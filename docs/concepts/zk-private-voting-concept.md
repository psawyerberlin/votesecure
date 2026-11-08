# Private Voting on Nervos CKB — Prototype Concept

**Status:** Concept / prototype design
**Target:** CKB L1 (devnet → testnet), no protocol changes
**Primitive:** Anonymous membership + nullifier (Semaphore-style), verified by a Groth16 verifier running as a CKB type script

---

## 1. Goal

Let a defined group of eligible voters cast exactly one vote each in an election, such that:

- **Eligibility:** only registered voters can vote.
- **Uniqueness:** each voter can vote at most once per election.
- **Anonymity:** nobody, not even the organizer, can link a vote to a voter.
- **Verifiability:** anyone can recompute the tally from chain data and check every ballot proof.
- **No fork:** everything is built from cells, scripts and witnesses.

This is the same core as a Zcash shielded pool (membership proof in a commitment tree plus a nullifier), but without value transfer. That makes it a good first step toward a full shielded pool.

### Out of scope for the prototype

- **Receipt-freeness / coercion resistance:** a voter can prove how they voted.
- **Hidden running tally:** in Phase 1 the vote choice is public; only the voter's identity is hidden. Phase 2 covers encrypted ballots.
- **Network-level anonymity:** IP and timing protection is left to a relayer and Tor.

---

## 2. Roles

| Role | Responsibility |
|---|---|
| **Organizer** | Creates the election, freezes the voter registry, funds the ballot box, finalizes the election |
| **Voter** | Holds a secret key `sk`, registers a commitment, generates a proof, submits a ballot |
| **Relayer** (optional, permissionless) | Wraps the ballot in a CKB transaction and gets paid from the ballot box, so the voter needs no CKB of their own and leaks no address |
| **Anyone** | Indexes the chain, verifies proofs and the tally |

---

## 3. Cryptographic Construction

### 3.1 Voter identity

```
sk          : random field element (BN254 scalar), kept by voter
commitment  = Poseidon(sk)
```

The organizer collects commitments, for example after verifying identity off-chain, and builds a **Poseidon Merkle tree** of depth `D` (prototype: `D = 16`, up to 65,536 voters).

```
voter_root  = MerkleRoot(commitments)
```

The organizer knows which person submitted which commitment, but never learns `sk`. It therefore cannot compute nullifiers or link ballots to people.

### 3.2 Nullifier

```
election_id = type_id of the Election cell (32 bytes, truncated into a field element)
nullifier   = Poseidon(sk, election_id)
```

The nullifier is deterministic per voter and election, so a second vote produces the same nullifier and is rejected. Nullifiers from different elections can't be linked to each other.

### 3.3 Ballot circuit (Groth16, BN254)

**Public inputs**

| Name | Meaning |
|---|---|
| `voter_root` | Registry root frozen in the Election cell |
| `election_id` | Binds the proof to this election |
| `nullifier` | One-vote-per-voter tag |
| `choice` | Option index `0..n_options-1` (Phase 1: public) |
| `binding` | `Poseidon(relayer_lock_hash, max_fee)`, which prevents relayer substitution and front-running |

**Private inputs**

`sk`, Merkle path `(siblings[D], path_bits[D])`

**Constraints**

1. `leaf = Poseidon(sk)`
2. `MerkleVerify(leaf, path, voter_root) == true`
3. `nullifier == Poseidon(sk, election_id)`
4. `choice < n_options` (range check; `n_options` can be hard-coded or a public input)
5. `binding` is constrained as `binding * binding` (dummy square), so tampering with it invalidates the proof

The expected size is roughly 5k–10k constraints at depth 16, so proof generation in a browser takes seconds.

### 3.4 Nullifier set

On CKB you can't prove that a cell does **not** exist, so nullifiers can't be stored one per cell. Instead:

- The ballot box cell stores `nullifier_smt_root`, the root of a **Sparse Merkle Tree** (`sparse-merkle-tree` crate, blake2b, already used in the CKB ecosystem).
- Each ballot carries an SMT non-membership-and-update proof in the witness.
- The script verifies that the key `nullifier` was empty under the old root and holds `1` under the new root.

