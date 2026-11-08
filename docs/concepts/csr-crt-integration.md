# CSR Monitor and CRT for VoteSecure — Parked

**Status:** PARKED on 7 November 2026, to be revisited in a few months.
**Decision:** VoteSecure keeps drand for tally-key release. CRT is not adopted.
**Update 8 Nov 2026:** the drand part of this decision is superseded. Architecture v2.3 removes drand and `K_event` entirely and uses homomorphic tallying with t-of-n trustees. CRT stays not adopted. The CSR registry is now also a candidate source of trustees (open problem 14).
**Repos reviewed:** `ckb-service-runner/csr-network-monitor` (last commit 3 Nov 2026) and `psawyerberlin/ckb-revocable-timelock` (spec v0.1-draft, no code).

## Worth revisiting

### CSR monitor clock cell → open problem 12 (closing the vote)

- The monitor's `csr-config-type` cell holds `clock_ms` and only moves forward.
- A cell dep must be live, so a ballot citing the clock cell proves "now" is at most about one update interval after `clock_ms`.
- That gives the upper time bound that `since` and header deps cannot. APPEND and REPLACE would require `clock_ms ≤ end`.
- **First check when revisiting:** does `csr-config-type` bind `clock_ms` to a real header timestamp, or does it trust the monitor key?
- **Liveness:** a stale clock should count as "closed".

### CSR registry → open problem 5 (relay federation) and 14 (trustees)

- CSR runners are staked (Nervos DAO deposit of at least 10,000 CKB), scored, and published as `FLAG_STAKED` leaves in a weekly stat cell.
- Metadata could name M relay keys chosen from those leaves, with any-of-M co-signing.
- The same leaves could supply independent trustees for the t-of-n election key (v2.3).
- Stake is reputation only: there is no slashing.

### CSR patterns → open problem 3 and relay accountability

- Relays can be probed and scored the way runners are.
- A relay could post a stat-cell-style Merkle root of the ballots it received before the deadline.
- The monitor's ASN and region diversity data could measure whether relays or trustees are really independent.

## Not adopted

### CRT as a drand replacement

- CRT would add chain-time release and a permissionless operator set, with a smaller blast radius per compromise.
- It does not remove the organizer's early peek (open problem 7): the application still generates `K`.
- It does not provide threshold tallying (open problem 4).
- Its cancel feature would let an organizer suppress results, so it would need to be locked off by the VoteSecure script.
- It would cost roughly 3,900 CKB spent per election with 8 nodes, against zero for drand.
- It has no code yet.
- Since v2.3 the question is moot: there is no single tally key left to time-release.
