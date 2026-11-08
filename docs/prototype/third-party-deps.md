# Prototype third-party dependencies — self-hosting TODO

The recruitment site (`/`, `/charter`, `/impressum`, `/datenschutz`) is fully
self-contained: self-hosted fonts, no analytics, no cookies, no third-party
network requests.

The **prototype** under `demo.html` and `web/` is older code and is **not** yet
held to that standard. It still pulls libraries from public CDNs at runtime and
talks to public blockchain infrastructure. This is disclosed to visitors in
`datenschutz.html` ("The prototype at /demo — third-party services").

## What the prototype loads from third parties

| Where | Files in repo | What it does |
|---|---|---|
| `cdn.jsdelivr.net` | `web/voter.html`, `web/organizer.html`, `web/viewElectionDetails.html` (import map + Buffer polyfill) | Loads `@ckb-ccc/core`, `@ckb-ccc/connector-react`, `buffer` |
| `ga.jspm.io` | same files | `es-module-shims` |
| `testnet.ckb.dev` | `src/ckbService_ccc.js`, `web/votesecure_config.json`, `src/votesecure_config.json` | CKB test-network RPC + indexer |
| `pudge.explorer.nervos.org` | `src/ckbService_ccc.js` | Transaction explorer links |

Each of these receives the visitor's IP address and request metadata when the
prototype pages load or are used.

## TODO — remove the runtime CDN dependency

- [ ] Vendor `@ckb-ccc/core` and `@ckb-ccc/connector-react` into the repo (they
      are already dependencies in `package.json`) and serve them from
      `web/vendor/` instead of the import map pointing at jsDelivr.
- [ ] Vendor or inline the `buffer` polyfill and `es-module-shims`; or drop
      `es-module-shims` once the import map points at local files and the target
      browsers support import maps natively.
- [ ] Re-check whether `es-module-shims` is still needed at all.
- [ ] Consider a self-hosted or project-run CKB node endpoint, or at minimum
      document that the RPC endpoint is operator-chosen and swappable.
- [ ] Once done, update `datenschutz.html` — remove the CDN section and the
      "must be reviewed" note, and shorten the prototype disclosure to just the
      blockchain endpoints and the wallet provider.

## Out of scope

Rewriting the prototype's module loading, build, or wallet integration. This is
only about removing third-party *network* dependencies so the privacy notice can
be shortened and the whole domain can be self-contained.