---

## 4. On-Chain Layout

### 4.1 Cells

```
┌──────────────────────────┐        ┌─────────────────────────────┐
│ Election Config Cell     │◄─dep───│ Ballot Box Cell (singleton) │
│ type: election-config    │        │ type: ballot-box            │
│ lock: organizer          │        │ lock: always-success*       │
│ data: params (frozen)    │        │ data: nullifier root, tally │
└──────────────────────────┘        └─────────────────────────────┘
          ▲                                        ▲
          │ dep                                    │ dep
┌──────────────────────────┐        ┌─────────────────────────────┐
│ Verifier Binary Cell     │        │ Verifying Key Cell          │
│ (ballot-box script code) │        │ data: Groth16 VK            │
└──────────────────────────┘        └─────────────────────────────┘
```

\* The ballot box lock is effectively "anyone can spend", because all rules live in the type script. The type script must therefore also forbid destroying the cell (see 5.2).

### 4.2 Election Config Cell — `data`

| Field | Size | Notes |
|---|---|---|
| `version` | 1 B | |
| `voter_root` | 32 B | Poseidon root, field element LE |
| `n_options` | 1 B | ≤ 16 in the prototype |
| `vote_start` | 8 B | Block number (or epoch) |
| `vote_end` | 8 B | Block number (or epoch) |
| `vk_hash` | 32 B | blake2b of the verifying key cell data |
| `max_fee_per_ballot` | 8 B | Shannons the relayer may take per ballot |
| `organizer_lock_hash` | 32 B | Who may finalize |

**Type script:** `election-config` with Type ID semantics, so `args` = type_id = `election_id`. It is immutable once created: any transaction that consumes the cell must reproduce identical data, or the cell may only be destroyed after `vote_end + grace`.

### 4.3 Ballot Box Cell — `data`

| Field | Size | Notes |
|---|---|---|
| `election_id` | 32 B | Must match the config cell |
| `nullifier_smt_root` | 32 B | Starts as the empty-SMT root |
| `ballot_count` | 4 B | |
| `tally[n_options]` | 4 B × n | Phase 1: plaintext counters |
| `phase` | 1 B | `0 = open`, `1 = finalized` |

**Capacity** = cell occupied capacity plus a **fee reserve** the organizer deposits. Relayers are paid out of this reserve.

### 4.4 Ballot transaction

```
cell_deps:   ballot-box script code, VK cell, Election Config cell
header_deps: (optional) recent header to check vote window
inputs:      [0] Ballot Box (old)
outputs:     [0] Ballot Box (new)
             [1] Relayer payout cell  (lock = relayer_lock_hash)
witnesses:   [0] { proof, choice, nullifier, relayer_lock_hash, max_fee,
                   smt_proof }
```

There are no other inputs, so the voter's address never appears on chain.

---

## 5. Script Logic

### 5.1 `ballot-box` type script — voting path (`phase == 0`)

1. Load exactly one ballot-box cell in Group Input and one in Group Output, both with the same type script.
2. Load the Election Config from `cell_deps` by type hash, using `election_id` from the ballot box data.
3. **Window check:** ensure `vote_start ≤ current ≤ vote_end`. The prototype uses a `since` constraint on input 0 (absolute block number ≥ `vote_start`) plus a `header_deps` check against `vote_end`.
4. Load the VK from `cell_deps` and check `blake2b(vk) == vk_hash`.
5. Parse witness 0 and build the public inputs `[voter_root, election_id, nullifier, choice, Poseidon(relayer_lock_hash, max_fee)]`.
6. **Verify the Groth16 proof.** Reject if invalid.
7. **SMT:** verify the non-membership of `nullifier` under the old root, and that inserting it yields the new root in the output data.
8. **Tally:** the output must equal the input except `tally[choice] += 1` and `ballot_count += 1`.
9. **Capacity:** require `out.capacity ≥ in.capacity − max_fee`, `max_fee ≤ max_fee_per_ballot`, and that output 1 pays `relayer_lock_hash`. The transaction fee itself also comes out of the box's capacity difference.

