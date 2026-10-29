# Box Productivity Suite: Web UI

React + TypeScript + Vite + Tailwind CSS + React Query + Recharts + Lucide.

Two modes, switchable from the header:

- **DEMO MODE** (default): seeded, fictional data. No Box credentials needed. Search, document details, collaborators, retention, simulated deletion and audit logs all work.
- **LIVE BOX**: a real Box folder by Folder ID, through the Box integration layer. If Box authentication is missing or expired, the UI shows *"Live Box connection unavailable. Please switch to Demo Mode."* with a one-click switch. It never crashes.

## Run it

```bash
# 1. Backend API (repo root). Needed for the real SQLite FTS5 search.
npm install
npm run seed-demo      # loads 17 demo documents into the SQLite index
npm run build
npm run web-api        # http://127.0.0.1:8799

# 2. Frontend
cd frontend
npm install
npm run dev            # http://127.0.0.1:5173
```

`npm run dev` on its own also works for Demo Mode: if the API is not running, the app falls back to a copy of the seeded data bundled with it, and says so on screen. Live Mode and the System Status page need the API.

## Pages

| Page | What it shows |
|---|---|
| Search | FTS5 search with relevance score, department, owner, path and modified date. Click a row for the detail panel. |
| Folder Explorer | **Connect Folder** (Live) lists a real folder's files, collaborators and retention. **Load Demo Folder** shows the seeded content as a tree. |
| Retention Center | Protected TRUE/FALSE, reasons, collaborator count and an **Attempt Delete** button. |
| Audit Logs | Retention decisions with Blocked / Allowed / All filters and a chart. |
| System Status | MCP server, Box authentication, search index, database and retention engine. |

## Safety properties

- **Nothing is ever deleted.** *Attempt Delete* is a dry run in both modes. It evaluates the retention rules and writes an audit entry. The API contains no Box delete call.
- **Live retention fails closed.** If a file's collaborators cannot be read, it is shown as *Unverified* and treated as protected, not as deletable.
- **Demo audit entries are kept apart** from the production retention log (`data/demo-audit-log.jsonl`).
- The API binds to `127.0.0.1` only, sends no CORS headers, checks the `Host` header, requires a custom header on POST, and validates all input. Box error details are logged server-side and never sent to the browser. The Vite dev server proxies `/api`, so the browser uses a single origin.

## Live Mode credentials

The API uses the same authentication as the MCP server (`src/box-client.ts`): `BOX_ACCESS_TOKEN` first, then `credentials/box-token.json`, then JWT. Export the variables in the shell that starts `npm run web-api`, and **restart the API** after changing them. The client is cached for the life of the process.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `WEB_API_PORT` | `8799` | API port (127.0.0.1 only) |
| `WEB_API_URL` | `http://127.0.0.1:8799` | Where the Vite dev server proxies `/api` |
| `WEB_DEMO_AUDIT_LOG` | `data/demo-audit-log.jsonl` | Demo Mode audit file |

## Refreshing the bundled demo data

`src/data/demoDocuments.ts` is generated. After changing `scripts/seed-demo-data.ts`:

```bash
npm run seed-demo && npm run build && npm run web-api   # in the repo root
npm run sync-demo-data                                  # in frontend/
```

## Structure

```
src/
  services/    boxService, searchService, retentionService, auditService  (+ offlineDemo fallback)
  state/       ModeContext (Live/Demo, persisted)
  pages/       Search, Explorer, Retention, Audit, Status
  components/  Layout, ModeToggle, DocumentPanel, LiveUnavailable, ui/*
  types/       wire types shared with src/api/dto.ts
```
