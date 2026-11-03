# Notching

Your notch, put to work. Free, open source, no ads, no tracking.

Notching turns the MacBook notch into a calm panel for the small tools you reach for every day. Hover the notch and it opens. Move away and it closes.

## Download

Get the file for your system from the latest [Release](https://github.com/HamdaniAsril/notching/releases/latest):

| System | File |
|---|---|
| macOS (Apple Silicon) | `Notching_x.y.z_aarch64.dmg` |
| Windows | `Notching_x.y.z_x64-setup.exe` or `.msi` |
| Ubuntu, Debian | `.deb` |
| Fedora, openSUSE | `.rpm` |
| Other Linux | `.AppImage` |

**macOS.** Open the DMG and drag Notching into Applications. The app is signed with an Apple Developer ID and notarized by Apple, so it opens like any other Mac app.

**Windows and Linux.** These builds are not code-signed.
- Windows: SmartScreen may warn on first run. Click "More info", then "Run anyway".
- Ubuntu/Debian: `sudo apt install ./Notching_x.y.z_amd64.deb`. Fedora: `sudo dnf install ./Notching-x.y.z-1.x86_64.rpm`.
- AppImage: `chmod +x Notching_*.AppImage`, then run it.

Requirements:
- macOS 13 or later on Apple Silicon (M1 or newer). It also works on Macs without a notch and on external displays.
- Windows 10 or 11 with WebView2 (already part of Windows 11; the installer fetches it if missing).
- Linux with webkit2gtk 4.1, for example Ubuntu 22.04+ or Fedora 38+.

Not available on Windows and Linux yet: Shelf, Screenshot, Cleaner, Keyboard Cleaning Mode, Music and Mirror's lamp. Everything else works the same.

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

You need Node.js 20+ and Rust (stable), plus the platform tools below.

- **macOS:** Xcode Command Line Tools.
- **Windows:** Visual Studio Build Tools with the "Desktop development with C++" workload, and WebView2.
- **Linux (Debian/Ubuntu):**
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```
  On Fedora: `sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file libxdo-devel libappindicator-gtk3-devel librsvg2-devel gcc-c++`.

```bash
npm ci
npm test
npm run tauri dev
```

To build the app and its installers for the OS you are on:

```bash
npm run tauri build
```

The output lands in `src-tauri/target/release/bundle/`: a DMG on macOS, NSIS and MSI on Windows, deb, rpm and AppImage on Linux.

## Releasing

Releases are built by [GitHub Actions](.github/workflows/release.yml) from a version tag. [CI](.github/workflows/ci.yml) runs the tests and a build on macOS, Windows and Linux for every push and pull request.

1. Bump the version in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and the `notching` entry in `src-tauri/Cargo.lock`.
2. Commit, then `git tag vX.Y.Z && git push origin main vX.Y.Z`. The tag must equal the version.
3. CI runs the tests on every OS, then builds all platforms into one draft release: the macOS DMG (signed with Developer ID, notarized), the Windows setup.exe and MSI, and the Linux deb, rpm and AppImage. Windows and Linux are unsigned.
4. When every job is green, publish it: `gh release edit vX.Y.Z --draft=false`.

The macOS job needs these repository secrets: `APPLE_CERTIFICATE` (base64 `.p12`), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_TEAM_ID`, `APPLE_ID` and `APPLE_PASSWORD` (an app-specific password). Windows and Linux need none.

## Project layout

- `src/`: the notch, settings window and shared kit (TypeScript).
- `src-tauri/`: the native side (Rust, Tauri 2 with tauri-nspanel).
- `modules/`: each module or widget pack is a web package with a `manifest.json`.
- `docs/superpowers/`: design documents, plans and verification notes, written in Indonesian.

## License

[MIT](LICENSE)

---

**Bahasa Indonesia.** Notching mengubah notch MacBook menjadi panel tenang untuk alat harian. Gratis, open source, tanpa iklan, dan tanpa pelacakan. Unduh dari [Releases](https://github.com/HamdaniAsril/notching/releases/latest): DMG untuk macOS, `-setup.exe` atau `.msi` untuk Windows, `.deb`, `.rpm` atau `.AppImage` untuk Linux. Versi macOS sudah ditandatangani Developer ID dan dinotarisasi Apple, jadi langsung bisa dibuka. Versi Windows dan Linux belum ditandatangani (di Windows klik "More info", lalu "Run anyway"). Shelf, Screenshot, Cleaner, Keyboard Cleaning Mode, Music, dan lampu Mirror belum tersedia di Windows dan Linux.
