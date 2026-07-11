---
description: Independently re-check a batch of rules-question verdicts (e.g. from the "evaluate old questions against the current rulebook" Claude Project) against the actual rulebook text, blind to the original verdict, then report disagreements.
argument-hint: <path-to-rulebook-file> <path-to-project1-csv>
---

You are running a second-opinion QA pass on rules-question evaluations. Someone (a separate Claude Project) already judged a batch of old test questions against the current rulebook and produced verdicts. Your job is to independently re-derive each verdict from the rulebook text alone, **without ever reading the original verdict until your own judgment is locked in**, then report where the two disagree. This only has value if you stay blind — if you read the original verdict first, you will anchor on it instead of genuinely re-deriving the answer, and this whole exercise becomes theater.

Arguments: `$ARGUMENTS` — first token is the path to the current rulebook file (PDF or text), second token is the path to Project #1's CSV export.

## Expected CSV shape

Project #1's CSV should have (at minimum) these columns — if the actual file uses different header names, map them by content, not by exact name match:
- a question identifier
- the question text
- the answer/ruling being evaluated
- Project #1's verdict (e.g. "still correct" / "outdated" / "needs revision")
- Project #1's cited rule reference and/or reasoning

## Process — follow this order exactly

1. **Read the CSV, but extract only the question identifier, question text, and answer/ruling being evaluated into a working list.** Do not read or note Project #1's verdict or reasoning columns yet — literally don't let that text enter your working context for step 2.

2. **Read the rulebook file.** If it's long, don't try to hold the whole thing in context per question — for each question, locate the specific section(s) that govern it (search by rule number if the question cites one, otherwise search by subject matter/keywords) and ground your judgment in that specific text, quoting or citing the exact rule number.

3. **For each question independently**, determine:
   - Is the evaluated answer still correct under the current rulebook text you just read?
   - If not, what's the correct current answer, and what changed (rule renumbered, rule text changed, rule removed, etc.)?
   - Your confidence: HIGH (directly found and read the governing rule text) or LOW (couldn't locate a clearly governing section — flag for human review rather than guessing).

   Do this for the *entire batch* before moving to step 4. If the batch is large, consider using the Agent tool to spawn one or more subagents to do this evaluation — subagents are naturally blind to your conversation history, which enforces the independence requirement structurally rather than relying on your own discipline not to peek ahead in the CSV.

4. **Only now**, read Project #1's verdict and reasoning columns from the CSV, and compare against your independent verdicts.

5. **Produce a report** (write it to a file, e.g. `/tmp/rules-verify-report.csv` or `.md`, and send it to the user) with one row per question:
   - question identifier + text (short)
   - Project #1's verdict + citation
   - Your independent verdict + citation
   - Agreement status: `AGREE`, `DISAGREE`, or `NEEDS HUMAN REVIEW` (your confidence was LOW)
   - Sort disagreements and needs-review rows first — those are what the user actually needs to look at.

6. **Summarize in chat**: total checked, how many agreed, how many disagreed (and briefly why, for each), how many need human review. Don't just say "report attached" — give the headline numbers directly.

Be honest in the confidence rating. A LOW-confidence guess dressed up as a verdict is worse than no verdict at all — it just adds a second wrong answer for the human to have to untangle instead of one.
