# Verifikasi Keyboard Cleaning Mode

Tanggal: 31 Oktober 2026
Perangkat: MacBook Air M4 (layar bawaan ber-notch).
Cara cek: build rilis dijalankan dari worktree `adoring-booth-2ff93a`, dibuka lewat `open` supaya izin Aksesibilitas tercatat atas nama Notching. Build ini tidak disalin ke `/Applications`. Selama cek, setiap detik dicatat apakah penahan "Notching keyboard cleaning" ada di `pmset -g assertions`. Penahan ini hanya ada selama mode menyala, bersama kunci keyboard. Setiap simpanan `settings.json` juga dicatat.

Desain: `docs/superpowers/specs/2026-10-31-keyboard-clean-design.md`. Rencana: `docs/superpowers/plans/2026-10-31-notching-8-keyboard-clean.md`.

## Test otomatis

- `npx tsc --noEmit`: lulus.
- `npm test`: 401 lulus (388 di awal).
- `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml`: 216 lulus, 1 diabaikan (204 di awal).

## Data

- Salinan sebelum cek: `~/Library/Application Support/id.web.notching/before-keyboard-clean/`.
- Modul `keyboard-clean` terpasang sendiri di folder modul, dalam keadaan menyala.
- `Notching.app` (rilis): 5,22 MiB.

## Checklist di Mac

| # | Cek | Hasil | Catatan |
|---|---|---|---|
| 1 | Izin Aksesibilitas diberikan, lalu kotak di halaman Modul menyalakan mode. | Lulus setelah perbaikan | Penahan menyala 19.28.36, 19.28.46, dan 19.43.29. Lihat Temuan soal izin yang diminta terus. |
| 2 | Layar gelap dengan pilihan C, keyboard terkunci. | Dilaporkan pemilik | Pemilik melanjutkan ke perbaikan, tanpa keluhan soal tampilan. Tampilan juga dicek di pratinjau browser. |
| 3 | Esc 5× mematikan mode. | Lulus | Penahan lepas 4–5 detik setelah menyala: 19.28.40, 19.28.51, 19.43.32. |
| 4 | Setelah mati, ikon di samping notch hilang dan kotak tidak putih lagi. | Lulus setelah perbaikan | Pada cek pertama ikon dan kotak putih tertinggal. Sudah diperbaiki di `91033b3`. Cek ulang di build rilis dari `main` (PID 35711, jalan sejak 22.06.48): mode menyala dan mati tiga kali (22.16.42–22.17.01, 22.17.07–22.17.08, 22.17.12–22.17.13 menurut `pmset -g log`). Ikon hilang dilaporkan pemilik ("sudah semua"). |
| 5 | Tanpa izin, layar tidak menggelap dan macOS meminta izin. | Lulus | Permintaan izin muncul (dilaporkan pemilik), dan tidak ada penahan yang tercatat sebelum izin berhasil. |
| 6 | Cmd+Q, pengaman 10 menit, tidur/kunci layar, klik dua kali cepat, input aman. | Tidak dicek | Pemilik ingin lanjut ke pekerjaan lain. |

## Diubah atas permintaan pemilik selama cek

- **Nama kotak di halaman Modul: "Clean KB"** (`91033b3`). Pemilik menawarkan "clean kb" atau "cleaning mode". "CLEANING MODE" terlalu panjang untuk kotak yang muat 6 dalam satu baris.

## Temuan

- **Ikon dan kotak putih tertinggal setelah Esc 5×** (`91033b3`). Aturan mode sudah mematikan dirinya sendiri sebelum layanan mematikannya, sehingga layanan tidak tahu modul mana yang statusnya harus dihapus. Pengaman 10 menit punya cacat yang sama. Test `five_esc_end_it` dan `the_safety_ends_it_after_ten_minutes` gagal dulu, lalu lulus.
- **Izin diminta terus walau sudah diberikan.**
  - Build tes hanya ditandatangani ad hoc pada program di dalamnya, dengan identitas `notching-<hash>`, bukan pada app utuhnya. Setiap build baru juga punya tanda tangan yang berbeda.
  - Setelah app ditandatangani ulang sebagai satu app utuh dengan identitas `id.web.notching`, entri lama dihapus, lalu app ditambahkan lewat tombol + di Aksesibilitas, mode langsung berjalan.
  - Versi rilis yang ditandatangani nanti tidak akan mengalami ini. Selama masih build tes, setiap build ulang perlu izin ulang.
- **Notching dari `main` sempat dibuka dari sesi lain** selama cek, sehingga kotak Clean KB hilang. Atas izin pemilik, app itu ditutup biasa (setara Cmd+Q), lalu build tes dibuka lagi.

## Pemeriksaan akhir

Seluruh cabang (9092830..088954f) ditinjau oleh pemeriksa terpisah (Opus). Hasilnya: tidak ada temuan kritis, dua temuan penting, dan enam temuan kecil. Setelah dinilai ulang, satu temuan kecil dinaikkan menjadi penting. Ketiganya diperbaiki (`828942e`, `666ade4`):

- fixed an action module could not be switched off/uninstalled (the store still treated it as widget-only) — an_action_module_can_be_switched_off_and_uninstalled, 'a module whose tile runs an action counts as a module' RED→GREEN
- fixed secure input on → keys would reach the app below the dim — it_needs_accessibility_and_no_secure_input RED→GREEN; notice "Input aman sedang aktif"
- toggle races: one toggle or stop at a time, and an old tap no longer clears a newer one's handler (no unit test: needs a live tap)

### Temuan kecil yang ditunda

- the 5th Esc drops the tap from inside its own callback (works: the run loop retains the source and port; could defer one turn)
- the Izin page poll can stack a timer if cleanup runs while settings() is in flight
- a screen added mid-mode is not dimmed, and a rebuilt notch panel sits under the dim (Esc still works)
- Cmd+Q matches the QWERTY Q key position, not the AZERTY label
- keyclean.rs WAIT_MAX_MS comment mentions a monotonic clock; the service uses wall time

### Keputusan pembuat

- Design: Ruling: notch works as usual and the white tile toggles the mode off; the display is held on while the mode is on (own Hold) — cost if wrong: small UI/power changes.
- Task 1: Ruling: a count resets once 3000 ms or more passed since the last Esc — cost if wrong: none.
- Task 2: Ruling: an icon-only status has no gap after the icon — cost if wrong: two numbers.
- Task 3: Ruling: isModule = page or action, used by the Modul page, Settings → Modul and search; module pages still need a page — cost if wrong: a settings detail page with little in it.
- Task 5: Ruling: raw FFI for the tap; dim panels at level 26, notch raised to 27 while on; hold named "Notching keyboard cleaning" — cost if wrong: one constant.
- Task 6: Ruling: dim strings in the host i18n; capability file clean.json for the dim windows — cost if wrong: none.
- Final: Ruling: toggle races fixed without a RED test (needs a live tap) — cost if wrong: an unlikely double-click race, still ended by the tile or Cmd+Q.
- Final: Ruling: reviewer's set-aside items stand (Caps Lock LED, power/Touch ID, accidental 5×Esc, the macOS prompt on each click without permission, first-frame transparency, run-loop stalls, revocation unreachable, IPC posture, >16 screens) — cost if wrong: small surprises.
- Owner: Ruling: the tile reads "Clean KB" — cost if wrong: one locale string.
