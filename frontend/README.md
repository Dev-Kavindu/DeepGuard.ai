# DeepGuard.ai Frontend

The DeepGuard.ai frontend is a Next.js App Router operations console for monitoring AI-assisted security cameras and reviewing preserved incident evidence. It is designed as a responsive dark-glass SaaS interface for desktop control rooms and mobile operator workflows.

## Product Areas

- **Live Command Center** (`/`): camera grid, live/offline status, MP4 playback, realtime incident highlighting, timestamps, and detection context.
- **Incident Vault** (`/vault`): searchable incident table with anomaly scores, playback, downloads, false-alarm feedback, and deletion controls.
- **Camera Configuration** (`/settings`): camera registration, RTSP/MP4 source URLs, Supabase Storage test-video uploads, sensitivity thresholds, and source removal.

## Technology

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Lucide React icons
- Supabase JavaScript client and Postgres Realtime
- Biome for formatting and lint checks

## Environment

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
```

Only the public Supabase URL and anon key belong in the browser. Keep service-role keys and backend credentials out of frontend environment variables.

The frontend expects these Supabase resources:

- `cameras` table with `id`, `name`, `url`, `threshold`, and `active`
- `incidents` table with `id`, `camera_id`, `anomaly_type`, `anomaly_score`, `video_url`, `is_false_alarm`, and `created_at`
- `incident_vault` Storage bucket
- Realtime enabled for `incidents`

## Local Development

From the repository root:

```powershell
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Quality Checks

```powershell
npm run lint
npm run build
```

`npm run build` performs the production Next.js compilation and TypeScript validation. `npm run lint` runs the repository Biome configuration.

## Project Layout

```text
src/
├── app/
│   ├── page.tsx              # Live Command Center
│   ├── vault/page.tsx        # Incident Vault
│   ├── settings/page.tsx     # Camera Configuration
│   ├── layout.tsx            # Global responsive shell
│   └── globals.css           # Theme and shared utilities
├── components/
│   ├── CameraGrid.tsx        # Camera feeds and realtime alerts
│   └── Sidebar.tsx            # Desktop rail and mobile navigation
└── lib/
	└── supabase.ts           # Browser Supabase client
```

## Realtime Behavior

`CameraGrid` subscribes to the Supabase `incidents` INSERT channel. When a new incident arrives, the matching camera receives a temporary alarm state and the UI attempts to play the local alarm asset. The subscription is removed during component cleanup.

Database and Storage calls remain client-side in the existing flows. Add authentication, Row Level Security, and protected Storage policies before exposing the console to external users.

## Deployment

The frontend can be deployed to Vercel or another Node-compatible platform:

```powershell
npm run build
npm run start
```

Set the two `NEXT_PUBLIC_*` variables in the deployment environment and configure the backend `CORS_ORIGINS` value to the deployed frontend URL.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
