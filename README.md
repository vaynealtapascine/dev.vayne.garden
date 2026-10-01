![AI Disclosure: Repo code is fully AI-generated. Makes use of anthropic/claude-opus-5.5](assets/ai-transparency-disclosure.png)

# dev.vayne.garden

A small, plain home for our local-first tools, with live copies of dScribe, eo3 and Disclosure Studio, deployed to Neocities.

Live at <https://dev.vayne.garden>.

## What's here

| Path | What |
|---|---|
| `/` | The tools and the things we made before them |
| `/dun/` | Dun reminders and timers, with installer downloads and release information |
| `/drycut/`, `/soundoff/`, `/arbor/` | Short landing pages for the desktop and self-hosted tools |
| `/dscribe/`, `/eo3/`, `/disclosure/` | Live builds of [dScribe](https://github.com/vaynealtapascine/dScribe), [eo3](https://github.com/vaynealtapascine/eo3) and [Disclosure Studio](https://github.com/vaynealtapascine/DisclosureStudio), rebuilt from each repo's `main` |
| `/eo3/about` | EO3 landing page, 14 live workskin examples, and an offline example bundle |
| `/build.json` | Which commit of each app is live |

The pages are hand-written HTML and stylesheets in `site/`. The EO3 about page uses a small script for gallery filters and a workskin on/off comparison; its gallery and downloads also work without JavaScript. Its interactive writing preview is built by EO3 from the same reusable Svelte components as the editor examples. Each example has a writing guide, an editable document, an importable group, plain-text input, and matching HTML and CSS downloads.

## Build

```sh
npm install          # only needed for the screenshot scripts
node scripts/build.mjs            # site/ plus fresh app builds into out/
node scripts/build.mjs --no-apps  # site/ only
node scripts/serve.mjs out 5270   # look at it on http://127.0.0.1:5270
```

`build.mjs` clones each app at a ref, runs its own `npm ci` and `npm run build`, copies `dist/` under the site, and adds a small "← dev.vayne.garden" link to the app's page. Point it at another branch, or a local checkout, with `DSCRIBE_REPO`/`DSCRIBE_REF`, `EO3_REPO`/`EO3_REF` and `DISCLOSURE_REPO`/`DISCLOSURE_REF`.

EO3's build exports its canonical example documents into `dist/workskin-examples`. The site generates the about-page gallery and downloads from that directory. With `--no-apps`, it reuses `.work/eo3/dist/workskin-examples`; set `EO3_EXAMPLES_DIR` to another EO3 checkout's export directory for local authoring. Run a full build once if those exports are missing. Old EO3 refs without the example exports cannot build the new about page.

## Deploy

### Updating Dun downloads

Edit `site/dun/releases.json`: the first entry in `downloads` is the primary download. Each entry contains its platform, architecture, version, publication date, size, file format, installer URL, and release-notes URL. Add an Android entry when a signed APK is published, or replace the Windows entry when its next installer is available. Only list published artifacts; keep older versions accessible through `allReleasesUrl`.

Run `node scripts/dun-releases.mjs` to refresh the checked-in HTML, then commit both files. The normal build also renders this data into `out/dun/index.html`, so the deployed links and metadata always come from the config. Downloads work without JavaScript; the page never depends on a live GitHub API request.

### Site deployment

`.github/workflows/deploy.yml` builds and uploads `out/` with [deploy-to-neocities](https://github.com/bcomnes/deploy-to-neocities):

- **Push to `main`** deploys to dev.vayne.garden.
- **Every hour** it compares each app's `main` with the live `build.json` and deploys only if one has moved, so app changes go live within the hour without any setup in the app repos.
- **Run workflow** (Actions tab) deploys to `dev` or `test` (test.vayne.garden), optionally with other app refs.

It needs the repository secrets `NEOCITIES_DEV_API_TOKEN` and, for test deploys, `NEOCITIES_TEST_API_TOKEN`: each site's API key from Neocities → Settings → API. The upload mirrors `out/` exactly, so anything else on that Neocities site is removed.

## Screenshots

Every screenshot shows the real app doing real work. `scripts/shots/raw/` holds the captures and their inputs; `site/shots/` holds the framed webp versions.

- `capture-web.mjs <dscribe-url> <eo3-url> [disclosure-url]` drives the web apps with Playwright. dScribe downloads its model and describes the sample images on the CPU. The café menu is `raw/garden-cafe-menu.jpg`; the two photos are Windows' bundled wallpapers.
- `capture-window.ps1` captures one desktop app's own window with `PrintWindow`, never the whole desktop. DryCut ran on `raw/still-life.jpg`, a small scene modelled in Blender for it. It's cropped to the work area so the capture leaves out its gallery. SoundOff opened a project made from a two-voice text-to-speech recording and transcribed by its own WhisperX worker, with settings redirected through `SOUNDOFF_SETTINGS_PATH`.
- Arbor's shots come from the Arbor repo.
- `frame.mjs` adds the tinted backdrop and shadow and writes webp. It needs ImageMagick.

## License

MIT. See [LICENSE](LICENSE).
