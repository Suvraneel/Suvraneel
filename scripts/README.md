# How this profile is built

Everything on the profile is drawn from the portfolio's own design system
([suvraneel.github.io](https://github.com/Suvraneel/suvraneel.github.io)): the black
ground, the `#1BFCD7` accent, the cyan-violet seed texture showing through
Space Boards headings, TASA Orbiter for text, and the liquid-metal button rim.
Text is drawn as SVG outlines, so it renders the same everywhere an `<img>` can.

| Piece | Built by | When |
| :-- | :-- | :-- |
| `assets/brand/*` section headers (dark + light), buttons, skills board, footer, activity icons | `node scripts/build-brand.mjs` | By hand, when copy or style changes |
| `assets/generated/*` contributions, by the numbers, languages, LeetCode | `node scripts/build-stats.mjs` | `profile.yml`, every 6 hours |
| "Recent activity" table in `README.md` | `node scripts/update-activity.mjs` | `profile.yml`, every 6 hours |
| `assets/metrics/*` isometric calendar, followers | `lowlighter/metrics` | `metrics.yml`, daily |
| Link and image check | `lycheeverse/lychee-action` | `readme-health.yml`, weekly; opens an issue |

All scripts are plain Node 20+ with no dependencies.

## Common edits

- **Headers, buttons or skills board**: edit `scripts/build-brand.mjs`, run it, commit `assets/brand`.
- **Copy in the README body**: edit `README.md` directly. Keep the
  `<!--START_SECTION:activity-->` / `<!--END_SECTION:activity-->` markers.
- **Hide a language from the card**: `HIDDEN_LANGUAGES` in `scripts/build-stats.mjs`.
- **Refresh now**: Actions → *Profile cards* → *Run workflow*.

## Previewing locally

```sh
node scripts/build-brand.mjs
GH_TOKEN=$(gh auth token) node scripts/build-stats.mjs --save /tmp/profile.json
node scripts/build-stats.mjs --fixture /tmp/profile.json      # re-render offline
GITHUB_TOKEN=$(gh auth token) node scripts/update-activity.mjs --dry
```

## Spotify card

The "On repeat" card comes from [spotify-github-profile](https://github.com/kittinan/spotify-github-profile).
Spotify refresh tokens now expire 6 months after you sign in, so the card stops
working twice a year. When `readme-health.yml` reports it, reconnect at
<https://spotify-github-profile.kittinanx.com/api/login> with the same Spotify
account; the URL in `README.md` does not change.

## Secrets

- `METRICS_TOKEN`: a personal access token (classic, `read:user`) used by both
  `profile.yml` and `metrics.yml`. Without it the cards still render from the
  built-in token, but private contribution counts are left out.
- `API_TOKEN_GITHUB` is no longer used and can be deleted.

## Fonts

`scripts/fonts/*.json` are outline tables cut from the portfolio's fonts by
`scripts/fonts/extract_glyphs.py`. TASA Orbiter is licensed under the SIL Open
Font License 1.1. Space Boards is the portfolio's display face (demo licence),
used here only as outlines for this personal profile. Logos in the stack come from
[Simple Icons](https://simpleicons.org) (CC0).
