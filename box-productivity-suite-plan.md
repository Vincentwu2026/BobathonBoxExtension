# Box Productivity Suite — Plan

## Top-Level Overview

Build a backend productivity tool that wraps IBM Box (the enterprise file-storage platform) with three
capabilities:

1. **Box MCP Server** — exposes Box as a rich set of MCP tools so AI agents (Bob and others) can
   search, read, upload, move, and manage files/folders via natural language.
2. **File Indexing Agent** — crawls Box on a schedule, builds and maintains a local full-text and
   metadata index for fast enhanced search.
3. **Retention / Deletion-Protection Guard** — a rule engine that prevents files with active
   collaborators from being deleted or expired, even when the original owner's account is
   deactivated (e.g. an IBMer who has left).

The scope is **backend-only** for this phase. All capabilities are exposed via the MCP server so a
UI layer can be added later without changing the core.

---

## Architecture Overview

```
Box Cloud API (OAuth 2.0)
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│                   box-mcp-server (Node.js / stdio)        │
│                                                           │
│  ┌─────────────────┐  ┌────────────────┐  ┌───────────┐  │
│  │  Box API Client │  │  Search Index  │  │ Retention │  │
│  │  (box-node-sdk) │  │  (SQLite FTS5) │  │   Guard   │  │
│  └────────┬────────┘  └───────┬────────┘  └─────┬─────┘  │
│           │                   │                  │        │
│  ┌────────▼──────────────────▼──────────────────▼──────┐ │
│  │              MCP Tool Registry                       │ │
│  │  box_search  box_get_file  box_upload  box_move      │ │
│  │  box_list_collaborators    box_check_retention       │ │
│  │  index_crawl   index_search                          │ │
│  └──────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
        │
        ▼
   Bob / AI Agents (via MCP stdio transport)
```

**Tech stack**

| Concern | Choice | Rationale |
|---|---|---|
| Runtime | Node.js 20 LTS (TypeScript) | MCP SDK is first-class TS/Node |
| Box SDK | `box-node-sdk` (official) | Official IBM/Box client |
| MCP SDK | `@modelcontextprotocol/server` v2 | Standard stdio transport |
| Index store | SQLite with FTS5 extension | Zero-dependency, embedded, full-text |
| Schema validation | `zod` | Required by MCP v2 tool API |
| Auth | OAuth 2.0 (JWT app auth for service account) | Allows access to all enterprise content |

---

## Sub-Tasks

---

### Sub-Task 1 — Project Scaffolding & OAuth Setup

**Status:** [ ] pending

**Intent**
Create the Node.js / TypeScript project, install all dependencies, configure the build pipeline,
and wire up the Box OAuth 2.0 JWT app-auth flow so every subsequent sub-task can authenticate
against Box without hardcoding credentials.

**Expected Outcomes**
- `package.json`, `tsconfig.json`, and `src/index.ts` shell exist.
- `npm run build` succeeds and produces `build/index.js`.
- A `get-tokens.js` one-time script exchanges Box JWT app credentials for an access token and
  stores the result in a local credential file (gitignored).
- All secrets are read from environment variables; no credentials appear in code.
- `.gitignore` excludes `build/`, `node_modules/`, `*.env`, and `credentials/`.

**Todo List**
1. Create project directory structure:
   `src/`, `scripts/`, `data/`, `credentials/` (gitignored).
2. Write `package.json` with `"type": "module"`, build script, and `bin` entry.
3. Write `tsconfig.json` targeting ES2022 / Node16.
4. Install runtime deps: `@modelcontextprotocol/server`, `box-node-sdk`, `zod`, `better-sqlite3`.
5. Install dev deps: `typescript`, `@types/node`, `@types/better-sqlite3`.
6. Write `scripts/get-tokens.ts` — reads `BOX_CLIENT_ID`, `BOX_CLIENT_SECRET`,
   `BOX_ENTERPRISE_ID`, `BOX_PRIVATE_KEY` from env; performs JWT auth; writes the service
   account token to `credentials/box-token.json` (not committed).
