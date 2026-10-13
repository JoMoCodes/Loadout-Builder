# The "no help" test

Print it and take it to the test. There are three tests. Each one checks one thing:

- **The daily test:** can someone who has never seen Loadout Builder bring in a load-out sheet
  and print a roster, using only what the app shows them?
- **The weekly test** (further down): can a lead who has never seen the app bring in a week of
  scorecards and email the driver reports, using only what the app shows them?
- **The route sheets test** (at the end): can a dispatcher who has never seen the app bring in the
  day's route sheet PDF and send the route sheets, using only what the app shows them?

Run them on different days, with different people.

# The daily test

## Who does it

- **The tester:** a lead or a new dispatcher who has never used Loadout Builder. Not Jonathan.
- **The watcher:** you. You watch and write. You do not help.

## Before the test (about 10 minutes, without the tester)

1. Install the app on the test computer from the latest release page. Open it once, then close
   it. Do not click around.
2. Put two practice files on the computer's desktop. They are made-up copies with no real
   drivers in them, from the `packages/fixtures` folder of the app's code (Jonathan has them):
   - the load-out sheet `loadout-sheets/2026_09_02_15_27_loadout_sheet.xlsx`
   - the Routes file `routes/Routes_XXX1_2026-09-01_12_20 (CDT).xlsx`
3. Do **not** put any real roster, driver list or export on that computer.

## What to tell the tester

Read this out, word for word:

> "This app makes the daily roster and gives out the vans. Please open it and turn on demo mode,
> so you are using made-up drivers. Then bring in the load-out sheet on the desktop, bring over
> the route data from the Routes file, give out the vans, and print the roster (saving it as a
> file is fine). I can't help you, but please say out loud what you are thinking. Stop whenever
> you want."

Then stay quiet. If they ask you something, say: "What would you try?"

## What to write down

Use the table at the bottom, one line for each thing that happens.

- **Where they paused** for more than a few seconds, and on which page.
- **What they asked** out loud, word for word.
- **What they clicked wrong**: a button or page that was not the next step.
- **What helped them**: the checklist on Home, a tour, the ? notes, How to use, or a message.
- **The time** it took from opening the app to having the printed roster (or the saved file).

## The pass rule

The test **passes** when the tester brings in the load-out sheet and prints the roster **with no
one helping them**. Slow is fine. Wrong clicks are fine, if they find their own way back.

The test **fails** if you had to help, or if they gave up.

## After the test

- Thank them. Ask: "What was the hardest part?" and "What would you change?" Write the answers
  down word for word.
- Give your notes to Jonathan. Do not put names, photos of the screen or the files in the notes.
  The notes may end up on the app's public help forum.
- If it failed, the place they got stuck is what gets fixed next. Then test again with someone
  new.

## Notes table

| Time | Page | What happened (pause, question, wrong click, what helped) |
| ---- | ---- | --------------------------------------------------------- |
|      |      |                                                           |
|      |      |                                                           |
|      |      |                                                           |
|      |      |                                                           |
|      |      |                                                           |
|      |      |                                                           |

Time to printed roster: ________ minutes. Passed with no help: **Yes / No**

---

# The weekly test

It checks one thing: **can a lead who has never seen Loadout Builder bring in a week of
scorecards and email the driver reports, using only what the app shows them?**

## Who does it

- **The tester:** a lead who has never used Loadout Builder or the old Weekly Performance App.
  Not Jonathan.
- **The watcher:** you. You watch and write. You do not help.

## Before the test (about 15 minutes, without the tester)

1. Install the app on the test computer from the latest release page. Open it once. If it offers
   to bring over old data, click **Not now**. Close it. Do not click around.
2. Make a folder on the computer's desktop called **Weekly files**. Copy into it the made-up
   weekly exports from the `packages/fixtures/performance` folder of the app's code (Jonathan has
   them). Keep the ten folders as they are (`roster`, `thresholds`, `scorecards`, `pod`, `cdf`,
   `dsb`, `psb`, `dcr`, `dcr-totals`, `safety`). They have no real drivers in them, and every
   email address in them is made up (at example.com), so no real person gets an email.
3. Make a practice Gmail address for the test, with 2-Step Verification turned on. Write its
   address and password on a card for the tester. Do **not** make the app password: the tester
   does that.
4. Do **not** put any real driver list, scorecard or export on that computer, and do not turn on
   demo mode.

## What to tell the tester

Read this out, word for word:

> "This app makes a weekly performance report for each driver and emails it to them. The files
> for this week are in the Weekly files folder on the desktop. They are made up. Please bring
> them in, look at how the drivers did, and email the reports to two drivers. Send them from
> the Gmail address on this card. I can't help you, but please say out loud what you are
> thinking. Stop whenever you want."

Then stay quiet. If they ask you something, say: "What would you try?"

## What to write down

Use the table at the bottom, one line for each thing that happens.

- **Where they paused** for more than a few seconds, and on which page or tab.
- **What they asked** out loud, word for word.
- **What they clicked wrong**: a button, page or tab that was not the next step.
- **What helped them**: the weekly checklist on Home, a tour, a ? note, How to use, or a message.
- **Whether they found** the Imports tab, Sync now, the Dashboard, and the email setup in
  Settings on their own.
