# Project Report — Mind Map Task Manager

**Date:** 2026-07-29
**Status:** ✅ Complete, built, and verified running in Docker

---

## 1. Overview

A single-user web application for managing tasks as a **branching mind map**
(XMind-style). A root topic branches into tasks and sub-tasks to any depth. Any
node can be marked **Done**, given a **deadline** and an **assignee**, and each
node's **color is derived automatically** from its own status, its deadline, and
the recursive state of its entire subtree.

No login, no accounts, no multi-tenancy — all data is shared, as specified.

---

## 2. Technology stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React 18 (Vite) | SPA |
| Canvas | React Flow 11 | drag, zoom, pan, mini-map |
| Styling | TailwindCSS 3 | utility CSS |
| Backend | Node.js + Express 4 | REST API |
| Database | SQLite via `better-sqlite3` | file-based, synchronous |
| Packaging | Single multi-stage Docker image | Express serves the built frontend |
| Persistence | Docker named volume `task-data` | survives restarts/rebuilds |

**Key design decision:** one container instead of two. The Docker build compiles
the React app, then copies the static bundle into the backend's `./public`, which
Express serves. Simpler to run and maintain than separate frontend/backend
containers.

---

## 3. Features delivered

### Core
- ✅ Branching tree with a root node; unlimited nesting depth.
- ✅ Any node markable **Done**.
- ✅ **Automatic color rules** (see §4) — the core logic.
- ✅ Per-node **deadline** (date + time), **assignee** (from a shared list), and
  free-text **notes**.
- ✅ Assignee management screen (full CRUD).
- ✅ Single-user, no auth.

### UI / UX
- ✅ Mind-map canvas: drag to reposition, zoom in/out, pan, mini-map.
- ✅ Click a node → slide-in edit panel (title, done toggle, deadline, assignee, notes).
- ✅ **+ Child**, **+ Sibling**, and **Delete** (with confirmation; deletes all descendants).
- ✅ Nodes show status color, deadline badges (✅ done / ⏰ overdue / 🔔 due within 24h),
  and an assignee initials avatar.
- ✅ Separate **Assignees** tab.
- ✅ Color legend in the header.

### Delivery
- ✅ `Dockerfile` (multi-stage) + `docker-compose.yml` with a persistent volume.
- ✅ Port 3000 exposed and documented.
- ✅ `README.md` — install, run, folder structure, data flow, color logic.
- ✅ Clean `frontend/` + `backend/` separation; the color logic is heavily commented.

---

## 4. Color / status logic (the crown jewel)

Colors are **never stored** in the database — they are derived on every render,
once a minute, and on window focus, so a node turns red the moment its deadline
passes without any DB write. Logic lives in `frontend/src/color.js`.

Priority for any node, computed over its **entire subtree**:

```
RED  >  GREEN  >  NEUTRAL
```

| Situation | Color |
|---|---|
| Leaf, not done, not overdue | ⚪ neutral |
| Leaf, done | 🟢 green |
| Any node with a past deadline **and** not done | 🔴 red |
| Parent overdue **or** any descendant red | 🔴 red (red always wins) |
| Parent not red **and** every child green | 🟢 green |
| Parent otherwise | ⚪ neutral |

Marking a node done clears its own overdue-red. A parent goes green only when its
whole subtree is done. A single red node anywhere forces every ancestor red.

---

## 5. Data model

**`Task`**: `id`, `title`, `description`, `parentId` (nullable; null = root),
`isDone`, `deadline` (nullable), `assigneeId` (nullable FK), `positionX`,
`positionY`, `createdAt`, `updatedAt`.
Delete cascades to descendants (`ON DELETE CASCADE`).

**`Assignee`**: `id`, `name`, `createdAt`.
Deleting an assignee nulls referencing tasks' `assigneeId` (`ON DELETE SET NULL`).

No `color` column — always derived.

### API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/tasks` | Full flat task list |
| POST | `/api/tasks` | Create task (`parentId` for a child) |
| PUT | `/api/tasks/:id` | Partial update |
| DELETE | `/api/tasks/:id` | Delete task + descendants |
| GET/POST/PUT/DELETE | `/api/assignees[/:id]` | Assignee CRUD |
| GET | `/api/health` | Health check |

---

## 6. Verification

All checks were run against the actual code and the running Docker container.

| Check | Result |
|---|---|
| Frontend production build (`vite build`) | ✅ 203 modules, no errors |
| Docker image build (Node 20) | ✅ native `better-sqlite3` compiled cleanly |
| API endpoints (create / update / cascade-delete / assignee CRUD) | ✅ all pass |
| Color logic vs. spec | ✅ **12 / 12 rule tests pass** |
| Container live | ✅ health OK, frontend served, root node seeded |
| Data persistence across container restart | ✅ verified via named volume |

Color test cases covered: leaf neutral/done/overdue, overdue-but-done stays green,
`red > green` (done sibling next to an overdue node → parent red), deep red
propagation to root, parent green only when whole subtree done, self-overdue
parent, and future deadlines staying neutral.

---

## 7. How to run

```bash
cd /home/anhpn85/dev/tracking-task
docker compose up --build         # requires the compose plugin
# open http://localhost:3000
```

Without the compose plugin (plain Docker):

```bash
docker build -t tracking-task .
docker volume create task-data
docker run -d --name tracking-task -p 3000:3000 -v task-data:/app/data tracking-task
```

Local dev (no Docker): `npm run dev` in `backend/` (:3000) and `frontend/` (:5173).

---

## 8. Environment notes for this machine

- The Docker daemon was not running and had to be started (`sudo systemctl start docker`).
  Enable on boot with `sudo systemctl enable docker`.
- The `docker compose` plugin is **not installed** — plain `docker run` was used.
  Install with `sudo apt-get install -y docker-compose-plugin` for the compose workflow.
- The current user is not in the `docker` group (needs `sudo`). Fix with
  `sudo usermod -aG docker $USER`, then log out and back in.
- Host Node is v18 with a broken `node-gyp`; the Docker image uses Node 20 and
  compiles the native module without issue, so Docker is the recommended path.

---

## 9. Possible future enhancements

- Automated test suite (color logic + API integration).
- Auto-layout button (tidy tree arrangement).
- Multi-assignee support and richer filtering (by assignee, by status).
- Real-time updates via WebSockets (currently periodic recompute on the client).
- Export / import (JSON or XMind format).
