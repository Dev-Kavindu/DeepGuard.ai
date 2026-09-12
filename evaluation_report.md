# DeepGuard.ai SaaS Evaluation Report

**Assessment date:** 2026-09-13  
**Assessment scope:** Frontend operator console, Supabase synchronization, FastAPI upload inference, Modal stream workers, evidence storage, and operational readiness  
**Overall status:** Pilot-ready foundation; not yet enterprise-production complete

## 1. Executive Summary

DeepGuard.ai is a real-time smart surveillance SaaS foundation designed to turn CCTV feeds into reviewable, operator-facing security events. Its core value proposition is the combination of:

- On-demand serverless GPU inference so passive cameras do not require continuous GPU allocation.
- Supabase-backed state and Realtime event delivery for low-latency operator feedback.
- Automated evidence capture, dynamic watermarking, and searchable incident review.
- A responsive command center for live camera status, anomaly signals, and incident operations.

The platform is technically coherent for a controlled production pilot. The frontend has a clear operational workflow across Live Command Center, Incident Vault, and Camera Settings. The backend supports both uploaded-video analysis and continuous stream processing through Modal. The principal gaps before broad production adoption are authentication and tenant isolation, webhook idempotency, stronger observability, storage security, operational SLOs, and measured GPU economics under representative workloads.

The product should be positioned as a **pilot-ready surveillance intelligence control plane**, not yet as a fully hardened multi-tenant SaaS platform.

## 2. System Profile

| Area | Current implementation | Assessment |
| --- | --- | --- |
| Operator UI | Next.js 16 App Router, React 19, Tailwind CSS 4, Lucide icons | Strong foundation with responsive operations workflows |
| State and events | Supabase browser client, PostgreSQL Realtime channels for cameras and incidents | Effective for low-latency UI synchronization; requires auth and event governance |
| Upload inference | FastAPI `/analyze`, OpenCV frame extraction, PyTorch classification | Suitable for asynchronous evidence analysis; needs API hardening |
| Stream inference | Modal T4 GPU functions, rolling frame buffers, cooldowns | Cost-efficient for intermittent workloads; cold-start and duplication controls need measurement |
| Evidence | Supabase `incident_vault` Storage bucket plus incident records | Functional lifecycle exists; private access and retention verification are required |
| Retention | Hourly Modal cleanup job with normal and seven-day cleanup paths | Useful baseline; needs auditable deletion and failure retrying |

## 3. Production Architecture and Performance Audit

### 3.1 Frontend UI/UX

**Strengths**

- The zinc glass surfaces, emerald operational signals, and red critical states create a coherent control-room visual language.
- The three primary workflows are discoverable: live monitoring, evidence review, and source configuration.
- Camera cards retain a stable video aspect ratio and distinguish AI monitoring from passive CCTV.
- The Incident Vault provides the expected operator actions: search, playback, download, false-alarm marking, and deletion.
- Responsive navigation adapts to a desktop sidebar and mobile bottom navigation, while local table overflow prevents wide evidence tables from breaking the page shell.
- Realtime insert/update/delete handling keeps the Vault and dashboard current without forcing a refresh.

**Risks and recommendations**

- Add authenticated route protection before exposing camera URLs, evidence actions, or configuration controls.
- Add explicit loading, stale-connection, and subscription-status telemetry so operators can distinguish an empty system from a disconnected one.
- Add browser-level acceptance tests for narrow mobile, tablet, 1440px desktop, and large-monitor layouts.
- Replace client-only destructive actions with server-authorized operations and audit events.

### 3.2 State Synchronization and Distributed Timing

The frontend uses Supabase Realtime as the event backbone. Camera changes refresh dashboard metrics and camera presentation; incident inserts update the live dashboard and Vault; Vault update/delete events reconcile existing rows. This is appropriate for an operator console where freshness matters more than offline-first editing.

The settings flow now uses:

- LocalStorage persistence for master AI, threshold override, and master threshold preferences.
- A computed all-cameras AI state rather than an independently mutable master flag.
- Direct per-camera updates for individual changes.
- ID-scoped batch updates for explicit global actions.
- A 300 ms debounce window for slider mutations.
- Timer cancellation when switching between individual and global threshold modes.

