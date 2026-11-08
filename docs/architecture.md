# VoteSecure Architecture — v2.3 (Ballot Relay + Ballot Box + Homomorphic Tally)

**Status:** Design proposal. Supersedes v1 ("one cell per ballot").
**Date:** 8 November 2026
**Companion document:** VoteSecure White Paper (Draft v0.98).
**Scope of this document:** the authoritative technical specification, and the
single canonical list of open problems (§11). The White Paper summarises this
document and does not restate its detail. Governance lives in `CHARTER.md`.
**Implementation status:** not implemented. The prototype in the repository
follows the superseded v1 design, and its on-chain script accepts every
transaction.
**Changes in v2.3:** **homomorphic tallying.** No individual ballot is ever
decrypted, by anyone, at any time. `e_tally` is now a vector of
exponential-ElGamal ciphertexts under a threshold election key held t-of-n by
trustees. The script verifies a validity proof on every ballot, sums the
ciphertexts at a new SEAL transition, and verifies the trustees' partial
decryptions of the sums at RELEASE. Only aggregates of at least *k* ballots are
ever decrypted. drand and `K_event` are removed. Consequences in §11: item 2
(release finalization) is resolved by design, item 4 (cryptographic
k-anonymity) is adopted, item 7 (K_event peek) is superseded, items 11 and 12
are narrowed, item 13 is decided (real-time option totals are dropped), and two
items are added: 14 (trustees) and 15 (cycle-cost benchmark, go/no-go). Entry
size grows to ~172 + 66·n B for n options. §3.3 now states the schedule
ordering.
**Changes in v2.2:** three open problems added (§11 items 11–13): organizer
linkability in per-voter-keys mode, the missing upper time bound inside a
script, and the undefined mechanism for real-time option totals. Phase 0 now
lists five decisions. Feasibility table updated to match.
**Changes in v2.1:** script-role table corrected (the script is the lock on Ballot
Box shards as well as on EventFund; lock args now carry the kind tag);
`script_role()` dispatch updated accordingly; entry-size arithmetic reconciled
with the itemised entry fields; roadmap restated as effort, not calendar;
Code Cell deployment cost surfaced; editorial artefacts removed.

---

## 1. Executive Summary

This revision replaces the v1 design (per-voter cells, open sponsor lock, 3-of-N
multisig release) with a tighter, CKB-native architecture built on five decisions:

1. **CKB-correct terminology and script roles.** One immutable **VoteSecure Script**
   deployed once in a **Code Cell**. The same binary acts as the **lock script** on
   the EventFund and Ballot Box cells (who may spend them, and for what) and as the
   **type script** on Metadata and Ballot Box cells (what state transitions are
   valid).
2. **Ballot Relay.** Voters never broadcast transactions. An open-source relay
   receives ballots, applies off-chain eligibility checks, **batches** them, and
   co-signs EventFund spends. This closes the EventFund griefing hole, removes
   write contention on the Ballot Box, and — because batches are shuffled and
   delayed — destroys the timestamp-correlation channel.
3. **Ballot Box cell.** All ballots for an event live in one (shardable)
   append/replace cell instead of one cell per voter. The Result Cell is merged
   into it: the box's terminal state, with the verified decrypted aggregates,
   *is* the result.
4. **Pseudonymous ballots via WebAuthn PRF.** The voter's JoyID wallet never
   appears on-chain. It is used purely client-side to deterministically derive a
   per-event pseudonym keypair and encryption secret (joyIDencrypt, PRF extension).
   On-chain linkage between wallet and ballot: none.
5. **Homomorphic tallying with threshold decryption.** Each ballot encrypts one
   0/1 value per option under an election public key whose private key exists
   only as *t-of-n* shares held by trustees. Ciphertexts add up without being
   opened. The script checks that every ballot is well formed, sums the
   ciphertexts itself, and checks the trustees' decryption of the sums. **No
   individual ballot is ever decrypted** — not after release, not by the
   organizer, not by anyone short of *t* colluding trustees.

Trust summary: the chain guarantees integrity, immutability, ballot validity,
and a **script-verified** tally. The relay is trusted for **liveness only** — it
can refuse to post a ballot (detectable, provable via receipts, mitigated by a
self-pay fallback) but can never forge, alter, or read one. The trustees are
trusted for **ballot secrecy** (any *t* of them together could decrypt
individual ballots) and for **result liveness** (fewer than *t* means no
result). They cannot forge or alter a result: a wrong decryption share fails
the script's proof check.

---

## 2. Component Overview

```
┌────────────┐   ballot (encrypted,      ┌──────────────────┐   batched txs   ┌─────────────────┐
│   Voter    │   pseudonymous, signed)   │   Ballot Relay   │ ───────────────▶│   CKB Network   │
│  Browser   │ ─────────────────────────▶│  (open source,   │                 │                 │
│  + JoyID   │                           │  organizer- or   │                 │  Code Cell      │
│  (PRF)     │ ◀───────────────────────  │  self-hosted)    │                 │  EventFund      │
└────────────┘   receipt + inclusion     └──────────────────┘                 │  Metadata Cell  │
      │            proof                        ▲                             │  Ballot Box(es) │
      │                                         │ fallback: self-pay direct   └─────────────────┘
      └─────────────────────────────────────────┴─────────────────────────────────────▲
                                                                                      │
┌────────────┐   create & fund event / reclaim capacity after audit                   │
│ Organizer  │ ─────────────────────────────────────────────────────────────────────--┤
│  + JoyID   │                                                                        │
└────────────┘                                                                        │
┌────────────┐   DKG before PUBLISH (election public key)                             │
│ Trustees   │   partial decryptions of the sealed aggregates at RELEASE ─────────────┘
│ (t-of-n)   │
└────────────┘
```

---

## 3. On-Chain Cell Architecture

### 3.1 VoteSecure Code Cell (deployed once, frozen)