### 5.2 Finalization path

- Allowed only when `current > vote_end`.
- At least one input must have `lock_hash == organizer_lock_hash`.
- The output ballot box keeps its `tally` and `nullifier_smt_root` unchanged and sets `phase = 1`. The leftover fee reserve can be withdrawn down to the cell's occupied capacity.
- **Destroying** the ballot box (no matching output) is rejected in every phase. The final result stays on chain as a permanent record. A cleanup path after a long grace period is an optional extension.

### 5.3 Why this is safe with an "anyone-can-spend" lock

The type script runs on both input and output, so the only ways to change the cell are a valid ballot (one nullifier, +1 on one counter, bounded fee) or an organizer-signed finalization after the deadline. A malicious party can at most consume the cell with a valid state transition, which is the intended behavior.

---

## 6. Off-Chain Components

| Component | Tech (prototype) |
|---|---|
| **Circuit** | Circom 2 + circomlib Poseidon/Merkle, Groth16 via snarkjs (phase-2 ceremony for this circuit only; Powers of Tau reused) |
| **On-chain verifier** | Rust `no_std` on `riscv64imac`, `ckb-std`; BN254 pairing via `substrate-bn` or `ark-bn254` + `ark-groth16` (`no_std`); Poseidon is not needed on-chain because all Poseidon work stays in the circuit |
| **SMT** | `sparse-merkle-tree` crate (blake2b), shared by script and client |
| **Registry builder** | CLI that collects commitments, builds the Poseidon tree and publishes the leaf list (for example on IPFS) so voters can compute their Merkle path |
| **Voter client** | Web page: generate or store `sk` (or derive it from a JoyID/wallet signature), fetch leaves, compute the path, build the proof in browser (snarkjs WASM), send to the relayer |
| **Relayer** | Small service (Node/TS + Lumos or CCC): queues ballots, fetches the live ballot box cell, builds the SMT proof against the current root, assembles the tx and submits. **It batches:** one ballot per tx, sequentially, re-basing on the latest root |
| **Indexer / tally viewer** | Reads all ballot box transactions, re-verifies each proof off-chain and displays the tally |

### 6.1 Contention

The ballot box is a singleton, so it can only be consumed once per block (~8–10 s). That is fine for a prototype with up to a few hundred voters per hour. The relayer serializes ballots, and voters never handle contention themselves.

**Scale-up options (later):**
- **Batch ballots:** one transaction carries *k* proofs and *k* SMT insertions.
- **Aggregated proof:** a recursive or SP1 proof over many ballots is verified once on chain.
- **Ballot cells + tally proof:** each ballot is its own cell, and the final tally is a single proof that dedups nullifiers. This avoids contention entirely, but needs a heavier final proof.

---

## 7. Phase 2 — Secret Running Tally (optional)

Replace the public `choice` with an **exponential ElGamal ciphertext** per option, under a threshold public key held by *t-of-n* trustees.

- The circuit additionally proves that each ciphertext encrypts 0 or 1 and that the plaintexts sum to 1.
- The ballot box stores the **homomorphic sum** of ciphertexts instead of plaintext counters. The curve must be in-circuit friendly, for example Baby Jubjub.
- At finalization, the trustees publish partial decryptions with a correctness proof, and the script (or anyone, off-chain) checks the decrypted tally.

This hides intermediate results, at the cost of a bigger circuit and more cycles.

---

## 8. Threat Model & Known Limitations

