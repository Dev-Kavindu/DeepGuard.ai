# DeepGuard.ai Backend

The DeepGuard.ai backend provides video anomaly detection for uploaded footage and live camera streams. It combines FastAPI, Modal GPU workers, OpenCV, ResNet50 feature extraction, a BiLSTM-MIL classifier, Supabase Storage, and Supabase Realtime.

## Runtime Paths

### FastAPI Upload API

`app.py` exposes `POST /analyze` for multipart video uploads. The service:

1. Validates the video extension.
2. Samples frames with OpenCV.
3. Extracts visual features with ImageNet ResNet50.
4. Resizes the temporal feature sequence to 32 segments.
5. Classifies activity with the UCF Crime BiLSTM-MIL checkpoint.
6. Uploads and watermarks evidence when the anomaly score crosses the threshold.
7. Inserts an incident into Supabase for the frontend realtime dashboard.

Form fields:

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `file` | file | required | `.mp4`, `.avi`, `.mov`, or `.mkv` video |
| `threshold` | float | `50.0` | Alarm score threshold |
| `camera_id` | integer | `1` | Related `cameras.id` value |

Example response:

```json
{
	"filename": "sample.mp4",
	"predicted_class": "Robbery",
	"anomaly_score": 87.42,
	"is_alarm": true,
	"threshold": 50.0,
	"message": "Alarm triggered! Video is being saved to vault."
}
```

### Modal Stream Worker

`main.py` reads active cameras from Supabase and starts one Modal GPU function per stream. Each worker keeps a rolling evidence buffer, analyzes sampled windows, applies a cooldown after an alarm, and writes evidence to the `incident_vault` bucket.

`modal_app.py` contains the class-based Modal HTTP endpoint and the scheduled retention task. The retention task removes normal detections after one hour and old incident evidence after seven days.

Run only the orchestration path that matches the deployment. Running both stream workers for the same camera can create duplicate detections.

## Model Contract

The backend uses the `Kavindu1124/ucf-crime-bilstm-mil` Hugging Face checkpoint:

- ResNet50 feature vector: 2048 dimensions
- Bidirectional LSTM hidden size: 64
- Output classes: Normal, Abuse, Arrest, Arson, Assault, Burglary, Explosion, Fighting, RoadAccidents, Robbery, Shooting, Shoplifting, Stealing, Vandalism
- Model weights are downloaded on first startup and cached by Hugging Face

## Configuration

Local FastAPI execution expects server-side environment variables:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-server-side-key
CORS_ORIGINS=http://localhost:3000
```

The API accepts the frontend variable names as a compatibility fallback, but production deployments should use `SUPABASE_URL` and `SUPABASE_KEY` from a protected secret manager.

Modal functions use a secret named `supabase-secrets` containing the same two Supabase values.

## Supabase Contract

The backend writes to the following tables and bucket:

**`cameras`**

`id`, `name`, `url`, `threshold`, `active`

**`incidents`**

`camera_id`, `anomaly_type`, `anomaly_score`, `video_url`, `is_false_alarm`, `created_at`

**Storage bucket**

`incident_vault`

The frontend expects `anomaly_type` and `video_url`. Legacy names such as `predicted_class` and `video_clip_url` are not part of the active contract.

Enable Supabase Realtime for `incidents` and configure Row Level Security and Storage policies before production use.

## Local Setup

From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Start the API:

```powershell
uvicorn app:app --reload --port 8000
```

The first startup downloads the ResNet50 and BiLSTM-MIL weights and may take several minutes.

Validate syntax without loading models:

```powershell
.\.venv\Scripts\python.exe -m compileall app.py main.py modal_app.py
```

Run the Modal stream worker after configuring the Modal secret:

```powershell
modal run main.py
```

## Production Guidance

- Restrict `CORS_ORIGINS` to the deployed frontend origin.
- Keep service-role Supabase credentials server-side only.
- Put authentication and authorization in front of inference, camera administration, and destructive incident actions.
- Prefer private Storage buckets and signed URLs for evidence.
- Add health checks, structured logs, retry/backoff for stream failures, and GPU cost monitoring.
- Do not expose arbitrary internal stream URLs without validation and network controls.
