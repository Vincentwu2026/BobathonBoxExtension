# Box Productivity Suite

Enterprise AI backend platform integrating **Box Enterprise** with the **Model Context Protocol (MCP)**, featuring **Local SQLite FTS5 Full-Text Indexing** and an **Active Collaborator-Aware Retention Guard**.

---

## Architecture Overview

```
                      +-----------------------------------+
                      |      AI Agents / Bob Client       |
                      +-----------------+-----------------+
                                        | (MCP stdio Transport)
                                        v
                      +-----------------------------------+
                      |   Box Productivity MCP Server     |
                      |        (src/server.ts)            |
                      +-----------------+-----------------+
                                        |
       +--------------------------------+--------------------------------+
       |                                |                                |
       v                                v                                v
+--------------+               +------------------+             +------------------+
|  Box File    |               |  Local Indexing  |             |  Retention Guard |
|  Tools (7)   |               |  Agent (FTS5)    |             |  & Safe Delete   |
+-------+------+               +--------+---------+             +--------+---------+
        |                               |                                |
        | (Rate-Limited API)            | (Local Search)                 | (Audit Log)
        v                               v                                v
+--------------+               +------------------+             +------------------+
| Box Platform |               | SQLite Database  |             | JSONL Audit Trail|
|  JWT Auth    |               | data/box_index.db|             | retention-log    |
+--------------+               +------------------+             +------------------+
```

### Three Major Core Systems (plus a Web UI):

1. **Box MCP Server**:
   Exposes comprehensive Box API actions (search, get file, list folder, upload, move, list collaborators, get versions) as strongly typed MCP tools for AI agents.

2. **File Indexing Agent**:
   Performs recursive and incremental folder crawling into an embedded **SQLite FTS5 full-text search engine**, providing sub-millisecond keyword and BM25 relevance searches over file contents, paths, owners, and collaborators.

3. **Retention & Deletion-Protection Guard**:
   Enforces strict enterprise data preservation rules. Deletion is automatically refused if a file has **one or more active collaborators** or has an explicit **`do_not_delete` retention tag**. No unconstrained raw deletion tool is exposed.

4. **Web UI & Local API** (additive; the MCP server is unchanged):
   A React frontend ([`frontend/`](frontend/README.md)) backed by a localhost-only HTTP API (`src/api/server.ts`, `127.0.0.1:8799`). It offers search, a folder explorer, a retention center, audit logs and system status, in **Demo Mode** (seeded fictional data, no credentials) or **Live Box** mode. "Attempt Delete" in the UI is always a dry run.

---

## Project Structure

```
.
├── src/
│   ├── index.ts                  # MCP Server entrypoint executable
│   ├── server.ts                 # McpServer setup & tool registrations
│   ├── box-client.ts             # Singleton Box JWT / Developer token manager
│   ├── api/                      # Localhost web API for the UI (search, retention, audit, status)
│   ├── demo/                     # Demo-only MCP server (demo_retention_check)
│   ├── tools/
│   │   ├── box-file-tools.ts     # Core Box file & folder MCP tools
│   │   └── retention-tools.ts   # Retention check & safe delete MCP tools
│   ├── indexer/
│   │   ├── schema.ts             # SQLite FTS5 schema & upsert triggers
│   │   ├── crawler.ts            # Recursive incremental Box folder crawler
│   │   └── search.ts             # FTS5 search queries & ranking
│   ├── retention/
│   │   ├── guard.ts              # Business logic for retention evaluation
│   │   └── logger.ts             # Immutable JSONL audit logger
│   └── util/
│       └── rate-limiter.ts       # Exponential backoff & 429 retry handler
├── scripts/
│   ├── get-tokens.ts             # CLI tool to exchange JWT credentials for tokens
│   ├── schedule-crawl.ts         # Periodic indexing daemon / cron script
│   └── seed-demo-data.ts         # Seeds 17 fictional documents into the SQLite index
├── frontend/                     # React + Vite + Tailwind web UI (see frontend/README.md)
├── docs/
│   ├── retention-policy.md       # Detailed enterprise retention rules & specs
│   └── smoke-test-results.md     # Component & integration test report
├── tests/
│   └── smoke-test.ts             # Automated test suite
├── data/                         # Local database and audit logs (gitignored)
├── credentials/                  # Token cache & private keys (gitignored)
├── .bob/
│   └── mcp.json                  # MCP Server registration config
├── package.json
└── tsconfig.json
```

---

## Prerequisites & Installation

### Requirements:
- **Node.js**: >= 20.0.0 LTS (Node 20, 22, or 24+ supported)
- **TypeScript**: 5.x+
- **Box Enterprise Account** with JWT App Authentication configured in the Box Developer Console.

### 1. Clone & Install Dependencies

```bash
git clone <repo-url> box-productivity-suite
cd box-productivity-suite
npm install
```

### 2. Build the TypeScript Pipeline

```bash
npm run build
```