| Threat | Mitigation / status |
|---|---|
| Ineligible voter | Merkle membership proof against the frozen `voter_root` |
| Double vote | Nullifier + SMT non-membership |
| Organizer links votes to people | Organizer never sees `sk`; nullifier needs `sk` ✔ |
| Organizer registers fake voters | Publish the registry leaf list and count; social or external audit. **Not solved cryptographically** |
| Relayer censors | Permissionless: anyone can run a relayer or submit directly |
| Relayer steals the fee or redirects the payout | `binding` public input ties the payout lock and max fee to the proof |
| Front-running / proof replay | The same nullifier is rejected; `binding` stops the payout being swapped |
| Timing correlation (voter IP ↔ ballot) | Submit via Tor or with delays; relayer mixes the order. **Partial** |
| Small anonymity set | Privacy is only as strong as the number of voters; warn when the set is small |
| Trusted setup compromise | Circuit-specific Groth16 phase 2. A compromised setup allows forged ballots (not deanonymization). Alternative: PLONK with universal setup, or a STARK at higher witness cost |
| Coercion / vote selling | Not addressed (voter can reveal `sk`). Out of scope |
| Fee reserve drained | Each ballot can take at most `max_fee_per_ballot`, so the reserve is sized as `n_voters × max_fee` |

---

## 9. Cycle & Size Budget (to be benchmarked)

| Item | Estimate | Note |
|---|---|---|
| Groth16 verify (BN254, 5 public inputs) | **TBD — benchmark first** | Expected tens to a few hundred M cycles in pure RISC-V; must stay well under the per-tx max |
| SMT update proof (depth 256, compiled) | small (< 1–2 M cycles) | blake2b is cheap |
| Proof size | 128–256 B | Groth16: 2×G1 + 1×G2 (compressed 128 B) |
| Witness total | ~0.5–2 KB | proof + SMT proof + fields |
| Ballot box cell | ~200 B + capacity reserve | |

**First milestone is purely this benchmark.** If pairing cost is too high, options are: BLS12-381 libraries with assembly optimisations from the CKB ecosystem, switching to a cheaper proof system, or the SP1-based path.

---

## 10. Repository Layout (proposal)

```
ckb-private-voting/
├── circuits/
│   ├── ballot.circom
│   ├── test/                 # circuit unit tests (circom_tester)
│   └── setup/                # ptau + zkey, vk.json export
├── contracts/
│   ├── election-config/      # Rust, ckb-std, Type ID
│   ├── ballot-box/           # Rust, Groth16 verifier + SMT + tally logic
│   └── tests/                # ckb-testtool integration tests
├── crates/
│   ├── vk-codec/             # vk.json -> compact on-chain bytes
│   └── smt-shared/           # SMT config shared by script and client
├── relayer/                  # TS service (CCC or Lumos)
├── voter-web/                # browser client, snarkjs WASM
├── tools/
│   ├── registry-builder/     # Poseidon tree from commitments
│   └── tally-verifier/       # independent tally recomputation
└── docs/
    └── concept.md            # this document
```

---

## 11. Milestones

1. **M0 — Verifier benchmark:** Groth16 BN254 verify of a dummy circuit in `ckb-testtool`; measure cycles. Go/no-go.
2. **M1 — Circuit:** `ballot.circom` with tests; trusted setup for the devnet only.
3. **M2 — Contracts:** `election-config` + `ballot-box` (voting path only); full test coverage including negative cases (double vote, wrong root, out-of-window, fee over limit, cell destruction).
4. **M3 — Finalization path** + tally verifier tool.
5. **M4 — Relayer + web client** on a local devnet (`offckb`), end-to-end with ~20 voters.
6. **M5 — Testnet deployment**, public demo election, external review of the circuit and scripts.
7. **M6 (optional) — Phase 2:** encrypted ballots with threshold decryption.

---

## 12. Open Questions

- Use the block number or the epoch for the vote window? Epoch is friendlier to `since`; block number is simpler for UX.
- Derive `sk` from a JoyID or wallet signature (convenient, but ties privacy to wallet key hygiene) or generate it randomly (needs a backup)?
- Should registration itself be on-chain (a registry cell with commitment appends before `vote_start`) to make the voter list publicly auditable?
- Groth16 per-election setup vs PLONK universal setup: which trade-off is acceptable for a public demo?
- How do we plan the path from here to a value-carrying shielded pool, where the same nullifier and SMT machinery is reused with note commitments?


