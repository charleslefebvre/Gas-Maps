# Install "Essence Québec" on your iPhone (Windows → free sideload)

This packages the web app as a native iOS app with **Capacitor**, builds an
**unsigned `.ipa`** on a **cloud Mac (Codemagic)**, and installs it on your
iPhone from Windows with **AltStore** + your **free Apple ID**.

> Trade-off of the free route: the app **stops working after 7 days** until it's
> re-signed (AltStore auto-refreshes it when your phone and PC are on the same
> Wi-Fi). A paid Apple Developer account ($99/yr) removes the 7-day limit — see
> the end.

---

## 1. Put the project on GitHub (one time)

Codemagic builds from a Git repo. From the project folder:

```bash
git init
git add .
git commit -m "Essence Québec"
# create an empty repo on github.com, then:
git remote add origin https://github.com/<you>/essence-quebec.git
git push -u origin main
```

`.env.local` and `ios/` are gitignored — your API key is **not** pushed; you'll
give it to Codemagic securely instead.

## 2. Build the .ipa on Codemagic (cloud Mac, free tier)

1. Sign up at **codemagic.io** and connect your GitHub repo.
2. It detects `codemagic.yaml` → pick the **"Essence — unsigned IPA (AltStore)"**
   workflow.
3. Add an environment-variable **group named `google`** (Teams → Environment
   variables), each marked **Secure**:
   - `VITE_GOOGLE_MAPS_API_KEY` = your key
   - `VITE_GOOGLE_MAP_ID` = your vector Map ID (optional, for the 3D nav camera)
4. **Start new build** → wait ~5–10 min → download **`Essence.ipa`** from the
   build artifacts.

## 3. Let the map work inside the app

The app runs in a WebView whose origin is `capacitor://localhost`. In Google
Cloud Console, on your API key's **HTTP-referrer** restrictions, add:

```
capacitor://localhost
capacitor://localhost/*
```

(Or, for a personal build, temporarily set the key to *no referrer restriction*.)
Keep **Maps JavaScript API**, **Places API (New)**, and **Geocoding API** enabled.

## 4. Install AltStore on Windows, then the app

1. Install Apple's **iTunes** and **iCloud** — the versions from **apple.com**
   (the direct downloads, *not* the Microsoft Store versions). AltServer needs them.
2. Download **AltServer** from **altstore.io**, run it.
3. Plug in your iPhone (trust the computer). AltServer tray icon →
   **Install AltStore → [your iPhone]** → sign in with your **free Apple ID**
   (an app-specific password may be required).
4. On the iPhone: **Settings → General → VPN & Device Management** → trust your
   Apple ID developer profile.
5. Open **AltStore** on the iPhone → **My Apps** tab → **＋** (top-left) →
   pick the **`Essence.ipa`** file → it installs to your home screen.

Launch **Essence Québec** from its icon — full native app, GPS + navigation.

## 5. Keep it alive (the 7-day thing)

- Free Apple ID sideloads expire after **7 days**. AltStore **auto-refreshes**
  apps in the background when your iPhone and the PC running AltServer are on the
  **same Wi-Fi** — leave AltServer running, or open AltStore and tap **Refresh
  All** before it expires.
- Free Apple IDs allow **max 3 sideloaded apps** at once.
- Alternative that doesn't need the PC constantly: **SideStore** (a fork of
  AltStore) refreshes over Wi-Fi without AltServer running.

---

## Caveats

- **GPS**: iOS 15+ WKWebView supports `navigator.geolocation`; the build adds the
  required `NSLocationWhenInUseUsageDescription`. If live navigation misbehaves in
  the wrapped app, the fix is to add the `@capacitor/geolocation` plugin — ask and
  I'll wire it in.
- **Map key referrer**: if the map shows "carte indisponible" in the app, it's the
  referrer allowlist (step 3).
- Every code change = re-run the Codemagic build → reinstall the new `.ipa` via
  AltStore.

## Paid route (no 7-day limit)

With an **Apple Developer account ($99/yr)** you can instead build a signed `.ipa`
and install via **TestFlight** (permanent, no re-signing). Same Capacitor setup —
just different signing in Codemagic + a TestFlight upload step. Ask if you want
that workflow instead.
