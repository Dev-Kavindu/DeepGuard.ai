import modal
import os
import time
import datetime
import subprocess
from fastapi import Request

app = modal.App("ucf-crime-detection")

def download_models():
    from torchvision.models import resnet50, ResNet50_Weights
    from huggingface_hub import hf_hub_download
    
    resnet50(weights=ResNet50_Weights.DEFAULT)
    hf_hub_download(repo_id="Kavindu1124/ucf-crime-bilstm-mil", filename="ucf_anomaly_lstm.pth")

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("libgl1-mesa-glx", "libglib2.0-0", "ffmpeg")
    .pip_install(
        "torch", "torchvision", "opencv-python-headless", "numpy",
        "huggingface_hub", "fastapi[standard]", "python-multipart", "supabase"
    )
    .run_function(download_models)
)

CLASSES = [
    "Normal", "Abuse", "Arrest", "Arson", "Assault", "Burglary", "Explosion",
    "Fighting", "RoadAccidents", "Robbery", "Shooting", "Shoplifting", "Stealing", "Vandalism"
]

# --- Cron Job (Free Tier Protection & Auto Cleanup) ---
@app.function(
    image=image,
    schedule=modal.Cron("0 * * * *"),
    secrets=[modal.Secret.from_name("supabase-secrets")]
)
def auto_cleanup():
    from supabase import create_client, Client
    from datetime import datetime, timedelta, timezone

    supabase: Client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
    
    now = datetime.now(timezone.utc)
    one_hour_ago = (now - timedelta(hours=1)).isoformat()
    supabase.table("incidents").delete().eq("predicted_class", "Normal").lt("created_at", one_hour_ago).execute()
    
    seven_days_ago = (now - timedelta(days=7)).isoformat()
    old_incidents = supabase.table("incidents").select("video_clip_url").lt("created_at", seven_days_ago).execute()
    
    files_to_delete = []
    for row in old_incidents.data:
        url = row.get("video_clip_url")
        if url:
            filename = url.split("/")[-1]
            files_to_delete.append(filename)
            
    if files_to_delete:
        supabase.storage.from_("incident_vault").remove(files_to_delete)
        
    supabase.table("incidents").delete().lt("created_at", seven_days_ago).execute()
    print("✅ Auto-cleanup & Storage freeing completed successfully!")


