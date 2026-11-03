# Professor Mail Tracker

An app for tracking the emails you send to professors and the universities you want to apply to.
It works as a website and can be installed on an Android phone.

**How it is built (in simple words):**
- **The website** is hosted on **Vercel** (free).
- **The data** (professors, universities, statuses, dates, templates...) lives in a **Neon Postgres database** (free). Neon is connected to Vercel with a few clicks.
- **The server** is a small program that also runs on Vercel (the `api` and `server` folders). It checks who you are and what you are allowed to change.
- **Your Google Sheet is the backup.** The admin can copy everything into the Sheet with one button and bring it back with another button (Settings page).

**Words you will see:**
- **Database**: the place where all the data is kept safely.
- **Environment variable**: a secret setting that you give to Vercel (like a password). It is never put in the code or on GitHub.
- **Apps Script**: a small program inside your Google Sheet. We use it only for the backup now.

---

## Part 1: Switch to the new database (do this once)

Follow the steps **in order**. Your live app keeps working the old way until Step 4.

### Step 1: Create the database in Vercel
1. Go to https://vercel.com and open your project.
2. Click the **Storage** tab.
3. Click **Create Database** (or **Connect Database**) and choose **Neon** (Postgres).
4. Accept the terms. Choose the **Free** plan.
5. Choose a **region close to you** (if you live in Asia, choose a Singapore or Tokyo region). Click **Create**.
6. When it asks which project to connect, choose your project and tick **all environments** (Production, Preview, Development). Click **Connect**.
7. Go to **Settings → Environment Variables**. You should now see `DATABASE_URL` in the list. That is the secret address of your database. Vercel added it for you.

(The names of the buttons may look a little different. The idea is always the same: create a Neon database and connect it to your project.)

### Step 2: Update the Google Sheet script (it becomes the backup)
1. Open your Google Sheet, then **Extensions → Apps Script**.
2. Click `Code.gs`, select all the text (`Ctrl + A`) and delete it.
3. Open `apps-script/Code.gs` from this project, copy everything, and paste it into the editor. Click **Save**.
4. In the function dropdown at the top choose **createBackupKey**, then click **Run**. (Allow permission again if Google asks.)
5. Click **Execution log** at the bottom. You will see `Your backup key is:` and a long text under it. **Copy that long text.** It is your **backup key**. Keep it secret.
6. Click **Deploy → Manage deployments**, then the pencil icon. Under **Version** choose **New version** and click **Deploy**.
   The Web app URL stays the same.

### Step 3: Give Vercel three secrets
In Vercel, go to your project → **Settings → Environment Variables**. Add these three, one by one. For each, keep **Production** and **Preview** ticked, then click **Save**.

| Name | Value |
|---|---|
| `SHEET_API_URL` | Your Google Web app URL (the one that ends with `/exec`). It is the same one you used before. |
| `BACKUP_KEY` | The backup key you copied in Step 2. |
| `SETUP_KEY` | Make up any long random text, at least 30 letters and numbers. You need it only once, in Step 5. |

### Step 4: Put the new version of the app live
Tell Claude: **"go live"**. Claude merges the new version into the main branch and pushes it, and Vercel publishes it in about a minute.
From this moment the app uses the new database. It is empty until Step 5, so do Step 5 right away. Please do not use the app in between.

### Step 5: Move your old data into the new database
1. Open this address in your browser (use your real site address and your `SETUP_KEY`):
   ```
   https://YOUR-SITE.vercel.app/api/setup?key=YOUR_SETUP_KEY
   ```
2. You should see `"ok":true` and a list of how many rows were moved (professors, universities, and so on).
   - If you see `"ok":false`, read the message. It says what to fix. You can run this address again safely: it only works while the database is empty.
3. Open your site. **You are still logged in**, and Ayon too. Everything you had is there.

### Step 6: Clean up
1. In Vercel, **delete** `SETUP_KEY` (Settings → Environment Variables → the **⋯** menu → Remove). It is not needed anymore.
2. Delete `VITE_API_URL` too, if it is still there. The app does not use it anymore.
3. In the Apps Script editor, find the line `var LEGACY_API = true;` near the top and change it to `false`. Save, then **Deploy → Manage deployments → pencil → New version → Deploy**.
   This switches off the old Sheet-based app for good. The backup keeps working.

### Step 7: Make your first backup
Log in as admin, open **Settings**, and press **Back up to Google Sheet** (see Part 3).

---

## Part 2: Run the app on your PC (optional)

You only need this if you want to change the app. **Be careful:** on your PC the app uses the **same database as the live site**, so anything you change there is real. Test carefully.

1. Install the Vercel tools and sign in (you already did this): `npx vercel login`
2. In the project folder run:
   ```
   npm install
   npx vercel env pull .env.local
   npx vercel dev
   ```
   The second command downloads your secrets into a file called `.env.local` (it is never uploaded). The third starts the website **and** the server together.
