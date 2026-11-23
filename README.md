# SwiftCargo

SwiftCargo is a local import-logistics web app for managing shipments, shipment costs, documents, master data, users/permissions, and branding settings.

## Stack
- **Frontend:** React + TypeScript + Vite
- **Backend:** Node.js + Express (`server/`)
- **Database:** SQLite persisted via `sql.js` (`server/store.db`)

## Prerequisites
- Node.js and npm

## Install
```bash
npm install
cd server
npm install
```

## Run locally
From the project root:

```bash
# frontend (Vite dev server)
npm run dev

# backend API (http://localhost:3001)
npm run server

# or both together
npm run dev:all
```

Default local URLs:
- Frontend: `http://localhost:8080` (Vite config)
- Backend API: `http://localhost:3001`

## Environment variables

### Frontend (`.env`)
- `VITE_API_URL` — API base URL (defaults in code to `http://localhost:3001`)
- `VITE_SUPABASE_*` — existing Supabase-related variables (if used by your environment)

### Backend (`server` process env)
- `PORT` — API port (default `3001`)
- `CORS_ORIGINS` — comma-separated allowed origins (default: `http://localhost:8080,http://localhost:5173,http://localhost:3000`)
- `JWT_SECRET` — JWT signing secret. If unset, the server generates/persists a local secret in `server/.jwt-secret`.

## Build & checks
```bash
npm run build
npm run lint
npm run test
```

## Notes
- This project uses a local API-backed data model (shipments, master data, users, settings) stored in `server/store.db`.
- Auth/permissions are enforced server-side for protected operations; some endpoints like branding settings read and health check are public by design.