```
┌──────────────────────────────────────────────────────────┐
│  VoteSecure Code Cell                                    │
│                                                          │
│  Contents (cell data): compiled RISC-V binary of the     │
│  VoteSecure Script                                       │
│                                                          │
│  Referenced by all VoteSecure cells via cell dep         │
│  (dep_type: code) using its code hash                    │
│                                                          │
│  Deployment: hash_type = data2 (hash of the binary).     │
│  There is NO Type ID and therefore NO upgrade path.      │
│  The script is cryptographically frozen: what was        │
│  audited is what runs, forever.                          │
│                                                          │
│  Lock: "unspendable" lock (all-zero code hash) so the    │
│  code cell itself can never be consumed or replaced.     │
│                                                          │
│  Capacity: ~30–80 K CKB (1 CKB per byte of binary),      │
│  permanently burned. Paid once, for all events, by       │
│  whoever deploys. See §8.                                │
└──────────────────────────────────────────────────────────┘
```

**Rationale for freezing.** Deploying with `hash_type: type` (Type ID) would allow
code upgrades, turning "immutable" into a governance promise. Freezing with
`data2` makes it a cryptographic fact and maximizes trust. Consequence: bugs are
forever; a flawed version is abandoned and a new Code Cell (new code hash) is
deployed, and events simply reference the version they were created under.
Version discipline: the code hash is the version identifier; the white paper and
repository publish the reproducible-build instructions that map source commit →
binary → code hash.

**Script roles.** The one binary implements both entry points:

| Attached as | On cell | Runs when | Enforces |
|---|---|---|---|
| **Lock script** | EventFund | the cell is *spent* | who may consume sponsor capacity, and for what |
| **Lock script** | Ballot Box | the shard is *spent* (i.e. every update) | that an update is a valid relay batch, self-pay write, SEAL, RELEASE, or RECLAIM |
| **Type script** | Metadata, Ballot Box | cell is *created, updated, or consumed* | election rules and valid state transitions |

**Args carry a one-byte kind tag in both roles.** This is what lets a single
binary dispatch correctly:

| Role | Cell | Args |
|---|---|---|
| Lock | EventFund | `0x00<eventId>` |
| Lock | Ballot Box | `0x02<eventId><shard>` |
| Type | Metadata | `0x01<eventId>` |
| Type | Ballot Box | `0x02<eventId><shard>` |

*Correction from v2.0.* The v2.0 role table listed the script as lock on
EventFund only, while §3.4 also attached it as the Ballot Box lock, and the
`script_role()` sketch routed every lock invocation to `verify_eventfund_spend`.
A Ballot Box spend would therefore have been validated against EventFund rules
and rejected. The kind tag above resolves it. **This is a design correction, not
a transcription fix — review it before it reaches the script implementation.**

### 3.2 EventFund Cell (per event; sponsor capacity escrow)

```
┌──────────────────────────────────────────────────────────┐
│  EventFund Cell                                          │
│                                                          │
│  Lock Script:  VoteSecure Script (code hash, data2)      │
│                args = 0x00<eventId>                      │
│  Type Script:  none                                      │
│  Capacity:     organizer's sponsor deposit               │
│  Data:         minimal (running accounting is implicit   │
│                in capacity; no mutable data needed)      │
│                                                          │
│  Lock rules (spend paths):                               │
│  A. BALLOT SPONSORSHIP (during voting window)            │
│     • witness must contain a signature by the Relay      │
│       pubkey registered in the Metadata cell (cell dep)  │
│     • tx must update the event's Ballot Box according    │
│       to the type-script rules (checked by the box's     │
│       own type script; the lock only checks the relay    │
│       co-signature and the capacity conservation)        │
│     • output must recreate the EventFund with            │
│       capacity_in − capacity_delta_of_box − fee          │
│  B. ORGANIZER RECLAIM (after audit_end_time)             │
│     • `since` on the input enforces t ≥ audit_end_time   │
│     • witness must contain the organizer's signature     │
│       (organizer lock hash stored in Metadata)           │
│  C. SELF-PAY FALLBACK: not a spend path — a voter with   │
│     a funded wallet may update the Ballot Box paying     │
│     fees from their own cells, without touching the      │
│     EventFund. Censorship escape hatch.                  │
└──────────────────────────────────────────────────────────┘
```

**Griefing analysis.** v1's open lock ("anyone may take capacity by creating a
ballot") allowed an attacker to drain the fund with junk ballots at zero cost.
Path A now requires the relay's co-signature, and the relay performs the
off-chain checks (rate limits, CAPTCHA, invite-key validation, ballot validity
proofs) *before* signing. An attacker without the relay cannot construct a
draining transaction at all. The relay cannot steal: path A forces the capacity
delta to land in the Ballot Box update, and path B is the only route to an
arbitrary destination — gated by organizer signature + timelock.

### 3.3 Metadata Cell (per event; immutable during the event)

```
┌──────────────────────────────────────────────────────────┐
│  Metadata Cell                                           │
│                                                          │
│  Lock Script:  organizer's lock (JoyID)                  │
│  Type Script:  VoteSecure Script, args = 0x01<eventId>   │
│                                                          │
│  Data {                                                  │
│    eventId, title, description,                          │
│    questions: [{id, text, options, type,                 │
│                 minSelect, maxSelect}],                  │
│    schedule: { start, end, release, audit_end },         │
│    eligibility: {                                        │
│      mode: public | invite_key | per_voter_keys,         │
│      inviteKeyHash | merkleRoot   // per-voter: Merkle   │
│    },                             // root of key hashes  │
│    reporting: { granularity, groupingFields, minK,       │
│                 mergeRule },                             │
│    allowedUpdates,                                       │
│    relayPubKey,            // authorizes EventFund path A│
│    organizerLockHash,      // authorizes path B          │
│    tally: {                                              │
│      suite,                // ciphersuite id (§11 item 1)│
│      electionPK,           // joint ElGamal public key   │
│      threshold t,                                        │
│      trustees: [{ id, pubKey, verificationShare Y_j }],  │
│      dkgCommitments        // Feldman commitments; let   │
│    },                      //   anyone recheck PK and Y_j│
│    frontendCodeHash,       // build attestation          │
│    shardCount              // number of Ballot Boxes     │
│  }                                                       │
│                                                          │
│  Type-script rules: creation validates schema and        │
│  schedule sanity, that 2 ≤ t ≤ n, and that electionPK    │
│  and every Y_j follow from dkgCommitments; the cell may  │
│  not be consumed before audit_end_time (enforced via     │
│  `since` on any spend). Referenced read-only as a cell   │
│  dep by every ballot tx.                                 │
└──────────────────────────────────────────────────────────┘
```

