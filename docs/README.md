# VoteSecure — Documentation Map

**As of:** 8 November 2026
**Rule:** this repository is the source of truth for every VoteSecure document.
Copies elsewhere (chat tools, notes, PDFs) are not authoritative. Every topic
has exactly one owning document; other documents summarise it in a sentence or
two and point to the owner.

## Which document owns what

| Topic | Owner | Version |
|---|---|---|
| Technical design: cells, script roles, flows, crypto, capacity, roadmap | [`architecture.md`](architecture.md) | v2.3 |
| **The canonical open-problems list** (items 1–15) | [`architecture.md`](architecture.md) §11 | v2.3 |
| Narrative: purpose, workflows, features, threat summary, limitations | [`white-paper.md`](white-paper.md) | Draft v0.98 |
| Governance, MV, distribution, cohort selection | [`../CHARTER.md`](../CHARTER.md) | Draft v0.1 |
| Public site copy and design | [`site-brief.md`](site-brief.md) | v0.3 |
| Alternative ZK eligibility path (exploratory, open problem 11) | [`concepts/zk-private-voting-concept.md`](concepts/zk-private-voting-concept.md) | 7 Nov 2026 |
| CSR monitor / CRT review (parked; open problems 5, 12, 14) | [`concepts/csr-crt-integration.md`](concepts/csr-crt-integration.md) | 7 Nov 2026 |

## The prototype

| Document | What it covers |
|---|---|
| [`prototype/local-development.md`](prototype/local-development.md) | Running the v1 prototype locally |
| [`prototype/withdrawal.md`](prototype/withdrawal.md) | v1 withdrawal flow |
| [`prototype/third-party-deps.md`](prototype/third-party-deps.md) | CDN libraries the prototype loads (referenced from the privacy notice) |

The prototype implements v1, not v2.3. Its on-chain script accepts every
transaction, and the organiser holds the RSA decryption key.

## Archive (superseded, kept for reference)

| Document | Why it is kept |
|---|---|
| [`archive/architecture-v1.md`](archive/architecture-v1.md) | The design the prototype follows |
| [`archive/claude-code-site-prompt.md`](archive/claude-code-site-prompt.md) | The prompt used to build the site from Site Brief v0.1 |

Older White Paper PDFs and RTFs were removed; they remain in Git history.

## Version history of the design

- **v2.3 (8 Nov 2026):** homomorphic tallying with t-of-n trustees replaces
  drand and `K_event`. No individual ballot is ever decrypted. Open problems 2,
  4, 7 and 13 resolved; 14 (trustees) and 15 (cycle-cost go/no-go) added.
- **v2.2 (7 Nov 2026):** open problems 11 (organiser linkability), 12 (voting
  deadline) and 13 (real-time totals) added.
- **v2.1:** script-role correction, entry-size reconciliation, Code Cell cost.
- **v1:** one cell per ballot. Implemented by the prototype.
