# Notching

Your notch, put to work. Free, open source, no ads, no tracking.

Notching turns the MacBook notch into a calm panel for the small tools you reach for every day. Hover the notch and it opens. Move away and it closes.

## Download

1. Download `Notching_x.y.z_aarch64.dmg` from the latest [Release](https://github.com/HamdaniAsril/notching/releases/latest).
2. Open the DMG and drag Notching into Applications.

The app is signed with an Apple Developer ID and notarized by Apple, so it opens like any other Mac app.

Requirements: macOS 13 or later on Apple Silicon (M1 or newer). It also works on Macs without a notch and on external displays.

## What's inside

**Pages.** The pill under the notch holds your pages. Beranda (home) comes first, and you can add your own pages built from widgets, each with its own icon.

**Widgets.** One row of four columns per page:
- Time: clock, clock + date, analog clock, calendar, day of year, this week, world clock.
- Around: weather, hourly weather, air, moon, sun.
- Prayer times (Kemenag RI method) and reminders.
- Focus: breathing, work hours.
- Music: what's playing, with controls.
- Timer.

**Modules.** One tap away on the Modul page:
- **Timer.** A countdown, shown beside the notch.
- **Keep awake.** Keeps your Mac awake.
- **Keyboard Cleaning Mode.** Locks the keyboard so you can wipe it.
- **Mirror.** Checks your camera before a meeting.
- **Shelf.** Drop files on the notch, drag copies out anywhere.
- **Screenshot.** Screen, window or area, with an editor.
- **Cleaner.** Clears caches and removes apps with their leftovers. Everything goes to the Trash first.
- **System stat.** CPU, memory, network.

## Privacy

Notching has no account and sends no analytics. The only network calls go to [Open-Meteo](https://open-meteo.com) for weather, air and city search. Everything else stays on your Mac.

Some modules need a macOS permission, which you grant in System Settings:
- Screen Recording for Screenshot.
- Accessibility for Keyboard Cleaning Mode.
- Full Disk Access for Cleaner.
- Camera for Mirror.

## Build from source

You need Node.js 20+, Rust (stable) and Xcode Command Line Tools.

```bash
npm ci
npm test
npm run tauri dev
```

To build the app and the DMG:

```bash
npm run tauri build
```

The output lands in `src-tauri/target/release/bundle/`.

## Releasing

Releases are built by [GitHub Actions](.github/workflows/release.yml) from a version tag:

1. Bump the version in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and the `notching` entry in `src-tauri/Cargo.lock`.
2. Commit, then `git tag vX.Y.Z && git push origin main vX.Y.Z`. The tag must equal the version.
3. CI runs the tests, builds for Apple Silicon, signs with Developer ID, notarizes, and attaches the DMG to a draft release.
4. When the run is green, publish it: `gh release edit vX.Y.Z --draft=false`.

The workflow needs these repository secrets: `APPLE_CERTIFICATE` (base64 `.p12`), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_TEAM_ID`, `APPLE_ID` and `APPLE_PASSWORD` (an app-specific password).

## Project layout

- `src/`: the notch, settings window and shared kit (TypeScript).
- `src-tauri/`: the native side (Rust, Tauri 2 with tauri-nspanel).
- `modules/`: each module or widget pack is a web package with a `manifest.json`.
- `docs/superpowers/`: design documents, plans and verification notes, written in Indonesian.

## License

[MIT](LICENSE)

---

**Bahasa Indonesia.** Notching mengubah notch MacBook menjadi panel tenang untuk alat harian. Gratis, open source, tanpa iklan, dan tanpa pelacakan. Unduh DMG dari [Releases](https://github.com/HamdaniAsril/notching/releases/latest). Aplikasi sudah ditandatangani Developer ID dan dinotarisasi Apple, jadi langsung bisa dibuka.
