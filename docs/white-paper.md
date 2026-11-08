# VoteSecure White Paper

*Transparent, tamper-evident, privacy-preserving elections on Nervos CKB*

**Version:** Draft v0.98
**Date:** 8 November 2026
**Author:** Patrick Sawyer (psawyer@gmx.de)
**License:** MIT
**Repository:** github.com/psawyerberlin/votesecure
**Live Site:** https://votesecure.net
**Companion document:** VoteSecure Architecture — v2.3 (authoritative for all
technical detail and for the full list of open problems). Governance is defined
in `CHARTER.md`; this paper only summarises it.
**Intended Audience:** Anyone running, auditing, contributing to, or participating in secure and verifiable elections or polls.

**Changes in v0.95:** CKB-correct terminology; frozen (non-upgradeable) on-chain
script; Ballot Relay; Ballot Box cell (merges Voter and Result cells);
pseudonymous ballots via WebAuthn PRF; deterministic public tallying; drand
timelock of the event tally key; revised threat model.

**Changes in v0.96:** aligned with Architecture v2.1 — corrected ballot entry
size (~220 B, not 150 B) and every capacity figure that depends on it; surfaced
the one-time burned Code Cell deployment cost; script role description corrected
(the script is the lock on Ballot Box cells as well as EventFund); release
finalization reclassified from refinement to blocker; open problems consolidated
into one section; governance aligned with the Contributor Charter; contact
address corrected.

**Changes in v0.97:** the Technical Architecture section is now a summary that
defers to Architecture v2.2 instead of restating it; the Open Problems section
lists titles and points to the canonical list; three new open problems
(organizer linkability with per-voter keys, the unenforceable voting deadline,
real-time option totals without a mechanism); live-statistics claim corrected;
15% voting cap described with its activation threshold; Fiber and RGB++ added
to Future Work, matching the public site.

**Changes in v0.98:** aligned with Architecture v2.3 — **homomorphic tallying**
replaces the drand timelock. No individual ballot is ever decrypted, by anyone.
Ballots are added up while still encrypted, and only the sums are decrypted, by
a group of trustees who each hold one share of the key. The script checks that
every ballot is well formed and that the published tally is correct. New role:
Trustee. Real-time option totals are dropped. Release finalization is resolved
by design. Costs and open problems updated.

---

# Executive Summary

VoteSecure is a decentralized application (dApp) for running transparent,
tamper-evident, and privacy-preserving elections and polls. It leverages the
Nervos CKB (Common Knowledge Base) blockchain for public verifiability while
keeping voter choices confidential and voter wallets unlinkable to ballots. The
application is open-source and designed so results can be independently
verified by anyone, without trusting a central authority.

**What is new in this revision.** No individual ballot is ever decrypted — not
during voting, not after release, not by the organizer. Ballots are encrypted so
that they can be **added up while still encrypted** (homomorphic tallying). Only
the sums are decrypted, and only by a group of **trustees** who each hold one
share of the election key: any *t* of *n* trustees together can decrypt a sum,
and nobody ever holds the whole key. The on-chain script checks that every
ballot is a valid vote, computes the encrypted sums itself, and accepts only the
tally that the trustees' decryption proofs allow.

The rest of the design is unchanged. The on-chain contract (the VoteSecure
Script) is deployed once and cryptographically frozen. Voters never broadcast
blockchain transactions and never appear on-chain: ballots are pseudonymous,
submitted through an open-source Ballot Relay that sponsors fees, batches writes,
and shields submission timing. All ballots for an event live in a single Ballot
Box cell (shardable), which also carries the final tally.

**What is not finished.** Nothing in this paper is implemented yet: the
prototype in the repository follows an earlier design, and its on-chain script
accepts every transaction. Three decisions block the first implementation — the
ciphersuite freeze, the relay deadline-flush policy, and exactly how a Ballot
Box closes at the deadline. One measurement is a go/no-go: whether the proof
checks fit into a CKB transaction. Who the trustees are must be decided before
the first live election. Several research problems remain genuinely open. They
are listed in *Open Problems* rather than buried, because they are the most
useful thing this document can tell a prospective contributor.

## Key properties

