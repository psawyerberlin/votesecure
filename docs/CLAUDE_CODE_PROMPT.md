# Prompt for Claude Code

Copy `SITE_BRIEF.md` and `CHARTER.md` into the repo root first (or into `docs/`, and adjust
the paths below). Then run Claude Code from the repo root and paste everything between the
lines.

---

You are working in the VoteSecure repository. The site at votesecure.net currently hosts a
partly working voting dApp. We are turning it into a recruitment site for volunteer
contributors, and demoting the dApp to a labelled prototype.

Read `SITE_BRIEF.md` in the repo root before doing anything else. It contains the full
copy, structure, design direction and constraints. Also read `CHARTER.md`, which the site
links to and renders. The brief's decisions win over your own defaults; where the brief is
silent, use your judgement and tell me what you chose.

Work in four phases and stop for my approval at the end of each of the first two.

**Phase 1 — Understand what exists.**
Inspect the repo: framework, build tooling, router, deploy target, where the dApp entry
point is, what is currently served at `/`, and how styling is done today. Then report back
in under 400 words: the current stack, what has to move for the dApp to live at `/demo`,
anything in the brief that conflicts with the existing setup, and the smallest change that
achieves the brief. Do not write code in this phase. Ask me about anything genuinely
ambiguous rather than guessing — but only about things you cannot determine from the repo
or the brief.

**Phase 2 — Design plan.**
Propose, in one page: a palette of 4–6 named hex values, typefaces and their roles, a
layout concept with a rough ASCII wireframe of the front page, and three principles
specific to this project. Then critique your own plan: for each choice, say whether you
would have produced it for any other recruitment landing page, and if so, replace it and
say what you changed. Ground the design in the vernacular of elections and verification —
ballots, tally marks, seals, official notices — not in crypto visual language. Wait for my
approval before building.

**Phase 3 — Build.**
Implement the front page, `/charter` (rendered from `CHARTER.md`, single source of truth),
`/impressum` and `/datenschutz` with clearly marked placeholders for my address, and move
the existing dApp to `/demo` with a banner stating it is an incomplete prototype and not
for real elections. Add
`.github/ISSUE_TEMPLATE/founding-application.yml` and link the front page to the
pre-filled new-issue URL.

Hard constraints:
- Keep the existing stack. Do not introduce a new framework or CSS library.
- Static output. No backend, no database, no form that stores personal data.
- No analytics, no cookies, no third-party font CDN. Self-host any fonts.
- The dApp must still work after the move. Verify it, do not assume it.
- Do not solicit donations anywhere. The distribution lock script does not exist yet.
- Nothing on the site may imply a token, a sale, or an investment.

**Phase 4 — Verify.**
Run the dev server, screenshot the front page at 1440px and 390px, and look at the
screenshots. Check every box in the brief's acceptance checklist and report the result
honestly, including anything you could not satisfy. Check keyboard focus is visible and
contrast is at least AA. Then give me a short list of what you would improve with more
time.

Commit in small, reviewable commits with clear messages. Do not force-push, do not rewrite
history, and do not touch anything under the contracts or protocol directories.

---

## Follow-up prompts, once the site is up

**Content review, run separately for a sharper read:**

> Read `SITE_BRIEF.md` and the front page you built. You are now a cryptographer with ten
> years in verifiable elections, reading this page for the first time. Would you apply?
> Give me the three sentences that would most likely make you close the tab, and rewrite
> them. Then do the same as an election lawyer with no blockchain background.

**Before launch:**

> Audit the site for anything that could read as a securities offering, an investment
> solicitation, or a promise of financial return. Quote each line you find and propose a
> replacement. Then check no page collects personal data, and confirm the privacy notice
> matches what the site actually does.
