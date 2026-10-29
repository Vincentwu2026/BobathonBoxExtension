# Box Productivity Suite: Web UI

React + TypeScript + Vite + Tailwind CSS + React Query + Lucide. One page, two tabs.

| Tab | What it does |
|---|---|
| **Demo files** (default) | Lists 8 sample documents. Search them through Bob (he reads the files and says why each one matches), click one to open the whole file in a pop-up, see its owner and whether it could be deleted, and ask Bob about it. |
| **My Box** | Says your own Box files are waiting for Box administrator approval, with a button back to the demo files. |

## Run it

```bash
# 1. API (repo root). It loads the files in demo-files/ by itself.
npm install
npm run build
npm run web-api        # http://127.0.0.1:8799

# 2. Website
cd frontend
npm install
npm run dev            # http://127.0.0.1:5173
```

## Safety properties

- **Nothing is ever deleted.** The website has no delete button. Deletion status is only shown.
- Extracted file text is always rendered as text, never as HTML.
- The API binds to `127.0.0.1` only, sends no CORS headers, checks the `Host` header, requires a custom header on POST, and validates all input. The Vite dev server proxies `/api`, so the browser uses a single origin.
- Search and Ask Bob send file text to Bob's service. Each search sends the text of all 8 demo files and costs roughly $0.01–0.06. If Bob is unavailable, search falls back to a plain word search and says so.
- The Bob API key stays on the server (`./.env`, gitignored); the browser only sends the question.

## Checking it

`node e2e/e2e.mjs` drives the page in headless Chrome (needs `npm install --no-save puppeteer-core`, the API and `npm run dev` running). Set `ASK_BOB=1` to include one real Bob call. Screenshots go to `e2e/screenshots/`.

## Structure

```
src/
  App.tsx        header + the two tabs
  pages/         DemoTab, MyBoxTab
  components/    PreviewPanel (the pop-up), AskBob, RetentionBadge, Snippet, ui/*
  services/      searchService, previewService, askBobService
  types/         wire types shared with src/api/dto.ts
```