- **Ballot secrecy by construction:** individual ballots are never decrypted; only sums of at least *k* ballots are.
- **Integrity & verifiability:** every ballot, every validity proof and the tally are on-chain; the script itself rejects invalid ballots and wrong tallies, and anyone can re-check everything.
- **Voter privacy:** ballots are pseudonymous; the voter's wallet never appears on-chain, and submission timing is hidden by relay batching.
- **Configurable access & anonymity:** public, invite-key, or per-voter cryptographic keys; totals-only or per-group results with k-anonymity merging.
- **Zero-cost voting:** organizers fund all fees and storage through the EventFund; a voter needs only a fresh, empty JoyID wallet.
- **Frozen contract:** the on-chain script is immutable by construction (`hash_type data2`, no Type ID); trust is anchored in code, not governance.

**Terminology:** we use **Organizer** for the party setting up an election,
**Voter** for participants using a JoyID wallet, **Relay** for the open-source
Ballot Relay service, and **Trustee** for a holder of one share of the election
key. "Event" refers to a poll or election instance. CKB terms (cell, lock
script, type script, code hash, capacity, witness, cell dep, `since`) are
defined in the Glossary and used in their precise CKB meaning throughout.

---

# Problem & Goals

Traditional online polling lacks credible auditability and often compromises
privacy. Blockchains offer immutability, but naïve designs leak voter identities
through wallet addresses and transaction timing, or enable coercion. VoteSecure
aims to:

- Provide end-to-end verifiability without exposing who voted for what — including protection against wallet-to-ballot linkage on the public ledger, and without ever decrypting an individual ballot.
- Keep the user flow simple for voters (web + JoyID, empty wallet, no fees) while allowing flexible organizer configuration.
- Prevent tampering, double counting, fund draining, and post-hoc manipulation with on-chain validation by a frozen script.

## Non-goals

- Identity verification beyond possession of wallet or invite credentials (optional integrations can strengthen this; see Future Work).
- Censorship resistance against powerful network-level adversaries (e.g., adversaries observing IP traffic to the Relay). Out of scope for v1.

---

# System Overview

VoteSecure consists of a web front end, an event configuration and publishing
workflow for organizers, an open-source Ballot Relay, a small group of trustees,
and a small set of on-chain CKB cells validated by one immutable script. JoyID
provides key material for voters and organizers — for voters, purely
client-side: the wallet is used to deterministically derive per-event keys and
never signs a blockchain transaction.

## Components

- **VoteSecure Script (Code Cell):** one compiled RISC-V binary, deployed once in a code cell and referenced by all VoteSecure cells via cell dep. It acts as the lock script on the EventFund and Ballot Box cells (governing who may spend them, and for what) and as the type script on the Metadata and Ballot Box cells (governing valid state transitions). It is deployed with `hash_type data2` and an unspendable lock: no Type ID, no upgrade path, cryptographically frozen.
- **EventFund cell (per event):** escrow of organizer capacity that sponsors all ballot storage and fees. Spendable only via (A) relay-co-signed ballot batches with strict capacity conservation, or (B) organizer reclaim after the audit window.
- **Metadata cell (per event):** immutable during the event; stores schedule, questions, eligibility parameters (including the Merkle root of per-voter key hashes), reporting and k-anonymity policy, the relay public key, the election public key with the trustees' verification keys, and the front-end code hash. Its stable out point serves as a constant cell dep, so every rule a validation needs is inside the transaction.
- **Ballot Box cell (per event, shardable):** holds all ballot entries, then the encrypted sums, then the tally. Merges the former Voter Cells and Result Cell. Each entry contains a pseudonym public key, revote sequence, group tag, one encrypted 0/1 value per answer option, a personal ciphertext for the voter, and the pseudonym's signature.
- **Ballot Relay:** open-source service, run by the organizer or by a third-party host, that receives ballots, applies off-chain eligibility checks, checks ballot validity proofs, co-signs EventFund spends, batches and shuffles submissions, and issues receipts. Trusted for liveness only: it can delay or refuse to post a ballot (detectable and provable), but can never forge, alter, read, or link one.
- **Trustees (t-of-n):** a small group that creates the election key together before the event (distributed key generation) so that nobody ever holds the whole key. After the release time, each trustee publishes a partial decryption of the sums, with a proof that it is correct. Any *t* of them are enough.

---

