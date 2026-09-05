
# DeepGuard.ai

DeepGuard.ai is a real-time video intelligence platform for security operations teams. It combines a dark-glass operations console, Supabase event storage and realtime delivery, a FastAPI inference service, and Modal GPU workers to detect anomalous activity in camera footage and preserve reviewable evidence.

The repository is organized as a production-oriented monorepo: `frontend/` contains the operator console and `backend/` contains the local API and GPU processing paths. Every backend writer uses the same incident contract, so a detection is stored once, delivered through Supabase Realtime, and immediately visible to operators.

## Product Surface

- **Live Command Center**: responsive camera wall with stream placeholders, MP4 playback, live/offline state, anomaly highlighting, current timestamps, and recent detection context.
- **Incident Vault**: searchable evidence register with anomaly scores, camera locations, date/time metadata, false-alarm feedback, playback, download, and deletion actions.
- **Camera Configuration**: add RTSP or MP4 sources, upload test videos to Supabase Storage, tune per-camera sensitivity, and remove sources.
- **Operations shell**: responsive desktop sidebar and mobile bottom navigation with consistent zinc glass surfaces, emerald health signals, and red critical-alert states.

## Architecture

```text
Camera / MP4 source
	|
	v
FastAPI /analyze or Modal process_camera_feed
	|
	+--> ResNet50 feature extraction
	+--> BiLSTM-MIL anomaly classification
	|
	+--> Supabase Storage: incident_vault
	+--> Supabase tables: cameras, incidents
			 |
			 +--> Supabase Realtime INSERT
				      |
				      v
			 Next.js App Router console
```

### Frontend

The frontend lives in `frontend/` and uses Next.js 16 App Router, React 19, Tailwind CSS 4, Lucide icons, and the Supabase JavaScript client. The browser uses the public Supabase URL and anon key only. It subscribes to new `incidents` inserts through the `live-incidents` channel and keeps database/storage operations in the existing client-side flows.

### Backend

The backend lives in `backend/` and provides two inference paths:

- `backend/app.py`: FastAPI `/analyze` endpoint for uploaded video files. It validates uploads, extracts sampled frame features, runs the anomaly model, and asynchronously watermarks/uploads alarm evidence.
- `backend/main.py`: Modal GPU worker that reads active camera rows, processes streams continuously, uploads evidence, and inserts incidents that trigger the frontend realtime channel.
- `backend/modal_app.py`: Modal class endpoint plus hourly retention job. The retention job removes normal detections after one hour and old incident evidence after seven days.

The model uses ImageNet ResNet50 features followed by the `Kavindu1124/ucf-crime-bilstm-mil` BiLSTM-MIL checkpoint. Supported labels include abuse, arrest, arson, assault, burglary, explosion, fighting, robbery, shooting, shoplifting, stealing, vandalism, road accidents, and normal activity.

## Requirements

- Node.js 20+ and npm
- Python 3.14+ (the checked-in `backend/.venv` is the workspace interpreter)
- A Supabase project with database realtime enabled for `incidents`
- A Supabase Storage bucket named `incident_vault`
- Modal account and CLI for GPU stream processing
- NVIDIA/CUDA is optional for local FastAPI inference; CPU fallback is supported but slower

## Configuration

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
```

For local backend execution, provide a `.env` file or process environment values:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-server-side-key
CORS_ORIGINS=http://localhost:3000
```

Modal uses a secret named `supabase-secrets` containing `SUPABASE_URL` and `SUPABASE_KEY`. The backend also accepts the frontend variable names as a compatibility fallback, but server deployments should use server-side names and a protected runtime secret store.

Never commit `.env*`, service-role keys, model checkpoints, uploaded footage, or Supabase credentials.

## Supabase Data Contract

The existing UI expects these fields:

**`cameras`**

`id`, `name`, `url`, `threshold`, `active`

**`incidents`**

`id`, `camera_id`, `anomaly_type`, `anomaly_score`, `video_url`, `is_false_alarm`, `created_at`

The incident query joins `cameras ( name )`. Keep that relationship and enable Realtime for `incidents` so camera alarms appear immediately in the dashboard.

The backend writes `anomaly_type` and `video_url`; older names such as `predicted_class` and `video_clip_url` are not part of the active contract.

## Local Development

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

Useful checks:

```powershell
npm run lint
npm run build
```

### FastAPI service

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

The API accepts multipart uploads at `POST /analyze` with `file`, optional `threshold`, and optional `camera_id` form fields. Model weights are downloaded from Hugging Face on first startup, so the first boot is expected to take longer.

To validate backend syntax without loading model weights:

```powershell
\.venv\Scripts\python.exe -m compileall app.py main.py modal_app.py
```

### Modal worker

After configuring the `supabase-secrets` Modal secret:

```powershell
cd backend
modal run main.py
```

The worker discovers active cameras from Supabase and spawns one GPU process per source.

`modal_app.py` exposes the class-based HTTP endpoint and scheduled retention job. Deploy the path that matches the intended Modal workflow; do not run both stream orchestrators for the same camera unless duplicate processing is intentional.

## Production Notes

- Restrict Supabase Row Level Security and Storage policies before exposing the console to operators.
- Set `CORS_ORIGINS` to the exact deployed frontend origin(s); the local default is `http://localhost:3000`.
- Put authentication and role-based authorization in front of camera administration and destructive vault actions.
- Use signed/private Storage URLs when evidence should not be publicly addressable.
- Add structured logging, health checks, retry/backoff for stream failures, and monitoring for model-load latency.
- Keep GPU workers isolated from the public API and rotate Modal/Supabase secrets regularly.

## Repository Layout

```text
.
├── frontend/              # Next.js App Router operations console
│   ├── src/app/            # Dashboard, Vault, Settings, global shell
│   ├── src/components/     # Sidebar and live camera grid
│   └── src/lib/            # Supabase browser client
├── backend/                # FastAPI and Modal inference paths
│   ├── app.py               # Local FastAPI upload inference
│   ├── main.py              # Modal stream worker
│   ├── modal_app.py         # Modal HTTP endpoint and retention job
│   ├── requirements.txt     # pip-compatible dependencies
│   └── pyproject.toml       # project metadata and dependencies
├── README.md
└── .gitignore
```

## License

This repository is an internal/prototype production foundation. Add the project license and third-party model usage terms before external distribution.
