import modal
import os
import time
import datetime

app = modal.App("ucf-crime-detection")

def download_models():
    from torchvision.models import resnet50, ResNet50_Weights
    from huggingface_hub import hf_hub_download
    
    resnet50(weights=ResNet50_Weights.DEFAULT)
    hf_hub_download(repo_id="Kavindu1124/ucf-crime-bilstm-mil", filename="ucf_anomaly_lstm.pth")

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("libgl1-mesa-glx", "libglib2.0-0")
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

# --- Cron Job (Free Tier Protection) ---
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
    supabase.table("incidents").delete().eq("anomaly_type", "Normal").lt("created_at", one_hour_ago).execute()
    
    seven_days_ago = (now - timedelta(days=7)).isoformat()
    old_incidents = supabase.table("incidents").select("video_url").lt("created_at", seven_days_ago).execute()
    
    files_to_delete = []
    for row in old_incidents.data:
        url = row.get("video_url")
        if url:
            filename = url.split("/")[-1]
            files_to_delete.append(filename)
            
    if files_to_delete:
        supabase.storage.from_("incident_vault").remove(files_to_delete)
        
    supabase.table("incidents").delete().lt("created_at", seven_days_ago).execute()
    print("✅ Auto-cleanup & Storage freeing completed successfully!")


# --- Continuous Stream Processing Function ---
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
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    sample_rate = max(1, int(round(fps * 0.5))) 
    buffer_seconds = 10
    max_frames = int(fps * buffer_seconds)
    
    raw_buffer = []
    frame_count = 0
    cooldown_frames = 0

    print(f"🎬 Processing Stream... (Threshold: {threshold}%)")

    # Live Loop
    with torch.no_grad():
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                # Video ended (if it's an mp4) or stream dropped
                # Optional: break or try reconnecting if it's RTSP
                break
            
            raw_buffer.append(frame)
            if len(raw_buffer) > max_frames:
                raw_buffer.pop(0)

            frame_count += 1
            if cooldown_frames > 0:
                cooldown_frames -= 1
                continue

            # Run AI every 3 seconds
            if frame_count % (int(fps) * 3) == 0 and len(raw_buffer) >= (fps * 3):
                
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

                outputs = bilstm_model(features_tensor)
                probs = torch.softmax(outputs, dim=2).squeeze(0)

                seg_prob = (1.0 - probs[:, 0]).cpu().numpy() * 100
                anomaly_score = np.mean(np.sort(seg_prob)[-3:])

                max_cls_probs, _ = torch.max(probs, dim=0)
                pred_id = torch.argmax(max_cls_probs).item()
                predicted_class = CLASSES[pred_id]

                if anomaly_score >= threshold:
                    print(f"🚨 ANOMALY: {predicted_class} | Score: {anomaly_score:.2f}% | Cam: {camera_id}")
                    
                    clip_name = f"evidence_cam{camera_id}_{int(time.time())}.mp4"
                    clip_path = f"/tmp/{clip_name}"
                    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
                    out = cv2.VideoWriter(clip_path, fourcc, fps, (width, height))
                    
                    for f in raw_buffer:
                        watermarked_frame = f.copy()
                        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        watermark_text = f"DeepGuard.ai | {camera_name} | {timestamp}"
                        
                        cv2.rectangle(watermarked_frame, (10, height - 40), (700, height - 10), (0, 0, 0), -1)
                        cv2.putText(watermarked_frame, watermark_text, (20, height - 20), 
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
                        
                        out.write(watermarked_frame)
                    out.release()
                    
                    with open(clip_path, "rb") as vid_file:
                        supabase.storage.from_("incident_vault").upload(
                            clip_name,
                            vid_file,
                            {"content-type": "video/mp4"},
                        )
                    public_url = supabase.storage.from_("incident_vault").get_public_url(clip_name)
                    
                    supabase.table("incidents").insert({
                        "camera_id": camera_id,
                        "anomaly_type": predicted_class,
                        "anomaly_score": float(anomaly_score),
                        "video_url": public_url,
                        "is_false_alarm": False
                    }).execute()
                    
                    # 10-second cooldown
                    cooldown_frames = int(fps * 10)
                    raw_buffer.clear()

    cap.release()
    print(f"[END] Stream processing stopped for Camera {camera_id}")


# --- Local Entrypoint ---
@app.local_entrypoint()
def main():
    import os
    import time
    from supabase import create_client
    
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    
    supa_url = os.environ.get("SUPABASE_URL", "https://uaskdqvmvezshhegtasl.supabase.co")
    supa_key = os.environ.get("SUPABASE_KEY")
    if not supa_key:
        supa_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." # ඔයාගේ key එක

    supabase = create_client(supa_url, supa_key)
    response = supabase.table("cameras").select("*").execute()
    
    active_cams = [
        cam for cam in response.data 
        if cam.get("status") == "active" or cam.get("active") is True or cam.get("status") is None
    ]
    
    print(f"🚀 Starting DeepGuard AI for {len(active_cams)} active cameras...")
    
    if len(active_cams) == 0:
        print("⚠️ No active cameras found!")
        return

    # Background workers ලා spawn කර reference තබා ගැනීම
    workers = []
    for cam in active_cams:
        video_url = cam.get("stream_url") or cam.get("url")
        threshold = cam.get("sensitivity") or cam.get("threshold") or 50.0
        
        if video_url:
            print(f"➡️ Spawning GPU AI Worker for CAM {cam['id']}: {cam['name']}...")
            # Worker spawn කර list එකට එකතු කිරීම
            call = process_camera_feed.spawn(cam["id"], cam["name"], video_url, threshold)
            workers.append(call)

    print("🟢 All GPU workers spawned! Streaming and processing live... (Press Ctrl+C to stop)")
    
    # App එක auto-kill නොවී run වෙන්න loop එකක් තැබීම
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n🛑 Stopping DeepGuard AI workers...")