import os
import shutil
import tempfile
import time
import datetime
from contextlib import asynccontextmanager

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from torchvision import transforms
from torchvision.models import resnet50, ResNet50_Weights
from huggingface_hub import hf_hub_download
import cv2
from supabase import create_client, Client

# --- Supabase Setup ---
SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
supabase: Client | None = None

def get_supabase() -> Client:
    if supabase is None:
        raise RuntimeError("Supabase is not configured. Set SUPABASE_URL and SUPABASE_KEY.")
    return supabase


def load_models() -> None:
    global feature_extractor, anomaly_model
    print("Loading ResNet50 feature extractor...")
    base_model = resnet50(weights=ResNet50_Weights.DEFAULT)
    feature_extractor = nn.Sequential(*list(base_model.children())[:-1]).to(DEVICE)
    feature_extractor.eval()

    print("Loading BiLSTM-MIL model...")
    model_path = hf_hub_download(
        repo_id="Kavindu1124/ucf-crime-bilstm-mil",
        filename="ucf_anomaly_lstm.pth",
    )
    anomaly_model = NewAnomalyLSTM().to(DEVICE)
    anomaly_model.load_state_dict(torch.load(model_path, map_location=DEVICE))
    anomaly_model.eval()
    print("Models loaded successfully")


@asynccontextmanager
async def lifespan(_: FastAPI):
    global supabase
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("Set SUPABASE_URL and SUPABASE_KEY before starting the API.")
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    load_models()
    yield


app = FastAPI(title="DeepGuard AI Inference API", version="1.0", lifespan=lifespan)

allowed_origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"]
)

CLASSES = [
    "Normal", "Abuse", "Arrest", "Arson", "Assault", "Burglary", "Explosion",
    "Fighting", "RoadAccidents", "Robbery", "Shooting", "Shoplifting", "Stealing", "Vandalism"
]
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

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

feature_extractor = None
anomaly_model = None

transform = transforms.Compose([
    transforms.ToPILImage(),
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

def extract_features(video_path):
    if feature_extractor is None:
        raise RuntimeError("Feature extractor is not loaded.")

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
                batch_tensors.append(transform(rgb_frame))
                if len(batch_tensors) == 16:
                    batch = torch.stack(batch_tensors).to(DEVICE)
                    features = feature_extractor(batch).flatten(1).cpu().numpy()
                    features_list.extend(features)
                    batch_tensors = []
            frame_count += 1
        if len(batch_tensors) > 0:
            batch = torch.stack(batch_tensors).to(DEVICE)
            features = feature_extractor(batch).flatten(1).cpu().numpy()
            features_list.extend(features)
    cap.release()
    return np.array(features_list)

# Background Task: Watermark and Upload to Supabase
def process_evidence(video_path: str, predicted_class: str, anomaly_score: float, camera_id: int = 1):
    database = get_supabase()
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    clip_name = f"evidence_cam{camera_id}_{int(time.time())}.mp4"
    watermarked_path = f"/tmp/{clip_name}"
    
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(watermarked_path, fourcc, fps, (width, height))
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        
        # Add Watermark
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        watermark_text = f"DeepGuard.ai | CAM {camera_id} | {timestamp} | {predicted_class}"
        cv2.rectangle(frame, (10, height - 40), (800, height - 10), (0, 0, 0), -1)
        cv2.putText(frame, watermark_text, (20, height - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
        
        out.write(frame)
        
    cap.release()
    out.release()
    
    # Upload to Supabase 'incident_vault'
    try:
        with open(watermarked_path, "rb") as f:
            database.storage.from_("incident_vault").upload(
                clip_name,
                f,
                {"content-type": "video/mp4"},
            )

        public_url = database.storage.from_("incident_vault").get_public_url(clip_name)
        database.table("incidents").insert({
            "camera_id": camera_id,
            "anomaly_type": predicted_class,
            "anomaly_score": float(anomaly_score),
            "video_url": public_url,
            "is_false_alarm": False,
        }).execute()
    finally:
        if os.path.exists(watermarked_path):
            os.remove(watermarked_path)

@app.post("/analyze")
async def analyze_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...), 
    threshold: float = Form(50.0),
    camera_id: int = Form(1) # අදාළ කැමරාවේ ID එක
):
    filename = file.filename or "upload.mp4"
    if not filename.lower().endswith((".mp4", ".avi", ".mov", ".mkv")):
        raise HTTPException(status_code=400, detail="Invalid video format")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as temp_video:
        shutil.copyfileobj(file.file, temp_video)
        temp_video_path = temp_video.name

    try:
        features_array = extract_features(temp_video_path)
        if len(features_array) == 0:
            raise HTTPException(status_code=500, detail="Failed to extract features")

        if anomaly_model is None:
            raise RuntimeError("Anomaly model is not loaded.")

        features_tensor = torch.tensor(features_array, dtype=torch.float32).unsqueeze(0).to(DEVICE)
        if features_tensor.shape[1] != 32:
            features_tensor = features_tensor.transpose(1, 2)
            features_tensor = F.interpolate(features_tensor, size=32, mode="linear", align_corners=False)
            features_tensor = features_tensor.transpose(1, 2)

        with torch.no_grad():
            outputs = anomaly_model(features_tensor)
            probs = torch.softmax(outputs, dim=2).squeeze(0)
            seg_prob = (1.0 - probs[:, 0]).cpu().numpy() * 100
            anomaly_score = float(np.mean(np.sort(seg_prob)[-3:]))
            max_cls_probs, _ = torch.max(probs, dim=0)
            pred_id = torch.argmax(max_cls_probs).item()
            predicted_class = CLASSES[pred_id]

        is_alarm = anomaly_score >= threshold

        # Anomaly එකක් නම්, Video එක Watermark කරලා Supabase එකට දාන්න Background Task එකක් යැවීම
        if is_alarm:
            background_tasks.add_task(process_evidence, temp_video_path, predicted_class, anomaly_score, camera_id)
        else:
            # Anomaly එකක් නැත්නම්, temp file එක මකා දැමීම
            background_tasks.add_task(os.remove, temp_video_path)

        return {
            "filename": filename,
            "predicted_class": predicted_class,
            "anomaly_score": round(anomaly_score, 2),
            "is_alarm": is_alarm,
            "threshold": threshold,
            "message": "Alarm triggered! Video is being saved to vault." if is_alarm else "Normal Activity."
        }

    except HTTPException:
        raise
    except Exception as e:
        if os.path.exists(temp_video_path):
            os.remove(temp_video_path)
        raise HTTPException(status_code=500, detail=str(e))