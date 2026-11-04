# Rencana: desain ulang System stat

Spec: `docs/superpowers/specs/2026-11-04-system-stat-design.md`. Semua di `main`, commit lokal per tugas, tanpa push.

## Tugas 1 — Rust: data baru (TDD)
File: `src-tauri/src/system_stats.rs`, `src-tauri/Cargo.toml`.
- Test dulu untuk fungsi murni:
  - `app_name(exe)`: nama `.app` paling luar, atau None.
  - `top_apps(rows, cores)`: kelompok, jumlah, urut CPU, maks 4.
  - `pick_temps(sensors)`: chip = max `PMU tdie*` yang masuk akal (0–130), baterai lalu SSD.
  - `pressure_from_level(level)`.
  - `History::push/trim` 60 detik.
- Setelah itu implementasinya: sysinfo feature `component`, `libc` untuk `sysctlbyname`, dan `NSProcessInfo.thermalState` (fitur objc2-foundation `NSProcessInfo`). Proses dibaca setiap kali; sensor dan disk paling sering setiap 5 detik.
- `cargo test system_stats`.

## Tugas 2 — Rust: penyimpanan dari Cleaner
File: `cleaner_service.rs`, `module_commands.rs`.
- `CleanerState` menyimpan `PartsDto` terakhir. `pub fn disk(app)` mengembalikan `{total, free, parts}` memakai `volume()`.
- `module_commands` mengisi `disk` setelah `read()`.

## Tugas 3 — Batas kartu 760
File: `modules/manifest.rs`.
- Test: lebar 760 diterima, 761 ditolak. `CARD_WIDTH` = 280..=760.

## Tugas 4 — Kartu baru (TDD)
File: `modules/system-stat/{card.ts,chart.ts,style.css,manifest.json,locales/*}`, `src/bridge-browser.ts` (data palsu).
- `chart.ts`: `segments(history, now)` (memutus celah > 4 detik) dan `pathFor(points, w, h)`. Test dulu.
- `card.ts`: tiga baris sesuai Pego. Test dulu untuk susunan, angka, aplikasi, suhu "—", disk dengan dan tanpa parts, serta angka kosong sebelum pembacaan pertama.
- Manifest kartu 760 × 394, deskripsi baru.
- `npm test`, `npm run build` (atau typecheck).

## Tugas 5 — Periksa
- Browser `?notch=1&page=modules` → Sistem: bandingkan dengan screenshot Pego.
- App asli (`npm run tauri dev` atau build): angka asli; setelah kartu ditutup, `ps -o %cpu` 0,0.

## Tugas 6 — Dokumen verifikasi
`docs/superpowers/verification/2026-11-04-system-stat.md`, lalu commit.