The Metadata cell is the stable anchor: it never moves during the event, so its
out point is a constant cell dep, and "scripts can't see the chain" ceases to
matter — everything a validation run needs (rules, schedule, relay key, Merkle
root, election key, trustee verification shares) is inside the transaction via
this dep.

**Schedule.** Four timestamps in Metadata, validated at creation as
`start < end ≤ release < audit_end`. Every check is a lower bound (`since` or
header deps, §7), so each milestone *opens* something and nothing in a script
*closes* at a time; only a state change (SEAL) closes the box.

| Milestone | Opens | Enforced by |
|---|---|---|
| *before PUBLISH* | trustees run the DKG; PUBLISH creates Metadata, EventFund, empty shards | off-chain; creation checks |
| `start` | APPEND / REPLACE (relay batches, self-pay) | `since` / header deps |
| `end` | SEAL (closes each shard; no ballots after it) | `since ≥ end`; the close itself is §11 item 12 |
| `release` | trustees publish partial decryptions; RELEASE (once) | `since ≥ release` |
| `audit_end` | RECLAIM of EventFund, shards and Metadata | `since ≥ audit_end`, organizer signature |

The gap between `end` and `release` is where the relay's deadline flush and
every shard's SEAL must land. `release` may equal `end` only if all shards can
be sealed first. #TO_BE_IMPROVED# — minimum gaps between milestones, and a
deadline by which trustees must publish, are not specified.

### 3.4 Ballot Box Cell (per event, shardable; merges v1 Voter Cells + Result Cell)

```
┌──────────────────────────────────────────────────────────┐
│  Ballot Box Cell (shard s of N)                          │
│                                                          │
│  Lock Script:  VoteSecure Script, args = 0x02<eventId><s>│
│                (open to update via relay path A or       │
│                 self-pay path C; seal, release, and      │
│                 reclaim after their times)               │
│  Type Script:  VoteSecure Script, args = 0x02<eventId><s>│
│                                                          │
│  Data {                                                  │
│    header: { eventId, shard, entryCount, phase },        │
│    entries: [                                            │
│      { pseudonym: 33B,        // voter's derived pubkey  │
│        sequence: u8,          // revote counter          │
│        groupTag: var,         // reporting group         │
│        e_tally: n × 66B,      // one exp-ElGamal         │
│                               //   ciphertext per option │
│                               //   under electionPK      │
│        e_personal: var,       // ECIES to voter's        │
│                               //   derived key           │
│        sig: 64B }             // pseudonym's signature   │
│                               //   over the entry        │
│    ],                                                    │
│    sealed: null | {           // written in SEAL tx      │
│      perGroup: [{ groupTag, count,                       │
│                   aggregate: n × 66B }],                 │
│      ballotSetHash },                                    │
│    tally: null | {            // RELEASE, shard 0 only   │
│      perOption, perBucket (k-merged), releasedAt }       │
│  }                                                       │
│                                                          │
│  Validity proofs travel in the witness, not the cell.    │
│                                                          │
│  Type-script rules per transition:                       │
│  • APPEND (new pseudonym): entry.sig verifies; sequence  │
│    = 1; within voting window (`since` + header deps);    │
│    eligibility witness valid (invite-key preimage, or    │
│    Merkle proof against Metadata merkleRoot); ballot     │
│    validity proof verifies (§5.2)                        │
│  • REPLACE (revote): same pseudonym exists in input box  │
│    with sequence n; output has n+1 ≤ allowedUpdates;     │
│    validity proof for the new entry verifies; all other  │
│    entries byte-identical                                │
│  • BATCH: one tx may apply many APPEND/REPLACE ops       │
│    (relay batching); rules checked per entry             │
│  • SEAL (closes the shard): entries untouched; `sealed`  │
│    must equal the homomorphic sum of e_tally per         │
│    (groupTag, option), with per-group counts; no APPEND  │
│    or REPLACE may follow. Anyone may submit.             │
│  • RELEASE (after release time, shard 0, once): all      │
│    shards sealed (1..N-1 read as cell deps); script      │
│    k-merges the group aggregates, verifies t partial     │
│    decryptions per aggregate, and accepts only the       │
│    counts they decrypt to. Anyone may submit.            │
│  • RECLAIM (after audit_end): organizer consumes the     │
│    box; capacity returns to organizer                    │
└──────────────────────────────────────────────────────────┘
```

**Why merge Voter and Result cells.** On CKB, capacity cost is 1 CKB per byte of
*total* cell size. A separate per-voter cell adds ~130 B of structural overhead
(8 B capacity field + ~55 B lock + ~65 B type script serialization) on top of the
entry data itself. As a Ballot Box entry the same ballot costs its data only.
The box therefore removes ~130 CKB per ballot and collapses thousands of cells
into a handful — simpler indexing, one query per event. All capacity is reclaimed
after the audit window.

**Entry size.** `e_tally` now scales with the number of options *n* (summed
over all questions), because each option is its own ciphertext:

| Field | Size |
|---|---|
| pseudonym | 33 B |
| sequence | 1 B |
| groupTag | ~4 B |
| e_tally (n × exp-ElGamal, two compressed points each) | 66·n B |
| e_personal (ECIES: ephemeral pubkey 33 B + tag 16 B + ciphertext) | ~70 B |
| sig | 64 B |
| **Total** | **~172 + 66·n B** (n = 3: ~370 B; n = 10: ~830 B) |

The validity proof (§5.2) adds ~128 B per option plus ~64 B per question, but
only to the transaction witness. Witnesses stay on chain permanently and are
readable by every verifier, but they lock no capacity.
**#TO_BE_IMPROVED#** — measured entry sizes once the ciphersuite is frozen
(§11 item 1).

**Sharding & limits.** Updating a cell re-emits its full data, and a CKB
transaction is capped around ~600 KB. v2.2 placed the shard ceiling at roughly
1,300 entries of ~220 B; at ~370 B (three options) that becomes roughly **750
ballots**, and less with more options. `shardCount` in Metadata scales beyond
that (relay assigns pseudonyms to shards by hash prefix). #TO_BE_IMPROVED# —
empirical shard-size tuning and fee-growth measurements on testnet; a
running-aggregate variant that keeps only `hash(e_tally)` per entry (§11
item 9).

