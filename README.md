# Gas - Stations d'essence du Quebec

A React + TypeScript web app that fetches and displays Quebec gas station data from the Regie de l'energie du Quebec.

## Features

- Fetches gzipped GeoJSON data from `https://regieessencequebec.ca/stations.geojson.gz`
- Decompresses client-side using `pako`
A **map-first, route-based** app (Google-Maps style): full-screen map, a floating
itinerary search, and a bottom sheet listing the cheapest gas along your route.

- **Route search** — enter a From → To itinerary; a driving route is computed
  (OSRM) and stations within a chosen corridor of the route are ranked by price,
  shown as markers on the map and cards in a bottom sheet
- **Turn-by-turn navigation** — press *Démarrer* to start live navigation: the map
  follows your GPS (`watchPosition`), with a maneuver list + current-step
  highlighting, live ETA / distance remaining, the cheapest station still ahead on
  your route, and automatic off-route re-routing
- **Address autocomplete** — Google Places suggestions when a key is configured,
  otherwise free OpenStreetMap/Nominatim suggestions (automatic fallback)
- **Brand logos** per station (see `public/logos/`), with brand-colored fallback badges
- Cheapest station highlighted with a "Meilleur" badge (map + list)
- Installable PWA, mobile-first (phone layout, safe areas, 44px touch targets)

## Data Displayed

| Column | Description |
|--------|-------------|
| Nom | Station name |
| Marque | Brand (Shell, Esso, Costco, etc.) |
| Adresse | Full street address |
| Region | Quebec administrative region |
| Code Postal | Postal code |
| Regulier | Regular gas price (cents/L) |
| Super | Super gas price (cents/L) |
| Diesel | Diesel price (cents/L) |

## Design System

The UI follows a design system generated with the **ui-ux-pro-max** skill
(style: *Vibrant & Block-based*).

- **Palette** — "Event orange + map blue": primary `#EA580C`, accent `#2563EB`,
  cheapest-price highlight `#16A34A`. Full **light + dark** theme via semantic
  CSS tokens in `src/index.css` (toggle in the header, persisted to
  `localStorage`, defaults to the OS preference).
- **Typography** — Fira Sans for UI, Fira Code (tabular figures) for prices so
  columns align.
- **UX** — cheapest station badged "Meilleur", responsive horizontal-scroll
  table, empty state with suggestions, visible focus rings, and
  `prefers-reduced-motion` support.

## Getting Started

```bash
npm install
npm run dev
```

## Configuration

The base map is **Google Maps**, so a Google Maps browser API key is required
(copy `.env.example` to `.env.local`):

```bash
# .env.local
VITE_GOOGLE_MAPS_API_KEY=your-key-here
```

In Google Cloud Console for that key, enable:
- **Maps JavaScript API** — renders the map
- **Places API (New)** — address autocomplete (primary); the app falls back to
  the legacy **Places API**, then OpenStreetMap, if it isn't enabled
- **Geocoding API** — resolving the current location / typed addresses

> It's a *browser* key (ships in the client bundle), so restrict it by **HTTP
> referrer** — include `localhost` for dev and your deployed domain. Address
> autocomplete and geocoding fall back to free OpenStreetMap/Nominatim if a call
> fails, but the **map itself needs the key** (otherwise you'll see a
> "carte indisponible" message).

### Driving camera (optional)

For the Google-Maps-style **tilted, heading-up 3D camera** during navigation,
create a **Vector Map ID** (Cloud Console → *Map Management* → new Map ID, type
*JavaScript* / *Vector*, tilt + rotation enabled) and set it:

```bash
# .env.local
VITE_GOOGLE_MAP_ID=your-map-id
```

Without a Map ID, navigation still follows you (zoomed in, north-up). Note: a
vector Map ID is styled in the Cloud Console, so the app's built-in dark map
style only applies to the default (non-Map-ID) map.

## Install on your iPhone (no App Store)

This is a **PWA** — you install it straight to your Home Screen from Safari; no
App Store, Mac, or Apple Developer account needed. GPS requires HTTPS, so serve
the built app from a secure URL.

1. **Build**: `npm run build` → produces `dist/`.
2. **Host it over HTTPS** (any of these):
   - **Netlify Drop** (easiest): open <https://app.netlify.com/drop> and drag the
     `dist` folder in → you get an instant `https://…netlify.app` URL.
   - or `npx vercel deploy dist --prod`, or GitHub Pages, etc.
3. **On your iPhone**, open that URL in **Safari** → tap **Share** →
   **Add to Home Screen**. Launch it from the new icon — it opens full-screen,
   standalone, with GPS + navigation working.

> If you use a **Google Places** key, add your deployed domain (and `localhost`)
> to the key's HTTP-referrer allowlist in Google Cloud Console, or autocomplete
> falls back to OpenStreetMap on the hosted site. The key is baked into the build
> at `npm run build` from `.env.local`.

For local testing on a phone over your LAN, GPS won't work on plain `http://`;
use the hosted HTTPS URL above (or a tunnel like `cloudflared`).

## Tech Stack

- Vite + React + TypeScript
- `pako` for gzip decompression
- `@tanstack/react-table` for table sorting/filtering/pagination
- `react-leaflet` map view with themed markers (green = cheapest)
- OSRM (public demo API) for driving-route itineraries
- Nominatim (OpenStreetMap) geocoding; optional Google Places autocomplete
- Fira Sans / Fira Code (Google Fonts)
