
# DeepGuard.ai

> **Cloud-Native Intelligent CCTV Anomaly Detection Platform**
>
> Edge-to-cloud real-time surveillance intelligence powered by Next.js, Supabase, and serverless GPU inference on Modal.

[![Next.js App Router](https://img.shields.io/badge/Next.js%20App%20Router-16.3.4-000000?logo=next.js)](https://nextjs.org/)
[![Supabase Realtime](https://img.shields.io/badge/Supabase-Realtime-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/realtime)
[![Modal GPU](https://img.shields.io/badge/Modal%20Labs-Serverless%20GPU-7C3AED)](https://modal.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![WebSockets](https://img.shields.io/badge/WebSockets-Supabase%20Pub%2FSub-111827)](https://supabase.com/docs/guides/realtime)

DeepGuard.ai is a security operations console for live camera monitoring, anomaly detection, and evidence review. The monorepo combines a responsive Next.js operator interface, Supabase PostgreSQL and Realtime, FastAPI upload inference, and Modal GPU workers running PyTorch vision models.

## Executive Architecture

```text
  CCTV feeds / MP4 vault
	  |
	  v
  Supabase cameras table and event stream
	  |
	  +---- Webhook / orchestration ----+
	  |                                  |
	  v                                  v
  FastAPI upload inference       Modal serverless T4 GPU workers
	  |                                  |
	  +-------- PyTorch / ResNet50 / BiLSTM-MIL --------+
							   |
							   v
			      Dynamic watermarking and evidence recording
							   |
							   v
			      Supabase incidents + incident_vault storage
							   |
							   v
			      Supabase Realtime WebSockets
							   |
							   v
			      Live operator command center and Incident Vault
```

### Core Capabilities

- **Real-time stream monitoring:** RTSP-oriented camera registration, browser-playable MP4 feeds, live/offline states, and in-flight frame sampling for active AI cameras.
- **Glassmorphic control plane:** Dark zinc surfaces, emerald operational signals, red critical alerts, responsive navigation, per-camera sensitivity controls, and bidirectional master AI/threshold overrides.
- **Automated Incident Vault:** Watermarked evidence clips are uploaded to Supabase Storage and indexed in PostgreSQL for playback, download, false-alarm handling, and deletion workflows.
- **Cost-aware distributed execution:** Passive cameras do not spawn GPU workers; AI-disabled workers terminate on state checks; debounced controls reduce mutation bursts during slider interaction.
- **Operator synchronization:** Dashboard, camera grid, and vault subscribe to Supabase Realtime so camera and incident changes propagate without a browser refresh.

## Technology Stack

| Layer | Technologies | Responsibility |
| --- | --- | --- |
| Operator frontend | Next.js 16 App Router, React 19, TypeScript | Dashboard, camera grid, settings, and evidence workflows |
| UI system | Tailwind CSS 4, Lucide React | Responsive dark-glass operations interface |
| Data and realtime | Supabase PostgreSQL, Realtime Pub/Sub, Storage | Camera state, incident records, event delivery, evidence objects |
| API inference | FastAPI, OpenCV, TorchVision | Multipart video analysis and asynchronous evidence processing |
| GPU compute | Modal Labs, PyTorch, ResNet50, BiLSTM-MIL | Serverless T4 stream inference and webhook-driven workers |
| Model artifacts | Hugging Face Hub | `Kavindu1124/ucf-crime-bilstm-mil` checkpoint distribution |
| Deployment | Vercel, Modal | Frontend edge deployment and GPU inference workers |


## Dataset Acquisition & License Information

**Dataset Name:** UCF-Crime Dataset (Real-world Anomaly Detection in Surveillance Videos)  
**Source:** [Kaggle - UCF Crimes](https://www.kaggle.com/datasets/bypktt/ucf-crimes) / Official CRCV Project Page  

**Dataset Overview:**
* The dataset contains approximately 128 hours of real-world CCTV surveillance video.
* It includes 1,950 long and untrimmed videos covering 13 realistic anomaly categories (Abuse, Arrest, Arson, Assault, Burglary, Explosion, Fighting, Road Accident, Robbery, Shooting, Shoplifting, Stealing, Vandalism) and 1 Normal category.

**Ethical Sourcing & License:**
The dataset was acquired from public research repositories (Kaggle). It is utilized in this Capstone Project strictly for **educational, research, and non-commercial purposes**. The data involves real-world CCTV footage, and its use is limited to developing automated threat-detection intelligence without violating individual privacy for commercial gain.

**Academic Citation:**
This dataset was introduced by Waqas Sultani, Chen Chen, and Mubarak Shah at CVPR 2018. The foundational research paper is cited below:

```bibtex
@InProceedings{Sultani_2018_CVPR,
author = {Sultani, Waqas and Chen, Chen and Shah, Mubarak},
title = {Real-World Anomaly Detection in Surveillance Videos},
booktitle = {The IEEE Conference on Computer Vision and Pattern Recognition (CVPR)},
month = {June},
year = {2018}
}
```


## Repository Layout

```text
.
├── frontend/
│   ├── src/app/page.tsx              # Live Command Center
│   ├── src/app/vault/page.tsx        # Incident Vault
│   ├── src/app/settings/page.tsx     # Camera and AI controls
│   ├── src/components/CameraGrid.tsx # Live camera wall
│   └── src/lib/supabase.ts           # Browser Supabase client
├── backend/
│   ├── app.py                        # FastAPI /analyze endpoint
│   ├── main.py                       # Modal stream worker entrypoint
│   ├── modal_app.py                  # Modal webhook, worker, and cleanup job
│   ├── requirements.txt
│   └── pyproject.toml
├── evaluation_report.md
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- Python 3.10+ for the Modal image; use the project virtual environment for local backend work
- Supabase project with `cameras` and `incidents` tables, Realtime enabled, and an `incident_vault` bucket
- Modal account and CLI for serverless GPU deployment

### Frontend Environment

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
```

The browser must receive only the public Supabase URL and anon key. Never expose a service-role key in `NEXT_PUBLIC_*` variables.

### Backend and Modal Environment

For local FastAPI execution:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-server-side-key
CORS_ORIGINS=http://localhost:3000
```

Configure the Modal secret named `supabase-secrets` with `SUPABASE_URL` and `SUPABASE_KEY`. A deployed webhook endpoint is represented by `MODAL_ENDPOINT_URL` for integrations that need to call the worker orchestration endpoint.

Optional local integration variables:

```env
MODAL_ENDPOINT_URL=https://your-modal-endpoint.modal.run
SUPABASE_SERVICE_ROLE_KEY=server-side-only-value
```

Do not commit any of these values.

### Run the Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

### Run the FastAPI Upload API

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

Send a multipart request to `POST /analyze` with `file`, optional `threshold`, and optional `camera_id`. The first startup downloads the ResNet50 and BiLSTM-MIL artifacts.

### Run or Deploy Modal Workers

```powershell
cd backend
modal run main.py
```

For the webhook and scheduled cleanup application:

```powershell
modal deploy modal_app.py
```

Deploy one stream orchestration path per camera. Running both `main.py` and `modal_app.py` for the same sources can create duplicate detections.

### Verification

```powershell
cd frontend
npm run build

cd ..\backend
\.venv\Scripts\python.exe -m compileall app.py main.py modal_app.py
```

## Supabase Contract

The active frontend and backend paths use these fields:

| Table | Important columns |
| --- | --- |
| `cameras` | `id`, `name`, `stream_url` or `url`, `status`, `active`, `ai_enabled`, `sensitivity` or `threshold` |
| `incidents` | `id`, `camera_id`, `camera_name`, `predicted_class` or `anomaly_type`, `anomaly_score`, `video_clip_url` or `video_url`, `is_false_alarm`, `created_at` |
| Storage | `incident_vault` bucket for evidence clips |

Enable Realtime for `cameras` and `incidents`. Configure Row Level Security and Storage policies before exposing this console to operators. Use private evidence objects and signed URLs for production deployments.

## Operational Notes

- AI processing is opt-in at the worker gate: cameras with `ai_enabled = false` remain passive feeds and should not consume GPU capacity.
- Workers periodically re-check camera existence, operational status, and AI enablement so deactivation can terminate processing without restarting the platform.
- Evidence timestamps are captured at anomaly confirmation and reused for the burned watermark and incident record.
- `modal_app.py` includes an hourly cleanup task for normal detections and seven-day incident retention.
- Add authentication, RBAC, audit logging, health checks, retry/backoff, webhook idempotency, and cost telemetry before a public or multi-tenant launch.

## Project Status

DeepGuard.ai is a strong pilot-ready foundation for controlled environments. It has the core operator workflow, realtime incident delivery, serverless GPU integration, and evidence lifecycle primitives. Production rollout should be gated on the security, observability, multi-tenant isolation, and webhook reliability work described in [evaluation_report.md](evaluation_report.md).

## License

This repository is an internal/prototype production foundation. Add a project license and verify third-party model and dataset terms before external distribution.