**Write contention.** Every update touches the shard cell, so naive concurrent
writes race. The relay serializes and batches, eliminating contention on the
happy path. Self-pay fallback transactions may race with a relay batch; clients
retry against the new out point.

---

## 4. Ballot Relay

Open-source service; the organizer runs their own instance or uses one hosted by
a third party. Reference implementation ships in the VoteSecure repository.

### 4.1 Responsibilities

1. **Eligibility and validity gating (off-chain half).** CAPTCHA, rate limits,
   device heuristics, invite-key pre-validation — the Sybil mitigations from the
   white paper's *Sybil Resistance* section, which can only run off-chain. The
   relay also checks each ballot's validity proof before queuing it, so it never
   pays fees for a batch the script would reject. The on-chain half (Merkle
   proofs, validity proofs) is enforced by the type script regardless of the
   relay.
2. **Sponsorship co-signing.** Signs EventFund path-A spends with `relayPubKey`.
3. **Batching & serialization.** Accepts ballots into a queue; builds one
   transaction applying many APPEND/REPLACE operations; removes Ballot Box
   contention entirely. Batch size is bounded by the per-transaction cycle cost
   of validity proofs (§11 item 15).
4. **Timing privacy.** Batches are posted **shuffled and on a delay schedule**
   (e.g., fixed intervals or threshold-triggered), so an on-chain observer sees
   "N pseudonymous ballots landed at 14:00", never "a ballot landed 3 s after
   Alice's browser connected". This closes the timestamp-correlation channel.
5. **k-aware batch release (group privacy).** Batching policy: a pending
   ballot whose `groupTag` has fewer than *k* queued ballots is held until the
   group reaches *k*, or until a maximum hold time elapses, at which point it is
   posted under the merged/parent group tag. Small groups therefore never appear
   on-chain in identifiable dribbles. Since v2.3 this protects participation
   patterns only: choices are never decrypted per ballot. #TO_BE_IMPROVED# —
   exact hold-time policy and merged-tag scheme; interaction with the voting
   deadline (final flush must post everything, merging all sub-k groups, before
   SEAL).
6. **Receipts.** Returns a signed receipt (entry commitment + eventual tx hash)
   so the voter can prove submission and verify inclusion; a censored voter can
   demonstrate non-inclusion with the receipt.

### 4.2 Trust model

| Property | Relay can violate? | Why not / consequence |
|---|---|---|
| Forge or alter a ballot | No | Entries are signed by the voter's pseudonym key |
| Read a ballot | No | e_tally under the trustees' threshold key; e_personal under voter key |
| Link wallet ↔ ballot | No on-chain; sees IP/timing off-chain | Non-goal per white paper (network-level adversaries); minimize logs, support proxies |
| Drain EventFund | No | Path A forces capacity into the Ballot Box update |
| Censor a ballot | Yes (liveness) | Detectable via receipt; self-pay fallback path C |
| Delay ballots | Yes, bounded | Deadline flush is verifiable on-chain |

#TO_BE_IMPROVED# — relay federation / redundancy (multiple relay keys in
Metadata, any-of-M co-signing) to remove the single liveness dependency.

---

## 5. Keys, Pseudonyms & Encryption

### 5.1 Deterministic derivation via WebAuthn PRF (joyIDencrypt)

The voter's JoyID wallet **never signs a CKB transaction and never appears
on-chain**. It is used client-side only:

```
prf_out   = WebAuthn PRF(credential, salt = "votesecure:" + eventId)
seed      = HKDF(prf_out)
pseudonym = secp256k1 keypair(seed, "pseudonym")   → identifies the ballot entry
enc_key   = key(seed, "personal-encryption")       → decrypts e_personal
```

Same wallet + same event ⇒ same pseudonym, every session, on any device holding
the passkey — so a returning voter finds their entry, decrypts `e_personal` to
display their vote, and signs a REPLACE (revote) with the same pseudonym key.
Different events ⇒ unlinkable pseudonyms.

*Assumed done:* joyIDencrypt redesigned on the PRF extension (per project
decision, July 2026). #TO_BE_IMPROVED# — verify PRF availability across JoyID's
supported authenticator/browser matrix; define recovery UX for authenticators
without PRF (fallback: relay-issued blinded credential? explicitly out of scope
for v1?).

### 5.2 Ballot ciphertexts and homomorphic tallying

**Design rule (v2.3): no individual ballot is ever decrypted.** Only sums of at
least *k* ballots are decrypted, and only once, at RELEASE.

Each entry carries two ciphertexts:

- **`e_personal`** — ECIES to the voter's derived `enc_key`. Purpose: "show me
  what I voted." Never publicly decryptable.
- **`e_tally`** — one **exponential-ElGamal** ciphertext per option, under the
  joint election key. Proposed group: secp256k1, the curve already used across
  CKB tooling (final choice: §11 item 1).

```
Trustee key   x = Σ λ_j·x_j      never assembled; trustee j holds share x_j
              PK = x·G           (electionPK),   Y_j = x_j·G (verification share)
Encrypt       Enc(m; r) = (A, B) = (r·G, m·G + r·PK)        m ∈ {0, 1}
Add           (A1+A2, B1+B2) encrypts m1+m2                  no key needed
Partial dec.  D_j = x_j·A, with a DLEQ proof that log_G Y_j = log_A D_j
Combine       M = B − Σ λ_j·D_j = T·G   over any t trustees (Lagrange λ_j)
Result        T = number of ballots for that option; T ≤ ballot count,
              so it is found by a short search and checked as T·G == M
```

**Key generation.** Before PUBLISH, the *n* trustees run a distributed key
generation (Pedersen DKG with Feldman commitments). Nobody, including the
organizer, ever holds `x`. The commitments go into Metadata so anyone can check
`electionPK` and every `Y_j`. Who the trustees are is §11 item 14.

**Ballot validity proof.** Because nobody decrypts a ballot, nobody could
otherwise notice a ballot that encrypts 5 votes, or −1. Each ballot therefore
carries a non-interactive zero-knowledge proof, in the witness:

- per option: a disjunctive Chaum-Pedersen proof that the ciphertext encrypts
  0 or 1 (~128 B);
- per question: a proof that the option values sum to an allowed number,
  between `minSelect` and `maxSelect` (single choice: exactly 1, ~64 B).