This compiles all modules into `./build/index.js`, `./build/scripts/`, and `./build/tests/`.

---

## Configuration & Environment Variables

Create your environment configuration (or export variables in your shell):

| Variable | Description | Required / Default |
|---|---|---|
| `BOX_CLIENT_ID` | Box App OAuth2 Client ID | Required for JWT Auth |
| `BOX_CLIENT_SECRET` | Box App Client Secret | Required for JWT Auth |
| `BOX_ENTERPRISE_ID` | Box Enterprise ID | Required for JWT Auth |
| `BOX_PRIVATE_KEY` | RSA Private Key (PEM format with `\n` or multiline) | Required for JWT Auth |
| `BOX_PRIVATE_KEY_PASSPHRASE`| Passphrase for encrypted private key | Optional |
| `BOX_PUBLIC_KEY_ID` | Public Key ID from Box Developer Console | Optional |
| `BOX_CONFIG_FILE` | Path to downloaded Box `config.json` | Optional (overrides individual keys) |
| `BOX_ACCESS_TOKEN` | Direct Developer Access Token | Optional (overrides JWT) |
| `BOX_DB_PATH` | Path for SQLite index database | Default: `./data/box_index.db` |
| `BOX_RETENTION_LOG` | Path for retention audit JSONL file | Default: `./data/retention-log.jsonl` |
| `BOX_INDEX_CONTENT` | Set to `false` to stop the crawler downloading files to index their text | Default: on |
| `BOX_SAMPLE_DRIVE` | Folder of local sample files used for Demo Mode file previews | Default: `./data/sample-drive` |

---

## Box JWT Authentication Setup

1. In the **Box Developer Console**, create a **Custom App** using **Server Authentication (with JWT)**.
2. Under **Application Scopes**, enable:
   - Read all files and folders stored in Box
   - Write all files and folders stored in Box
   - Manage Users and Manage Collaborations
3. Generate a **Public/Private Keypair** and download the `config.json` file.
4. Exchange JWT credentials and cache tokens securely:

```bash
# Option A: Using individual environment variables
export BOX_CLIENT_ID="your_client_id"
export BOX_CLIENT_SECRET="your_client_secret"
export BOX_ENTERPRISE_ID="your_enterprise_id"
export BOX_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."

npm run get-tokens

# Option B: Using the downloaded Box JSON config file
export BOX_CONFIG_FILE="/path/to/box_config.json"

npm run get-tokens
```

Tokens are saved with restricted permissions (`0600`) at `credentials/box-token.json`.

---

## MCP Server Registration

The server is configured for Bob or Claude Desktop via `.bob/mcp.json`:

```json
{
  "mcpServers": {
    "box-productivity-suite": {
      "command": "node",
      "args": [
        "${workspaceFolder}/build/index.js"
      ],
      "env": {
        "BOX_CLIENT_ID": "${env:BOX_CLIENT_ID}",
        "BOX_CLIENT_SECRET": "${env:BOX_CLIENT_SECRET}",
        "BOX_ENTERPRISE_ID": "${env:BOX_ENTERPRISE_ID}",
        "BOX_PRIVATE_KEY": "${env:BOX_PRIVATE_KEY}",
        "BOX_PRIVATE_KEY_PASSPHRASE": "${env:BOX_PRIVATE_KEY_PASSPHRASE}",
        "BOX_PUBLIC_KEY_ID": "${env:BOX_PUBLIC_KEY_ID}",
        "BOX_ACCESS_TOKEN": "${env:BOX_ACCESS_TOKEN}",
        "BOX_CONFIG_FILE": "${env:BOX_CONFIG_FILE}",
        "BOX_DB_PATH": "${workspaceFolder}/data/box_index.db",
        "BOX_RETENTION_LOG": "${workspaceFolder}/data/retention-log.jsonl"
      }
    }
  }
}
```

---

## MCP Tool Reference & Examples

### 1. `box_search`
Search Box enterprise content with filters for extensions, ancestor folders, and types.

```json
{
  "query": "Q3 Financial Forecast",
  "fileExtensions": ["pdf", "xlsx"],
  "limit": 10
}
```

### 2. `box_get_file`
Retrieve metadata, parent folder hierarchy, and sharing links.

```json
{
  "fileId": "1298471982"
}
```

### 3. `box_list_folder`
List contents of a Box folder (`0` for root).

```json
{
  "folderId": "0",
  "limit": 50,
  "sort": "date",
  "direction": "DESC"
}
```

### 4. `box_upload_file`
Upload UTF-8 text or Base64 binary file.

```json
{
  "name": "executive-summary.md",
  "parentFolderId": "0",
  "content": "# Q4 Executive Summary\nAll quarterly targets achieved."
}
```

### 5. `box_move_file`
Move or rename a file in Box.

```json
{
  "fileId": "1298471982",
  "destinationFolderId": "872635411",
  "newName": "Q3_Report_Final.pdf"
}
```

