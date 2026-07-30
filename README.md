# 🧠 Mind Map Task Manager

A single-user web app for managing tasks as a **branching mind map** (XMind-style).
Nodes branch from a root topic, any node can be marked **Done**, and each node's
color is **derived automatically** from its status, deadline, and the state of its
whole subtree.

- **Frontend:** React (Vite) + [React Flow](https://reactflow.dev/) canvas + [dagre](https://github.com/dagrejs/dagre) auto-layout + TailwindCSS
- **Backend:** Node.js + Express REST API
- **Database:** SQLite (via `better-sqlite3`), file-based, persisted in a Docker volume
- **Packaging:** one multi-stage Docker image (Express serves the built frontend)
- **No login / no accounts** — all data is shared.

---

## Quick start with Docker

> Requires Docker Engine with the **Compose plugin** (`docker compose`).
> On this machine the plugin was not detected — see [If `docker compose` is missing](#if-docker-compose-is-missing).

```bash
docker compose up --build
```

Then open **http://localhost:3000**.

Stop with `Ctrl+C`, or run detached with `docker compose up --build -d` and stop with
`docker compose down`. Your data lives in the named volume `task-data` and survives
restarts and rebuilds. To wipe all data: `docker compose down -v`.

### If `docker compose` is missing

This host has `docker` but not the `docker compose` subcommand. You can either:

**A) Install the Compose plugin** (Debian/Ubuntu):
```bash
sudo apt-get update && sudo apt-get install -y docker-compose-plugin
```

**B) Run the single container without Compose:**
```bash
docker build -t tracking-task .
docker volume create task-data
docker run -d --name tracking-task -p 3000:3000 -v task-data:/app/data tracking-task
```
Open http://localhost:3000. Stop/remove with `docker rm -f tracking-task`.

> **Docker permissions:** if you get `permission denied ... docker.sock`, your user
> isn't in the `docker` group. Fix with `sudo usermod -aG docker $USER` then log out
> and back in (or prefix commands with `sudo`).

---

## Running locally without Docker (dev mode)

Two terminals:

