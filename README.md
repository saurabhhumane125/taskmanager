# Taskflow

A simple task manager built with React, Express, Node.js, and optional MongoDB. Add, edit, complete, search, sort, and delete tasks in a responsive interface.

## Run locally

Requires Node.js 20.19+ or 22.12+ and npm.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. The API runs on port 3001. On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm`.

Without configuration, tasks persist in `data/tasks.json`. The interface identifies this as demo mode. It is a working fallback for presentations, not a MongoDB database.

## Enable MongoDB (the full MERN version)

Copy `.env.example` to `.env`, then set your MongoDB connection string:

```env
PORT=3001
MONGODB_URI=mongodb://127.0.0.1:27017/taskflow
```

Use a running local MongoDB instance or your Atlas connection string. Keep credentials in `.env`. Restart the server. The footer should show **Connected to MongoDB**. A failed configured connection stops startup instead of silently switching storage. Demo and MongoDB data are separate; switching does not migrate tasks.

### Local MongoDB on Windows

If the server is not installed, install MongoDB Community using Windows Package Manager (an administrator prompt may appear):

```powershell
winget install --id MongoDB.Server --exact --source winget --silent --accept-source-agreements --accept-package-agreements
```

MongoDB should run as the `MongoDB` Windows service. Check it with `Get-Service MongoDB`. If stopped, run `Start-Service MongoDB` in an administrator PowerShell terminal. The database runs separately from `npm run dev` and keeps running when the app stops.

After setting `.env`, verify the real database connection:

```powershell
npm.cmd run db:check
```

`npm.cmd run test:mongodb` verifies the API against your configured real database. It creates one temporary test task and removes it afterward, leaving existing tasks untouched.

Restart `npm.cmd run dev` after changing `.env` (Node watch mode does not watch this file). Open `/api/health` to confirm `"storage":"mongodb"`. Add a task and refresh to demonstrate persistence. In MongoDB Compass, connect to `mongodb://127.0.0.1:27017` and open `taskflow` → `tasks` to view saved records after creating a task. Compass is optional and installed separately.

## Production build

```sh
npm run build
npm start
```

Open http://127.0.0.1:3001. Express serves the built frontend and API from the same process. In development, Vite proxies API requests to port 3001; keep that port for `npm run dev`.

## Verify

```sh
npm test
npm run build
```

API tests cover task creation, validation, updates, deletion, filtering fields, missing records, and file persistence. MongoDB requires a real connection for integration verification.

## Presentation walkthrough

1. Explain React renders the interface, Express handles HTTP requests, and MongoDB stores tasks (when configured).
2. Add “Prepare internship presentation” with a due date and priority.
3. Edit the description, search for it, and mark it complete.
4. Show the summary cards and Completed filter updating.
5. Refresh to demonstrate persistence, then delete the task using the confirmation dialog.

See `IMPLEMENTATION_PLAN.md` for the design and scope. This is a single-user local demonstration without authentication.
