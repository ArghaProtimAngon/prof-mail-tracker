# Professor Mail Tracker

An app for tracking the emails you send to professors. It works as a website and can be installed on an Android phone.
Your Google Sheet is the database. Google Apps Script is the "server".

**Words you will see:**
- **Apps Script**: a small program that lives inside your Google Sheet. Our app talks to it.
- **Web App URL**: the internet address of that program.
- **PWA**: a website that can be installed on your phone like a normal app.
- **Vercel**: a free service that puts your website on the internet.

---

## Part 1: Set up the backend (Google Sheet)

### 1. Put the code in your Sheet
1. Open your Google Sheet **"Professor to Mail"**.
2. Click **Extensions → Apps Script**. A code editor opens in a new tab.
3. Click the file **Code.gs** on the left. Select all the text (`Ctrl + A`) and delete it.
4. Open `apps-script/Code.gs` from this project, copy everything, and paste it into the editor.
5. Click the **Save** icon (or `Ctrl + S`).

### 2. Run `setup()` once
1. In the function dropdown at the top, choose **setup**, then click **Run**.
2. The first time, Google asks for permission:
   - Click **Review permissions** and choose your Google account.
   - If you see "Google hasn't verified this app", click **Advanced → Go to (project name) (unsafe) → Allow**.
     It says "unsafe" only because you wrote the script yourself and Google has not reviewed it.
3. Click **Execution log** at the bottom. You will see a link like `https://<your-site>/join?code=abc123...`.
   Copy the code after `code=`. It is your personal invite code.
   (If you lost it, open the **Users** tab in your Sheet. It is in the `invite_code` column on Angon's row.)
4. In your Sheet you now have the tabs Professors, Contacts, Users, Templates, Activity and Settings. `Sheet1` stays untouched.

Running `setup()` again is safe. It never deletes anything.

### 3. Deploy it as a Web App
1. In the Apps Script editor, click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set **Execute as: Me** and **Who has access: Anyone**. Then click **Deploy**.
4. Copy the **Web app URL** (it ends with `/exec`).
5. Test it: paste the URL in your browser. You should see `{"ok":true,"data":"ProfMail API is running."}`.

### 4. How to update the script later (important!)
Every time `apps-script/Code.gs` changes:
1. Paste the new code into the Apps Script editor and save.
2. Click **Deploy → Manage deployments**, then the pencil icon.
3. Under **Version** choose **New version**, then click **Deploy**.

The URL stays the same. If you only press Save and skip the new version, the live app keeps using the **old** code.

---

## Part 2: Run the app on your PC

You need [Node.js](https://nodejs.org) (you already have it).

1. Copy `.env.example` to a new file named `.env`.
2. In `.env`, replace the example URL with your Web app URL.
3. Open a terminal in the project folder and run:
   ```
   npm install
   npm run dev
   ```
4. Open http://localhost:5173/join?code=YOUR_CODE (use your invite code).
5. You are in. If you change `.env`, stop the app (`Ctrl + C`) and run `npm run dev` again.

Your invite link works on **all your devices** (up to 10). Keep it somewhere safe. If you lose it, open the **Users** tab in your Sheet and copy the `invite_code` from your row, or use **Admin → Copy link**.

---

## Part 3: Invite Ayon

1. Log in as Angon and open **More → Admin** (on a computer, **Admin** in the left menu).
2. Type `Ayon` and click **Create**. The invite link is copied for you.
3. Send the link to Ayon. **The same link works on all of Ayon's devices**, for example his phone and his computer. He just opens it on each one. Each device stays logged in until he presses Log out.
4. Anyone who has the link can get in, so send it only to Ayon. If it goes to the wrong person, press **New link** next to Ayon's name. The old link stops working and Ayon is logged out on every device, so send him the new link. His data stays safe.
5. **Revoke** blocks a person and logs them out.

Make the invite links **after** you open the live website (Part 4), so they start with your real website address and not `localhost`.

---

## Part 4: Put the app on the internet (Vercel)

You do this once. You do not need GitHub for this way.

1. Create a free account at https://vercel.com (you can sign up with Google).
2. In a terminal in the project folder, run:
   ```
   npx vercel login
   ```
   Follow the steps in the browser.
3. Run:
   ```
   npx vercel
   ```
   Answer the questions: accept the defaults. (Set up and deploy: **Y**. Link to existing project: **N**. Project name: anything, like `prof-mail`. Directory: press Enter. Override settings: **N**.)
4. Tell Vercel your Web app URL. Run this and paste the URL when it asks, choosing **Production**:
   ```
   npx vercel env add VITE_API_URL production
   ```
5. Publish the real version:
   ```
   npx vercel --prod
   ```
   It prints your website address, like `https://prof-mail.vercel.app`.
6. Open `https://YOUR-SITE.vercel.app`. You should see "You need an invite link". That is correct.
7. Log in as Angon on the live site. Use the same code as before: open `https://YOUR-SITE.vercel.app/join?code=YOUR_CODE`.
8. Now create Ayon's invite link in the Admin page. It will start with your real address.

**To update the website later:** run `npx vercel --prod` again.

The `.env` file stays on your PC and is never uploaded. Vercel keeps its own copy in step 4.

---

## Part 5: Install it on an Android phone

1. Open your website link in **Chrome** on the phone and log in with your invite link.
2. Tap the **⋮** menu (top right).
3. Tap **Install app** (or **Add to Home screen**), then **Install**.
4. The ✉️ ProfMail icon appears on your home screen. It opens like a normal app.

If the invite link is opened inside another app (like WhatsApp), long-press the link and open it in Chrome first, then install.

---

## What the app does

- **Dashboard**: numbers for each person and combined, status bars, follow-ups and deadlines.
- **Professors**: search, filter by university, field, status and person, sort, and a "Needs follow-up" filter. A table on computers and cards on phones.
- **Professor page**: all info, your own status/date/reply, both people's progress side by side, shared notes, and **Email with template**.
- **Email with template**: pick a template, then open Gmail (or another mail app), or copy the email. Then it asks "Did you send it?". If you say yes, the status becomes "Sent" with today's date.
  Placeholders: `{professor_name}`, `{professor_last_name}`, `{university}`, `{field}`, `{my_name}`.
- **Activity**: who did what, newest first.
- **Settings**: follow-up days (default 10) and dark mode (system / light / dark).
- **Export CSV**: one file with the professor info and both people's status, date and reply.
- **Offline**: the app opens with your last saved data and shows a banner. Saving is turned off until you are online again.
- **Deleting a professor** only hides it. The row stays in your Sheet, so you can bring it back by changing `deleted` to `FALSE` on that row of the **Professors** tab.

## For developers
- `npm run dev` runs the app, `npm run build` makes the production build.
- `node scripts/make-icons.mjs` re-draws the app icons in `public/`.