```bash
# Terminal 1 — backend on :3000
cd backend
npm install
npm run dev

# Terminal 2 — frontend on :5173 (proxies /api to :3000)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

> `better-sqlite3` is a native module. If `npm install` fails to compile it, make sure
> `python3`, `make`, and `g++` are installed and on your PATH (`npm_config_python=/usr/bin/python3 npm install`).
> Node 20+ is recommended.

---

## Using the app

- **Add nodes:** click a node → the edit panel opens → **+ Child** or **+ Sibling**.
- **Edit:** click a node to set its title, done toggle, deadline, assignee, and notes.
- **Layout:** nodes arrange themselves automatically into a tidy left-to-right tree
  (see below). You can drag for minor tweaks; the **✨ Tidy layout** toolbar button
  snaps everything back.
- **Collapse/expand:** any node with children shows a `+`/`−` circle on its right edge;
  click it to hide/show that whole branch. Use **Collapse all** / **Expand all** in the
  toolbar for everything at once.
- **Delete:** the **Delete** button removes the node **and all its descendants**
  (with a confirmation prompt).
- **Assignees:** the **Assignees** tab is a simple CRUD list of people you can assign
  to tasks (shown as an initials badge on each node).

## Tree layout & collapse/expand

Positions are computed automatically with **dagre** (`frontend/src/layout.js`) as a
left-to-right tree: root on the left, deeper levels further right. Because dagre ranks
nodes by depth, **all siblings share the same X (aligned left edges)** and are evenly
spaced vertically. Every node is a **fixed 220×56px** (titles truncate with the full
text on hover / in the edit panel). The layout re-runs automatically after any add,
delete, or collapse/expand.

Collapsing a node hides its entire subtree and its edges, and shows a **"N hidden"**
badge. Collapsing is **purely visual** — the API always returns the full tree, so a
parent's derived color is still computed from the whole hidden subtree. The state is
stored per node (`isCollapsed`) and survives refreshes and container restarts.

---

## Color / status logic (the important part)

Colors are **never stored in the database**. They are recomputed on every render (and
once a minute, and on window focus) so a node can silently turn red the moment its
deadline passes — no stale data possible. The logic lives in
[`frontend/src/color.js`](frontend/src/color.js).

Priority for any node, computed over its **entire subtree**:

```
RED  >  GREEN  >  NEUTRAL
```

| Situation | Color |
|---|---|
| Leaf, not done, no overdue deadline | ⚪ neutral (white/gray) |
| Leaf, done | 🟢 green |
| Any node with a deadline in the past **and** not done | 🔴 red |
| Parent — it is overdue **or** any descendant is red | 🔴 red (red always wins) |
| Parent — not red **and** every child is green | 🟢 green |
| Parent — otherwise | ⚪ neutral |

Marking a node **done** clears its own overdue-red. A parent turns green only when its
**whole** subtree is done. A single red node anywhere below a parent forces that parent
(and every ancestor) red, regardless of other done siblings.

Node badges: ✅ done, ⏰ overdue, 🔔 due within 24h, and an initials avatar for the assignee.

---

## Data model

**`Task`** — `id`, `title`, `description`, `parentId` (nullable; `null` = root),
`isDone`, `deadline` (nullable ISO datetime), `assigneeId` (nullable FK),
`positionX`, `positionY`, `isCollapsed` (branch collapsed in the UI),
`createdAt`, `updatedAt`.
Deleting a task cascades to its descendants (`ON DELETE CASCADE`). Old databases are
migrated in place to add `isCollapsed` on startup.

**`Assignee`** — `id`, `name`, `createdAt`.
Deleting an assignee sets referencing tasks' `assigneeId` to `NULL` (`ON DELETE SET NULL`).

There is **no `color` column** — color is always derived.

## API

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/tasks` | Full task list (flat; tree built client-side from `parentId`) |
| POST | `/api/tasks` | Create a task (`parentId` for a child) |
| PUT | `/api/tasks/:id` | Partial update (title, isDone, deadline, assignee, position, notes, isCollapsed) |
| DELETE | `/api/tasks/:id` | Delete a task and all descendants |
| GET | `/api/assignees` | List assignees |
| POST | `/api/assignees` | Create assignee |
| PUT | `/api/assignees/:id` | Rename assignee |
| DELETE | `/api/assignees/:id` | Delete assignee |
| GET | `/api/health` | Health check |

## Data flow

1. `GET /api/tasks` + `GET /api/assignees` load the flat data.
2. The frontend builds the tree from `parentId` and derives every node's color with
   `computeColors()` against the current time.
3. React Flow renders nodes (colored, badged) and edges (parent → child).
4. Edits/moves call the REST API, then re-fetch so colors re-derive.

---

## Folder structure

```
tracking-task/
├── docker-compose.yml       # one service, SQLite persisted in the `task-data` volume
├── Dockerfile               # multi-stage: build frontend → serve from Express
├── backend/
│   ├── package.json
│   └── src/
│       ├── index.js         # Express app + serves built frontend from ./public
│       ├── db.js            # SQLite schema, seed, connection
│       └── routes/
│           ├── tasks.js     # /api/tasks CRUD (+ cascade delete)
│           └── assignees.js # /api/assignees CRUD
└── frontend/
    ├── package.json
    ├── vite.config.js       # dev server proxies /api → :3000
    └── src/
        ├── App.jsx          # canvas, tabs, wiring, layout + collapse orchestration
        ├── api.js           # REST client
        ├── color.js         # ⭐ color/status derivation (see above)
        ├── layout.js        # dagre left-to-right auto tree layout + node size
        ├── tree.js          # tree helpers (hidden ids, descendant counts)
        └── components/
            ├── TaskNode.jsx     # custom React Flow node (+ collapse toggle, badge)
            ├── EditPanel.jsx    # node editor + add/delete actions
            └── AssigneesPage.jsx# assignee CRUD screen
```
