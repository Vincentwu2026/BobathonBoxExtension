# Box MCP Server

A backend productivity suite that wraps IBM Box with three capabilities exposed as MCP tools:

1. **Core File Tools** — search, read, upload, move, and manage files/folders via AI agents
2. **File Indexing Agent** — crawls Box on a schedule and maintains a local SQLite FTS5 full-text index
3. **Retention / Deletion-Protection Guard** — prevents files with active collaborators from being deleted or expired

All capabilities are exposed via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) over stdio transport, making them available to Bob and other AI agents.

---

## Prerequisites

- **Node.js 20+** (tested on Node 26)
- A **Box App** configured for JWT (Server Authentication) — [Box JWT auth guide](https://developer.box.com/guides/authentication/jwt/)
- npm

---

## Setup

### 1. Clone and install dependencies

```bash
git clone https://github.com/Vincentwu2026/BobathonBoxExtension.git
cd BobathonBoxExtension
npm install
```

### 2. Configure environment variables

All Box credentials must be set as environment variables — never hardcoded. Add these to your shell profile or a local `.env` file (which is gitignored):

| Variable | Description |
|---|---|
| `BOX_CLIENT_ID` | OAuth 2.0 client ID from your Box app |
| `BOX_CLIENT_SECRET` | OAuth 2.0 client secret |
| `BOX_ENTERPRISE_ID` | Your Box enterprise / organization ID |
| `BOX_PRIVATE_KEY` | PEM-encoded RSA private key (escape newlines as `\n`) |
| `BOX_PRIVATE_KEY_ID` | Key ID registered in the Box app |
| `BOX_PASSPHRASE` | *(Optional)* Passphrase for the private key |

Example export (replace values with your own):

```bash
export BOX_CLIENT_ID="your_client_id"
export BOX_CLIENT_SECRET="your_client_secret"
export BOX_ENTERPRISE_ID="your_enterprise_id"
export BOX_PRIVATE_KEY_ID="your_key_id"
export BOX_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
```

### 3. (Optional) Pre-fetch a service account token

If you want to test the token exchange independently before wiring up the full server:

```bash
npm run get-tokens
```

This writes a token to `credentials/box-token.json` (gitignored). The server will use env vars if present; the token file is only a fallback.

### 4. Build

```bash
npm run build
```

Output is placed in `build/`. Entry point is `build/index.js`.

### 5. Run the server

```bash
node build/index.js
```

The server communicates over **stdio** (MCP transport). It is meant to be launched by an MCP host (e.g. Bob), not run directly in a terminal for normal use.

---

## MCP Registration (Bob)

Add the following entry to `.bob/mcp.json` in your workspace:

```json
{
  "mcpServers": {
    "box-mcp-server": {
      "command": "node",
      "args": ["/absolute/path/to/BobathonBoxExtension/build/index.js"],
      "env": {
        "BOX_CLIENT_ID": "${env:BOX_CLIENT_ID}",
        "BOX_CLIENT_SECRET": "${env:BOX_CLIENT_SECRET}",
        "BOX_ENTERPRISE_ID": "${env:BOX_ENTERPRISE_ID}",
        "BOX_PRIVATE_KEY": "${env:BOX_PRIVATE_KEY}",
        "BOX_PRIVATE_KEY_ID": "${env:BOX_PRIVATE_KEY_ID}",
        "BOX_PASSPHRASE": "${env:BOX_PASSPHRASE}"
      }
    }
  }
}
```

All env vars are forwarded from the shell that starts Bob — no secrets appear in the config file.

---

## Available MCP Tools

> Tools are added incrementally across sub-tasks. This list will grow as the project progresses.

### Sub-Task 2 — Core File Tools *(coming next)*
| Tool | Description |
|---|---|
| `box_search` | Full-text search across Box |
| `box_get_file` | Retrieve file metadata and download URL by file ID |
| `box_list_folder` | List contents of a folder by folder ID |
| `box_upload_file` | Upload a file to a target folder |
| `box_move_file` | Move a file to another folder |
| `box_list_collaborators` | List all collaborators on a file or folder |
| `box_get_file_versions` | List version history of a file |

### Sub-Task 3 — Indexing *(coming soon)*
| Tool | Description |
|---|---|
| `index_crawl` | Trigger a full or incremental crawl of a Box folder tree |
| `index_search` | Query the local FTS5 index with ranked results |

### Sub-Task 4 — Retention Guard *(coming soon)*
| Tool | Description |
|---|---|
| `box_check_retention` | Check if a file/folder is protected from deletion |
| `box_safe_delete` | Delete a file only if it passes retention checks |
| `box_set_retention_policy` | Tag a file or folder with a `do_not_delete` policy |

---

## Project Structure

```
box-mcp-server/
├── src/
│   ├── index.ts              # MCP server entry point (stdio)
│   ├── box-client.ts         # Singleton Box client (JWT auth)
│   ├── tools/                # MCP tool implementations
│   ├── indexer/              # SQLite FTS5 crawler & search
│   ├── retention/            # Retention guard & logger
│   └── util/                 # Shared utilities (rate limiter, etc.)
├── scripts/
│   └── get-tokens.ts         # One-time token exchange script
├── data/                     # SQLite index & retention log (gitignored)
├── credentials/              # Box token cache (gitignored)
├── docs/                     # Retention policy & smoke test results
├── build/                    # Compiled output (gitignored)
├── package.json
└── tsconfig.json
```

---

## Security Notes

- **Never commit credentials.** The `credentials/` directory and all `*.env` files are gitignored.
- All secrets are injected via environment variables at runtime.
- The `box_safe_delete` tool is the **only** code path that may delete a Box file — no raw delete is exposed.
- Retention decisions are logged to `data/retention-log.jsonl` for audit purposes.

---

## Development Status

| Sub-Task | Status |
|---|---|
| 1 — Project Scaffolding & OAuth Setup | ✅ Complete |
| 2 — Box MCP Server Core File Tools | ⬜ Pending |
| 3 — File Indexing Agent | ⬜ Pending |
| 4 — Retention / Deletion-Protection Guard | ⬜ Pending |
| 5 — MCP Registration & End-to-End Validation | ⬜ Pending |