3. Open the address it shows (usually http://localhost:3000).

(`npm run dev` alone starts only the website, without the server, so logging in will not work.)

---

## Part 3: Backup and restore (admin only)

Go to **Settings**. At the bottom you will find the **Backup** box. It shows when the last backup was made.

- **⬆️ Back up to Google Sheet**: copies everything into your Google Sheet. It **replaces** what is in the Sheet's backup tabs. Your app data does not change. Before it runs, the app asks **"Are you sure?"**.
- **⬇️ Restore from Google Sheet**: **replaces ALL the data in the app** with what is in the Sheet. Everything added or changed after the last backup is **lost for good**. The app shows a red warning, and the button stays grey until you **type the word RESTORE**.
  - People who are in the Sheet stay logged in. People who are not in the Sheet are removed.
  - If the Sheet looks wrong (for example, it has no admin, or a tab is missing), the restore stops and changes nothing.

Tips:
- Make a backup before big changes, and now and then (for example once a week).
- You can open the Sheet and look at your data any time. Please do not type in the backup tabs: the next backup replaces them. (If you do edit them and then restore, the app tidies up bad values.)
- Never share your Sheet publicly. It contains your data and the invite links of your users.

---

## Part 4: Invite Ayon

1. Log in as Angon and open **More → Admin** (on a computer, **Admin** in the left menu).
2. Type `Ayon` and click **Create**. The invite link is copied for you.
3. Send the link to Ayon. **The same link works on all of Ayon's devices**, for example his phone and his computer. He just opens it on each one. Each device stays logged in until he presses Log out (up to 10 devices).
4. Anyone who has the link can get in, so send it only to Ayon. If it goes to the wrong person, press **New link** next to Ayon's name. The old link stops working and Ayon is logged out on every device, so send him the new link. His data stays safe.
5. **Revoke** blocks a person and logs them out.

---

## Part 5: Install it on an Android phone

1. Open your website link in **Chrome** on the phone and log in with your invite link.
2. Tap the **⋮** menu (top right).
3. Tap **Install app** (or **Add to Home screen**), then **Install**.
4. The ✉️ ProfMail icon appears on your home screen. It opens like a normal app.

If the invite link is opened inside another app (like WhatsApp), long-press the link and open it in Chrome first, then install.

---

## Part 6: Updating the app later

- **The website and server:** change the code, then `git add .`, `git commit -m "..."`, `git push`. Vercel publishes it by itself in about a minute.
- **The Google Sheet script** (only if `apps-script/Code.gs` changes): paste it into Apps Script, then **Deploy → Manage deployments → pencil → New version → Deploy**.

If a new version breaks the site: Vercel → **Deployments** → find the last good one → **⋯ → Promote to Production**.

---

## What the app does

- **Dashboard**: numbers for each person and combined, status bars, follow-ups and deadlines.
- **Universities**: a list of universities you want to apply to, even without a professor. Add one by one (**+ Add**, or **+ University** on the Dashboard) or paste many names at once (**Add many**). Each has country, program, website, admission page, deadline, fee, funding, priority, Dream/Target/Safe and notes. **Each person has their own application status** (Not started, Preparing, Submitted, Interview, Accepted, Rejected) and a documents checklist (CV, statement of purpose, transcripts, recommendation letters, English test). Everyone can see everyone's status. You can search, filter, sort and export, and the Dashboard shows counts and deadlines in the next 14 days.
- **University field of a professor**: when you add or edit a professor, you can type any university name or pick one from your Universities list. The list shows the names from the Universities page.
- **Professors**: search, filter by university, field, status and person, sort, and a "Needs follow-up" filter. A table on computers and cards on phones.
- **Date I sent the email**: every person has their own date for each professor. You can type it right in the Professors list (the date box in your column) or on the professor's page. Putting in a date sets your status to Sent. **Only you can change your date, and everyone can see it**: Ayon sees the date Argha put in, and Argha sees the date Ayon put in.
- **Professor page**: all info, your own status/date/reply, both people's progress side by side, shared notes, and **Email with template**.
- **Email with template**: pick a template, then open Gmail (or another mail app), or copy the email. Then it asks "Did you send it?". If you say yes, the status becomes "Sent" with today's date.
  Placeholders: `{professor_name}`, `{professor_last_name}`, `{university}`, `{field}`, `{my_name}`.
- **Activity**: who did what, newest first.
- **Export to Excel**: all exports are `.xlsx` files (they open in Excel, Google Sheets and phones). **Export Excel** on the Professors page gives the professors with both people's status, date and reply. **Export Excel** on the Universities page gives the universities with both people's application status and documents done. **Export all (Excel)** on the Dashboard (and in the sidebar, or on the More tab on a phone) gives one file with three sheets: *Combined* (each university next to its professors), *Professors* and *Universities*.
- **Settings**: follow-up days (default 10), dark mode (system / light / dark), and for the admin the **Backup** box.
- **Offline**: the app opens with your last saved data and shows a banner. Saving is turned off until you are online again.
- **Deleting a professor or a university** only hides it. The row stays in the database. (Ask Claude if you ever need one back.)

## For developers
- `npm run build` type-checks the website and the server, and builds the website.
- `npm test` runs the server tests (on an in-memory database) and an end-to-end backup test that runs the real `apps-script/Code.gs` against a fake Sheet.
- `node scripts/make-icons.mjs` re-draws the app icons in `public/`.