7. Write `src/box-client.ts` — singleton that reads token from env or credential file and
   constructs the `BoxClient`.
8. Write `.gitignore` covering credentials, build, and env files.
9. Run `npm run build` and confirm it passes.

**Relevant Context**
- Box JWT app auth docs: https://developer.box.com/guides/authentication/jwt/
- MCP build-mcp-server skill: scaffold shape matches `src/index.ts` as the stdio entry point.
- Credentials MUST be env-injected (`${env:BOX_CLIENT_ID}` etc.) in `mcp.json`, never hardcoded.

---

### Sub-Task 2 — Box MCP Server — Core File Tools

**Status:** [ ] pending

**Intent**
Implement the primary MCP tools that let AI agents perform file and folder management operations
on Box. This is the core of the MCP server.

**Expected Outcomes**
- The MCP server starts cleanly via `node build/index.js` and connects over stdio.
- The following tools are registered and callable:
  - `box_search` — full-text search across Box using the Box Search API.
  - `box_get_file` — retrieve file metadata and download URL by file ID.
  - `box_list_folder` — list contents of a folder by folder ID.
  - `box_upload_file` — upload a file to a target folder.
  - `box_move_file` — move a file to another folder.
  - `box_list_collaborators` — list all collaborators on a file or folder.
  - `box_get_file_versions` — list version history of a file.
- Each tool returns structured JSON. Failures return `isError: true` with a descriptive message.
- All tools validate input with `zod` schemas.

**Todo List**
1. Create `src/tools/box-file-tools.ts` — implement the seven tools listed above using
   `box-node-sdk` API calls.
2. Register all tools in `src/index.ts` using `server.registerTool`.
3. Add input/output type guards for all Box API responses.
4. Write `src/server.ts` with the `McpServer` instantiation and `StdioServerTransport` wiring.
5. Ensure all logging goes to `console.error`, never `console.log`.
6. Build and manually test each tool with a known Box file ID.

**Relevant Context**
- Box Node SDK: https://github.com/box/box-node-sdk
- MCP v2 `registerTool` signature: `server.registerTool(name, { description, inputSchema }, handler)`.
- `box_list_collaborators` output feeds directly into the Retention Guard (Sub-Task 4).

---

### Sub-Task 3 — File Indexing Agent

**Status:** [ ] pending

**Intent**
Build a crawl-and-index pipeline that walks Box folder trees, extracts file metadata and
content snippets, and stores them in a local SQLite FTS5 database. This enables fast,
offline-capable enhanced search beyond what the Box Search API alone provides.

**Expected Outcomes**
- `data/index.db` is created with a `files` table using FTS5 full-text search.
- Schema captures: `box_id`, `name`, `path`, `owner_email`, `collaborators` (JSON array),
  `content_preview`, `last_modified`, `indexed_at`.
- `index_crawl` MCP tool triggers a full or incremental crawl of a given root folder.
- `index_search` MCP tool queries the local index and returns ranked results with Box URLs.
- Incremental crawl uses `last_modified` to skip unchanged files.
- Crawl respects Box API rate limits (exponential back-off on 429 responses).

**Todo List**
1. Create `src/indexer/schema.ts` — define the SQLite FTS5 table schema using `better-sqlite3`.
2. Create `src/indexer/crawler.ts` — recursive folder walker using `box_list_folder` and
   `box_get_file`; extracts metadata; writes rows to `data/index.db`.
3. Create `src/indexer/search.ts` — FTS5 query builder; ranks by relevance; returns top-N results
   with Box direct links.
4. Register `index_crawl` and `index_search` tools in `src/index.ts`.
5. Add rate-limit back-off logic in a shared `src/util/rate-limiter.ts` module.
6. Add `scripts/schedule-crawl.ts` — optional cron-style runner that triggers incremental crawl
   every N minutes (configurable via env `CRAWL_INTERVAL_MINUTES`).

**Relevant Context**
- SQLite FTS5 docs: https://www.sqlite.org/fts5.html
- `better-sqlite3` is synchronous; wrap crawl logic in async queues to avoid blocking the MCP
  stdio channel.
