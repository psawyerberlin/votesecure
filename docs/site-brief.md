# votesecure.net — Site Brief

**Version:** 0.3 (draft, for Claude Code)
**Status:** v0.1 was implemented on branch `claude/recruitment-site`, not yet
merged to `main`. v0.2 corrected copy that contradicted the architecture, the
Charter and the actual prototype. v0.3 aligns the open-problems copy (§4.4) with
Architecture v2.3: homomorphic tallying with trustees replaces drand. Apply both
to that branch.
**Owner:** Patrick Sawyer (Steward, Phase 0)
**Repo:** https://github.com/psawyerberlin/votesecure
**Companion document:** `CHARTER.md` (VoteSecure Contributor Charter v0.1)

---

## 1. What this site is for

Today votesecure.net hosts a partly working voting dApp. That is not what the site
is for any more.

**The site's one job: recruit 5–20 serious volunteers who want to build fair,
verifiable, decentralised voting, and who are willing to work for years without pay.**

The existing dApp becomes supporting evidence — proof that real code exists — reachable
from the front page but no longer the front page itself.

### Audience, in priority order

1. Cryptographers and protocol designers (anonymous credentials, verifiable tallying, MPC)
2. CKB / Bitcoin-layer engineers (Script, Fiber, RGB++, cell model)
3. Frontend, security and SRE engineers
4. Election lawyers, election administrators, civic-tech practitioners
5. Communications, community and documentation people, especially non-English speakers

CKB has strong communities in Asia, North America and Europe. Assume an international
audience reading English as a second language. Short sentences. No idioms.

### Success is not traffic

Success is a small number of high-quality applications. Every design and copy decision
should filter *harder*, not wider. A page that attracts a thousand people looking for a
token launch is a failure. A page that attracts twelve cryptographers is a success.

---

## 2. The positioning

Do not hide the weaknesses. They are the recruiting asset.

- No funding, no investors, no token, no ICO, no airdrop.
- No deadline. Expected horizon: 5–15 years.
- Several central technical problems are **unsolved**.
- The Steward is a project manager, not a cryptographer, and says so.

Serious people are repelled by finished-looking products with nothing left to do, and
attracted by hard open problems and honest framing. State the position plainly in the
first screen.

**The thesis, in one paragraph (use this, tightened, anywhere it fits):**

> Within ten years public blockchains will be the most trusted settlement layer in
> finance. People will then ask why their elections are less verifiable than their
> money. Building that takes a decade, so it has to start now, in the open, with no
> owner.

---

## 3. Sitemap

```
/                    The prototype (index.html), with a notice linking to /about.html in a new tab
/about.html          The recruitment page — the main work
/charter.html        The Contributor Charter, rendered from CHARTER.md
/web/*               The prototype's organiser, voter and election pages
/impressum           Legal notice (required, see §8)
/datenschutz         Privacy notice (required, see §8)
```

Everything is static. Keep it that way.

*Changed 8 Nov 2026:* the prototype is now the front page, for a better first
impression; it explains the v2.3 concept, states plainly what the prototype does
and does not do yet, and every page carries a notice linking to `/about.html`.

---

## 4. Front page — structure and copy

Copy below is the real content. Edit for tone, do not replace with placeholders. Section
titles are for this brief; the page does not have to display all of them as headings.

### 4.1 Hero

The hero should not be a slogan over a gradient. The most characteristic thing in this
project's world is **the list of things nobody has solved yet**. Consider opening with
that, or with a single verification-shaped idea, rather than a marketing headline.

Headline:

> Fair and verifiable voting on a public blockchain.

Sub-headline:

> No funding. No deadline. Several unsolved problems. We think it takes ten years, and
> we are looking for the people who want to spend them on this.

Two actions:

- Primary: **Apply to contribute** → jumps to §4.6
- Secondary: **Read the open problems** → jumps to §4.4

Somewhere in or immediately under the hero, in small but unmissable type:

> No token. No investment. No pre-sale. Contribution is the only way in.

### 4.2 Why this matters

> Money on a public chain can be verified by anyone, at any time, without trusting the
> institution that holds it. Elections cannot. Voters are asked to trust a supplier, an
> administrator and a machine they will never inspect.
>
> Verifiable voting is a harder problem than verifiable money, because a ballot has to be
> provably counted and permanently unlinkable from the person who cast it. Those two
> requirements pull against each other. That is why this is not already solved, and why
> it is worth a decade.

### 4.3 Why Nervos CKB

> CKB's cell model lets us put arbitrary verification logic on chain instead of fitting
> voting into a token standard. Lock scripts are programmable, state is explicit, and the
> chain is proof-of-work anchored. Fiber can cut the per-ballot cost. RGB++ can anchor
> results to Bitcoin, the chain with the widest trust.
>
> We are not tied to CKB by ideology. It is currently the best fit for what an election
> needs.

