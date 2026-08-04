# Retail Store POS

A full-stack **Point of Sale (POS)** system built for retail stores — checkout, inventory, products, customers, reports, and back-office settings in one modern web app.

## Features

- **Checkout** — fast product grid, barcode scanning, cart, discounts, multiple payment methods, receipts, and return mode
- **Products** — parent products with pack-size SKUs, pricing, categories, brands, and suppliers
- **Inventory** — per-SKU stock levels, adjustments, movement history, and low-stock alerts
- **Customers** — profiles, loyalty points, and purchase history
- **Settings** — single-branch profile (hex id), users & roles, categories, variants, units, brands, suppliers, receipt templates
- **Reports & dashboards** — sales summaries and operational insights
- **Dark / light theme** — see `design.md` for the design system
- **Admin link** — each POS install is scoped to one branch hex id (`BRANCH_ID` / `VITE_BRANCH_ID`)
## Tech Stack

| Layer | Stack |
|-------|--------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, Framer Motion, Recharts, Zustand |
| Backend | Python, Flask, Flask-SocketIO, SQLAlchemy |
| Database | PostgreSQL 15 |
| Desktop (optional) | Tauri |

## Project Structure

```
retail store pos main/
├── backend/          # Flask API (port 5001)
│   ├── app/          # Models, routes, services
│   ├── run.py
│   └── start-backend.ps1
├── frontend/         # React SPA (port 5173)
│   └── src/
├── docker-compose.yml
└── README.md
```

## Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.10+
- **PostgreSQL** (via Docker or local install)
- **Git**

## Quick Start

### 1. Database

```powershell
docker compose up -d
```

Postgres runs on **localhost:5433** (user: `sootshoot`, password: `password123`, db: `sootshoot`).

### 2. Backend

```powershell
cd backend
copy .env.example .env   # if .env.example exists; otherwise create backend/.env
.\start-backend.ps1
```

API: **http://localhost:5001**

### 3. Frontend

```powershell
cd frontend
npm install
npm run dev
```

App: **http://localhost:5173** (API proxied to backend)

### Default login

Use the credentials created during first-time setup, or run the setup flow at `/setup` if the database is fresh.

## Environment

Create `backend/.env` with your database URL and secrets, for example:

```env
DATABASE_URL=postgresql://sootshoot:password123@localhost:5433/sootshoot
SECRET_KEY=your-secret-key
# Hex id from admin panel for this store (optional until setup)
BRANCH_ID=
```

Optional frontend `frontend/.env`:

```env
VITE_BRANCH_ID=<same-hex-id-as-BRANCH_ID>
```

Each POS install is **single-branch scoped**. Set the same 32-character hex id on backend and frontend so the terminal stays aligned with the admin panel. UI theme rules: see [`design.md`](./design.md).

> **Never commit** `backend/.env` — it is listed in `.gitignore`.

## Scripts

| Command | Location | Description |
|---------|----------|-------------|
| `.\start-backend.ps1` | `backend/` | Start API with venv (kills stale port 5001) |
| `npm run dev` | `frontend/` | Dev server with hot reload |
| `npm run build` | `frontend/` | Production build |
| `npm run tauri:dev` | `frontend/` | Desktop app (Tauri) |

## Branches

| Branch | Purpose |
|--------|---------|
| `dev` | Active development |
| `main` | Stable releases (when promoted from `dev`) |

## License

Private / proprietary — all rights reserved unless otherwise noted.

## Repository

[github.com/mobeenkiani6/Retail_POS](https://github.com/mobeenkiani6/Retail_POS)
