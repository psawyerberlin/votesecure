# Deploying votesecure.net

The site is static. There is no build step and no server code: the HTML, CSS
and JavaScript in this repository are served as they are, and the prototype
loads the CKB libraries from a CDN. Deployment is a plain file copy to the web
host (Strato).

## Step 1 — prepare the files locally

On any machine with Git and Bash (e.g. WSL):

```bash
git clone https://github.com/psawyerberlin/votesecure.git   # first time only
cd votesecure
git checkout main
git pull
bash scripts/package-site.sh
```

This creates `site-dist/` (and `site-dist.zip`) containing exactly the 27 files
the site needs, with `logo.png` placed at the root where the prototype's wallet
connector expects it. The script stops if `charter.html` is out of date with
`CHARTER.md` (requires Node; fix with `npm run build:charter`) or if a page
links to a file that is not in the package.

## Step 2 — copy to Strato

1. **Back up the live site first.** Download the whole current web root of
   votesecure.net to a dated local folder (e.g. `votesecure-live-2026-11-08/`).
2. Upload the **contents** of `site-dist/` (not the folder itself) into the web
   root, overwriting existing files. Keep the folder structure:

   ```
   /index.html  /charter.html  /demo.html  /impressum.html  /datenschutz.html
   /favicon.svg /logo.png
   /assets/site.css   /assets/fonts/*
   /web/*.html *.css *.js
   /src/*.js
   ```

3. Delete files the new site no longer uses, if they exist on the server:
   `/web/index.css`, `/web/privacy.html`, `/web/terms.html`, and any old
   `/documentation/`, `/docs/`, `/PythonSetup/`, `/PS_Local_Notes/` folders.
   The site must not serve design documents or notes; those live on GitHub.

## Step 3 — check

- `https://votesecure.net/` shows the recruitment page ("Fair and verifiable
  voting on a public blockchain").
- `https://votesecure.net/demo.html` shows the red "incomplete prototype"
  banner; `web/organizer.html` and `web/voter.html` show it too and connect a
  testnet wallet.
- `charter.html`, `impressum.html`, `datenschutz.html` open.
- Hard-refresh (Ctrl+F5) to bypass the browser cache.

## Before go-live (not deployment blockers, but legally relevant)

`impressum.html` and `datenschutz.html` contain placeholders in square
brackets (address, hosting provider, log retention, supervisory authority,
date). Fill them in before announcing the site.