### 4.4 The open problems (the Research Agenda)

Headline: **What we have not solved**

Introduce with one line: *This is the honest state of the project. If one of these is
your field, we would like to hear from you.*

Four workstreams. Each shows the problem, not a solution. They group the
numbered open problems in §11 of `docs/architecture.md` (v2.3) for a
general reader: workstream 1 covers items 11 and 8; workstream 2 covers 3 and
12; workstream 3 covers 5, 14 and 15; workstream 4 covers 9 and 10 plus the
Fiber and RGB++ directions in the White Paper's Future Work. Items 2, 4, 7 and
13 are resolved by the v2.3 design and do not appear. The architecture list
stays the authority; if it changes, update this section.

**1 · Eligibility without identity**
> Only eligible people may vote, exactly once. No voter's identity or wallet may ever
> appear on chain. Nobody, including the organiser and including us, may be able to link
> a ballot to a person. The current design checks eligibility on chain and never
> decrypts a single ballot, but whoever issues the voter keys can still tell who voted.
> Anonymous credentials, blind signatures and nullifiers are the obvious directions.
> None of them is chosen yet.

**2 · Anonymity against a timestamped ledger**
> A blockchain records when everything happened. Submission timing, transaction graphs
> and fee sources all leak. Batching and shuffling help. They are not a proof. We need an
> anonymity model we can state precisely and defend. And a chain cannot tell that a
> deadline has passed, so even closing the vote is a design problem.

**3 · Removing the trusted parts**
> Ballots are counted while still encrypted, and only the totals are ever decrypted.
> That decryption needs several trustees together, each holding one share of the key.
> But trustees who collude could read ballots, and trustees who disappear leave an
> election without a result. A single relay can still delay ballots. Who the trustees
> are, how we show they are independent, and whether the proof checks fit on chain at
> all: open.

**4 · Cost, wallets and anchoring**
> A voter should not need a wallet, a token balance, or any prior blockchain knowledge,
> and should never pay a fee. Passkey-derived keys with organiser-paid fees are the
> current direction. Fiber for cost. RGB++ for a Bitcoin anchor. All unproven at
> election scale.

Close the section with a link: *Full technical detail lives in the repository →*
(links to `docs/architecture.md` on GitHub.)

### 4.5 How the project is governed

Headline: **Nobody owns this**

> Contribution is the only currency. Every quarter, contributors award each other
> **Merit-Voice (MV)** — a non-transferable unit that can never be bought, at any price.
> MV decides voting power, capped at 15% for any one person once there are seven or more
> contributors, and decides how any donations the project ever receives are split.
>
> The Steward runs the first rounds and says so publicly. Every round result and every
> decision is put to a public poll before it is carried out. The intention is to hand governance to VoteSecure itself
> once it can run its own elections.

Small print under it:

> Everything is public: the code (MIT), the ledger, every award, every vote, and every
> application to join.

Link: **Read the Contributor Charter →** `/charter`

### 4.6 Apply

Headline: **Apply to the founding cohort**

> The first Merit Round opens **1 March 2027**. Applications before then are considered
> for the founding cohort, which shares the first 100 MV equally.

What we ask for — display as a short list, three items only:

1. A link to something you have made. A repository, a paper, a portfolio, a campaign, a
   professional profile. Not a CV.
2. About 300 words: why fair on-chain voting matters to you, and what you would work on
   in your first two quarters.
3. Your real name, known to the other contributors. You can stay pseudonymous in public.

Then, plainly:

> Applications are public. The Steward selects the founding cohort against the criteria
> in the Charter, and publishes every application and the reason for every decision. AI
> may be used to summarise and shortlist applications. The Steward makes every decision.
>
> If fewer than five people qualify by 1 March 2027, the first round moves one quarter and
> we say so.

Primary action: **Apply on GitHub** (see §5)
Secondary, smaller: an email address, for people who will not use GitHub.

Add one line, because it prevents the most common wrong assumption:

> We cannot pay anyone. If the project ever receives donations, they are split by MV. That
> may be nothing, for years, or forever.

### 4.7 The prototype

Headline: **There is already code**

> A prototype dApp runs on CKB testnet: ballot encryption in the browser, on-chain event
> publishing and ballot submission, and results the organiser decrypts. It follows the
> earlier v1 design, not the current architecture, and its on-chain script does not yet
> check anything. It is not secure enough for a real election. It exists so you can see
> that this is engineering, not a whitepaper.

Actions: **Open the prototype →** `/demo` · **Read the code →** GitHub

Keep this section visually quieter than the rest. It is evidence, not the offer.

### 4.8 Footer

Repo · Charter · Telegram · Impressum · Datenschutz · MIT Licence

Repeat once, quietly: *No token. No investment round. Ever.*

