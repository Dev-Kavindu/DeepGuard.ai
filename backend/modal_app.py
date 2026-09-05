import modal
import os
from fastapi import File, Form, UploadFile

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

# --- ස්වයංක්‍රීයව දත්ත සහ වීඩියෝ මකා දැමීමේ Cron Job (Free Tier Protection) ---
@app.function(
    image=image,
    schedule=modal.Cron("0 * * * *"),
    secrets=[modal.Secret.from_name("supabase-secrets")]
)
def auto_cleanup():
    from supabase import create_client, Client
    from datetime import datetime, timedelta, timezone

    supabase: Client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
    
    # 1. Normal වාර්තා පැයකින් පසු මකා දැමීම (මේවායේ වීඩියෝ සේව් වෙන්නේ නැත)
    now = datetime.now(timezone.utc)
    one_hour_ago = (now - timedelta(hours=1)).isoformat()
    supabase.table("incidents").delete().eq("anomaly_type", "Normal").lt("created_at", one_hour_ago).execute()
    
    # 2. දින 7කට වඩා පැරණි Anomaly වාර්තා සහ වීඩියෝ මකා දැමීම (Storage Space ඉතිරි කිරීමට)
    seven_days_ago = (now - timedelta(days=7)).isoformat()
    
    # මකා දැමිය යුතු වාර්තා වල URL ලබා ගැනීම
    old_incidents = supabase.table("incidents").select("video_url").lt("created_at", seven_days_ago).execute()
    
    files_to_delete = []
    for row in old_incidents.data:
        url = row.get("video_url")
        if url:
            filename = url.split("/")[-1]
            files_to_delete.append(filename)
            
    # Storage එකෙන් MP4 ෆයිල් මකා දැමීම
    if files_to_delete:
        supabase.storage.from_("incident_vault").remove(files_to_delete)
        
    # Database එකෙන් පේළි (Rows) මකා දැමීම
    supabase.table("incidents").delete().lt("created_at", seven_days_ago).execute()
    
    print("✅ Auto-cleanup & Storage freeing completed successfully!")


@app.cls(
    image=image,
    gpu="T4",
    scaledown_window=120,
    secrets=[modal.Secret.from_name("supabase-secrets")]
)
class CrimeDetector:
    @modal.enter()
    def load_models(self):
        import torch
        import torch.nn as nn
        from torchvision import transforms
        from torchvision.models import resnet50, ResNet50_Weights
        from huggingface_hub import hf_hub_download
        from supabase import create_client

        self.CLASSES = [
            "Normal", "Abuse", "Arrest", "Arson", "Assault", "Burglary", "Explosion",
            "Fighting", "RoadAccidents", "Robbery", "Shooting", "Shoplifting", "Stealing", "Vandalism"
        ]
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

        class NewAnomalyLSTM(nn.Module):
            def __init__(self, input_size=2048, hidden_size=64, num_classes=14):
                super().__init__()
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

        print("⏳ Loading Models...")
        base_model = resnet50(weights=ResNet50_Weights.DEFAULT)
        self.feature_extractor = nn.Sequential(*list(base_model.children())[:-1]).to(self.device)
        self.feature_extractor.eval()

        model_path = hf_hub_download(repo_id="Kavindu1124/ucf-crime-bilstm-mil", filename="ucf_anomaly_lstm.pth")
        self.model = NewAnomalyLSTM().to(self.device)
        self.model.load_state_dict(torch.load(model_path, map_location=self.device))
        self.model.eval()

        self.transform = transforms.Compose([
            transforms.ToPILImage(),
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])
        print("✅ Models loaded successfully!")

    def extract_features(self, video_path):
        import cv2, torch, numpy as np
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        sample_rate = max(1, int(round(fps * 0.5))) if fps > 0 else 12
        features_list, batch_tensors = [], []
        frame_count = 0

        with torch.no_grad():
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret: break
                if frame_count % sample_rate == 0:
                    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    batch_tensors.append(self.transform(rgb_frame))
                    if len(batch_tensors) == 16:
                        batch = torch.stack(batch_tensors).to(self.device)
                        features = self.feature_extractor(batch).flatten(1).cpu().numpy()
                        features_list.extend(features)
                        batch_tensors = []
                frame_count += 1
            if len(batch_tensors) > 0:
                batch = torch.stack(batch_tensors).to(self.device)
                features = self.feature_extractor(batch).flatten(1).cpu().numpy()
                features_list.extend(features)
        cap.release()
        return np.array(features_list)

    @modal.fastapi_endpoint(method="POST")
    async def analyze(self, file: UploadFile = File(...), threshold: float = Form(50.0), camera_id: int = Form(1)):
        import os, shutil, tempfile, torch, time, numpy as np
        import torch.nn.functional as F

        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as temp_video:
            shutil.copyfileobj(file.file, temp_video)
            temp_video_path = temp_video.name

        try:
            features_array = self.extract_features(temp_video_path)
            if len(features_array) == 0:
                return {"error": "Failed to extract features from video"}

            features_tensor = torch.tensor(features_array, dtype=torch.float32).unsqueeze(0).to(self.device)

            if features_tensor.shape[1] != 32:
                features_tensor = features_tensor.transpose(1, 2)
                features_tensor = F.interpolate(features_tensor, size=32, mode="linear", align_corners=False)
                features_tensor = features_tensor.transpose(1, 2)

            with torch.no_grad():
                outputs = self.model(features_tensor)
                probs = torch.softmax(outputs, dim=2).squeeze(0)

                seg_prob = (1.0 - probs[:, 0]).cpu().numpy() * 100
                anomaly_score = float(np.mean(np.sort(seg_prob)[-3:]))

                max_cls_probs, _ = torch.max(probs, dim=0)
                pred_id = torch.argmax(max_cls_probs).item()
                predicted_class = self.CLASSES[pred_id]

            is_alarm = anomaly_score >= threshold
            video_clip_url = None

            # මුදල් ඉතිරි කිරීමට අපරාධයක් (Alarm එකක්) නම් පමණක් Storage එකට Upload කිරීම
            if is_alarm:
                file_name = f"camera_{camera_id}_{int(time.time())}.mp4"
                with open(temp_video_path, "rb") as f:
                    self.supabase.storage.from_("incident_vault").upload(file_name, f.read(), {"content-type": "video/mp4"})
                video_clip_url = self.supabase.storage.from_("incident_vault").get_public_url(file_name)

            try:
                self.supabase.table("incidents").insert({
                    "camera_id": camera_id,
                    "anomaly_type": predicted_class,
                    "anomaly_score": anomaly_score,
                    "video_url": video_clip_url,
                    "is_false_alarm": False
                }).execute()
            except Exception as e:
                print(f"Database insert error: {e}")

            return {
                "filename": file.filename,
                "predicted_class": predicted_class,
                "anomaly_score": round(anomaly_score, 2),
                "is_alarm": is_alarm,
                "camera_id": camera_id,
                "video_url": video_clip_url
            }
        finally:
            if os.path.exists(temp_video_path):
                os.remove(temp_video_path)