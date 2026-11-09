# Making the build faster

Written 9 November 2026, from the timings of the GitHub builds on 18 and 19 October 2026
(the 2.14.1 and 2.14.2 releases). This page says where the time went and what saves the
most. The four changes it recommends were made to the GitHub build the same day. One side
effect to know: a branch is now built through its pull request, not on every push, so a
branch with no pull request open is not built until one is opened (or the build is started
by hand on GitHub's Actions page).

## What happened before the changes

Every time code is pushed to GitHub, GitHub builds the app from scratch. A build takes
**6 to 7 minutes** from push to green tick, and up to **9 minutes** when GitHub is busy.

Where those minutes go, for one typical build:

| Step                                 | Time         | What it is                                                    |
| ------------------------------------ | ------------ | ------------------------------------------------------------- |
| Privacy scan                         | 15 seconds   | Checks nothing real is in the code. Must finish before the rest starts. |
| Install                              | 1 min 25 sec | Downloads all the parts the app is made of (Electron and friends). |
| Check the code style                 | 30 seconds   | Spots untidy code.                                            |
| Check the types                      | 22 seconds   | Spots mistakes like a word where a number should be.          |
| Test                                 | 46 seconds   | Runs the 1,700 small tests.                                   |
| Build installer and portable .exe    | 1 min 50 sec | Makes the two .exe files people download.                     |
| Start the app and check every page   | 36 seconds   | Opens the built app once and clicks through it.               |
| Upload                               | 11 seconds   | Saves the .exe files to GitHub.                               |

Two surprises in there:

1. **Turning the code into the app takes 3 seconds.** The other 1 minute 47 seconds of the
   "Build installer" step is squeezing the app into a small .exe file. Squeezing alone is
   about a minute.
2. **Every pull request is built twice.** GitHub starts one build because code was pushed to a
   branch, and a second identical build because that branch has a pull request open. Of the
   last 40 builds, 16 were a second copy of one that was already running. The second copy
   often sits in a queue for 3 minutes before it even starts, which is why some builds look
   like 9 minutes.

## What would save the most

Ranked by how much time they save for how little risk.

### 1. Build each change once, not twice

**What changes for you:** a pull request gets one green tick instead of two, and it arrives
sooner because the two builds no longer queue behind each other. If you push again while a
build is still running, the old build is cancelled instead of finishing for nothing.

**Saves:** half of all build time on GitHub. No change to the app.

### 2. Skip the installer on branches

**What changes for you:** builds on branches and pull requests stop making the two .exe
files. They still compile the app, run every test and open the app to click through every
page. The .exe files are only made for pushes to `main` and for releases, which is the only
time anyone downloads them. You can still ask for the .exe files on a branch by starting the
build by hand on GitHub's Actions page.

**Saves:** about 1 minute 45 seconds on every branch build. Branch builds drop from about
6 minutes to about 4.

### 3. Run the checks beside the build, not before it

**What changes for you:** the style check, the type check and the tests run on a second
computer at the same time as the Windows build, instead of one after another on the same
one. They run on Linux, which GitHub provides faster and in larger numbers than Windows.

**Saves:** about 1 minute 40 seconds off the Windows build. With 2 and 3 together a branch
build is around 2 and a half minutes, and a release build around 4.

### 4. Keep the downloaded parts between builds

**What changes for you:** nothing visible. The build keeps a copy of Electron and the
installer tools from the last run instead of downloading them again.

**Saves:** 15 to 30 seconds per build. Small, but free.

### Things not worth doing

- **Making the installer squeeze less.** It would cut a minute off release builds, but the
  download for every user would roughly double (from about 100 MB to over 200 MB), and
  self-updates would take longer. Not worth it. Item 2 gets the same saving on branches
  without touching what users download.
- **Running the privacy scan beside the build instead of first.** Saves about 20 seconds,
  but it is the thing that stops real driver data ever being built into an .exe on a public
  repo. Leave it as the gate.
- **Speeding up the tests or type check further.** Together they are about a minute and
  already fast for their size. Item 3 takes them off the critical path anyway.

## On this computer

Nothing is built on this computer today. The app's parts (the `node_modules` folders) are
not installed in either checkout, so all building happens on GitHub. The suggestions above
are all about the GitHub build. If local builds start being used, the biggest local saving
is the same as item 2: use `npm run dist:dir` to try the app without making installers.

## For whoever maintains the app

All four items are edits to `.github/workflows/build-windows.yml`, and all four are in place.

1. **One build per change.** Restrict `push` to `main` and `v*` tags and keep `pull_request`
   for branches, and add
   ```yaml
   concurrency:
     group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
     cancel-in-progress: true
   ```
   The duplicate run today comes from `push: branches: ['**']` plus `pull_request:` firing on
   the same commit. Note the Claude-session-link check reads `github.event.pull_request.number`,
   which already handles the PR case.
2. **Skip the installer on branches.** The smoke script launches Electron from `node_modules`
   against `dist/`, so it does not need `release/`. On non-main, non-tag runs replace
   `npm run dist` with `npm run build -w @loadout/desktop`, and give the installer step and
   the artifact upload an `if:` for `github.ref == 'refs/heads/main' || startsWith(github.ref,
   'refs/tags/v') || github.event_name == 'workflow_dispatch'`. The timeline shows the
   `electron-builder` portion is about 7 s rebuilding `better-sqlite3`, 20 s packaging, about
   65 s LZMA-compressing `win-unpacked` into the NSIS payload, then a few seconds for the
   portable target, which reuses it.
3. **Parallel checks on Linux.** Add a `checks` job on `ubuntu-latest` that does `npm ci`,
   `npm run lint`, `npm run typecheck`, `npm test`, with `needs: privacy-scan`, and drop
   those three steps from the Windows job. `vitest.config.ts` notes the Windows runner is
   slow for tests, so this also makes the tests themselves quicker. Make `release` depend on
   both `checks` and `build`.
4. **Cache downloads.** `actions/setup-node` with `cache: npm` only caches the npm tarball
   store. Add `actions/cache` for `~\AppData\Local\electron\Cache` and
   `~\AppData\Local\electron-builder\Cache`, keyed on `package-lock.json`. That covers the
   Electron zip and the `nsis` and `nsis-resources` downloads seen in the log.

Smaller optional ones: `electron-builder` could skip its own `@electron/rebuild` pass
(`npmRebuild: false`) since `check-native.mjs` already ensures `better-sqlite3` loads inside
Electron, saving about 7 s, but only after confirming the postinstall actually runs under
`npm ci` in CI (its output did not appear in the 19 October log). `npm run typecheck` runs six
`tsc` invocations serially; project references with `tsc -b` would share work, but the whole
step is 22 s so it is low priority.