# --- Continuous Stream Processing Function (GPU Worker) ---
@app.function(
    image=image, 
    secrets=[modal.Secret.from_name("supabase-secrets")], 
    timeout=3600, 
    gpu="T4"
)
def process_camera_feed(camera_id: int, camera_name: str, video_url: str, threshold: float):
    import cv2
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torchvision import transforms
    from torchvision.models import resnet50, ResNet50_Weights
    from huggingface_hub import hf_hub_download
    import numpy as np
    from supabase import create_client, Client

    DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[START] Initializing AI for Cam {camera_id}: {camera_name} on {DEVICE}")

    # Model Architecture
    class NewAnomalyLSTM(nn.Module):
        def __init__(self, input_size=2048, hidden_size=64, num_classes=14):
            super(NewAnomalyLSTM, self).__init__()
            self.lstm = nn.LSTM(input_size, hidden_size, batch_first=True, bidirectional=True)
            self.fc1 = nn.Linear(hidden_size * 2, 64)
            self.relu = nn.ReLU()
            self.dropout = nn.Dropout(0.6)
            self.fc2 = nn.Linear(64, num_classes)

        def forward(self, x):
            lstm_out, _ = self.lstm(x)
            out = self.fc1(lstm_out)
            out = self.relu(out)
            out = self.dropout(out)
            out = self.fc2(out)
            return out

    # Supabase Client
    supabase: Client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
    
    # Load Models
    print("⏳ Loading ResNet50...")
    base_model = resnet50(weights=ResNet50_Weights.DEFAULT)
    feature_extractor = nn.Sequential(*list(base_model.children())[:-1]).to(DEVICE).eval()
    
    print("⏳ Downloading BiLSTM-MIL Model from Hugging Face...")
    model_path = hf_hub_download(repo_id="Kavindu1124/ucf-crime-bilstm-mil", filename="ucf_anomaly_lstm.pth")
    bilstm_model = NewAnomalyLSTM().to(DEVICE)
    bilstm_model.load_state_dict(torch.load(model_path, map_location=DEVICE))
    bilstm_model.eval()

    transform = transforms.Compose([
        transforms.ToPILImage(),
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    cap = cv2.VideoCapture(video_url)
    if not cap.isOpened():
        print(f"❌ ERROR: Unable to open video feed at: {video_url}")
        return

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    if fps <= 0 or fps > 120:
        fps = 25.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 360
    
    sample_rate = max(1, int(round(fps * 0.5))) 
    buffer_seconds = 10
    max_frames = int(fps * buffer_seconds)
    
    raw_buffer = []
    frame_count = 0
    cooldown_frames = 0
    last_status_check = time.time()

    print(f"🎬 Processing Stream... FPS: {fps:.1f} | Resolution: {width}x{height} | Threshold: {threshold}%")

    # Live Loop
    with torch.no_grad():
        while True:
            ret, frame = cap.read()
            if not ret:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret, frame = cap.read()
                if not ret:
                    print("⚠️ Video stream disconnected or ended. Reconnecting in 2s...")
                    time.sleep(2)
                    cap = cv2.VideoCapture(video_url)
                    continue
            
            raw_buffer.append(frame)
            if len(raw_buffer) > max_frames:
                raw_buffer.pop(0)

            frame_count += 1
            current_time = time.time()

            # 🟢 ඇත්තම වෙලාවෙන් තත්පර 15කට වරක් Database එක Check කිරීම
            if current_time - last_status_check >= 15:
                last_status_check = current_time
                try:
                    cam_record = supabase.table("cameras").select("status").eq("id", camera_id).execute()
                    if not cam_record.data:
                        print(f"🛑 Camera {camera_id} was DELETED from Supabase. Terminating GPU worker.")
                        break
                    
                    cam_status = (cam_record.data[0].get("status") or "active").lower()
                    if cam_status not in ["active", "online"]:
                        print(f"🛑 Camera {camera_id} deactivated by user. Shutting down GPU worker.")
                        break
                except Exception as e:
                    print(f"⚠️ Warning: Could not check camera status - {e}")

            if cooldown_frames > 0:
                cooldown_frames -= 1
                continue

            # තත්පර 3කට වරක් AI Inference run කිරීම
            if frame_count % (int(fps) * 3) == 0:
                if len(raw_buffer) < (fps * 2):
                    continue

                sampled_frames = raw_buffer[::sample_rate]
                batch_tensors = [transform(cv2.cvtColor(f, cv2.COLOR_BGR2RGB)) for f in sampled_frames]
                
                if not batch_tensors:
                    continue

                batch = torch.stack(batch_tensors).to(DEVICE)
                features = feature_extractor(batch).flatten(1).cpu().numpy()

                features_tensor = torch.tensor(features, dtype=torch.float32).unsqueeze(0).to(DEVICE)

                if features_tensor.shape[1] != 32:
                    features_tensor = features_tensor.transpose(1, 2)
                    features_tensor = F.interpolate(features_tensor, size=32, mode="linear", align_corners=False)
                    features_tensor = features_tensor.transpose(1, 2)

                outputs = bilstm_model(features_tensor) # shape: [1, 32, 14]
                probs = torch.softmax(outputs, dim=2).squeeze(0) # shape: [32, 14]

                seg_prob = (1.0 - probs[:, 0]) * 100.0 # shape: [32]

                sorted_scores, _ = torch.sort(seg_prob)
                anomaly_score = float(sorted_scores[-3:].mean().item())

                peak_idx = torch.argmax(seg_prob) 
                peak_probs = probs[peak_idx]      
                
                pred_id = torch.argmax(peak_probs).item()
                predicted_class = CLASSES[pred_id]

                print(f"📊 [INFERENCE] Cam {camera_id} | Class: {predicted_class} | Score: {anomaly_score:.1f}% (Threshold: {threshold}%)")

                if anomaly_score >= threshold:
                    if predicted_class == "Normal":
                        best_anomaly_idx = torch.argmax(peak_probs[1:]).item() + 1
                        predicted_class = CLASSES[best_anomaly_idx]
                        
                    print(f"🚨 ANOMALY DETECTED: {predicted_class} | Score: {anomaly_score:.2f}% | Cam: {camera_id}")
                    
                    clip_name = f"evidence_cam{camera_id}_{int(time.time())}.mp4"
                    raw_clip_path = f"/tmp/raw_{clip_name}"
                    clip_path = f"/tmp/{clip_name}"
                    
                    # 1. OpenCV එකේ ස්ථාවරව වැඩ කරන mp4v මඟින් ලිවීම
                    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
                    out = cv2.VideoWriter(raw_clip_path, fourcc, fps, (width, height))
                    
                    for f in raw_buffer:
                        watermarked_frame = f.copy()
                        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        watermark_text = f"DeepGuard.ai | {camera_name} | {timestamp}"
                        
                        cv2.rectangle(watermarked_frame, (10, height - 40), (700, height - 10), (0, 0, 0), -1)
                        cv2.putText(watermarked_frame, watermark_text, (20, height - 20), 
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
                        
                        out.write(watermarked_frame)
                    out.release()
                    
                    # 2. බ්‍රවුසරයේ ප්ලේ වීම සඳහා ffmpeg මඟින් browser-safe H.264 බවට පත් කිරීම
                    subprocess.run(
                        ["ffmpeg", "-y", "-i", raw_clip_path, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast", clip_path],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL
                    )
                    
                    if os.path.exists(raw_clip_path):
                        os.remove(raw_clip_path)
                    
                    with open(clip_path, "rb") as vid_file:
                        supabase.storage.from_("incident_vault").upload(
                            clip_name,
                            vid_file,
                            {"content-type": "video/mp4"},
                        )
                    public_url = supabase.storage.from_("incident_vault").get_public_url(clip_name)
                    
                    if os.path.exists(clip_path):
                        os.remove(clip_path)
                    
                    # 🟢 Sri Lanka Standard Time (UTC+5:30) සහ camera_name දත්ත ගබඩාවට යැවීම
                    sri_lanka_tz = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
                    local_time = datetime.datetime.now(sri_lanka_tz).isoformat()

                    supabase.table("incidents").insert({
                        "camera_id": camera_id,
                        "camera_name": camera_name,  
                        "predicted_class": predicted_class,
                        "anomaly_score": float(anomaly_score),
                        "video_clip_url": public_url,
                        "is_false_alarm": False,
                        "created_at": local_time
                    }).execute()
                    
                    print(f"💾 Incident saved successfully to Supabase: {clip_name}")
                    
                    # 🟢 Cooldown තත්පර 30
                    cooldown_frames = int(fps * 30)
                    raw_buffer.clear()

    cap.release()
    print(f"[END] Stream processing stopped for Camera {camera_id}")


# --- Webhook Endpoint (Supabase Real-time Trigger) ---
@app.function(image=image, secrets=[modal.Secret.from_name("supabase-secrets")])
@modal.fastapi_endpoint(method="POST")
async def camera_webhook(request: Request):
    payload = await request.json()
    record = payload.get("record", {})
    event_type = payload.get("type", "")

    cam_id = record.get("id")
    cam_name = record.get("name", f"Camera {cam_id}")
    video_url = record.get("stream_url") or record.get("url")
    threshold = float(record.get("sensitivity") or record.get("threshold") or 50.0)
    
    cam_status = (record.get("status") or "active").lower()
    is_active = cam_status in ["active", "online"]

    if event_type in ["INSERT", "UPDATE"] and is_active and video_url:
        print(f"⚡ [WEBHOOK TRIGGER] Spawning T4 GPU Worker for Camera {cam_id}: {cam_name}")
        process_camera_feed.spawn(cam_id, cam_name, video_url, threshold)
        return {"status": "success", "message": f"Worker spawned for camera {cam_id}"}

    return {"status": "ignored", "message": "Camera is not active or missing stream URL"}