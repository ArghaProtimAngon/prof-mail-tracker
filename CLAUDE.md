# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About the user and the project

The user (Angon) is a beginner in web development. Explain steps, terms and decisions in simple English, and give exact click-by-click instructions for anything done by hand (Vercel, Neon, Google Sheets, Apps Script). Do not commit or push unless asked.

The app ("Professor Mail Tracker", short name ProfMail) lets two people, Angon (admin) and Ayon, track cold emails to professors and the universities they want to apply to. It is a PWA (React + Vite + TypeScript + Tailwind v4 + `vite-plugin-pwa`) on Vercel, with a small server in `api/` + `server/` and a **Neon Postgres** database. The **Google Sheet is only the backup**: the admin can back up to it and restore from it in Settings. Access is by invite link only, and everyone sees everyone's data. `README.md` is the user-facing guide (easy English). Keep it updated when setup steps change.

History: the app first used the Google Sheet (through Apps Script) as its database. The branch `new-backend` moved it to Neon. The old sheet API still exists in `apps-script/Code.gs` behind `LEGACY_API` and is meant to be switched off after the move.

## Commands

- `npm run build`: type-check the website (`tsc -b`) and the server (`tsc -p tsconfig.server.json`), then build with Vite.
- `npm test`: server tests (`tests/server.test.ts`, on in-memory Postgres via PGlite) and an end-to-end backup test (`tests/e2e.test.ts`) that runs the real `apps-script/Code.gs` in a Node `vm` against a fake Sheet, over HTTP with a redirect like Google's. Run it after any change in `server/`, `api/` or `apps-script/`.
- `npx vercel dev`: runs the website AND the `/api` functions locally (needs `npx vercel env pull .env.local`). `npm run dev` alone has no server. Local runs use the live database.
- `node scripts/make-icons.mjs`: regenerates `public/icon-192.png` and `icon-512.png`.
- Server environment variables (see `.env.example`): `DATABASE_URL` (Neon, set by the Vercel integration), `SHEET_API_URL` (the Apps Script Web App URL), `BACKUP_KEY` (made by `createBackupKey()` in Apps Script), `SETUP_KEY` (one-time, for `/api/setup`). The website itself needs none.

## Server: `api/` and `server/`