The Fiat-Shamir challenge hashes `eventId`, the pseudonym, the question and
option index, and the ciphertexts. A proof is therefore bound to its own
pseudonym, which blocks *ballot copying*: an attacker cannot take another
voter's `e_tally` (or a re-randomised copy) and submit it as their own. The
type script verifies the proof on every APPEND and REPLACE, so an invalid ballot
can never enter the box.

**Revoting** needs no subtraction. REPLACE overwrites the entry in place, so the
box only ever holds each pseudonym's latest ballot, and the sum at SEAL covers
exactly the ballots that count.

**SEAL and RELEASE.** SEAL closes a shard and writes, per `groupTag`, the ballot
count and the summed ciphertext for each option. The script recomputes both
from the entries, so a wrong sum is rejected. RELEASE (shard 0, reading the
other sealed shards as cell deps) applies the k-merge rule across all shards,
adds the group sums into reporting buckets, and verifies *t* partial
decryptions with their DLEQ proofs for each bucket and option. The tally it
writes is the only one the proofs allow, so a RELEASE cannot carry wrong
numbers, and it cannot be repeated (§6.3).

**k-merge before decryption.** Per-group counts are public (group tags are
public), so the merge is deterministic: every ballot lands in exactly one
reported bucket and every bucket holds at least *k* ballots. A small group is
never left out of the report, because the overall total minus the reported
groups would then reveal it by subtraction. If the whole event has fewer than
*k* ballots, the event reports totals only. Inherent limit: in a bucket of
exactly *k*, if *k − 1* voters disclose their choices, the last one is implied.
That is true of any aggregate and is stated, not solved.

**What the trustees can and cannot do.**

| Trustees could… | Prevented? |
|---|---|
| Publish a wrong result | Yes — every partial decryption is DLEQ-checked by the script |
| Decrypt an individual ballot | Only *t* or more colluding. This is the trust assumption |
| Read results early | Only *t* or more colluding, by decrypting the running sums |
| Withhold the result | Yes, if more than n − t refuse. The event then has no result (§11 item 14) |

drand and `K_event` are gone. v2.2's organizer-peek caveat disappears with
them: an organizer who is also a trustee holds one share, not the key. Release
time is enforced by `since ≥ release` on RELEASE.

### 5.3 Eligibility cryptography

- **Public mode:** relay gating only (inherently Sybil-limited; see white paper).
- **Invite-key mode:** witness carries the key preimage; type script checks
  `hash(preimage) == Metadata.inviteKeyHash`.
- **Per-voter-keys mode:** Metadata stores a **Merkle root** of all per-voter
  key hashes. The witness carries `(preimage, merkleProof)`; the type script
  verifies the proof. One-ballot-per-key is enforced structurally: the entry's
  pseudonym is bound to the key (`pseudonym_binding = hash(preimage ‖ pseudonym)`
  checked by the script), and APPEND for an already-present binding is rejected;
  revoting is a REPLACE under the same pseudonym. Even a malicious relay cannot
  sponsor ineligible ballots in this mode.

  **Caveat — organizer linkability.** The Merkle proof reveals which leaf is
  used, and `pseudonym_binding` ties that leaf to a pseudonym. Whoever issued
  the per-voter keys (normally the organizer) knows which person holds which
  key, and can therefore link a person to their pseudonym. Since v2.3 this
  reveals *that* the person voted, their group tag and how often they revoted,
  but **not their choice**, unless *t* trustees collude.
  #TO_BE_IMPROVED# — see §11 item 11. The leading candidate is an anonymous
  membership proof with a nullifier, studied in
  `concepts/zk-private-voting-concept.md`.

### 5.4 Post-release privacy

After release, the public learns, per ballot, `(pseudonym, groupTag, sequence)`
and ciphertexts that are never opened; and in plaintext, only the per-option
totals of reporting buckets of at least *k* ballots. **Pseudonyms, never
wallets; aggregates, never choices.** Wallet↔ballot linkage does not exist
on-chain by construction, and timing correlation is closed by relay batching.
Residual:

- **k-anonymity is now cryptographic for choices.** Only k-merged aggregates are
  ever decrypted. Group tags and per-group *participation* counts remain public,
  which can still matter in very small populations.
- **The ciphertexts are permanent.** They stay on chain after RECLAIM in the
  transaction history. If *t* trustee shares ever leak, even years later, every
  past ballot of that event can be decrypted. Trustees must destroy their shares
  after RELEASE, and ElGamal is not post-quantum. #TO_BE_IMPROVED# — §11
  item 14.
- Coercion: a voter can be coerced into revealing their PRF-derived keys and
  `e_personal`, proving their vote. #TO_BE_IMPROVED# — deniability mechanisms
  (fake receipts / re-randomizable e_personal).

---

## 6. Transaction Flows

### 6.1 Publish event (organizer)

```
off-chain: trustees run DKG → electionPK, Y_1..Y_n, dkgCommitments

tx: PUBLISH
  inputs:   organizer capacity cells (JoyID-signed)
  outputs:  Metadata cell (0x01<eventId>)  with electionPK, t, trustees, commitments
            EventFund cell (sponsor deposit)
            Ballot Box shards 0..N-1 (empty, phase=voting)
  cell deps: VoteSecure Code Cell
  type script: checks 2 ≤ t ≤ n and that electionPK, Y_j follow from the commitments
```

### 6.2 Cast / revote (voter → relay)

```
Voter browser:
  derive pseudonym + enc_key (PRF)
  e_tally   = [Enc_PK(m_i) for each option i]          m_i ∈ {0,1}
  proof     = per-option 0/1 proofs + per-question sum proofs,
              Fiat-Shamir bound to eventId and pseudonym
  build entry { pseudonym, seq, groupTag, e_tally, e_personal, sig }
  attach eligibility witness (invite preimage / Merkle proof) + validity proof
  POST to relay  → signed receipt

Relay (per batch interval, k-aware queue):
  verify validity proofs, drop invalid ballots
tx: BATCH
  inputs:   EventFund (lock path A: relay co-sig), Ballot Box shard(s)
  outputs:  EventFund (capacity − Δbox − fee), Ballot Box shard(s) with
            entries appended/replaced (shuffled order)
  cell deps: Code Cell, Metadata cell
  witnesses: relay sig; per-entry eligibility witnesses and validity proofs
```

