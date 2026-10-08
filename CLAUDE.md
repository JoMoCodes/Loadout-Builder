# Notes for Claude

## Write summaries like you're explaining to a five-year-old

The people who read this repo's pull requests and the app's Features log are not
programmers. Anything written for them must be in plain, everyday words:

- **Pull request summaries** (title and description) and
- **Release notes** in `packages/core/src/releaseNotes.ts` (they show in the app's
  "What's new" window and Features log page).

How to write them:

- Say what changed **for the person using the app**, not how the code works.
  Good: "The app now reminds you when your driver list is over a month old."
  Bad: "Added `refreshDueAt` to `associatesMeta` and a staleness check in the renderer."
- Short sentences. One idea per bullet.
- No code words: no file names, function names, settings keys, "IPC", "renderer",
  "state", "refactor", "API", etc. Use the names people see in the app
  (button labels, page names like **Load Out** or **Route Data**).
- If something is technical but matters, explain what it means in real life
  ("If the folder is on a USB stick that's unplugged, the app saves to its usual
  folder instead").
- Keep headings and titles short and plain, with no descriptions in brackets.
  Good: "What changed". Bad: "What changed (in plain words)".
- Use the PR template's sections. A short "For whoever maintains the app"
  section at the end may use technical words, but only there.

## Never put real data in this repo

This repo will end up public. Drivers' details must never be in it, in any form:

- **No real driver names, Transporter IDs, VINs, plates, phone numbers, email
  addresses or station codes**, and no screenshots of real data, anywhere:
  code, comments, tests, commit messages, pull requests, issues, release notes,
  help pages, or Discussions. If you are unsure whether something is real,
  leave it out.
- **Example names must come from `packages/fixtures/manifest.json`.** Pick
  made-up people from there. Help screenshots are taken in demo mode, which
  loads the made-up files in `packages/fixtures/`.
- **Real exports stay outside the repo.** Read them from a path on the computer
  (for example the Downloads folder) and never copy them in. Test files come
  from `npm run fixtures`, which writes made-up copies.
- **Logs and error messages never include names or IDs.** Log counts and reason
  codes instead (for example "12 rows read", not who was in them).
- **The privacy scan (`npm run scan`) must pass.** It runs before every commit
  and on every push. If it fails, remove the real data. Never edit the scan, its
  lists, or the manifest just to get past it.
- Secrets (passwords, keys) are never written into files in this repo.