These controls materially reduce mutation storms, but LocalStorage is only a browser preference cache. It is not an authority and does not synchronize preferences across operators or devices. For an enterprise tier, store organization-level policy in PostgreSQL and make the UI a projection of server state.

**Recommended control-plane invariants**

1. Every global mutation carries an actor, organization, request ID, and timestamp.
2. Every webhook or database event is idempotent by camera ID, event ID, and desired state version.
3. UI writes are optimistic only when the server response confirms the resulting state.
4. Realtime updates reconcile by primary key and never blindly overwrite newer local edits.

### 3.3 Resource and Compute Economics

Modal GPU workers are a better fit than a permanently allocated EC2 GPU cluster when camera workloads are intermittent, deployments are small, or operational simplicity is a priority. A traditional always-on GPU cluster pays for idle capacity and requires capacity planning, patching, health management, and queueing infrastructure. Modal shifts more of that burden to per-invocation execution and managed container scheduling.

A practical cost model is:

```text
Monthly GPU cost
= active GPU seconds x GPU rate
+ cold-start and image initialization overhead
+ storage and network egress
+ observability and control-plane services
```

For each camera, the main variables are:

- Number of active AI-enabled cameras.
- Stream uptime and reconnect frequency.
- Frame sampling rate and inference interval.
- GPU class and utilization during inference.
- Model image size and cold-start duration.
- Evidence clip frequency, duration, and egress volume.

The current architecture avoids GPU allocation for passive cameras and terminates workers after camera deletion, deactivation, or AI disablement checks. That creates a meaningful savings path. The trade-off is that continuous streams may keep a GPU worker active for long periods, so serverless does not automatically mean low cost. A pilot should capture GPU-seconds per camera-hour, cold starts per camera-day, inference throughput, and evidence storage growth before setting commercial pricing.

**Benchmark gates for production pricing**

| Metric | Required evidence |
| --- | --- |
| Detection latency | p50/p95 from sampled frame window to Realtime event |
| Cold start | p50/p95 from spawn to first successful inference |
| Worker utilization | GPU utilization and active seconds per camera-hour |
| Reliability | Stream reconnect success rate and worker termination latency |
| Evidence cost | Average clip size, retention volume, and egress per incident |
| Alert quality | False-positive and false-negative rates by camera class |

## 4. Reliability, Security, and Edge Cases

### 4.1 Graceful Shutdown and In-Flight Frames

Workers periodically re-read camera status and `ai_enabled`. This provides eventual termination rather than immediate cancellation. The expected shutdown latency is bounded by the status polling interval plus the time required to finish the current frame read, inference window, or evidence upload.

Recommended hardening:

- Add an explicit cancellation or lease mechanism for faster operator shutdown.
- Stop accepting new inference windows once a shutdown signal is observed.
- Ensure temporary raw and converted clips are deleted in `finally` blocks after upload failures.
- Emit worker lifecycle events: spawned, ready, reconnecting, stopping, stopped, and failed.
- Define an operator-facing shutdown SLO, such as 30 seconds from disable action to worker termination.

### 4.2 Webhook Deduplication and Trigger Storm Prevention

The camera webhook can spawn workers from camera INSERT and UPDATE events. Without an idempotency key, repeated updates or retries can create duplicate workers for the same camera. The frontend has debounce and batch protections, but database/webhook boundaries still need server-side deduplication.

Recommended controls:

- Use a durable worker lease table keyed by `camera_id` with an active worker identifier and expiration.
- Treat repeated desired-state updates as idempotent.
- Include a monotonic camera configuration version in webhook payloads.
- Reject stale webhook versions and coalesce rapid updates.
- Record Modal spawn results and correlate them with Supabase audit records.
- Apply exponential backoff and dead-letter handling for failed webhook delivery.

### 4.3 Storage Lifecycle and Archival

The scheduled cleanup job provides a useful baseline: normal detections are eligible for short retention, while older incident evidence is removed after seven days. Before production, retention must become an explicit policy rather than an implicit hardcoded behavior.

