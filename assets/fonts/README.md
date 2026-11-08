# Fonts

**Public Sans** — SIL Open Font License 1.1, full text in `Public-Sans-OFL.txt`.
Upstream: <https://github.com/uswds/public-sans>.

The `.woff2` files here are **subsets**: only the glyphs used by the site's own
static pages (`index.html`, `charter.html`, `impressum.html`, `datenschutz.html`),
generated from the "latin" `@fontsource/public-sans` woff2 by
`scripts/build-fonts.mjs`.

Regenerate after changing visible copy:

```
npm install
npm run build:fonts
```

Nothing here is loaded from Google Fonts or any CDN — these committed files are
the only fonts the site serves.