### 6.3 Seal and release (anyone)

```
tx: SEAL                                   (per shard; once `end` is reached —
                                            exact rule is §11 item 12)
  inputs:   Ballot Box shard s
  outputs:  same shard, phase=sealed,
            sealed.perGroup = Σ e_tally per (groupTag, option), counts,
            sealed.ballotSetHash = hash(entries)
  type script: recomputes every sum and count; entries untouched;
               APPEND/REPLACE are refused from now on

Trustees (after `release`): each computes D_j = x_j·A for every
  k-merged bucket aggregate, with a DLEQ proof, and publishes it.

tx: RELEASE                                (once, after `release`)
  inputs:   Ballot Box shard 0 (sealed)
  cell deps: Code Cell, Metadata, sealed shards 1..N-1
  outputs:  shard 0, phase=released, tally written
  witness:  ≥ t partial decryptions per bucket and option, with DLEQ proofs
  type script: since ≥ release; all shards sealed; recomputes the k-merge;
               verifies every share against Y_j; combines; accepts only
               counts T with T·G == M; Released is terminal (only RECLAIM follows)
```

**Release finalization (was §11 item 2).** v2.2 left open whether a second
RELEASE with different numbers was self-correction or tally churn. In v2.3 the
script verifies the numbers themselves: exactly one tally passes, and the phase
is terminal, so there is nothing to dispute and no window to define. This holds
only if the on-chain checks fit in the cycle budget (§11 item 15).

### 6.4 Reclaim (organizer, after audit_end)

```
tx: RECLAIM
  inputs:   EventFund (path B), Ballot Box shards, Metadata (since ≥ audit_end,
            organizer-signed)
  outputs:  organizer capacity cell(s)
  → all sponsor CKB returns; transaction history (ciphertexts, proofs,
    decryption shares) remains and can be re-verified forever
```

If fewer than *t* trustees ever publish their shares, the shards stay sealed,
the event has no result, and RECLAIM still returns the capacity at
`audit_end`. There is deliberately no fallback that decrypts anything else.

---

## 7. VoteSecure Script — validation sketch (Rust, ckb-std)

Illustrative; not compilable as-is. Everything validated is **inside the
transaction** (inputs, outputs, witnesses, cell deps) — no chain scanning.

```rust
const KIND_EVENTFUND:  u8 = 0x00;
const KIND_METADATA:   u8 = 0x01;
const KIND_BALLOT_BOX: u8 = 0x02;

fn main() -> Result<(), Error> {
    let kind = script_args_kind()?;          // first byte of this script's args
    match (script_role()?, kind) {
        (Role::Lock, KIND_EVENTFUND)  => verify_eventfund_spend(),
        (Role::Lock, KIND_BALLOT_BOX) => verify_ballot_box_spend(),
        (Role::Type, KIND_METADATA)   => verify_metadata_transition(),
        (Role::Type, KIND_BALLOT_BOX) => verify_ballot_box_transition(),
        _ => Err(Error::InvalidKind),
    }
}

fn verify_eventfund_spend() -> Result<(), Error> {
    let meta = load_metadata_dep()?;                  // cell dep, stable out point
    if witness_has_sig(&meta.relay_pubkey)? {
        // Path A: sponsorship — capacity conservation into the Ballot Box
        let delta = ballot_box_capacity_delta()?;     // outputs − inputs of box cells
        ensure(eventfund_out()? == eventfund_in()? - delta - tx_fee()?)?;
        ensure(within_window(meta.schedule.start, meta.schedule.end)?)?;   // via since/header deps
        Ok(())
    } else if witness_has_sig(&meta.organizer_lock_hash)? {
        // Path B: reclaim
        ensure(input_since_at_least(meta.schedule.audit_end)?)?;
        Ok(())
    } else {
        Err(Error::Unauthorized)
    }
}

// Lock on the Ballot Box: is this spend an allowed *kind* of update at all?
// The detailed entry rules live in the type script; the lock gates the phase.
fn verify_ballot_box_spend() -> Result<(), Error> {
    let meta = load_metadata_dep()?;
    match intended_phase()? {
        Phase::Voting    => ensure(within_window(meta.schedule.start, meta.schedule.end)?),
        Phase::Sealed    => ensure(input_since_at_least(meta.schedule.end)?),   // §11 item 12
        Phase::Released  => ensure(input_since_at_least(meta.schedule.release)?),
        Phase::Reclaimed => {
            ensure(input_since_at_least(meta.schedule.audit_end)?)?;
            ensure(witness_has_sig(&meta.organizer_lock_hash)?)
        }
    }
}

fn verify_ballot_box_transition() -> Result<(), Error> {
    let meta = load_metadata_dep()?;
    let (input_box, output_box) = load_box_pair()?;   // None input ⇒ creation at publish
    match phase(&output_box) {
        Phase::Voting => {
            ensure(phase(&input_box) == Phase::Voting)?;       // no reopening after SEAL
            ensure(within_window(meta.schedule.start, meta.schedule.end)?)?;
            for op in diff_entries(&input_box, &output_box)? {
                match op {
                    Op::Append(e) => {
                        verify_entry_sig(&e)?;                       // pseudonym self-sig
                        ensure(e.sequence == 1)?;
                        verify_eligibility_witness(&e, &meta)?;      // preimage / Merkle proof
                        ensure_binding_unique(&output_box, &e)?;     // one ballot per key
                        verify_ballot_validity(&e, &meta)?;          // 0/1 per option, per-question
                                                                     //   sum, bound to pseudonym
                    }
                    Op::Replace(old, new) => {
                        ensure(old.pseudonym == new.pseudonym)?;
                        verify_entry_sig(&new)?;
                        ensure(new.sequence == old.sequence + 1)?;
                        ensure(new.sequence <= meta.allowed_updates)?;
                        verify_ballot_validity(&new, &meta)?;
                    }
                }
            }
            ensure_untouched_entries_identical(&input_box, &output_box)?;
        }
        Phase::Sealed => {
            ensure(phase(&input_box) == Phase::Voting)?;
            ensure(output_box.entries == input_box.entries)?;
            // homomorphic sum per (groupTag, option) plus counts — point additions only
            ensure(output_box.sealed == aggregate_by_group(&input_box.entries)?)?;
        }
        Phase::Released => {
            ensure(phase(&input_box) == Phase::Sealed && shard(&input_box) == 0)?; // once, lead shard
            ensure(input_since_at_least(meta.schedule.release)?)?;
            ensure(output_box.entries == input_box.entries)?;
            let shards = load_sealed_shard_deps(&meta)?;           // shards 1..N-1, all Sealed
            let buckets = k_merge(&input_box, &shards, &meta.reporting)?; // each ≥ k, none dropped
            let shares = load_partial_decryptions()?;              // from the witness
            for (bucket, option, agg) in buckets.aggregates() {
                // each D_j DLEQ-checked against Y_j; any t valid shares combined
                let m = combine_partial_decryptions(&agg, &shares, &meta.tally)?;
                ensure(mul_g(output_box.tally.count(bucket, option)) == m)?;
            }
        }
        Phase::Reclaimed => {
            ensure(input_since_at_least(meta.schedule.audit_end)?)?;
            ensure(witness_has_sig(&meta.organizer_lock_hash)?)?;
        }
    }
    Ok(())
}
```

