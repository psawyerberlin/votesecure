# VoteSecure

Transparent, tamper-evident, privacy-preserving elections on the Nervos CKB
blockchain. The goal is an election anyone can verify and nobody can link back
to a voter.

> **Status: in development. Nothing here is safe for a real election.**
> The site at [votesecure.net](https://votesecure.net) includes a clickable
> prototype on the CKB **testnet** as its front page. It follows the superseded v1 design, the
> organiser holds the decryption key, and its on-chain script accepts every
> transaction, so it gives no on-chain guarantees. The current design
> (Architecture v2.3) is not implemented yet. Many issues remain open.

## What is unsolved

The canonical list is §11 of [`docs/architecture.md`](docs/architecture.md).
In short:

- Proving eligibility without letting the voter-key issuer see who voted
- Defending anonymity against a ledger that timestamps everything, and closing
  the vote at a deadline the chain cannot see
- Removing the trusted parts: who the tally trustees are, a relay trusted for
  liveness, and whether the proof checks fit on chain at all
- Cost, wallet-free voting, and anchoring results to Bitcoin via RGB++

## Where things are

| Path | What it is |
|---|---|
| [`docs/`](docs/README.md) | **All design documentation. This repository is the source of truth.** Start with `docs/README.md` |
| [`CHARTER.md`](CHARTER.md) | Contributor Charter (governance). `charter.html` is generated from it |
| `index.html`, `web/`, `src/` | The v1 prototype dApp; `index.html` is the site's front page and explains the v2.3 concept (testnet, non-validating) |
| `about.html`, `charter.html`, `impressum.html`, `datenschutz.html`, `assets/` | Project and recruitment pages (static) |
| `PythonSetup/` | v1 on-chain lock script and deployment helper (stub; every check returns success) |
| `scripts/` | `build-charter.mjs`, `build-fonts.mjs`, `package-site.sh` |
| [`DEPLOY.md`](DEPLOY.md) | How to put the site online |

## How the project works

No funding, no deadline, no token, and no owner. Contribution is the only
currency: contributors award each other Merit-Voice (MV) each quarter, a
non-transferable unit that can never be bought. MV decides voting power, capped
at 15% once there are seven or more contributors, and how any future donations
are split. Every award, vote and application is public. The first Merit Round
opens 1 March 2027.

**Contributors wanted:** cryptographers, CKB engineers, frontend and security
engineers, election lawyers and administrators, and people who can write
clearly in a language other than English. See [CONTRIBUTING.md](CONTRIBUTING.md).

---

- Design: Architecture v2.3 · White Paper Draft v0.98 · Charter Draft v0.1
- Steward: Patrick Sawyer (psawyer@gmx.de)
- AI assistance: drafting and code support from Claude, GPT-5 and Grok
- Licence: MIT
- Site: https://votesecure.net (prototype) · project page at `/about.html`
