# Prato Nevoso Live

A single-page website for **Prato Nevoso**, in the Ligurian Alps (Mondolè ski area, Cuneo, Italy).

- ☀️ **Weather** — current conditions and a 7-day forecast (Open-Meteo)
- 📷 **Webcams** — live views from the resort, opened in a modal (list in `data/webcams.json`)
- 🔗 **Links** — news, official sites, and social channels (lists in `data/news.json` and `data/social.json`)

> **A personal project.** This site was made for personal use — quick access to weather, live views, and useful links for the mountain. It is not an official resource and is not affiliated with any organization or company.

---

## How this project was built

**This website is 100% AI-generated.** Every single line — design, markup, style, logic, even this README — was written by **Big Pickle**, an AI agent powered by the **Qwen3.8** model, starting only from a study of an existing multi-page website for the same mountain.

There is no template, no framework, no component library, no build step: just one HTML file, one CSS file, one vanilla JavaScript file, and a few JSON data files. You are looking at the complete result of an AI writing a website from scratch. 🙂

The site is published at **https://pratonevoso.auino.com** from the repository [auino/pratonevoso](https://github.com/auino/pratonevoso).

## Stack

| Layer      | What it is                                                             |
| ---------- | ---------------------------------------------------------------------- |
| Structure  | One static `index.html`                                                |
| Style      | One `css/style.css` (CSS variables, no framework)                     |
| Logic      | One `js/app.js` in vanilla ES6, no dependencies, no bundler            |
| Data       | `data/webcams.json`, `data/news.json`, `data/social.json`              |
| Weather API| [Open-Meteo](https://open-meteo.com) (free, no API key, CC BY 4.0)     |
| Fonts      | Google Fonts (Inter + Instrument Serif), with system fallbacks         |

There is no server-side code and no build toolchain — everything runs in the browser.

## Run it locally

Because the lists (webcams, news, social) are loaded with `fetch()`, the page needs to be served over HTTP (browsers block `fetch` on `file://`):

```bash
cd pratonevoso_singlepage
python3 -m http.server 8080
# → http://localhost:8080
```

Or, if you prefer Docker (like the sibling project):

```bash
docker run -d -p 8080:80 -v "$PWD":/usr/share/nginx/html:ro nginx:alpine
```

Both the `run.sh` provided here and the Docker option work out of the box.

## Publish it on GitHub Pages

The site is published (and can be republished) at **[auino/pratonevoso](https://github.com/auino/pratonevoso)** — live at **https://pratonevoso.auino.com**.

All paths in the site are **relative**, so it works at any URL:

1. The repository is [`auino/pratonevoso`](https://github.com/auino/pratonevoso); this folder is the site root.
2. Publish it (GitHub Pages or any static host) from the `main` branch, root `/`, with the dedicated domain `pratonevoso.auino.com`.
3. The site is live at `https://pratonevoso.auino.com`.

No configuration is needed for GitHub Pages. Weather data and the JSON lists are fetched at runtime; everything else is static.

## Project structure

```
pratonevoso_singlepage/
├── index.html          # the only page
├── css/style.css       # all styles
├── js/app.js           # all logic (weather, webcams, links, modal)
├── data/
│   ├── webcams.json    # webcam list (loaded dynamically)
│   ├── news.json       # news / useful links (loaded dynamically)
│   └── social.json     # social channels (loaded dynamically)
├── favicon.svg
└── README.md
```

## How the webcams work (same approach as the original site)

The list lives in `data/webcams.json` and is fetched at runtime. Each entry supports three kinds of `embed`:

- **`https://...` to an HTML page** (e.g. a Panomax 360° viewer) → loaded in an `<iframe>`
- **`https://...jpg|png|...`** → a still image with optional cache-busting via the `time` field
- **`<...>` raw HTML** (e.g. an image link wrapping the webcam) → injected into the modal

Entries with `"enabled": false` are hidden. Each webcam is also reachable via a deep link you can share: `index.html#webcam-0`, `index.html#webcam-1`, … (matching its position in the filtered list). Thumbnails are refreshed every 5 minutes with a cache-busting parameter; if a thumbnail fails to load, the entry's `thumbFallback` (or a camera placeholder) is shown.

```json
{
  "enabled": true,
  "label": "La Conca",
  "desc": "Panoramica 360° in paese",
  "embed": "https://pratonevoso.panomax.com/conca",
  "thumb": "https://live-image.panomax.com/cams/11813/recent_reduced.jpg",
  "thumbFallback": "https://panodata.panomax.com/cams/11813/preview_og.jpg",
  "credit": "Prato Nevoso S.p.A.",
  "creditUrl": "https://pratonevoso.com/inverno/live/webcam/",
  "time": null
}
```

## How to adapt this site to another place

The page is location-agnostic by design. Three files do all the work:

### 1. The place itself — `js/app.js` (top of file)

```js
const LOCATION = {
  name: 'Prato Nevoso',
  lat: 44.256097,      // ← new coordinates
  lng: 7.792604,
  altitude: 1500,
  timezone: 'Europe/Rome',
  locale: 'it-IT'
};
```

Every request to Open-Meteo, every clock, every date and label follows from this object. Change `timezone` (IANA name) and `locale` (e.g. `en-US`) and the whole page re-localizes.

### 2. The webcams — `data/webcams.json`

Replace the entries with the cams of the new area (same schema, including `thumb` / `thumbFallback` / `enabled`).

### 3. The links — `data/news.json` and `data/social.json`

- `news.json`: `title`, `url`, optional `description`, `mark` (2–3 letter logo if the item has no icon), `tag`, `enabled`.
- `social.json`: `title`, `url`, `handle`, `icon` (one of `instagram`, `facebook`, `youtube`, `telegram`, or `globe`), `enabled`.

### 4. The name in the markup — `index.html`

The town name appears in the header brand, the hero (`<h1>`), the meta description, and the footer. Search for "Prato Nevoso" and replace — there is no other hardcoded reference to the place.

> **Tip:** the weather cache key is fixed (`pn-live-weather-v1`). If you ever run two variants side by side, bump the key so they don't share `localStorage`.

## Privacy & licensing notes

- **Weather data** © Open-Meteo (CC BY 4.0) — the attribution is shown in the page footer and next to the data.
- The site is **independent and made for personal use**: it is not affiliated with any organization (stated in the footer). Webcam names and credits belong to their owners and are displayed with source links.
- No tracking, no cookies, no analytics: the only third parties are the APIs listed above and the webcam providers.

---

*Built with 💚 by Big Pickle + Qwen3.8 — 2026 · [github.com/auino/pratonevoso](https://github.com/auino/pratonevoso)*