- **The time** it took from opening the app to the "emails sent" message.

## The pass rule

The test **passes** when the tester brings in the week, sets up the email (including the Gmail
app password) and the app says the two reports were sent, **with no one helping them**. Slow is
fine. Wrong clicks are fine, if they find their own way back. A "could not be delivered" email
from Gmail afterwards is fine too: the made-up addresses do not exist.

The test **fails** if you had to help, or if they gave up.

## After the test

- Thank them. Ask: "What was the hardest part?" and "What would you change?" Write the answers
  down word for word.
- Delete the app password from the practice Gmail account, and delete the practice account.
- Give your notes to Jonathan. Do not put names, email addresses, photos of the screen or the
  files in the notes. The notes may end up on the app's public help forum.
- If it failed, the place they got stuck is what gets fixed next. Then test again with someone
  new.

## Notes table

| Time | Page and tab | What happened (pause, question, wrong click, what helped) |
| ---- | ------------ | --------------------------------------------------------- |
|      |              |                                                           |
|      |              |                                                           |
|      |              |                                                           |
|      |              |                                                           |
|      |              |                                                           |
|      |              |                                                           |

Time to "emails sent": ________ minutes. Passed with no help: **Yes / No**

---

# The route sheets test

It checks one thing: **can a dispatcher who has never seen Loadout Builder bring in the day's
route sheet PDF, choose who gets the routes that need a choice, and send the route sheets, using
only what the app shows them?**

## Who does it

- **The tester:** a dispatcher or lead who has never used Loadout Builder or the old Route Sheet
  Distributor. Not Jonathan.
- **The watcher:** you. You watch and write. You do not help.

## Before the test (about 15 minutes, without the tester)

1. Install the app on the test computer from the latest release page. Open it once. If it offers
   to bring over old data, click **Not now**. Close it. Do not click around.
2. Put three practice files on the computer's desktop. They are made-up copies with no real
   drivers in them, from the `packages/fixtures` folder of the app's code (Jonathan has them):
   - the route sheet PDF `route-sheets/2026-09-01.pdf`
   - the Routes file `routes/Routes_XXX1_2026-09-01_12_20 (CDT).xlsx`
   - the driver list `associates/AssociateData.csv`
   Every email address in them is made up (at example.com), so no real person gets an email.
3. Make a practice Gmail address for the test, with 2-Step Verification turned on. Write its
   address and password on a card for the tester. Do **not** make the app password: the tester
   does that. (Leave this out if you only want to check the tester can reach the **Email**
   part of Settings and the **Email all** button. Demo mode never sends emails.)
4. Do **not** put any real route sheet, driver list or export on that computer, and do not turn
   on demo mode.

## What to tell the tester

Read this out, word for word:

> "This app sends each driver their route sheet by email. The three files for today are on the
> desktop. They are made up. Please bring them in, choose who gets the routes that need a choice,
> and email the route sheets to two drivers. Send them from the Gmail address on this card. I
> can't help you, but please say out loud what you are thinking. Stop whenever you want."

Then stay quiet. If they ask you something, say: "What would you try?"

## What to write down

Use the table at the bottom, one line for each thing that happens.

- **Where they paused** for more than a few seconds, and on which page or tab.
- **What they asked** out loud, word for word.
- **What they clicked wrong**: a button, page or tab that was not the next step.
- **What helped them**: the checklist on Home, the tour, a ? note, How to use, or a message.
- **Whether they found** the Associates and Route Data pages for the other two files, the **?**
  next to **Bring in the route sheet PDF**, the **Sheets** tab, **Email all**, and the email
  setup in Settings on their own.
- **Whether they understood** the green, amber and red counts, and what **Accept all
  suggestions** does, without being told.
- **The time** it took from opening the app to the "Sent" message.

## The pass rule

The test **passes** when the tester brings in the three files, chooses who gets every route that
needs a choice, sets up the email (including the Gmail app password) and the app says two route
sheets were sent, **with no one helping them**. Slow is fine. Wrong clicks are fine, if they find
their own way back. A "could not be delivered" email from Gmail afterwards is fine too: the
made-up addresses do not exist.

The test **fails** if you had to help, or if they gave up.

## After the test

- Thank them. Ask: "What was the hardest part?" and "What would you change?" Write the answers
  down word for word.
- Delete the app password from the practice Gmail account, and delete the practice account.
- Give your notes to Jonathan. Do not put names, email addresses, photos of the screen or the
  files in the notes. The notes may end up on the app's public help forum.
- If it failed, the place they got stuck is what gets fixed next. Then test again with someone
  new.

## Notes table

| Time | Page and tab | What happened (pause, question, wrong click, what helped) |
| ---- | ------------ | --------------------------------------------------------- |
|      |              |                                                           |
|      |              |                                                           |
|      |              |                                                           |
|      |              |                                                           |
|      |              |                                                           |
|      |              |                                                           |

Time to "Sent": ________ minutes. Passed with no help: **Yes / No**
