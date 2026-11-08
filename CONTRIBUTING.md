# Contributing to VoteSecure

Thank you for looking. VoteSecure is unfunded and volunteer-run. Read the
[Charter](CHARTER.md) before you invest time: nobody is paid, and Merit-Voice
(MV) can never be bought.

## Ways in

1. **Apply to the founding cohort.** Open a
   [founding application](https://github.com/psawyerberlin/votesecure/issues/new?template=founding-application.yml).
   Applications are public. The first Merit Round opens 1 March 2027.
2. **Pick an open problem.** The canonical list is §11 of
   [`docs/architecture.md`](docs/architecture.md). Open an issue named after the
   problem number (for example "Open problem 15: cycle cost on CKB-VM") before
   you start, so work is not duplicated.
3. **Critique the design.** Issues that find a flaw in the architecture, the
   White Paper or the Charter are as valuable as code.

## Rules for documents

- Every topic has exactly one owning document; see [`docs/README.md`](docs/README.md).
  Other documents summarise and link, they never restate detail.
- Open problems keep their numbers forever. New ones are appended; resolved
  ones are struck through, not removed.
- Mark unfinished points with `#TO_BE_IMPROVED#`.

## Rules for code

- The prototype in `web/` and `src/` follows the superseded v1 design. Fixes
  there are welcome but are not the priority.
- The site is static. Do not add a backend, analytics, cookies or CDN fonts
  (see [`docs/site-brief.md`](docs/site-brief.md) §7).
- After editing `CHARTER.md`, run `npm run build:charter`.

## Licence

By contributing you agree that your contribution is released under the
[MIT licence](LICENSE).