# Roles

### Organizer

Creates and funds an event, defines questions and answer options, sets
eligibility rules and the reporting/anonymity policy, chooses the trustees,
publishes the event on-chain, distributes invites, and reclaims unspent capacity
after the audit window.

### Voter

Opens the event link, authenticates with JoyID (used client-side only), casts an
encrypted pseudonymous ballot at zero cost, optionally revotes within
organizer-defined limits, and later audits inclusion and re-checks the tally.

### Relay operator

Runs the Ballot Relay. Applies the configured abuse controls (rate limits,
CAPTCHA, invite pre-checks), checks ballot validity, batches ballots to the
chain on a shuffled schedule, and honors the deadline flush. All relay behavior
that matters for integrity is verifiable on-chain.

### Trustee

Takes part in key generation before the event, keeps one key share safe during
it, publishes a partial decryption of the final sums after the release time, and
destroys the share afterwards. A trustee cannot alter the result: a wrong
partial decryption fails the script's check. Any *t* trustees together could
decrypt individual ballots, so trustees should be independent of each other and
of the organizer.

---

# Organizer Workflow

**Create & publish event.** Connect JoyID as the sponsoring wallet. Define title
and description (Markdown; limited, sanitized HTML — scripts and event handlers
stripped). Configure questions (single- or multi-select), answer options, and
allowed updates per voter. Set the schedule: voting start, voting end, results
release time, and audit end time. Set eligibility: public, invite-key, or
per-voter keys (emails are used only for distribution and never stored on-chain;
per-voter keys are committed on-chain only as a Merkle root of their hashes).
Choose reporting granularity (totals only, or by group) and grouping fields
(e.g., ZIP, city, cohort) with a minimum group size k for k-anonymity. Choose
the trustees and the threshold *t*; the trustees run key generation. Review the
cost estimate (capacity scales with expected voters and the number of answer
options — about 370 CKB per ballot for three options, almost all refundable).
Publish: the app creates the Metadata cell (with the election public key),
EventFund cell, and empty Ballot Box shard(s) in one transaction. Receive the
event URL/QR and invite material.

**Distribute invites.** Send URL/QR plus invite-key or per-voter keys via secure
channels (email, SMS, in person). Keys authenticate ballots cryptographically;
they are never written to the chain in the clear.

**Close and release.** After the voting end, anyone can seal the Ballot Box
shards; sealing adds up the encrypted ballots and stops further ballots. After
the release time, the trustees publish their partial decryptions, and anyone —
organizer, any voter, or any third party — can submit the release transaction.
The script accepts only the correct tally.

**Reclaim.** After the audit end time, consume the event cells; unspent sponsor
capacity and all storage capacity return to the organizer's wallet. The
transaction history remains on-chain and can be re-verified forever.

---

# Voter Workflow

1. Open the event URL (or scan the QR code) in a browser.
2. Connect JoyID. The wallet is used only to derive per-event keys via the WebAuthn PRF extension: a pseudonym keypair that identifies the ballot, and a personal encryption key. The wallet signs no transaction, holds no funds, and never appears on-chain. A brand-new, empty wallet works.
3. Complete the ballot form and submit. The client encrypts a 0 or 1 for each answer option under the election key, adds a proof that the ballot is valid (each value is 0 or 1, and the number of choices is allowed), encrypts a personal copy for the voter, signs the entry with the pseudonym key, attaches the eligibility witness (invite-key preimage or per-voter Merkle proof), and sends it to the Ballot Relay. The relay returns a signed receipt (a commitment to the entry). No fee, no gas, no capacity is required from the voter.
4. Revote (if allowed): reconnecting the same wallet re-derives the same pseudonym; the client locates the voter's entry in the Ballot Box, decrypts the personal copy to display the current vote, and submits a replacement with an incremented sequence, up to the organizer-set limit. The replacement overwrites the old entry, so only the last ballot is counted.
5. Audit: verify on-chain inclusion of the entry using the receipt; after release, re-check every validity proof, the encrypted sums and the trustees' decryption proofs with the open-source verification tool.

---

# Features

