**Executive Summary**

VoteSecure is an open research and engineering project building
transparent, tamper-evident, privacy-preserving elections on the Nervos
CKB blockchain. The goal is an election anyone can verify and nobody can
link back to a voter.

It is not finished. A working prototype runs on a local devnet — ballot
encryption, on-chain submission, deterministic public tallying — but
several problems at the centre of the design are unsolved, and the
current build is not safe for a real election. The open problems are
documented rather than hidden, because they are what we are recruiting
for.

**What is unsolved**
- Proving eligibility without ever putting a voter's identity or wallet on chain
- Defending anonymity against a ledger that timestamps everything
- Removing the remaining trusted parts: a relay trusted for liveness, and drand for tally-key release
- Cost, wallet-free voting, and anchoring results to Bitcoin via RGB++

**How the project works**

No funding, no deadline, no token, and no owner. Contribution is the
only currency: contributors award each other Merit-Voice (MV) each
quarter, a non-transferable unit that can never be bought. MV decides
voting power, capped at 15%, and how any future donations are split.
Every award, vote and application is public. The first Merit Round opens
1 March 2027.

**Contributors wanted:** cryptographers, CKB engineers, frontend and
security engineers, election lawyers and administrators, and people who
can write clearly in a language other than English. See CONTRIBUTING.md.

---
📦 Version: Draft v0.95
📅 Date: <update on commit>
👤 Steward: Patrick Sawyer (psawyer@gmx.net)
🤖 AI assistance: drafting and code support from Claude, GPT-5 and Grok
📄 Licence: MIT
🔗 Repository: github.com/psawyerberlin/votesecure
🌐 Site: https://votesecure.net · prototype at /demo
📋 Governance: CHARTER.md
📄 Design: documentation/Votesecure_White_Paper.pdf
🎯 Audience: people who want to help build verifiable elections, and
   anyone auditing the design