---

## 5. Application flow

**Do not build a backend, a database, or a form that stores personal data.** It creates
GDPR obligations, hosting cost and a security surface, for no benefit.

**Primary route: a GitHub Issue template.**

Add `.github/ISSUE_TEMPLATE/founding-application.yml` with fields matching §4.6, and link
the front page directly to the pre-filled new-issue URL. This gives, for free:

- public applications, which the Charter already promises
- no personal data stored by the project
- a natural filter (applicants can use GitHub)
- a thread per application for questions

**Secondary route:** a plain `mailto:` link for non-GitHub applicants, with the same three
questions listed in the page so they can be copied.

If a hosted form is ever added instead, it must not store data on votesecure.net and the
privacy notice must name the processor.

---

## 6. Design direction

Ground the design in the vernacular of **elections and verification**: ballot papers,
tally marks, seals, official notices, counting. Not in the vernacular of crypto
(gradients, glowing nodes, 3D chains, dark neon dashboards). Crypto styling actively
attracts the wrong audience for this page.

Starting palette, to be argued with rather than obeyed:

| Role | Suggestion |
|---|---|
| Paper | `#FFFFFF` with one tinted band, not an all-over cream |
| Ink | `#16202A` — body text, most structure |
| Seal | `#A3261C` — the single loud accent, used sparingly for unsolved/open items |
| Verified | `#2C7A5A` — used only where something really is verified or done |
| Pencil | `#6B7280` — secondary text, rules |

Type: one family carrying the whole page is fine. Prefer something with a civic,
institutional character over a startup grotesque. Monospace is allowed **only** for real
data — MV figures, hashes, addresses — never for decorative labels.

Rules of thumb specific to this brief:

- Red marks what is unsolved. Green marks what is done. If the colour is not carrying that
  meaning, do not use the colour.
- The four open problems are not a sequence, so do not number them 01/02/03/04 in a
  stepped layout. They are parallel workstreams.
- One memorable element, everything else quiet. The open-problems section is the strongest
  candidate.
- Motion: at most one deliberate moment. No fade-and-slide on every section.
- Responsive to 360px, visible keyboard focus, `prefers-reduced-motion` respected, AA
  contrast throughout. This is an election-integrity project; an inaccessible site
  contradicts the pitch.

Avoid: cream background with serif display and terracotta accent; near-black with an acid
accent; identical rounded cards with soft shadows; all-caps tracked-out eyebrow labels;
arrows appended to every link; middle-dot meta strings.

---

## 7. Technical constraints

- Inspect the existing repo first and follow its stack. Do not introduce a new framework.
- Static, no build-time secrets, no server. Must survive being hosted anywhere.
- **No analytics, no cookies, no third-party fonts loaded from a CDN.** Self-host fonts.
  This keeps the privacy notice short and honest.
- The existing dApp keeps working, moved to `/demo`, with a visible banner that it is an
  incomplete prototype and not for real elections.
- `/charter` renders from `CHARTER.md` in the repo so there is one source of truth.
- Page weight target: under 300 KB on first load, excluding `/demo`.
- English only in v1. Structure the copy so translation is possible later, but do not build
  an i18n system yet.

---

## 8. Legal (Germany)

The site is operated from Germany, so two pages are legally required and are not optional:

- **`/impressum`** — operator name, postal address, contact. Required by §5 DDG for
  German-operated sites.
- **`/datenschutz`** — privacy notice. Short, if the site stores nothing: state that no
  cookies or analytics are used, that fonts are self-hosted, name the hosting provider and
  its log retention, and state that applications are made publicly on GitHub and are
  therefore processed by GitHub under its own terms.

Leave the address fields as clearly marked placeholders for the owner to complete.

*This reflects the general requirement and is not legal advice; confirm the wording before
the site goes live.*

---

## 9. Out of scope for this pass

- Any change to the voting protocol or contracts
- Payment, donation address or fee handling — the distribution lock script does not exist
  yet, so the site must not solicit donations
- Multi-language support
- A blog, a newsletter, or social embeds
- Anything implying a token, a sale, or an investment opportunity

---

## 10. Acceptance checklist

- [ ] Front page states, above the fold: unfunded, undated, unsolved, no token
- [ ] The four open problems are legible to a cryptographer and to a lawyer
- [ ] Applying takes under five minutes and requires no account on votesecure.net
- [ ] The Charter is one click away and renders from `CHARTER.md`
- [ ] The prototype is reachable, labelled as incomplete, and not the main event
- [ ] Impressum and Datenschutz exist, with placeholders marked
- [ ] Nothing on the site collects or stores personal data
- [ ] 360px width works; keyboard focus visible; reduced motion respected; AA contrast
- [ ] No gradient meshes, no glowing chains, no token-sale visual language
