# OfficerFlow

Professional officer management, daily attendance, monthly reports, and salary records for a small office.

Data is stored in SQLite (`data/officerflow.db`) and is never reset on startup.

## Requirements

- Node.js 22 or later

## Local development

```bash
copy .env.example .env
npm install
npm run dev
```

Then open **http://localhost:5173**

Sign in with username `admin` and the Admin password you already set. The API runs on port **3847** and the Vite dev server proxies `/api` to it.

Create a Boss account after you sign in: **Settings → User Management** (or the **User Management** page). Choose the Boss username and password yourself.

## Daily workflow

1. Open Daily Attendance
2. Select today’s date (already selected)
3. Mark each active officer Present / Absent / Half Day / Leave / Off
4. Enter check-in and check-out where needed
5. Save once

Dashboard, monthly reports, officer profiles, and salary calculations update from that saved attendance.

## Production (same machine)

```bash
npm install
npm run build
npm start
```

Then open **http://localhost:3847** and sign in.

Public HTTPS deployment steps are in [DEPLOY.md](DEPLOY.md).
