# Loadout Builder

**What it does, in one sentence:** you give it today's load-out sheet and the other files from Amazon and DSP Workplace, and it builds the daily roster, gives each driver the right van, and prints the sheets you hand out.

**Why you can trust it:** it never guesses a match between a driver and their record. If something does not line up, it stops, tells you what is wrong in plain words, and lets you decide.

---

## Install (Windows)

1. **Download the app.** Go to the [latest release](https://github.com/JoMoCodes/Loadout-Builder/releases/latest). Under **Assets**, click the file whose name starts with `Loadout-Builder-Setup` and ends in `.exe`.
2. **Open the file you downloaded.** You'll usually find it in your **Downloads** folder.
3. **If Windows shows a blue "Windows protected your PC" box,** click **More info**, then **Run anyway**. This appears because the app isn't registered with Microsoft (that costs money), not because anything is wrong.
4. **Follow the installer.** Keep the default choices and click **Next** / **Install**, then **Finish**. On the **Shortcuts** step, leave **Create a desktop shortcut** ticked if you want one on your desktop (untick it if not). The app is always added to the Start menu, as **Loadout Builder**.

That's it. From now on the app **updates itself**: when a new version is out, a green **Restart to update** button appears at the bottom-left of the app. Click it and the update installs quietly in the background (no setup screens), keeping your shortcuts and data, and the app opens again by itself. The first time you open the new version, a **What's new** window tells you what changed. You can read every note again on the **Features log** page.

> **Can't install programs on this computer?** On the same release page, download the file ending in `-portable.exe` instead. Double-click it and the app runs straight away, with no installing. It won't update itself, though, so you'll need to download the newest one yourself now and then.

---

## Using it every day

The first time you open the app, the **Home** page shows a short checklist and each page shows a quick tour of its buttons. You can do everything from the checklist:

1. **Bring in your driver list.** Only again when your list changes.
2. **Bring in your vans.** Only again when your vans change.
3. **Bring in today's load-out sheet.**
4. **Bring over route data.**
5. **Assign vans and print.**

**Shortcut:** drag a file from your computer onto the page that uses it.

Open **How to use** in the left menu for a step-by-step walk through a normal day, what the colours mean, and what to do when something goes wrong. Hard to read? Use **A+** at the top of the window, or pick **High contrast** in **Settings**.

### Used the old Loadout Builder?

The first time you open the app, it looks for your old roster data. If it finds it, it asks **We found your old roster data. Bring it over?** Click **Yes** to copy your drivers, vans and saved layouts into the new app. The old file is not changed. Click **Not now** to skip it, or **Choose a different file** if you keep the old file somewhere else (it is called `loadout.db`). You can do it later from **Settings**, under **Bring over data from the old app**. It only works while the new app has nothing saved yet, so it can never write over your work.

---

## Where your data lives

Everything stays **on your computer**, in `%APPDATA%\Loadout Builder\data`. Click **Open data folder** in **Settings** to see it. The app never uploads drivers, rosters or files anywhere. The only thing it ever contacts is GitHub, to check whether a newer version of the app is out.

Printed rosters and exports go to the folder you choose when you save them.

---

## Try it without your own data

Turn on **Demo mode** in **Settings**. The app fills itself with made-up drivers and vans, so you can look around or train someone. Your real data is not touched, and nothing you do in demo mode is kept. The app always starts with demo mode off.

---

## Asking a question

Click **Help** at the top of the window, then **Ask a question**. It opens the [help forum](https://github.com/JoMoCodes/Loadout-Builder/discussions) in your browser.

**Please read this first: the help forum is public. Anyone on the internet can read it.**

- **Describe the problem in words.** Say what you clicked and what the app said.
- **Never post a roster, a screenshot, an export file, or any driver's name, ID, phone number or van details.** Not even a little bit, and not even if you cover part of it.
- If you are not sure whether something is private, leave it out.

---

## For whoever maintains the app

### Releasing a new version

1. Open `apps/desktop/package.json` and bump `"version"` (for example `2.0.0` → `2.0.1`).
2. Add a short entry for that version at the top of `packages/core/src/releaseNotes.ts`, in plain words, like you're explaining it to a five-year-old (see `CLAUDE.md`). People see it in the **What's new** window the first time they open the updated app. (The tests fail if you forget.)
3. Commit and push to `main`.

GitHub then checks for private data, tests the app, starts it once on Windows to make sure it opens, builds it, and publishes the new release by itself. Everyone's installed app picks it up within a few hours, or the next time they open it.

Good to know:

- Pushing to `main` **without** changing the version builds and tests the app but doesn't release anything.
- Updates only work while this repository is **public**, because the app downloads updates without logging in.
- Nothing builds or releases unless the **Privacy scan** job passes first.

### Working on the code

```bash
npm install        # one-time setup (also installs the commit check, see below)
npm start          # open the app for development
npm test           # run the automated checks (uses made-up data)
npm run lint       # check the code style
npm run typecheck  # check the types
npm run dist       # build the Windows installer and portable .exe (run this on Windows)
npm run scan       # run the privacy scan over every file
node scripts/make-icon.mjs   # draw the app icon again (apps/desktop/build)
```

| Folder | What it holds |
|---|---|
| `apps/desktop/` | The Windows app: the window and its screens (Electron + React + TypeScript) |
| `packages/core/` | The rules and file reading, in plain TypeScript with no window code, plus its tests |
| `packages/storage/` | The saved data (SQLite), and the one-time copy from the old app's database |
| `packages/fixtures/` | Made-up export files shaped like the real ones, the script that makes them, and `manifest.json` |
| `docs/` | The checklist of everything the old app did (`PARITY.md`) and how the app was planned |
| `scripts/` | The privacy scan, the old-app comparison, the icon, and the script that builds the public repository |

### Keeping real driver data out of the repo

Real names, Transporter IDs, VINs, phone numbers, emails and the station code must never be in this repo (rules in `CLAUDE.md`).

- **Real files stay outside the repo.** `.gitignore` blocks data files everywhere except `packages/fixtures/`.
- **Before every commit**, a check runs on the files you are about to save and stops the commit if it finds something real. It is installed by `npm install`. It fails on emails, phone numbers, the station code, IDs and VINs that are not made up, and any name on your private list.
- **On every push**, the same check runs in GitHub over the whole repo, and the build waits for it. The station code is not in the repo, so give GitHub a repository secret named `LB_STATION_CODE` (the station code, and optionally the DSP name, separated by commas). Without it that one check is skipped.
- **Your private lists** live in `.private/` (ignored by git, never uploaded). Set them up once on each computer that commits:
  1. Put the station code (and DSP code and name), one per line, in `.private/station.txt`.
  2. Run `node scripts/make-real-names.mjs "<path to the real associate export>"`. It builds `.private/real-names.txt`, the list of names the check must never let through.
- **Test files are made, never copied.** `packages/fixtures/README.md` explains how `npm run fixtures` turns real exports into made-up ones. Use names from `packages/fixtures/manifest.json` in examples.
- If the check fails, take the real data out. Do not change the check to get past it.
