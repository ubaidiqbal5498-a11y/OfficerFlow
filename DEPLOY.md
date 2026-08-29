# OfficerFlow deployment

This application is **not deployed yet**. Follow the steps below when you are ready.
Do not buy a domain or paid plan until you choose a host.

OfficerFlow is one Node.js program:

- the React website (after `npm run build`)
- the Express API (`/api`)
- your existing SQLite file (`data/officerflow.db`)

```
Internet
  → HTTPS URL (from the host)
    → OfficerFlow (this project)
        → React pages
        → Express API
        → SQLite on a persistent disk
```

The SQLite file is never published as a download. Only a signed-in Admin can create a backup from Settings.

## 1. Recommended hosting

**Simplest reliable option: Railway** (or a small VPS such as Hetzner / DigitalOcean).

You need:

- **Node.js 22+**
- **one running instance** (do not scale to many copies)
- **a persistent disk/volume** so `officerflow.db` survives restarts

Do **not** use Vercel, Netlify, or GitHub Pages. Those hosts do not keep a SQLite file safely.

SQLite is enough for this office. PostgreSQL is only needed later if a host cannot give you a persistent disk. Do **not** migrate automatically — first download a backup from Settings.

## 2. Exact deployment steps (Railway example)

1. Install [Node.js 22+](https://nodejs.org/) on your PC if needed.
2. Keep your current folder. Do **not** delete `data/officerflow.db`.
3. On your PC, test production locally:

```bash
npm install
npm run build
npm start
```

Open `http://localhost:3847`, sign in as Admin, and confirm officers EMP001–EMP004 are still there.

4. Create a free GitHub repository and push this project (do **not** commit `.env`).
5. Open [Railway](https://railway.app), sign in, **New Project → Deploy from GitHub**.
6. Add a **Volume** and mount it at `/var/data`.
7. In Railway **Variables**, add the environment variables from section 3.
8. Copy your local database onto the volume **before** people start using the live site:

   - Local file: `data/officerflow.db`
   - On the server: `/var/data/officerflow.db`

   Railway: use their volume/file tools or CLI. VPS: `scp data/officerflow.db user@server:/var/data/officerflow.db`

9. Deploy. Check `https://YOUR-HOST-URL/api/health` — it should return `{"ok":true,"status":"ok"}`.
10. Open the public HTTPS URL Railway shows you. Sign in as Admin. Create the Boss account (section 5).

## 3. Required environment variables

Copy `.env.example` to `.env` on your PC. On the host, set the same keys in the dashboard (never commit real values).

| Variable | Required | What to put |
|---|---|---|
| `NODE_ENV` | yes | `production` |
| `HOST` | yes | `0.0.0.0` |
| `PORT` | no | Leave empty; Railway sets it |
| `DATA_DIR` | yes | `/var/data` (the volume path) |
| `SESSION_SECRET` | yes | Long random text. Generate with: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `SESSION_DAYS` | no | `7` |
| `COOKIE_SECURE` | no | Leave unset on HTTPS (defaults to secure cookies) |
| `CORS_ORIGINS` | no | Leave empty when the website and API are the same URL |
| `ADMIN_USERNAME` | first boot only | `admin` — used **only if** that username does not exist yet |
| `ADMIN_PASSWORD` | first boot only | Your Admin password — used **only if** the admin user does not exist yet |
| `VITE_API_URL` | no | Leave empty so the site calls `/api` on the same HTTPS URL |

Do **not** set a Boss password in environment variables. Create Boss from the Admin panel.

Never put real passwords, JWT/session secrets, or the database file in Git.

## 4. Database requirements

- Keep using the **existing** SQLite file. Startup adds missing columns/tables only. It does not delete officers, attendance, or salary.
- The disk must be **persistent**. If the host wipes the filesystem on each deploy, attendance and officers will look empty even though your laptop copy is fine.
- One server process only. Two copies of the app writing the same SQLite file is unsafe.
- PostgreSQL: skip unless you later move to a host without a disk. Then: Admin backup first, restore on a test copy, migrate with a tool, never drop the live file as the first step.

## 5. How to create the Boss account

1. Sign in as **Admin**.
2. Open **Settings** (or **User Management**).
3. Under **User Management**, fill in:
   - Full name
   - Username (for example `boss`)
   - Email (optional)
   - Role: **Boss**
   - Status: **Active**
   - Password (choose it yourself; it is not displayed later)
4. Click **Create user**.

If a `boss` user already exists, use **Edit** / **Reset password** instead of creating a second one.

## 6. How Admin login works

- Open the public URL (or `http://localhost:3847` after `npm start`).
- Username: `admin`
- Password: the Admin password you already configured (Settings → Security, or `npm run set-admin-password` on your PC).
- After Sign In you go to the Dashboard.
- Sign out with **Sign out** in the sidebar.

Inactive users cannot sign in. Boss cannot open Settings, User Management, backup, or Admin-only APIs.

## 7. How to get the public HTTPS URL

Railway (and Render) give you an `https://….up.railway.app` (or similar) address automatically after the first successful deploy. That is your public URL. You do not need a custom domain to start.

## 8. Custom domain later (optional)

In the host dashboard:

1. Add your domain, for example `officerflow.example.com`.
2. Create the DNS record they show (usually a CNAME).
3. Wait for HTTPS to become active.

You do not need to change OfficerFlow code if `VITE_API_URL` is empty.

## 9. How to backup the production database

While signed in as Admin:

1. Settings → **Backup database**.
2. Save the downloaded `.db` file in a private folder (not on a public website).

That file includes officers, attendance, salary, salary history, users, and settings.

On a VPS you can also copy `/var/data/officerflow.db` with `scp` when the app is idle.

## 10. How to update the application safely

1. Download a fresh Admin backup.
2. On your PC: `npm install`, `npm run build`, sign in locally and smoke-test Dashboard / Attendance / Salary.
3. Push the new code (still without `.env` or `data/*.db` if those are ignored).
4. Redeploy. The volume keeps `officerflow.db`.
5. Open `/api/health`, then sign in and confirm EMP001–EMP004 and recent attendance.

If something looks wrong, restore the backup from Settings (Admin only) or copy the `.db` file back onto the volume.

## Commands

| What | Command |
|---|---|
| Development | `npm run dev` → http://localhost:5173 |
| Production build | `npm run build` |
| Production start | `npm start` → http://localhost:3847 |
| Health check | `GET /api/health` |
| Reset Admin password (local terminal) | `npm run set-admin-password` |

## Roles

**Admin:** Dashboard, officers (add/edit), profiles, attendance, reports, salary (view + process), settings, backup/restore, user management.

**Boss:** Dashboard, view officers and profiles, daily attendance (including edit), monthly reports, view salary. No user management, no authentication settings, no database reset, no backup deletion/restore, no critical system settings.
