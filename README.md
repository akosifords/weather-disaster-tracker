# PH Flood Disaster Tracker

Real-time, map-first flood reporting for the Philippines. The app collects community reports, highlights hotspots by severity, and surfaces stranded cases needing rescue. Made with love and intention to help save lives during disasters in the Philippines.
If this helps your community or you have suggestions, I’d love to hear from you.

## Demo
- Live: https://weather-disaster-tracker.vercel.app/

## Highlights
- Live hotspot map with severity-based markers
- Barangay-level visualization and admin boundaries
- Rescue flagging for stranded reports
- Fast, map-first UI built for quick situational awareness
- Community-first reporting flow

## Tech Stack
- React + TypeScript + Vite
- Leaflet (maps)
- Supabase (Postgres + PostGIS)
- Vercel Functions (API)

## Screenshots
- (add screenshots or GIFs)

## Run Locally
```bash
npm install
npm run dev
```

## Environment Variables
Create a `.env` file with:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_BASE_URL=
VITE_STADIA_API_KEY=
```

## Build
```bash
npm run build
npm run preview
```

## License
MIT