- **Organizer-sponsored, zero-cost voting:** all ballot storage and fees are paid from the EventFund; voters need no CKB at all.
- **Cost estimation before publishing:** shown from expected voters, number of answer options and configuration; capacity is 1 CKB per byte of on-chain state and is reclaimed after the audit window.
- **Revoting with limits:** sequence-checked replacement of the voter's own entry, enforced by the type script inside each transaction.
- **Flexible eligibility:** public (relay-gated), single invite-key (hash-checked on-chain), or per-voter keys (Merkle-proof-checked on-chain — even a malicious relay cannot sponsor ineligible ballots; the key issuer can, however, tell whether a person voted, see *Known limitations*).
- **Wallet-unlinkable ballots:** pseudonymous entries; the ledger contains no reference to any voter wallet, and relay batching removes timing correlation.
- **Homomorphic, script-verified tallying:** the script checks a validity proof on every ballot, adds the encrypted ballots itself, and accepts only the tally that the trustees' decryption proofs produce. No individual ballot is ever opened, and a wrong tally cannot be recorded.
- **Anonymity controls:** totals only, or per-group results with k-anonymity (groups under the threshold are merged before anything is decrypted).
- **Live statistics:** participation counts during voting. Option-level totals are deliberately not offered before release: decrypting a running total twice would reveal the votes cast in between.
- **Health dashboard during voting:** turnout, anomaly flags, and k-anonymity status without leaking results.

---

# Sybil Resistance — Clarifications

