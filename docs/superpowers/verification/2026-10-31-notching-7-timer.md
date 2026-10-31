# Verifikasi modul Timer dan strip tipis

Tanggal: 31 Oktober 2026
Perangkat: MacBook Air M4 (layar bawaan ber-notch).
Cara cek: build rilis dijalankan langsung dari worktree `adoring-booth-2ff93a`, cabang `claude/adoring-booth-2ff93a`, tidak disalin ke `/Applications`. Selama cek, setiap simpanan `settings.json` dicatat setiap 2 detik (modul yang dimatikan, strip tiap halaman, halaman terakhir), dan keluaran galat app ditampung di log.

Desain: `docs/superpowers/specs/2026-10-31-timer-design.md`. Rencana: `docs/superpowers/plans/2026-10-31-notching-7-timer.md`.

## Test otomatis

- `npx tsc --noEmit`: lulus.
- `npm test`: 388 lulus (349 di awal).
- `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml`: 204 lulus, 1 diabaikan (189 di awal). Yang diabaikan masih `live_search_and_forecast_through_macos_tls`.

## Data

- Salinan sebelum cek: `~/Library/Application Support/id.web.notching/before-timer/` (`settings.json`, `reminders.json`).
- Modul `timer` terpasang sendiri di folder modul saat app pertama dijalankan, dalam keadaan menyala. Setelah build ulang, salinannya ikut diganti (berkas baru berisi `tm-top`).
- `settings.json` lama tanpa `strip` terbaca biasa. Setelah strip dipasang, Beranda menyimpan `"strip": "timer/strip"`.
- Log galat app kosong selama semua cek: tidak ada notifikasi atau status Timer yang gagal dikirim.

## CPU dan ukuran

- CPU `notching` saat diam, panel tertutup, tanpa timer: 0,0.
- `Notching.app` (rilis): 5,17 MiB menurut Tauri (Keep awake: 5,05 MiB). Paket `timer`: 140 KB, sama dengan modul lain.
- `dist/assets`: 252 KB.

## Pratinjau browser

Dicek di `npm run dev` dengan `?strip=1&notch=1`: strip di Beranda, penggaris diseret lalu timer jalan (titik merah, Jeda, Stop), angka diketik "12" lalu Enter, halaman Timer dari kotak di halaman Modul, dan editor halaman memasang strip lewat kartu Timer.

## Checklist di Mac

| # | Cek | Hasil | Catatan |
|---|---|---|---|
| 1 | Pengaturan → Halaman → Beranda → klik kartu Timer: strip muncul di pratinjau. | Lulus | `settings.json` 17.03.18: Beranda menyimpan `strip: "timer/strip"`. |
| 2 | Panel menampilkan strip Timer di bawah baris widget. | Dilaporkan pemilik | "aman semua". |
| 3 | Klik penggaris tanpa menggeser tidak memulai timer. | Dilaporkan pemilik | Tidak ada jejak di file. |
| 4 | Geser ke 1:00 → jalan → status ⏱ per detik di samping notch → notifikasi "Timer selesai · 1 menit sudah habis" dengan bunyi. | Dilaporkan pemilik | Log galat kosong. Pertanyaan pengecek (angka di strip setelah selesai) tidak dijawab. |
| 5 | Jeda, Lanjut, Stop (tanpa notifikasi). | Dilaporkan pemilik | Tidak ada jejak di file. |
| 6 | Kotak Timer di halaman Modul bertitik merah saat jalan; halaman Timer terbuka. | Sebagian lulus | `lastPage` menjadi `module:timer` pukul 17.05.50. Titik merah hanya dilaporkan. |
| 7 | Matikan modul saat jalan → status dan strip hilang, tanpa notifikasi; nyalakan lagi. | Sebagian | `settings.json`: `disabledModules: ["timer"]` pukul 17.18.21, dinyalakan lagi 17.18.32. Pemilik tidak melaporkan apakah timer sedang jalan saat itu. |
| 8 | Tutup laptop melewati jam selesai → notifikasi langsung muncul saat bangun. | Tidak dicek | Pemilik memilih tidak mengecek sekarang ("nanti saja saya revisi kalau ada kendala"). Test `a_clock_jump_past_the_end_ends_at_once` menutup logikanya. |
| 9 | Saklar "tampilkan status" menyembunyikan teks, titik merah tetap. | Tidak dicek | `statusOff` tetap kosong selama cek. |

Laporan "aman semua" pada putaran 1 dicocokkan dengan file: cek 1 dan 6 punya jejak, sisanya hanya laporan pemilik. Putaran 2 tidak dikerjakan pemilik, kecuali mematikan dan menyalakan modul pada cek 7.

## Diubah atas permintaan pemilik selama cek

Setiap perubahan punya test yang gagal dulu, lalu lulus.