Required production controls:

- Make retention configurable per organization and incident severity.
- Store object keys separately from public URLs so deletion is deterministic.
- Prefer private buckets with signed, short-lived playback URLs.
- Add a deletion ledger and reconcile database rows against Storage objects.
- Retry failed object deletion and alert on orphaned clips.
- Apply lifecycle rules for cold archival when legal or operational requirements demand longer retention.
- Define legal hold and evidence export procedures before regulated use.

### 4.4 Security Posture

The current frontend uses public Supabase browser credentials by design, while Modal and FastAPI use server-side secrets. This separation is correct, but authorization still needs to be enforced server-side.

Immediate controls:

- Enable and test Row Level Security on `cameras` and `incidents`.
- Remove public evidence access and use signed URLs.
- Add authentication before settings and destructive Vault actions.
- Validate and constrain camera stream URLs to reduce SSRF and internal-network exposure.
- Keep service-role keys exclusively in Modal/FastAPI secret stores.
- Add audit logs for camera changes, AI policy changes, evidence deletion, and false-alarm decisions.
- Scan dependencies and container images continuously.

## 5. Strategic Roadmap

### Phase 1: Multi-Tenant Enterprise Tiering

- Organization and workspace isolation in PostgreSQL.
- Team invitations, SSO/OIDC, and organization-level policies.
- RBAC roles: **Admin**, **Security Guard**, and **Auditor**.
- Tenant-scoped Realtime filters and Storage paths.
- Immutable audit logs and configurable retention per organization.
- Usage metering for cameras, GPU-seconds, incidents, and evidence storage.

### Phase 2: Edge-Assisted Hybrid Inference

- Add WebAssembly or WebCodecs-based lightweight motion detection in the browser or an edge gateway.
- Suppress empty-scene windows before invoking Modal GPU processing.
- Use adaptive sampling based on motion intensity and scene classification.
- Preserve privacy by keeping raw frames local until an edge trigger is confirmed.
- Measure GPU savings and alert recall against cloud-only inference.

### Phase 3: Multi-Modal Alert Delivery

- Telegram and Slack integrations with signed incident links.
- WhatsApp Business API notifications with organization consent and templates.
- Generic outbound webhooks with retry, signing, and delivery logs.
- Automated incident ticket creation in systems such as Jira or ServiceNow.
- Escalation policies by anomaly class, score, camera, schedule, and acknowledgement state.

### Phase 4: Advanced Vision Analytics

- Zero-shot anomaly detection with CLIP- or VLM-based open-vocabulary prompts.
- Scene-specific policies and operator-defined detection classes.
- Crowd density and movement heatmaps.
- Vehicle detection and license plate recognition with jurisdiction-aware privacy controls.
- Cross-camera identity-free trajectory analysis and incident correlation.
- Human-in-the-loop feedback to calibrate thresholds and improve model quality.

## 6. Final Verdict

### Readiness: Controlled Production Pilot

DeepGuard.ai has the right architectural shape for a live pilot: a responsive operator console, realtime state delivery, evidence persistence, serverless GPU execution, and explicit passive-camera behavior. Its strongest differentiator is the operational pairing of realtime incident visibility with cost-aware GPU activation rather than a permanently allocated inference fleet.

It is not yet ready for an unrestricted public SaaS launch. The immediate deployment sequence should be:

1. Enforce Supabase RLS, authentication, signed evidence URLs, and server-side authorization.
2. Add webhook idempotency and worker leasing before scaling camera count.
3. Instrument cold starts, GPU-seconds, inference latency, reconnects, and evidence storage.
4. Run a representative pilot with known footage and labeled outcomes to measure precision, recall, and false-alert cost.
5. Define retention, legal hold, incident export, and audit requirements with the target customer.
6. Establish operational SLOs, alerting, backup/restore procedures, and a rollback plan.

**Executive conclusion:** The platform is a credible campus and investor demonstration with a practical path to a controlled production pilot. Its next value unlock is not more UI surface; it is operational hardening, tenant security, measurable model quality, and verifiable GPU economics.
