# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About the user and the project

The user (Angon) is a beginner in web development. Explain steps, terms and decisions in simple English, and give exact click-by-click instructions for anything done by hand (Google Sheets, Apps Script, Vercel).

The app ("Professor Mail Tracker", short name ProfMail) lets two people, Angon (admin) and Ayon, track cold emails to professors. It is a PWA (React + Vite + TypeScript + Tailwind v4 + `vite-plugin-pwa`) hosted on Vercel. A Google Sheet is the database, reached through a Google Apps Script Web App. Access is by invite link only, and everyone sees everyone's data. `README.md` is the user-facing setup guide (easy English). Keep it updated when setup steps change.

## Commands

- `npm run dev`: dev server on http://localhost:5173. Restart it after editing `.env`.
- `npm run build`: type-check (`tsc -b`) and build. There is no linter and no test runner.
- `node scripts/make-icons.mjs`: regenerates `public/icon-192.png` and `icon-512.png`.
- `VITE_API_URL` (in `.env`, see `.env.example`) is the Apps Script Web App URL. It is baked in at build time, so Vercel needs it set before building.

## Backend: `apps-script/Code.gs`

The user pastes this file by hand into the Sheet's Extensions > Apps Script editor, and must **redeploy a new Web App version** after every change (the README says how). Always remind them when you change this file.

- `SCHEMA` at the top is the source of truth for tabs and column order. Rows are read and written positionally by `SCHEMA` order (`readAll_`, `appendRow_`, `updateRow_`). Header names in the sheet are not read back. If you add or reorder a column, update `SCHEMA` and the sheet header row together. `setup()` does not migrate existing tabs.
- `doPost` takes `{action, token, ...params}`, looks up `ACTIONS[action]`, authenticates the token (except `join`), takes a script-wide `LockService` lock around every handler (reads too), and returns `{ok, data}` or `{ok:false, error}`. `error: 'AUTH'` means the session is invalid, and the frontend logs out. To add an endpoint, add a function to `ACTIONS` and call `requireAdmin_(user)` for admin-only ones.
- Auth has no passwords. An admin-created `invite_code` is a reusable link: every `join` with it creates a new session token for that device. The `session_token` cell holds all of a person's tokens, comma-separated (max `MAX_DEVICES`, the oldest is dropped), read through `sessionTokens_`. `regenerateInvite` replaces the code and clears all tokens, which logs out every device and kills the old link. `revokeUser` clears the tokens and blocks the link.
- Text cells are written with the plain-text number format (`fmt_`), so Sheets never turns a note into a date, a number or a formula. If Sheets still hands back a `Date`, `readAll_` turns it back into text. Dates are stored as `yyyy-mm-dd` strings. Always compare booleans with `truthy_()`, because Sheets may return the strings "true" and "false".
- Professors are soft-deleted (`deleted` column). `getAll` returns everything the app needs in one call (professors, contacts, users, the caller's own templates, settings, latest 200 activity). Activity rows are written by the server inside each action, as a ready sentence in `details` ("marked Prof. X as Sent"), and the UI shows `<name> <details>`.
- Helpers end in `_` so Apps Script does not expose them as callable.

## Frontend: `src/`

- `lib/api.ts` sends every request as a POST with `Content-Type: text/plain` to avoid a CORS preflight, which Apps Script cannot answer. Do not switch to `application/json`.
- `lib/auth.tsx` holds the session token in `localStorage` (`pmt_token`). `lib/data.tsx` (`DataProvider`, mounted only when logged in) loads `getAll`, caches it in `localStorage`, and shows the cache first, then refreshes (also when the tab becomes visible again after 60 s). Every write goes through `save(action, params, successMessage)`, which calls the API and then reloads everything. There are no optimistic updates. `useData()` also gives helpers like `contactOf`, `statusOf` and `userName`.
- Per-person progress is a `Contacts` row per (professor, user). A missing row means "Not sent". "Emailed" means any status except "Not sent". A "Follow up" badge is shown when the status is Sent or Seen and `date_sent` is more than `follow_up_days` old (`lib/utils.ts: followUpAge`).
- Dark mode is the `dark` class on `<html>` (Tailwind `@custom-variant dark` in `index.css`). An inline script in `index.html` sets it before paint. Shared look comes from the `.card`, `.input`, `.btn`, `.btn-primary`, `.btn-danger` and `.muted` classes in `index.css`. Use these instead of repeating utility strings.
- `vercel.json` rewrites all paths to `index.html`, so `/join?code=...` works when opened directly.