Double voting in public or single-invite-key modes is a Sybil risk. Off-chain
mitigations — rate limits, CAPTCHA, email verification, device heuristics — are
applied by the Ballot Relay before it sponsors a ballot; they reduce but do not
eliminate Sybil attempts. Elections using per-voter keys largely avoid this
issue: each key admits exactly one live ballot, enforced cryptographically by the
on-chain script (one pseudonym binding per key). Post-election group-level audits
can flag inconsistencies (e.g., votes exceeding a group's eligible population);
if detected, the organizer should invalidate the affected group's results or
rerun the vote for that group under stricter eligibility. **For binding
elections, use per-voter keys.**

---

# Result Disclosure Policies

**During voting:** participation counts only. No option-level totals exist
before release, by design.

**At release:** after the release time, the trustees publish partial
decryptions of the sealed sums. Any *t* of the *n* trustees are enough. Each
partial decryption carries a proof, and the script rejects any that is wrong.
Before release, results could only be read if *t* trustees colluded; no single
party — not the organizer, not the relay, not VoteSecure — can read them alone.
If fewer than *t* trustees ever publish, the event has no result; nothing else
is ever decrypted instead.

## Publication modes (post-release)

- **Public:** anyone can view final tallies.
- **Invite-Key:** viewing results in the app requires the invite-key used to vote.
- **Private:** only organizer(s) and authenticated voters can view final tallies in the app.

**Note on access modes:** the tally is written on-chain at release, so
Invite-Key and Private modes restrict the application's presentation, not the
underlying data — a technically skilled observer can read the tally from the
chain. These modes are suitable for convenience-level, not secrecy-level,
restrictions. Group-level reporting enforces the configured k-anonymity
threshold; sub-threshold groups are merged before decryption, so no result for
a small group ever exists in plaintext.

---

# Security & Privacy Model

- **Ballot secrecy:** ballots are encrypted client-side and never decrypted individually. Only k-merged sums are decrypted, once, at release, by *t* trustees. The individual ballots stay encrypted forever.
- **Integrity:** every state change is validated by the frozen VoteSecure Script, including the validity of every ballot, the encrypted sums, and the decryption of the tally. The code hash of the deployed front-end is committed in the Metadata cell to prevent organizer-side script substitution, and the app validates it at load.
- **Wallet unlinkability:** the voter's JoyID wallet signs no transaction and appears nowhere on-chain. Ballots are identified by per-event pseudonyms derived client-side via WebAuthn PRF; pseudonyms are unlinkable across events.
- **Timing privacy:** the relay posts ballots in shuffled, delayed batches; an observer sees that a batch of pseudonymous ballots landed, not when any individual voted. The relay additionally holds sub-threshold group batches until k ballots have accumulated (or until the deadline flush, which posts under merged group tags), so small groups never appear on-chain in identifiable dribbles.
- **Availability & liveness:** anyone can seal the box and anyone can submit the release, so neither the organizer nor the relay can block a result. The result does depend on *t* trustees publishing. A voter with a funded wallet can bypass a censoring relay entirely via the self-pay fallback path.
- **Auditability:** voters verify inclusion of their entry via signed receipts and on-chain inspection; everyone can re-check every proof, sum and decryption from public chain data with the open-source verification tool.

## Known limitations

- **Trustee collusion and liveness.** Any *t* trustees together could decrypt individual ballots or read results early. Fewer than *t* available means no result. Who the trustees are, and how their independence is shown, is undecided — open problem 14.
- **Ciphertexts are permanent.** Encrypted ballots stay on-chain forever. If *t* key shares leak, even years later, that event's ballots can be decrypted. Trustees must destroy their shares after release. The encryption is not post-quantum.
- **Coercion resistance:** receipts do not reveal choices, but a coerced voter could be forced to re-derive their keys and decrypt their personal ballot copy, proving their vote. #TO_BE_IMPROVED# — plausible-deniability mechanisms (e.g., deniable receipts, re-randomizable personal ciphertexts).
- **Sybil attacks:** public and single-invite-key modes remain vulnerable; use per-voter keys for binding elections.
- **Participation is visible.** Group tags and the number of ballots per group are public. Choices are protected cryptographically by the k-merge; participation patterns in very small groups are not.
- **Relay liveness:** a single relay is a liveness dependency (never an integrity one). #TO_BE_IMPROVED# — relay federation with any-of-M co-signing.
- **The key issuer can tell whether a person voted in per-voter-keys mode.** The Merkle proof identifies the key used, and the issuer knows who holds each key. Since ballots are never decrypted individually, this reveals participation, not the choice. Anonymous membership with a nullifier is the leading candidate fix — open problem 11.
- **The voting deadline is closed by a transaction, not a clock.** CKB scripts can prove a time has been reached, not that it has not passed. Sealing the box closes it; exactly when and by whom is open problem 12.
- **On-chain cost of the checks is unmeasured.** If the proofs do not fit into a CKB transaction, verification moves off-chain and the guarantee weakens from "the script rejects it" to "anyone can detect it" — open problem 15.
- **No security audit has been performed.** Freezing the script makes the audit load-bearing; it must precede the mainnet deployment.

---

# Threats & Mitigations (Summary)

| Threat | Mitigation |
| --- | --- |
| EventFund draining (griefing) via junk ballots | EventFund lock requires the relay co-signature and enforces capacity conservation into the Ballot Box; an attacker cannot construct a draining transaction. Relay applies rate limits and CAPTCHA before signing. |
| Automated voting (bots) | Relay-side CAPTCHA and rate limits; optional email verification; per-voter keys for binding elections; organizer anomaly review. |
| Malformed ballot (e.g., 5 votes, or −1) | Zero-knowledge validity proof on every ballot, checked by the script; an invalid ballot cannot enter the box. |
| Copying another voter's ballot | Validity proofs are bound to the voter's pseudonym; a copied or re-randomised ballot fails the check. |
| Reading individual ballots | Never decrypted individually; only *t* colluding trustees could. |
| Wallet-to-ballot linkage on the ledger | Pseudonymous ballots; the voter wallet never signs a transaction; per-event PRF-derived pseudonyms, unlinkable across events. |
| Timestamp correlation of votes | Relay batches, shuffles, and delays submissions; k-aware batching for small groups. |
| Small-group deanonymization in reports | Enforce k (e.g., k ≥ 5); sub-threshold groups merged before decryption, with no group left out (so it cannot be recovered by subtraction). |
| Early result disclosure | No single party holds the key; trustees publish only after release. Residual: *t* colluding trustees. |
| Tampered or false published tally | The script recomputes the encrypted sums and checks every partial decryption; only the correct tally can be recorded, and release happens once. |
| Relay censorship of ballots | Signed receipts prove submission; self-pay fallback path lets a funded voter post directly; deadline flush is verifiable on-chain. |
| Phishing of invite links | Signed invitations and short-lived links; out-of-band verification encouraged. |
| Front-end tampering | Front-end code hash committed in the Metadata cell; the app validates at load; reproducible builds map source commit to hash. |
| Contract substitution or stealth upgrade | The VoteSecure Script is frozen: `hash_type data2`, unspendable code cell, no Type ID. What was audited is what runs. |

---

# Technical Architecture

This is a summary. *VoteSecure Architecture — v2.3* is the specification: cell
layouts, script roles and args, the schedule, transaction flows, the validation
sketch, the capacity model and the roadmap live there and are not repeated here.

- **One frozen script.** A single RISC-V binary in an unspendable Code Cell,
  deployed with `hash_type data2` and no Type ID. It is the lock on EventFund and
  Ballot Box cells and the type script on Metadata and Ballot Box cells. Fixing a
  bug means deploying a new Code Cell; events keep the version they started with.
  The deployment burns an estimated 30–80 K CKB once, which is the largest
  unfunded number in the project.
- **Three per-event cells.** EventFund (organizer sponsorship, relay co-signed,
  capacity-conserving), Metadata (immutable rules, schedule and election key,
  used as a constant cell dep), and Ballot Box (all entries, then the sealed
  sums, then the tally; about 172 + 66 B per answer option per entry, roughly
  750 three-option ballots per shard).
- **Ballot Relay.** Batches, shuffles and sponsors ballots and issues receipts.
  Trusted for liveness only; voters with funds can bypass it.
- **Cryptography.** Per-event pseudonym and personal key derived from JoyID via
  WebAuthn PRF; `e_personal` (ECIES) for the voter; `e_tally` as one
  exponential-ElGamal ciphertext per answer option under a t-of-n trustee key,
  with zero-knowledge validity proofs in the transaction witness.
- **Schedule.** `start` opens voting; `end` allows SEAL, which adds up the
  encrypted ballots and closes the box; `release` allows trustees to publish
  and anyone to submit RELEASE; `audit_end` allows RECLAIM.
- **Homomorphic, script-verified tallying.** SEAL computes the encrypted sums
  per group and option. RELEASE merges small groups, checks the trustees'
  partial decryptions, and writes the only tally they allow. RELEASE happens
  once.
- **Cost.** About 370 CKB locked per three-option ballot, almost all refundable
  after the audit window. A 500-voter, three-option election on one shard locks
  about 188 K CKB.

# Open Problems

The honest state of the project. Nothing below is a known solution awaiting
implementation. The canonical list, with detail, is §11 of *VoteSecure
Architecture — v2.3*; the numbers here match it. Items resolved by the design
keep their numbers.

**Decisions blocking the first implementation** (answerable now; the script
cannot be written until they are settled): 1 ciphersuite freeze · 3 relay
deadline-flush policy · 12 closing the Ballot Box at the deadline.

**Go/no-go measurement before the script is written:** 15 cycle cost of the
validity proofs, sealing and release checks on CKB-VM.

**Decision before the first live election:** 14 trustees — who, how many,
independence, share handling, liveness.

**Research problems** (need a person, not a task): 5 relay federation · 6
coercion resistance · 11 anonymous eligibility with per-voter keys.

**Measurement and engineering:** 8 WebAuthn PRF availability and recovery · 9
shard sizing, fee growth and revote compaction · 10 Code Cell binary size.

**Resolved by the v2.3 design:** 2 release finalization · 4 cryptographic
k-anonymity · 7 tally-key splitting · 13 real-time option totals (dropped).

---

# Future Work

- **Automated release integration:** align official VoteSecure releases with finalized on-chain event results; automate tagging and deployment from verifiable on-chain data.
- **Customizable voter interfaces:** a public API allowing third parties to embed customized voter interfaces while preserving the on-chain logic and integrity guarantees.
- **Credential-based eligibility:** integrations with OIDC, Verifiable Credentials, and proof-of-personhood protocols to strengthen eligibility without centralized identity disclosure.
- **Fiber for cost:** use Fiber channels to cut the per-ballot cost. Unexplored.
- **RGB++ anchoring:** anchor final results to Bitcoin through RGB++. Unexplored.

---

# Project, Governance & Distribution

VoteSecure is a volunteer project. It has no funding, no deadline, and no owner.
It is not a company, not a registered association, and not a legal entity.

**Governance.** Contribution is the only currency. Contributors award each other
**Merit-Voice (MV)** — a non-transferable unit that cannot be purchased at any
price. MV determines voting power, capped at 15% for any one person, and
determines how any donations the project receives are split. The cap takes
effect once there are seven or more contributors. The first Merit
Round opens 1 March 2027; the founding cohort shares the first 100 MV equally.
The Steward runs the early rounds publicly, with the intention of handing
governance to VoteSecure itself once it can run its own elections. The full rules
are in `CHARTER.md` in the repository.

There is no token, no investment round, and no pre-sale.

**Open source.** Code and reproducible-build documentation are published on
GitHub at github.com/psawyerberlin/votesecure — front end, Ballot Relay, on-chain
script, trustee tooling, and verification CLI. All source is distributed under
the MIT License, allowing anyone to freely use, modify, and distribute the
software, including commercially, provided attribution is given.

**Version control and transparency.** Each release is linked to a specific Git
commit hash, and the deployed on-chain script is identified by its code hash,
reproducible from the published source. This provides full traceability from
source code to the running application and the frozen contract, so independent
parties can verify the integrity and authenticity of every component.

**Contributions.** The project is maintained by its contributors and is open to
anyone. Bug reports, design critique, and pull requests are welcome through the
GitHub issue tracker. The open problems above are the most useful place to start.

**Data protection.** No PII is written on-chain; emails and phone numbers are
used only for invite delivery and stored off-chain with consent; the relay
minimizes logs.

---

# Glossary

| Term | Definition |
| --- | --- |
| CKB | Nervos Common Knowledge Base, a Layer-1 blockchain focused on state verification. Capacity (state storage) costs 1 CKB per byte of cell size. |
| Cell | CKB's primary state unit: capacity, an optional data field, a lock script, and an optional type script. |
| Lock script | The script governing who may spend (consume) a cell. Runs only when the cell is used as an input. |
| Type script | The script validating a cell's state transitions. Runs when the cell is created and when it is consumed. |
| Code cell | A cell whose data is a compiled script binary; other cells reference it via cell deps. |
| Code hash | The hash identifying a script. With `hash_type data2` it is the hash of the binary itself, making the referenced code immutable. |
| Type ID | A CKB pattern enabling script upgrades. VoteSecure deliberately does not use it: the upgrade capability is burned. |
| Cell dep | A read-only reference to another cell inside a transaction; how VoteSecure cells load the script binary and the Metadata rules. |
| Out point | The (transaction hash, index) pair identifying a specific cell. |
| Witness | Per-input auxiliary data in a transaction: signatures, invite-key preimages, Merkle proofs, ballot validity proofs, partial decryptions. |
| `since` | A CKB input field enforcing that a cell cannot be spent before a given time or block; used for all VoteSecure timelocks. |
| JoyID | Passwordless WebAuthn/passkey wallet. In VoteSecure it is used client-side only, to derive per-event keys; it never signs a transaction. |
| WebAuthn PRF | A WebAuthn extension producing deterministic per-credential pseudorandom output; the basis of joyIDencrypt key derivation. |
| Pseudonym | A per-event keypair derived from the voter's wallet via PRF; identifies and signs the ballot entry; unlinkable to the wallet and across events. |
| Ballot Relay | Open-source service that gates, sponsors, batches, shuffles, and posts ballots. Trusted for liveness only. |
| Ballot Box | The per-event (shardable) cell holding all ballot entries, the sealed encrypted sums, and after release the tally. Merges the former Voter Cells and Result Cell. |
| EventFund | The per-event escrow cell of organizer capacity sponsoring all ballots. |
| Homomorphic tallying | Counting votes by adding encrypted ballots without decrypting them; only the final sums are decrypted. VoteSecure uses exponential ElGamal. |
| Trustee | Holder of one share of the election key. Any *t* of *n* trustees can decrypt a sum; nobody holds the whole key. |
| Threshold decryption | Decryption that needs *t* of *n* key shares; each share's contribution comes with a proof that it is correct. |
| Validity proof | A zero-knowledge proof that an encrypted ballot is a legal vote (each value 0 or 1, allowed number of choices), without revealing it. |
| SEAL | The transition that closes a Ballot Box shard and records its encrypted sums. |
| k-anonymity | Releasing group results only if at least k ballots share the group; sub-threshold groups are merged before decryption. |
| Merit-Voice (MV) | The project's non-transferable governance unit. See `CHARTER.md`. |
