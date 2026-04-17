# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

UIGen is an AI-powered React component generator with live preview. A user describes a component in chat; an LLM uses file-editing tools to populate a **virtual in-memory file system**, which is simultaneously rendered as a live preview and shown in a Monaco editor. Nothing is ever written to disk — the entire "workspace" lives in memory and, for signed-in users, is persisted as serialized JSON on a `Project` row.

## Commands

```bash
npm run setup       # install deps, generate Prisma client, run migrations (run once after clone)
npm run dev         # Next.js dev (Turbopack) at http://localhost:3000
npm run dev:daemon  # same, backgrounded, logs to ./logs.txt
npm run build       # production build
npm run lint        # next lint (ESLint, flat config via .eslintrc.json)
npm test            # vitest (jsdom, @vitejs/plugin-react, vite-tsconfig-paths)
npm run db:reset    # prisma migrate reset --force (destroys dev.db)
```

Run a single test: `npx vitest run src/lib/__tests__/file-system.test.ts` or filter by name with `-t "pattern"`. `npx vitest` (no `run`) starts watch mode.

Every `next` script is launched via `NODE_OPTIONS='--require ./node-compat.cjs'`. That shim deletes `globalThis.localStorage`/`sessionStorage` on the server to work around Node 25's experimental Web Storage globals breaking SSR guards. If you add a new Node entry point, preserve this.

## Architecture

### Virtual file system is the central data structure

`src/lib/file-system.ts` (`VirtualFileSystem`) is used on **both** server and client and is the source of truth for everything the AI touches. Same class instance is shared across:

- **Server**: `src/app/api/chat/route.ts` deserializes `files` from the request body, hands the VFS to the two AI tools, and (for authenticated requests with a `projectId`) persists `fileSystem.serialize()` into `Project.data` on finish.
- **Client**: `FileSystemProvider` (`src/lib/contexts/file-system-context.tsx`) holds the VFS and mirrors every tool call the assistant emits via `handleToolCall` — this is how the editor and preview stay in sync with what the model is doing mid-stream.

Tool-call mirroring is the mechanism: the server's tools mutate the server-side VFS (so it gets persisted), and the client intercepts the same tool calls via `useAIChat`'s `onToolCall` to apply identical mutations locally. Both must stay consistent, so any new tool needs handlers in **both** `src/lib/tools/*` and `FileSystemContext.handleToolCall`.

### AI tools

The LLM is given two tools (`src/lib/tools/`):
- `str_replace_editor` — Anthropic-style text editor with `view` / `create` / `str_replace` / `insert` / `undo_edit` commands.
- `file_manager` — `rename` / `delete`. Rename doubles as move and auto-creates parent directories.

The system prompt (`src/lib/prompts/generation.tsx`) pins the model to: root `/App.jsx` as the entry, Tailwind-only styling, `@/`-prefixed imports for non-library files, no HTML files. Changes to what the model can produce usually mean editing both this prompt and the preview/transform pipeline.

### Provider fallback (no API key required)

`src/lib/provider.ts` returns a real `anthropic(MODEL)` when `ANTHROPIC_API_KEY` is set, otherwise a hand-written `MockLanguageModel` that streams a scripted 3-step sequence (create component → enhance → create App.jsx) based on keywords in the prompt (`form`/`card` otherwise `counter`). The app is fully functional without an API key — this matters for local dev and tests. The chat route also lowers `maxSteps` from 40 → 4 when the mock provider is in use to avoid the scripted loop repeating.

### Live preview pipeline

`src/lib/transform/jsx-transformer.ts` (`transformJSX`, `createImportMap`, `createPreviewHTML`) Babel-transforms every JSX/TSX file in the VFS **in the browser**, builds an import map so `@/...` and relative paths resolve against the VFS, and writes an HTML document into `PreviewFrame`'s iframe. Missing imports are stubbed with placeholder modules so the preview doesn't crash mid-edit. CSS `import` statements are detected and handled separately.

### Auth, persistence, and the anonymous flow

- Auth: JWT (jose) in an httpOnly cookie, bcrypt passwords, handled via server actions in `src/actions/index.ts`. `getSession()` reads from `cookies()`, `verifySession(request)` from middleware context.
- Schema (`prisma/schema.prisma`): `User` has many `Project`. `Project.messages` and `Project.data` are `String` columns holding JSON (messages array and serialized VFS).
- **Prisma client output is `src/generated/prisma`** (not `node_modules/@prisma/client`). Always import the client from `@/lib/prisma`, not `@prisma/client`.
- Anonymous users: `src/lib/anon-work-tracker.ts` stashes messages + VFS in `sessionStorage`. On sign-up, that work is read back and turned into the user's first `Project` so nothing is lost across the auth boundary.
- Routing: `/` redirects authenticated users to their most recent project (creating one if none exists); anonymous users see the editor with no project. `/[projectId]` loads a specific project and 404s-to-home on missing/unauthorized access. `src/middleware.ts` gates `/api/projects` and `/api/filesystem` on a valid session.

### UI shell

`src/app/main-content.tsx` is the whole three-panel layout (chat left, preview/code tabs right) built on `react-resizable-panels`. shadcn/ui "new-york" style, Tailwind v4 (`src/app/globals.css`), Lucide icons. When adding a shadcn component, the CLI config in `components.json` puts it under `@/components/ui`.

## Conventions

- `@/*` path alias → `./src/*` (see `tsconfig.json`). The preview's in-browser import resolver depends on this too — don't introduce a second alias.
- Server-only modules use `import "server-only"` (see `src/lib/auth.ts`).
- Tests live alongside code in `__tests__/` folders and run under jsdom; components are tested with `@testing-library/react`.
- Next config sets `devIndicators: false` intentionally.
- Use comments sparingly. Only comment complex code.
- The database schema is defined in `prisma/schema.prisma`. Read it whenever you need to understand the shape of data stored in the database.
- Vitest config lives in `vitest.config.mts` (not `vite.config.ts` or `vitest.config.ts`).
