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