- `api/rpc.ts` is the only endpoint the app uses: `POST /api/rpc` with `{action, token, ...params}` and answers `{ok, data}` or `{ok:false, error}`. `error: 'AUTH'` means the login is invalid, and the frontend logs out. `api/setup.ts` is the one-time move of the old Sheet data into an empty database (`GET /api/setup?key=SETUP_KEY`).
- `server/handler.ts` (`handleRpc`) authenticates and runs `ACTIONS[action]` from `server/actions.ts`. Only `UserError` messages (`fail('...')`) are shown to people. Any other error is logged and replaced with a generic message, so database details never leak. To add an endpoint, add a function to `ACTIONS`, call `requireAdmin(user)` for admin-only ones, and add a test.
- Server code uses `.js` in relative imports (`'./db.js'`) even though the files are `.ts`. This is required by Vercel's ESM build and by `tsx`.
- `server/db.ts` is a tiny `Db` interface (`query`, and `batch` = one transaction). Live it is Neon's HTTP driver, in tests PGlite. Write plain SQL with `$1` placeholders. Related writes (a change plus its activity row) go in one `batch`.
- `server/schema.ts` has the tables (`ensureSchema` creates them on first use, so there are no migrations; adding a column needs an `ALTER TABLE ... IF NOT EXISTS` step there) and `SHEET_TABLES`, which maps each table to a Sheet tab and its column order. Dates and times are text (`yyyy-mm-dd`, ISO), as in the Sheet.
- Auth has no passwords. An admin-created `invite_code` is a reusable link: every `join` creates a login for that device. Logins are stored hashed (`sessions.token_hash`), at most `MAX_DEVICES` per person (oldest dropped). `regenerateInvite` replaces the code and deletes all logins. `revokeUser` deletes the logins and blocks the link. Per-person data (`contacts`, `university_progress`, `templates`) is always written with the user from the login, never from the request. Everyone can read everyone's progress.
- Professors and universities are soft-deleted (`deleted` column). `getAll` returns everything in one call (professors, contacts, users, the caller's templates, settings, latest 200 activity, universities and their progress). Activity rows are written inside each action as a ready sentence in `details` ("marked Prof. X as Sent"); the UI shows `<name> <details>`. University activity uses actions starting with `uni_` and keeps the university id in the `professor_id` column.
- `server/backup.ts`: `backupToSheet` writes every table to the Sheet through Apps Script (`backup_write`), `restoreFromSheet` reads it back (`backup_read`) and replaces everything in ONE transaction. Restore refuses (and changes nothing) if the Sheet has no active admin, lacks the caller's admin account, or misses a tab. It tidies hand-edited values (bad statuses/dates, duplicate keys), keeps the logins of people who stay, and needs `confirm: 'RESTORE'` in the request (the UI makes the person type it). Logins are never written to the Sheet. `importFromSheet` (one time, empty database only) also imports the old logins, so nobody has to log in again.

## Google Sheet script: `apps-script/Code.gs`

The user pastes this file by hand into the Sheet's Extensions > Apps Script editor and must **deploy a new Web App version** after every change (the README says how). Always remind them when you change this file.

- Its job now: `backup_write` / `backup_read` (plain `doPost` actions guarded by the `BACKUP_KEY` script property, made by running `createBackupKey()`), plus `setup()` to create the tabs. `SCHEMA` at the top lists the tabs and column order, and must stay in step with `SHEET_TABLES` in `server/schema.ts`.
- The old Sheet-as-database API (`ACTIONS`: join, getAll, ...) is kept behind `var LEGACY_API = true;`. After the move it should be set to `false`. Do not build new features there.
- Text cells are written with the plain-text number format, so Sheets never turns a note into a date, a number or a formula. `backupRead_` turns any real `Date` back into text.

## Frontend: `src/`

- `lib/api.ts` POSTs JSON to `/api/rpc` (same address as the site, so no CORS). `lib/auth.tsx` holds the login token in `localStorage` (`pmt_token`). `lib/data.tsx` (`DataProvider`, mounted only when logged in) loads `getAll`, caches it in `localStorage`, shows the cache first, then refreshes (also when the tab becomes visible again after 60 s). Every write goes through `save(action, params, successMessage)`, which calls the API and then reloads everything. There are no optimistic updates. `useData()` also gives helpers like `contactOf`, `statusOf`, `uniStatusOf` and `userName`.
- Per-person progress is a `contacts` row per (professor, user); a missing row means "Not sent". "Emailed" means any status except "Not sent". A "Follow up" badge is shown when the status is Sent or Seen and `date_sent` is more than `follow_up_days` old (`lib/utils.ts: followUpAge`). The date sent can be edited in the Professors list (`components/SentDate.tsx`), only for yourself.
- University progress is a `university_progress` row per (university, user): status and a documents checklist (comma-separated `CHECKLIST_ITEMS` keys). `professors.university` stays free text. The professor form offers the Universities names through `UniversityCombobox` (a custom dropdown that still accepts any typed name; the browser `<datalist>` was unreliable). The app matches the two with `uniKey()` (case and spaces ignored).
- The Settings page shows `components/BackupCard.tsx` to the admin: backup and restore, each behind an "Are you sure?" dialog (restore also needs the typed word RESTORE).
- Dark mode is the `dark` class on `<html>` (Tailwind `@custom-variant dark` in `index.css`). An inline script in `index.html` sets it before paint. Shared look comes from the `.card`, `.input`, `.btn`, `.btn-primary`, `.btn-danger` and `.muted` classes in `index.css`. Use these instead of repeating utility strings.
- Exports are Excel (`.xlsx`) files, never CSV. `lib/exportRows.ts` builds the rows (pure, no browser code, imports use `.ts` extensions so Node can load it for tests; `allowImportingTsExtensions` is on). `lib/export.ts` turns rows into a file with `write-excel-file/universal` (loaded with a dynamic `import()` on click, so it stays out of the main bundle) and downloads it. Components call it through `useExport()`. Cell values are plain strings, so notes like `=1+1` stay text. Combined sheet = universities joined to professors by `uniKey(university)`.
- `vercel.json` rewrites every path except `/api/...` to `index.html`, so `/join?code=...` works when opened directly. The service worker's `navigateFallbackDenylist` also skips `/api/`.