- Index is stored in `data/` which must be gitignored.

---

### Sub-Task 4 — Retention / Deletion-Protection Guard

**Status:** [ ] pending

**Intent**
Implement the business rule that prevents files with active collaborators from being deleted or
expired — even if the original file owner's account is deactivated. This is the core protection
for files shared by IBMers who have left, where Box's auto-expiry or account cleanup could
otherwise destroy content others still need.

**Expected Outcomes**
- `box_check_retention` MCP tool: given a file/folder ID, returns `{ protected: boolean, reason: string, active_collaborators: string[] }`.
- `box_safe_delete` MCP tool: checks retention before deletion; refuses and explains if the file
  is protected; proceeds only when `protected === false`.
- `box_set_retention_policy` MCP tool: tags a file or folder with a `do_not_delete` metadata
  template on Box (uses Box Metadata API).
- Retention rule logic: a file is protected if it has ≥ 1 active collaborator OR carries the
  `do_not_delete` metadata tag.
- All deletion attempts by other tools are routed through `box_safe_delete` — no raw delete
  tool is exposed.
- Guard decisions are logged to `data/retention-log.jsonl` with timestamp, file ID, decision,
  and reason.

**Todo List**
1. Create `src/retention/guard.ts` — `checkRetention(fileId)` function that calls
   `box_list_collaborators` and checks Box Metadata for `do_not_delete` tag.
2. Create `src/retention/logger.ts` — append-only JSONL log writer to `data/retention-log.jsonl`.
3. Implement `box_check_retention` tool in `src/tools/retention-tools.ts`.
4. Implement `box_safe_delete` tool — wraps `guard.checkRetention`; refuses if protected; calls
   Box delete API otherwise; logs every decision.
5. Implement `box_set_retention_policy` tool — creates/upserts Box Metadata on the target item.
6. Register all three tools in `src/index.ts`.
7. Document the retention rules in `docs/retention-policy.md`.

**Relevant Context**
- Box Metadata API: https://developer.box.com/reference/get-files-id-metadata/
- Box Collaborations API: https://developer.box.com/reference/get-files-id-collaborations/
- The guard is the only code path that may call Box delete — no other module calls delete directly.

---

### Sub-Task 5 — MCP Server Registration & End-to-End Validation

**Status:** [ ] pending

**Intent**
Register the completed server with Bob's MCP configuration so it is available to AI agents, and
run an end-to-end smoke test covering all four capability areas.

**Expected Outcomes**
- `mcp.json` (workspace scope) contains a valid entry for `box-mcp-server` pointing to the
  built `build/index.js`.
- All required env vars (`BOX_CLIENT_ID`, `BOX_CLIENT_SECRET`, `BOX_ENTERPRISE_ID`,
  `BOX_PRIVATE_KEY`) are referenced via `${env:...}` — never literal values.
- Bob connects to the server and all registered tools appear in the MCP tools panel.
- Smoke test: call `box_search`, `index_search`, `box_check_retention`, and `box_safe_delete`
  with a known test file ID and confirm correct responses.
- `README.md` documents setup steps, required env vars, and example tool calls.

**Todo List**
1. Write `.bob/mcp.json` (workspace scope) with the server entry.
2. Write `README.md` covering: prerequisites, env var setup, `npm run build`, registration, and
   example prompts.
3. Restart Bob / reload MCP and confirm the server appears as connected.
4. Run smoke test against a real Box file — document results in `docs/smoke-test-results.md`.
5. Fix any connection or tool-call failures surfaced during smoke testing.

**Relevant Context**
- MCP registration uses `configure-mcp` skill pattern: `command: "node"`,
  `args: ["/absolute/path/to/build/index.js"]`.
- Env vars must be set in the shell environment that starts Bob; a restart of Bob may be needed
  after first-time setup.

---

## Non-Goals (this phase)

- No frontend / UI dashboard.
- No real-time event streaming from Box Webhooks (can be added later as a Sub-Task 6).
- No migration of existing Box data — read/write only via the SDK.
- No multi-tenant support — single enterprise / service account for now.