Time checks use `since` on inputs and header deps (median-time granularity —
minutes, which is fine for election schedules; document that boundary times are
approximate to ±~minutes).

**Lower bounds only.** `since` and header deps can prove that a time has been
*reached*, never that it has *not yet passed*: a submitter can always cite an
old header. Every `within_window(start, end)` call above therefore enforces
`start` only. Nothing in a script can stop a ballot landing after `end`. Only a
state change that closes the box can do that — in v2.3 that state change is
SEAL. #TO_BE_IMPROVED# — see §11 item 12.

**Cycle cost.** `verify_ballot_validity` costs several elliptic-curve scalar
multiplications per option, per ballot. `aggregate_by_group` is point
additions only. RELEASE costs one DLEQ check per share, per bucket and option.
None of this has been measured on CKB-VM. #TO_BE_IMPROVED# — §11 item 15 is the
go/no-go.

---

## 8. Capacity & Cost Model

CKB capacity costs **1 CKB per byte** of total cell size.

| Item | Size | Capacity | Refundable |
|---|---|---|---|
| Code Cell (once, all events) | binary ~30–80 KB | ~30–80 K CKB | ❌ burned forever |
| Metadata cell | ~2–4 KB (trustee keys and DKG commitments add ~1 KB) | ~2–4 K CKB | ✅ after audit_end |
| EventFund | deposit | organizer-chosen | ✅ unspent portion |
| Ballot Box base (per shard) | ~200 B | ~200 CKB | ✅ |
| Sealed aggregates (per shard) | groups × (66·n + 8) B | small | ✅ |
| Per ballot (entry data) | ~172 + 66·n B | ~370 CKB at n = 3 | ✅ |
| Validity proofs | ~128·n + 64·q B per ballot, witness only | none | — fee only |
| Tx fees | per byte, sponsored | small vs. capacity, but witnesses now dominate them | — consumed |

**Worked example** — 500-voter invite-key election, one question with three
options, 1 shard, totals only:
Metadata ~3 K + box base ~200 + sealed aggregates ~0.2 K + entries
500 × 370 ≈ 185 K ⇒ organizer locks **~188 K CKB** (v2.2: ~112 K), nearly all
of which returns after the audit window. The UI's cost estimator computes this
from expected voters × entry size, where entry size now depends on the number
of options.

**The Code Cell cost is separate and permanent.** Deployment burns 30–80 K CKB
once, for every event that will ever run under that code hash. It is not an
organizer cost and it is never refunded — freezing the script means the capacity
is locked with it. Whoever deploys pays it. The elliptic-curve and proof code
added in v2.3 makes the binary larger. #TO_BE_IMPROVED# — binary size is
unknown until the script is written; this is the single largest unfunded number
in the project.

#TO_BE_IMPROVED# — measured entry sizes once the ciphersuite is finalized.

---

## 9. Feasibility vs. White Paper (v0.98)

| Requirement | Mechanism | Status |
|---|---|---|
| Integrity & verifiability | All state in typed cells; frozen script; tally verified by the script | ✅ (pending §11 item 15) |
| Ballot secrecy (no ballot ever decrypted) | Homomorphic sum; threshold decryption of k-merged aggregates only | ✅ (trust: fewer than t trustees collude) |
| Ballot validity | Zero-knowledge 0/1 and sum proofs, checked on every APPEND/REPLACE | ✅ (pending §11 item 15) |
| Voter privacy (wallet unlinkable) | Pseudonymous ballots; wallet never on-chain; relay batching kills timing | ✅ |
| Empty-wallet voting, zero cost | Relay sponsorship path A; wallet only derives keys | ✅ |
| EventFund griefing resistance | Relay co-sig lock path; capacity conservation | ✅ |
| No early result peek | Threshold key; RELEASE only after `release` | ✅ (t-of-n collusion caveat, §11 item 14) |
| "Automatic" tallying | Script sums ciphertexts and verifies the decryption | ✅ |
| Revoting with limits | REPLACE transition, sequence counter, checked in-tx; latest ballot only in the sum | ✅ |
| Eligibility (per-voter keys) | Merkle root in Metadata + proof in witness, script-enforced | ✅ (issuer can link a person to participation, not choice; §11 item 11) |
| Voting deadline | SEAL closes the box | ⚠️ when and by whom, §11 item 12 |
| Real-time option totals | Dropped by decision: differencing would reveal batches. Participation counts only | ✅ decided, §11 item 13 |
| k-anonymity | k-merge before decryption (cryptographic for choices); relay batching for participation | ✅ |
| Coercion resistance | Receipts don't reveal choices; PRF keys still coercible | ⚠️ #TO_BE_IMPROVED# |
| Result liveness | Needs t of n trustees | ⚠️ §11 item 14 |
| Storage reclaim | RECLAIM flow after audit_end | ✅ |
| Censorship resistance vs. relay | Self-pay fallback + provable receipts | ✅ (liveness-only trust) |
| Release finalization | Script-verified, terminal RELEASE | ✅ (pending §11 item 15) |

---

## 10. Roadmap

**These are effort estimates, not a schedule.** VoteSecure has no funded
engineers and no deadline. A phase marked "2 weeks" means roughly two weeks of
one focused person's time; when that time arrives depends entirely on who joins.
The public framing — that this is a decade-scale project — is not in tension with
the numbers below; it reflects that most of the elapsed time is spent finding the
people, not doing the work.