### 6. `box_list_collaborators`
List all users or groups with active or pending access to a file.

```json
{
  "fileId": "1298471982"
}
```

### 7. `box_get_file_versions`
List version history and previous revisions of a file.

```json
{
  "fileId": "1298471982"
}
```

### 8. `index_crawl`
Initiate recursive, incremental indexing into the local SQLite FTS5 database.

```json
{
  "startFolderId": "0",
  "maxDepth": 10,
  "forceReindex": false
}
```

### 9. `index_search`
Query the local FTS5 database with BM25 ranking and snippet previews.

```json
{
  "query": "strategic revenue ARR guidance",
  "limit": 20
}
```

### 10. `box_check_retention`
Inspect whether a file is protected from deletion due to active collaborators or retention tags.

```json
{
  "fileId": "1298471982"
}
```

### 11. `box_safe_delete`
Safely delete a file. Automatically refuses and logs if active collaborators or `do_not_delete` tags are found.

```json
{
  "fileId": "1298471982",
  "confirmation": true
}
```

### 12. `box_set_retention_policy`
Mark a file with the `do_not_delete` retention tag and metadata flag.

```json
{
  "fileId": "1298471982",
  "tag": "do_not_delete"
}
```

### 13. `box_get_retention_logs`
Retrieve recent audit log entries for compliance and verification.

```json
{
  "limit": 50
}
```

---

## Running the Web UI

```bash
npm run seed-demo      # load 17 fictional demo documents into the SQLite index
npm run build
npm run web-api        # API on http://127.0.0.1:8799

cd frontend && npm install && npm run dev   # UI on http://127.0.0.1:5173
```

See [`frontend/README.md`](frontend/README.md) for modes, pages, safety properties and configuration.

### File preview

Opening a document shows a **Preview file** button that renders the file's content in the page: Box Notes (`.boxnote`), Word (`.docx`), PowerPoint (`.pptx`), Excel (`.xlsx`) and plain text. PDF and legacy `.doc`/`.ppt`/`.xls` are not supported and say so. Extracted text is always rendered as text, never as HTML, and parsing is bounded (file size, zip entry sizes, blocks, slides, sheets, rows and columns).

- **Live Mode** downloads the file from Box on demand, read-only, after checking its type and size.
- **Demo Mode** reads from a local folder, so you can try real files without Box access:

```bash
npm run build
npm run seed-sample-drive -- /path/to/your/files     # copies supported files into the sample drive and indexes their text
BOX_SAMPLE_DRIVE=./data/sample-drive npm run web-api
```

To give local files an owner, collaborators or a do-not-delete flag (so the Retention Center has something to evaluate), put a `governance.json` next to them:

```json
{ "Plan.docx": { "owner": "me@example.com", "collaborators": ["a@example.com"], "doNotDelete": true } }
```

### Searching file contents

The crawler downloads new or changed Box Notes, Word, PowerPoint, Excel and text files (up to 5 MB each) and indexes their text next to the Box description, so search matches words inside documents. Unchanged files are not downloaded again. Files that cannot be downloaded or read are still indexed by metadata. Set `BOX_INDEX_CONTENT=false` to turn this off. After upgrading, run a crawl with `BOX_FORCE_REINDEX=true` once to index files that were crawled before.

---


## Scheduled Indexing Daemon

To maintain an up-to-date local index, run the crawler daemon:

```bash
# Run continuous daemon (every 60 minutes by default)
CRAWL_INTERVAL_MINUTES=30 npm run schedule-crawl

# Run a single one-shot crawl and exit
npm run schedule-crawl -- --once
```

---

## Automated Smoke Testing

Execute the built-in test suite:

```bash
npm run test
```

Verifies FTS5 schema, indexing, search, rate-limiting backoff, retention rules, audit logging, MCP server startup, the crawler (against a fake Box client), and file preview extraction including hostile inputs (zip bombs, false size headers, path traversal).

The test writes to the configured index, so point it elsewhere to keep your data untouched:

```bash
BOX_DB_PATH=/tmp/test.db BOX_RETENTION_LOG=/tmp/test-log.jsonl npm run test
```

---

## Troubleshooting

1. **`HTTP 429 Too Many Requests`**:
   The suite automatically handles 429 errors using exponential backoff with jitter via [`src/util/rate-limiter.ts`](src/util/rate-limiter.ts).

2. **`Missing Box JWT Credentials`**:
   Verify that `BOX_CLIENT_ID`, `BOX_CLIENT_SECRET`, `BOX_ENTERPRISE_ID`, and `BOX_PRIVATE_KEY` (or `BOX_CONFIG_FILE`) are exported in your environment.

3. **`Deletion Blocked` Error**:
   If `box_safe_delete` refuses deletion, call `box_list_collaborators` to inspect who has access or check if the file has the `do_not_delete` tag. If retention is intentionally being lifted, remove collaborators or clear the tag before retrying.