- **Strip tanpa tombol waktu, angka bisa diketik** (`afa4a1f`). Penggaris jadi lebih panjang. Ketik "7" atau "7:00" lalu Enter untuk memulai. Isian di luar 1–60 menit bulat mengembalikan angka semula.
- **Halaman Timer: penggaris besar di atas** (`afa4a1f`). Garis lebih tinggi, 12 px per menit, dengan angka menit besar (28 px) di kanan yang juga bisa diketik. Angka huruf titik-titik di atas dihapus. Tombol waktu dan Jeda/Stop ada di baris bawah.
- **Waktu bawaan 30 menit** (`29f28d0`), semula 5. Dengan begitu penggaris penuh di kedua sisi garis putih saat app baru dibuka.

## Pemeriksaan akhir

Seluruh cabang (a52ae34..4524ce7) ditinjau oleh pemeriksa terpisah (Opus). Hasilnya: tidak ada temuan kritis, tidak ada temuan penting, dan sepuluh temuan kecil. Setelah dinilai ulang menurut dampaknya bagi pemakai, tiga temuan dinaikkan menjadi penting dan diperbaiki dengan test yang gagal dulu (`e5d5299`):

- fixed stuck drag after a state rebuild — the ruler never leaves its row, and lostpointercapture ends the drag — 'a drag that loses the pointer ends without starting, and the ruler moves again' RED→GREEN
- fixed ruler/time flashing back to the old value after a release or preset — 'the value let go of stays until the core answers' RED→GREEN
- fixed a trackpad wobble of 3–7 px restarting a running timer — DRAG_PX 3→8 (one tick) — 'a click on the ruler without moving starts nothing' RED→GREEN

Satu temuan lain ditemukan di pratinjau browser dan diperbaiki (`4524ce7`): kartu strip selebar 4 sel menambah kolom sempit di daftar widget 3 sel dan menjepit kartu Waktu sholat. Sekarang kartu strip mengisi satu baris penuh daftar.

### Temuan kecil yang ditunda

- row widget dropped over the editor's strip area lands in the row column above it (hit test is the whole .ed-row)
- timer_service::read pokes the thread on every 1 s poll, doubling status work while the panel is open
- view.draw writes the DOM every animation frame even when nothing changed
- a hand-edited strip ref to a non-strip widget draws that widget in the strip and blocks saving until removed
- the ruler's role=slider has no keyboard support
- pointerdown accepts any button/pointer (a right-button drag can start a timer)
- MAX_MINUTES repeated in bridge-browser-timer.ts; widget-preview hard-codes 'Timer'

### Keputusan pembuat

Semua keputusan yang diambil pelaksana atas nama pemilik, berurutan, masing-masing dengan akibatnya kalau keliru (dalam bahasa Inggris, seperti di catatan kerja).

- Design: Ruling: a strip whose package is away is hidden and the page drops back to 104 px — cost if wrong: one condition in viewSize.
- Design: Ruling: the Timer page has the ruler too; the notice names the last started minutes; clicking another strip card replaces the strip — cost if wrong: small UI changes.
- Design: Ruling: status beside the notch is m:ss refreshed every second; paused keeps the red dot and a frozen text; the notice click opens the Timer page; ruler orange #FF6A1A — cost if wrong: constants and CSS.
- Task 2: Ruling: timer.start reuses ExtendArgs {minutes: u32} — same shape, one struct — cost if wrong: none.
- Task 3: Ruling: settings page_from reads 'strip' leniently (non-string → None) so a bad strip never drops its page — cost if wrong: none.
- Task 4: Ruling: timerInfo() test helper shared in src/notch/test-helpers.ts — cost if wrong: none.
- Task 5: Ruling: isOwnEcho treats an absent strip as null; the native echo always carries strip:null and would otherwise rebuild the editor on every save — cost if wrong: none.
- Task 6: Ruling: formatLeft and its test landed with the browser stand-in, which needs it — cost if wrong: none.
- Task 7: Ruling: added a ':' glyph to the dot font for the big time (the page later dropped the dot time; the glyph stays, tested) — cost if wrong: none.
- Task 8: Ruling: the strip card spans a whole line of the widget list — cost if wrong: a stretched sample.
- Task 8: Ruling: `?strip=1` in the browser bridge for previews — dev-only — cost if wrong: none.
- Final: Ruling: the reviewer's set-aside items stand (manual clock changes lengthen a timer; Power Nap notice; empty row above a lone strip; Timer status behind a later Keep awake; full view ≥ 164 px; out-of-order replies self-heal within 1 s) — cost if wrong: small UX surprises.
- Owner: Ruling: the Timer page keeps its presets; the owner asked to drop them from the strip only — cost if wrong: one line in build().
- Owner: Ruling: typed text accepts "7" or "7:00", 1–60; anything else restores the time; typing while running restarts, like the ruler — cost if wrong: one regex.
