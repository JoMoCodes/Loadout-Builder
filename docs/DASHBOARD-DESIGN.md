# The Dashboard: design note

Written before building it, as the plan asks (section 7). It is kept here and in the pull request.

## Who it is for

The dispatcher on Monday morning, once the new exports are in, and the manager asking "how are we
doing, and who needs a word?". Both answers must fit on one screen and take under a minute.

## What is on it, top to bottom

1. **The week bar.** The weeks in use, with quick picks: Last week, Last 4, Last 8, Last 13 and
   All. Until someone picks, it shows every week, the same as the Performance page, and "All" is
   lit. The same choice is kept for next time, and both pages share it.
2. **Four tiles, one row.** Fleet average score (with the change from the week before, and a tiny
   line of the last weeks); Tiers (Platinum, Gold, Silver, Bronze counts as one coloured bar, with
   how many moved in and out of each); Packages delivered (and the change); Drivers with safety
   events that count against the program. Each tile has a small "How is this worked out?" button
   that says it in words, for example "The average of every driver's Overall Score in 2026-W40."
3. **Who needs a word.** The biggest part of the page. One line per flagged driver: name, tier
   chip, score, the reasons in plain words ("Dropped from Platinum to Gold", "Score fell 3 weeks
   running"), and the one metric costing them the most points. High first, then Watch. Next to
   it, a short **ID expiry** list: expired, then expiring within the window. Clicking a driver
   offers "Open on the Performance page", "Preview report" and "Explain this score".
4. **Movers.** Most improved and most declined (how many comes from Settings), each with before,
   after and the change as a green or red chip.
5. **Trend.** The fleet average score week by week as a simple line, and the failure reasons
   (POD, CDF, DSB, PSB) as bars, each marked "growing" or "shrinking" by comparing the first half
   of the weeks with the second half.

## Why it looks like this

- Tiles with small trend lines over a list, as in StackAI and Klaviyo's reporting pages: the
  numbers first, the detail one glance lower.
- The "Who needs a word" list borrows Charma's one-row-per-person scorecard and Fresha's change
  chips, because the question a manager asks is about people, not charts.
- Period quick picks over everything, as in Devin's leaderboard, because the week range changes
  every number on the page.
- No radar chart: twelve metrics on a radar look good but are hard to act on. The "metric costing
  the most points" says the same thing in one line.
- Charts are drawn by the app itself, so they follow light, dark and high contrast and the text
  size buttons. Every number can be explained; nothing is on the page that cannot be acted on.
- With no data yet, the page says so in one line and offers the button that fixes it (the Imports
  tab), instead of empty charts.

## Making it your own

Added later. The page above is now "the usual layout": what everyone starts with, and what
**Reset to the usual layout** goes back to. From there the page is the person's to arrange.

- **Sections.** Every part of the page is a section: each tile, who needs a word, ID expiry, most
  improved, most declined, the trend, the failure reasons, the watch list, and tiles the person
  builds. A layout is an ordered list of sections on twelve columns.
- **Customize.** One button turns the page into its arranging mode. Each section gets a strip
  with a handle to drag it, arrow buttons to move it without a mouse, a width (Small, Medium,
  Half, Wide, Full), a height (Fit, Short, Medium, Tall), its own choices, and Hide. The right
  edge can be dragged to change the width. Changes are saved as they are made. The sections are
  switched off while arranging, so a drag never opens a driver's menu.
- **A narrow window.** Widths are for a wide page. On a narrower one a section takes half or all
  of the page; on a narrow one every section is as wide as the page. Nothing scrolls sideways.
- **Each section's own choices.** Who needs a word: which reasons count, only High, how many
  lines. ID expiry: only expired, how many lines. Failure reasons: which kinds. A tile with one
  big number: a target, which gives the tile a red edge and says so when it is missed.
- **Layouts.** Several named layouts are kept, with ready-made ones to start from. A layout can
  keep its own weeks (a quick pick moves along as new weeks come in), so "Monday morning" can
  open on last week while the Scorecards page stays on every week. A layout can be saved to a
  file and brought in on another computer. The file names no driver.
- **Watch list.** Drivers the person pins from any driver's menu, or picks from everyone on file.
  One list, shared by every layout, kept beside the layouts and never in a layout file.
- **Your own tile.** A scorecard number (the Overall Score, packages, one of the twelve metric
  scores, or a kind of failure), then the average, the total, or how many drivers are below or
  above a number. Shown as a big number with a small line, or as a chart by week. Its "How is
  this worked out?" is written from the choices.

Why it stays simple to read: the usual layout is unchanged, Reset is always one click away, and
every number, built-in or built by the person, still has its explanation.
