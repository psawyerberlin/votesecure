# VoteSecure Contributor Charter

**Draft v0.1 — for discussion, not yet adopted**
Merit-Voice (MV) governance and distribution rules

votesecure.net · [github.com/psawyerberlin/votesecure](https://github.com/psawyerberlin/votesecure) — MIT Licence
First Merit Round: 1 March 2027

---

## 0. Purpose and status of this document

VoteSecure is a volunteer project building cryptographically secure, privacy-preserving on-chain voting on the Nervos CKB blockchain. Its goal is fair and transparent voting on a public blockchain. It has no funding, no deadline, and several unsolved technical problems. It is expected to take between five and fifteen years.

This Charter defines how the project makes decisions and how any value it eventually receives is distributed among the people who built it. It is not a legal document and VoteSecure is not a legal entity. Nothing here creates an employment relationship, a partnership, a company, a security, or an enforceable claim on anyone. It is a public statement of the rules the contributors agree to follow, kept honest by the fact that everything it governs happens in the open.

Every rule in this Charter may be changed by a vote of the contributors under section 5. There are no entrenched clauses.

> *Status: draft. Adopted only when the founding cohort votes to adopt it at the first Merit Round.*

---

## 1. Definitions

| Term | Meaning |
|---|---|
| **Contributor** | A person holding one or more Merit-Voice units, or a member of the founding cohort. |
| **Merit-Voice (MV)** | The project's unit of recognised contribution. Determines voting power and share of any CKB received. Non-transferable and never purchasable. |
| **Merit Round** | The quarterly process in which contributors award MV to one another. |
| **Award** | The act of granting MV to another contributor during a Merit Round. Never called a vote. |
| **Vote** | A decision on a proposal under section 5. Distinct from an award. |
| **Budget** | The share of the quarterly 100 MV that a contributor is entitled to award. |
| **Steward** | The person who executes rounds and on-chain writes during Phase 0. Currently Patrick Sawyer. |
| **Supply** | The total MV issued since the founding round. |

---

## 2. Founding cohort

### 2.1 Selection criteria

Applications are open publicly. To be considered, an applicant provides:

- A public artifact of past work that a stranger can open — a repository, portfolio, publication, campaign, professional profile, or organisational record. Not a CV.
- A written statement of roughly 300 words on why fair on-chain voting matters to them and what they intend to work on in their first two quarters.
- A real name known to the cohort. Public pseudonymity is acceptable; anonymity within the cohort is not, because mutual identification is the project's only defence against one person holding several contributor accounts.
- Agreement to this Charter, to the MIT licence, and to the rule that MV can never be bought.

An applicant is excluded if they make payment, equity, or tokens a condition of joining, or if they have an undisclosed conflict of interest such as employment by a voting-system vendor or an active political campaign.

No entry task is required. There is no fixed cohort size.

### 2.2 Selection process

The Steward selects the founding cohort against the criteria above. AI tools may be used to summarise and shortlist applications; the decision is made by the Steward. Every application received and the reason for each selection is published.

### 2.3 Founding grant and start date

- The founding cohort shares 100 MV, divided equally. Five founders receive 20 MV each; twenty founders receive 5 MV each.
- The first Merit Round opens on 1 March 2027.
- If fewer than five qualified founders are selected by that date, the founding round is postponed by one quarter. Applications received are published regardless.

> *The founding grant is fixed at 100 MV rather than a per-person amount so that dilution behaves identically no matter how many founders there are, and so that nobody benefits from keeping the cohort small.*

---

## 3. Merit-Voice

### 3.1 Properties

- MV is awarded only for contribution. It cannot be bought, sold, transferred, or received in exchange for a donation, at any price. This rule is what keeps the project from being controlled with money and from becoming a financial instrument.
- MV never expires. Influence declines through dilution as new MV is issued, not through decay.
- MV is recorded against a contributor's CKB address and is publicly auditable on chain.
- MV is recorded to three decimal places (e.g. 100.000).
- There is no expulsion and no forfeiture. A contributor who stops contributing stops receiving MV, and their share declines as supply grows.
- A lost key means lost MV and lost distributions. This is accepted and will not be reversed.

### 3.2 The quarterly Merit Round

1. A budget of 100 MV is opened each quarter and allocated among contributors in proportion to their MV holdings. The 15% voting cap does not apply to the budget.
2. The round opens at the quarterly contributor call and closes fourteen days later.
3. Each contributor decides how to award their budget. They may award all of it, part of it, or none of it. There is no limit on how much may go to a single recipient.
4. No contributor may award MV to themselves.
5. Budget that is not awarded is not minted. A quiet quarter issues less MV. If the cohort judges that only 15 MV of work was done, only 15 MV comes into existence.
6. To be eligible to receive MV in a round, a contributor must submit an award decision for that round. An explicit decision to award nothing counts as participation; simply not turning up does not.
7. All awards are published in full after the round closes, including who awarded what to whom.

> *Worked example. Supply is 400 MV. Anna holds 100 MV, so her budget is 25 MV. She judges that Ben did nearly all the useful work this quarter and awards him 24 MV and Carla 1 MV. She may not award herself anything. If Anna does not submit any decision, her 25 MV is never minted and she is also ineligible to receive MV this round.*

### 3.3 Concentration

Concentration of MV is not limited. A contributor who does all the work in a quarter may receive the entire issued amount. The self-award prohibition means a large holder must award their budget to others each quarter, so a concentrated position declines unless peers actively choose to renew it.

Mutual awarding between two contributors to hold their positions without contributing is possible under these rules. The defence is publication: all awards and all votes are public, and the cohort meets quarterly. Abuse is expected to be visible long before it is decisive. If it is not, the cohort can adopt a rule under section 5.

---

## 4. Voting power

- Voting power is derived from MV holdings, capped at 15% for any single contributor.
- Power above the cap is redistributed pro rata among contributors below it, computed against total supply, not against those who voted.
- The cap applies to voting only. It does not apply to the award budget and it does not apply to distributions.
- The cap takes effect once there are seven or more contributors. Below that number a 15% cap cannot be satisfied and power is proportional to holdings.

> `#TO_BE_IMPROVED#` The threshold at which the cap activates is a placeholder. Any figure of seven or above is arithmetically workable.

---

## 5. Decisions

### 5.1 Proposals

Any contributor may put a proposal to a vote. Proposals cover features, priorities, spending rules, changes to this Charter, and anything else the cohort decides collectively.

### 5.2 Voting rules

| Rule | Value |
|---|---|
| **Quorum** | Contributors representing at least 30% of capped voting power must cast a vote (yes, no, or explicit abstain). |
| **Threshold** | More than 50% of yes and no votes combined. Abstentions count toward quorum but not toward the result. |
| **Ties** | A tie fails. An exact 50/50 split is a rejection. |
| **Quorum not met** | No decision. The status quo holds and the proposal may be reintroduced in a later round. |
| **Voting window** | Fourteen days, running alongside the Merit Round award window. |
| **Publication** | All votes are public, including who voted which way. |

> *Consequence worth stating openly: with a 30% quorum and a majority of yes and no votes, a proposal can in principle pass on slightly more than 15% of total voting power if the rest of the quorum abstains. Abstention is a deliberate choice and every vote is public, so this is a known and accepted property of the rules rather than an oversight.*

---

## 6. Distribution of CKB

- Donations and, in future, fees are received in CKB at a published address.
- Collected CKB is distributed to contributors in proportion to their raw MV holdings. The 15% voting cap does not apply to distributions.
- Each share is floored to whole shannons. Remaining dust is assigned to the lowest-indexed output.
- CKB assigned to an address whose key is lost is unrecoverable and effectively burned.
- The project handles no fiat currency. A donor who wishes to pay by card converts through a third-party service of their own choosing and sends CKB to the published address. The project takes no part in that conversion and holds no fiat at any time.
- Each contributor is solely responsible for their own tax position in their own jurisdiction. The project gives no tax advice.
- There is no reimbursement of expenses and no logging of hours. Contributors who spend money or time on the project are recognised through MV awarded by their peers, in the same way as any other contribution.

> `#TO_BE_IMPROVED#` Distribution requires a CKB lock script that reads the MV ledger and splits a cell deterministically. No donations or fees can be accepted until it exists and has been reviewed. Rounding, dust handling, and ledger authority must be fixed in that specification.

> *Because distribution follows lifetime MV holdings, contributors who work through the unfunded early years hold a durable and slowly diluting claim on later revenue. This is intentional: it is the compensation for working with no pay and no guarantee of success. It is stated here so that nobody joining later can say they were not told.*

---

## 7. Phases of governance

### 7.1 Phase 0 — Steward

- The Steward executes Merit Rounds, maintains the MV ledger, and performs on-chain writes.
- Every round result and every governance decision is put to a public Telegram poll before execution, so that any divergence between the published rules and what is executed is visible immediately.
- The Steward pays for votesecure.net hosting personally and is under no obligation to continue doing so indefinitely.
- The Steward holds no veto and no additional voting power beyond their own MV.

### 7.2 Later phases

Authority over the MV ledger moves to a multi-signature arrangement among contributors, and eventually to VoteSecure itself, once the application is capable of running the project's own governance. Each transition is a proposal under section 5.

> `#TO_BE_IMPROVED#` Whoever can write the MV ledger controls both governance and distributions. This is the project's central trust assumption and it is presently one person. Defining the multi-signature arrangement and its trigger condition is the highest-priority governance work after adoption.

---

## 8. Openness

- All code is published under the MIT licence at github.com/psawyerberlin/votesecure. Anyone may fork the project and continue it independently.
- The MV ledger, all awards, all votes, and all distributions are public.
- Applications to the founding cohort and the reasons for selection are published.
- The project claims no exclusive right to its ideas or its code. If it fails, the work remains available to whoever wants to continue it.

---

## 9. Open items

Items marked `#TO_BE_IMPROVED#` in this Charter, collected here:

1. The contributor count at which the 15% voting cap activates.
2. The CKB lock script specification for MV-proportional distribution, including rounding and ledger authority. Blocks all donations and fees.
3. The multi-signature arrangement for MV ledger authority, and the condition that triggers the move away from a single Steward.
4. Whether individual awards should be secret during a round and published after it closes, to reduce the incentive to rate peers politely.
5. Whether reciprocity between pairs of contributors should be published as a statistic alongside each round's results.

---

## 10. Adoption and amendment

This Charter takes effect when the founding cohort adopts it by vote at the first Merit Round. Any provision may be amended by a proposal passing under section 5. Amendments are published with the date and the vote result, and previous versions remain publicly available.

---

*Draft v0.1 — prepared for discussion. Not adopted.*