---

## Appendix — Relation to VoteSecure v2.1/v2.2 (review, 7 Nov 2026)

**Verdict:** This concept fits VoteSecure as an alternative eligibility and anonymity layer for v2.1's per-voter-keys mode and as the on-ramp to open problem #4. It does not replace v2.1. Most of the chain-side mechanics are already the same.

### Where it matches v2.1

| Topic | v2.1 | This concept |
|---|---|---|
| Platform | CKB L1, no fork | Same |
| Shared state | Ballot Box singleton per shard, relay serializes | Ballot Box singleton, relayer serializes |
| Relay trust | Liveness only, self-pay escape hatch | Liveness only, anyone can submit directly |
| Voter wallet on chain | Never | Never |
| Fees | EventFund pays, capacity conservation | Fee reserve in box, `max_fee_per_ballot` bound |
| Time window | `since` + header deps | `since` + header deps |
| Non-goals | Coercion, network-level anonymity, organizer fake registrations | Same three |

### What it adds that v2.1 lacks

1. **Anonymity against the organizer in per-voter-keys mode.** In v2.1 the voter proves a Merkle path to a known leaf, and `pseudonym_binding = hash(preimage ‖ pseudonym)`. Whoever issued the preimages can test which pseudonym each key produced, so the organizer can link a voter to a ballot. The Semaphore-style proof hides the leaf entirely. This is a real v2.1 gap that is not on the open-problems list today.
2. **Much lower capacity per ballot.** The box stores only an SMT root and counters (~200 B fixed). Proofs live in witnesses. That removes the ~220 CKB locked per ballot and the ~1,300-ballot shard ceiling.
3. **No RELEASE dispute in Phase 1.** The tally is updated by the script on every ballot, so blocker #2 (RELEASE finalization window) does not arise.
4. **Phase 2 matches open problem #4.** Threshold ElGamal with final-only decryption is the Helios-style flagship, and it agrees with the VoteConcept position that no election key should ever be published in full.

### Where it conflicts with v2.1

1. **Running tally is public in Phase 1.** v2.1 seals results until the drand round. A plaintext live tally is weaker than v2.1 for any real election, so Phase 1 is only acceptable as a prototype step.
2. **No revote.** A fixed nullifier blocks v2.1's REPLACE transition. Supporting revote would need a different construction (for example a nullifier per sequence number plus a proof that the old one is cancelled), which is research work.
3. **No "show me what I voted".** There is no `e_personal`. A local receipt could cover this off-chain.
4. **No reclaim.** Destroying the box is forbidden, so its capacity stays locked forever. v2.1's economics assume RECLAIM after `audit_end`. A cheap fixed-size box makes this less painful, but the two designs need to agree.
5. **Trusted setup.** Groth16 needs a circuit-specific ceremony. With a frozen script this ceremony is effectively frozen too, so it joins the audit-before-freeze list.
6. **Ciphersuite.** BN254, Poseidon and the SMT hash would join blocker #1 (ciphersuite freeze).

### Issues in the concept itself

- **The vote_end check does not work as written.** `since` and `header_deps` can only prove a lower bound on time: a submitter can always reference an old header. Ballots after `vote_end` can be stopped only by finalization freezing the box. Late ballots between `vote_end` and finalization stay possible unless finalization is permissionless and incentivized right at the deadline. The same limit applies to v2.1's window checks and should be stated there.
- **§6 contradicts itself.** It says the relayer "batches" and then describes one ballot per transaction. Pick one. Batching k proofs per transaction is listed under scale-up.
- **Groth16 verify cost on CKB-VM is unknown.** M0 is correctly the go/no-go gate.

### Follow-up

- Done in Architecture v2.2: the organizer-linkability gap is open problem 11,
  and the missing upper time bound is open problem 12 (applies to both designs).
- M0 (Groth16 cycle benchmark) is referenced from open problem 11 as the first
  step of this path; it is tracked here, not as a separate open problem.
