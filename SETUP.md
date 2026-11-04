# SuperValue app — setup (about 15 minutes, once)

## 1. Make a test copy of the sheet
Open the Super Value sheet → **File → Make a copy**. Do steps 2–3 in the copy first.
When you're happy, repeat them in the real sheet (or just keep using the copy).

## 2. Add the sync script to the sheet
1. In the sheet: **Extensions → Apps Script**.
2. Click **+** next to "Files" → **Script**, name it `SuperValueApp`.
3. Delete what's in the new file, paste in all of `SuperValueApp.gs`, click **Save**.
   (Your existing "Update" script is not touched.)
4. In the function dropdown at the top pick **svaSetup** → **Run**.
   Google asks for permission → choose your account → *Advanced* → *Go to … (unsafe)* → **Allow**.
   (It says "unsafe" only because it's your own unpublished script.)
5. Open **Execution log**: it shows `App key: xxxxxxxxxxxxxxxx`. Copy that key.
   The sheet now has two extra columns at the end, **App ID** and **App Sync**. Leave them alone.
6. **Deploy → New deployment** → gear icon → **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
   → **Deploy** → copy the **Web app URL** (ends in `/exec`).

> If you later change the script, use **Deploy → Manage deployments → Edit → New version**
> so the URL stays the same.

## 3. Put the app on GitHub Pages
1. On github.com: **New repository**, e.g. `supervalue` (Public), create it.
2. **Add file → Upload files** → drag in everything inside the `docs` folder
   (index.html, app.js, styles.css, sw.js, manifest.webmanifest and the three .png icons) → **Commit**.
3. Repo **Settings → Pages** → Source: *Deploy from a branch*, Branch: **main**, folder **/docs** → Save.
4. After a minute the app is at `https://<your-username>.github.io/supervalue/`.

## 4. Each phone (at home, with internet)
1. Open the app address in **Safari** (iPhone) or **Chrome** (Android).
2. Install it: iPhone **Share → Add to Home Screen**; Android **⋮ → Add to Home screen / Install app**.
3. Open it **from the home-screen icon** → ⚙︎ → paste the Web app URL and the key → **Save & sync**.
4. On the first phone, tap **Copy setup link for the other phone** and send that link to the second
   person. They install the app (step 2), open it from the home screen, ⚙︎ → paste the link → Save.

Done. Before leaving for the store, open the app once so it has the latest list.

## How it behaves
- **At home**: change quantities in the app (*All items* tab) or in the sheet as usual.
- **At the store (no internet)**: everything works. Tap an item to set its aisle, side, position
  and shelf. It moves to the right aisle immediately. The top badge shows "Offline · N waiting".
- **Back online**: changes upload by themselves (or tap the badge). Only the changed fields are sent.
- **Same item changed in two places**: the most recent change wins.
- Check-marks stay on each phone (not synced). Use **Uncheck all** before the next trip.
- New items, names, Spanish translations and boat locations: add or edit them in the sheet.
  The phones pick them up on the next sync.
- The Isles / Pasillo tabs and the Update checkbox still work if you want a printout.

## Notes
- Anyone with both the URL and the key could edit the list. Don't post them publicly.
- iPhone: use the home-screen app. Safari and the home-screen app keep separate data.