**Phase 0 — Unblock (must precede Phase 1).** The three decisions in §11:
items 1, 3 and 12, plus the measurement in item 15. The decisions are not
research problems; each is a decision that Phase 1 cannot be written without.
Item 15 is a go/no-go: if the on-chain checks do not fit the cycle budget, the
tally design changes before any script is written.

**Phase 1 — Script (~3–4 wks effort):** implement lock+type logic for all four
role/kind combinations, including validity-proof verification, SEAL aggregation
and RELEASE decryption checks; ckb-debugger tests for every transition
(APPEND/REPLACE/BATCH/SEAL/RELEASE/RECLAIM, both lock paths), including invalid
ballots, copied ballots and wrong decryption shares; reproducible build; deploy
frozen to testnet; publish code hash.

**Phase 2 — Relay (~2 wks effort):** queue, k-aware batching policy, validity
pre-checks, co-signing, receipts, deadline flush; self-pay fallback in client;
abuse tooling (CAPTCHA/rate limits) behind an interface.

**Phase 3 — Client & crypto (~3 wks effort):** joyIDencrypt-PRF integration;
pseudonym derivation; exp-ElGamal encryption and validity proofs in the
browser; e_personal; "my vote" view + revote; receipts & inclusion proofs.

**Phase 4 — Trustee, release & audit tooling (~2 wks effort):** trustee CLI for
DKG, share storage, partial decryption with DLEQ proofs, and share destruction;
SEAL and RELEASE submitter; open-source verification CLI ("verify this election
in one command": re-check every validity proof, sum, share and count).

**Phase 5 — Hardening (ongoing):** external script and cryptography audit
**before** freezing the mainnet deployment (freezing makes the audit
load-bearing); testnet dry-run elections; then mainnet.

---

## 11. Open Issues (consolidated #TO_BE_IMPROVED#)

**Blocking Phase 1 — decisions, not research:**

1. **Exact ciphersuite freeze** before script freeze: the ElGamal group
   (secp256k1 proposed), the encoding of the validity and DLEQ proofs and their
   Fiat-Shamir transcript, the DKG scheme, and the ECIES curve/KDF for
   `e_personal`. Entry sizes, capacity costs, cycle costs and the audit all
   depend on it. (AES-GCM and the tlock library left the suite in v2.3.) If the
   item 11 path is ever adopted, ballots proven inside a SNARK circuit would
   want a circuit-friendly curve such as Baby Jubjub; weigh that before
   freezing.
2. ~~RELEASE challenge/finalization window~~ — **resolved by design in v2.3**
   (§6.3): RELEASE is verified by the script and terminal, so a disputed or
   repeated tally cannot occur. Reopens if item 15 forces tally verification
   off-chain.
3. **Relay k-aware hold-time policy** and merged-group tag scheme at deadline
   flush. See §4.1.5.

**Research problems — need a person, not a task:**

4. ~~Cryptographic k-anonymity via threshold tallying~~ — **adopted in v2.3**
   (§5.2). Residual: group tags and per-group participation counts are public.
5. Relay federation (multi-relay co-signing) for liveness without a single host.
6. Coercion resistance / plausible-deniability receipts.
7. ~~K_event organizer-peek hardening~~ — **superseded in v2.3**: there is no
   `K_event`. The remaining early-peek risk is *t* colluding trustees, item 14.

**Measurement and engineering:**

8. PRF availability matrix across JoyID authenticators; recovery UX without PRF.
9. Shard sizing, fee growth, and revote compaction — measure on testnet. Entry
   size now grows with the number of options. Candidate optimisation: the box
   keeps a running aggregate per (group, option) and only `hash(e_tally)` per
   entry; REPLACE re-supplies the old ciphertext in the witness, the script
   checks its hash and subtracts it.
10. Code Cell binary size, and therefore the one-time burned deployment capacity.

**Added in v2.2** (numbered after the original ten so existing references stay
valid):

11. **Research — organizer linkability in per-voter-keys mode.** The key issuer
    can link a person to their pseudonym (§5.3). Since v2.3 that reveals
    participation, group and revote count, not the choice. Candidate:
    anonymous membership proof plus nullifier; see
    `concepts/zk-private-voting-concept.md`, whose first milestone is a Groth16
    verification cycle benchmark on CKB-VM.
12. **Decision, blocks Phase 1 — closing the vote.** Scripts cannot enforce
    `end` (§7). v2.3 supplies the closing transition: SEAL, after which APPEND
    and REPLACE are refused. Still to decide: whether SEAL may be submitted from
    `end` (as sketched) or only from `release`, who submits it at `end` and why
    they would, and how the relay's deadline flush (item 3) lands before it.
13. ~~Real-time option totals~~ — **decided 8 Nov 2026: dropped.** White Paper
    v0.96 offered option-level totals during voting. Homomorphic sums would make
    a mechanism possible (trustees decrypt the running sum), but two successive
    decryptions differ by one batch, which reveals that batch's votes and
    breaks the v2.3 rule. During voting, only participation counts are shown
    (entry counts per shard and group, which are public on chain anyway).
    Trustees publish no partial decryption before `release`.

**Added in v2.3:**

14. **Decision, blocks the first live event — trustees.** Who the *n* trustees
    are and what *t* is; how their independence is shown (one person running
    three trustee keys is one trustee); how shares are stored, how partial
    decryptions are published at `release`, and how shares are destroyed
    afterwards; what the UI says when the organizer is also a trustee. Default
    position in this document: if fewer than *t* trustees ever publish, the
    event has no result, and there is no fallback that decrypts anything else.
    Candidate source of independent, staked operators: the CSR registry
    (`concepts/csr-crt-integration.md`, parked). Long-lived risk: ciphertexts
    stay on chain forever, so a share leak years later still decrypts old
    ballots.
15. **Measurement, go/no-go before Phase 1 — cycle cost on CKB-VM** of: the
    validity proof per ballot (sets the maximum batch size), SEAL aggregation
    per shard, and RELEASE share verification per bucket and option. If they do
    not fit, the fallback is to verify proofs and the tally off-chain only,
    which weakens the guarantee from "the script rejects it" to "anyone can
    detect it" and reopens item 2.
