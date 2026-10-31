# Verifikasi modul Keep awake

Tanggal: 31 Oktober 2026
Perangkat: MacBook Air M4 (layar bawaan ber-notch). Monitor eksternal tidak tersambung.
Cara cek: checklist dicoba pemilik di build dev (`npm run tauri dev`) dari worktree `blissful-burnell-e2c699`, cabang `claude/keep-awake-778777`. Selama cek, `pmset -g assertions` dicatat setiap 2 detik, bersama jam simpan `settings.json` dan daftar modul yang dimatikan. Build rilis dibuat di worktree itu dan tidak disalin ke `/Applications`.

Desain: `docs/superpowers/specs/2026-10-31-keep-awake-design.md`. Rencana: `docs/superpowers/plans/2026-10-31-notching-6-keep-awake.md`.

## Test otomatis

- `npx tsc --noEmit`: lulus.
- `npm test`: 349 lulus (335 di awal).
- `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml`: 189 lulus, 1 diabaikan (174 di awal). Yang diabaikan masih `live_search_and_forecast_through_macos_tls`.
- Test `a_hold_shows_in_pmset_until_dropped` memasang penahan sungguhan, lalu memeriksa bahwa `pmset` mencatatnya atas proses test dan bahwa catatan itu hilang setelah penahan dilepas.

## Data

- Salinan sebelum cek: `~/Library/Application Support/id.web.notching/before-keep-awake/` (`settings.json`, `reminders.json`).
- Setelah semua cek, `reminders.json` sama persis. Di `settings.json` hanya `lastPage` yang berubah, dari `p2` ke `module:keep-awake`.
- Modul `keep-awake` terpasang sendiri di folder modul saat app pertama dijalankan, dalam keadaan menyala. Saat app baru dibuka tidak ada penahan (`pmset`: 0).

## CPU dan ukuran

- CPU `notching` saat diam, dengan panel tertutup: 0,0 di 12 sampel, setiap 2 detik, 13.49.00–13.49.24.
- `Notching.app` (rilis): 5,05 MiB menurut Tauri (rencana 5 bagian B: 4,93 MiB). Paket `keep-awake`: 140 KB, sama dengan `system-stat`.
- `dist/assets`: 252 KB (bagian B: 248 KB).

## Checklist

| # | Cek | Hasil | Catatan |
|---|---|---|---|
| 1 | Modul → kotak AWAKE → halaman Keep awake dalam keadaan mati, sesuai mockup B. | Lulus | Dilaporkan pemilik. Tampilan juga dicek di pratinjau browser: mati, kotak ke 1 jam, +15, kotak ke mati, ∞, ketik 45 menjadi "45m". |
| 2 | Kotak dan tombol menyalakan dan mematikan; kotak AWAKE putih saat menyala. | Lulus | `pmset`: penahan menyala dan lepas mengikuti klik (13.10.58–13.13.22, 13.21.06–13.21.34, 13.26.10–13.26.23). |
| 3 | Ketik 1 menit → "☕ 1m" di samping notch → setelah 1 menit muncul notifikasi "Keep awake selesai" dan status hilang. | Lulus setelah diulang | `pmset`: penahan 13.46.26–13.47.27, yaitu 61 detik, dan lepas tanpa ada simpanan pengaturan, jadi berakhir sendiri. Notifikasi dilaporkan pemilik. Dua laporan "semua cocok" sebelumnya belum mencakup cek ini: penahan paling lama 13 detik. |
| 4 | Status di samping notch menampilkan ikon modul (cangkir kopi) di kiri teks. | Lulus setelah perbaikan | Pada cek kedua hanya teks yang muncul. Penyebabnya dijelaskan di Temuan. Setelah perbaikan dilaporkan pemilik. |
| 5 | Matikan modul saat ∞ menyala → status dan penahan langsung hilang. | Lulus setelah diulang | 13.48.27: `settings.json` tersimpan dengan `disabledModules: ["keep-awake"]`, dan di sampel yang sama penahan 0. Modul dinyalakan lagi 13.48.32. Laporan sebelumnya belum mencakup cek ini: semua simpanan pengaturan terjadi saat Keep awake mati. |
| 6 | Cmd+Q saat menyala → penahan lepas. | Lulus | Penahan menyala 13.26.27. App keluar tanpa galat 13.26.31, dan `pmset` langsung 0. |
| 7 | Saklar "tampilkan status" di Pengaturan → Modul → Keep awake menyembunyikan teks, tapi kotak tetap putih. | Dilaporkan pemilik | Pengaturan tersimpan 13.20.47 dan 13.20.50, tapi saat itu Keep awake mati, jadi file tidak bisa membuktikan bagian "kotak tetap putih". `statusOff` akhir kosong. |

Layar yang tetap terang tidak ditunggu sampai waktu mati layar habis (10 menit di Mac ini). Buktinya adalah jenis penahan `PreventUserIdleDisplaySleep` atas nama "Notching keep awake" di `pmset`. App Claude di Mac ini juga menahan Mac supaya tidak tidur, jadi Mac yang tetap menyala bukan bukti untuk Keep awake.

## Diubah atas permintaan pemilik selama cek

Setiap perubahan punya test yang gagal dulu, lalu lulus.

- **Ikon cangkir kopi, bukan matahari** (`d224dbd`). Dipakai di kotak halaman Modul, di kotak besar, dan di samping notch.
- **Status di samping notch selalu membawa ikon modulnya** (`c26b341`), supaya terlihat modul mana yang sedang berjalan. Ini juga berlaku untuk Timer nanti. Tab kanan notch melebar dari 56 ke 76 px. Contoh status dari Pengaturan tetap tanpa ikon. Desain 30 Oktober §8 ikut diubah.
- **Klik kotak saat mati langsung tanpa batas** (`8134e23`), bukan 1 jam. Keterangannya "Klik kotak: tanpa batas".

## Temuan dan catatan

- **Ikon status tidak terlihat di app Mac** (`871633f`). Ikon modul aslinya hitam. Ikon itu diputihkan dengan efek CSS (`brightness(0) invert(1)`). Pratinjau browser menampilkannya, tetapi WebKit mengabaikan efek CSS itu pada bagian dalam SVG, sehingga ikon tergambar hitam di atas notch hitam. Ini dibuktikan dengan gambar WKWebView dari sebuah skrip kecil: dengan efek CSS pikselnya hitam (0,00), dengan filter SVG (`feColorMatrix`) putih (1,00). Sekarang ikon memakai filter SVG.
- **Laporan "semua cocok" dua kali belum cocok dengan catatan.** Keduanya diulang sampai `pmset` dan file menunjukkan hasilnya.
- **Celah temuan kecil ke-6 rencana 5 ditutup.** Status sekarang dihitung ulang saat modul dimatikan, dicopot, atau dipasang lagi, dan saat overlay dibangun ulang (`dcb7b8c`). Cek 5 menunjukkan hasilnya.
- **Lingkup:** paket baru hanya `keep-awake`. Di samping notch tetap paling banyak satu status dan satu titik.

## Pemeriksaan akhir

Seluruh cabang (d91af04..25875ff) ditinjau oleh pemeriksa terpisah. Hasilnya: tidak ada temuan kritis, dua temuan penting, dan tiga temuan kecil. Kedua temuan penting diperbaiki dengan test yang gagal dulu (`22cba5e`).

- fixed a stop racing the status update could leave a white tile and "42m" beside the notch with nothing held — a_status_shown_is_cleared_once_after_a_stop, a_status_shown_before_an_end_is_cleared_once_after_it RED→GREEN
- fixed a run past its end (Mac just woke) was still readable and extendable, so +1 jam could revive it — a_run_past_its_end_takes_no_more_time RED→GREEN

Test akhir: `npm test` 349 lulus; `cargo test` 189 lulus, 1 diabaikan.

### Temuan kecil yang ditunda

- a start that passes the gate just before its module is switched off can take the hold for a switched-off module (tiny window; fix: check the module is on inside turn_on)
- a poll reply in flight during start/stop can flip the box back for up to 1 s
- turn_on by a different module leaves the previous module's status (latent: only keep-awake declares awake)

### Keputusan pembuat

Semua keputusan yang diambil pelaksana atas nama pemilik, berurutan, masing-masing dengan akibatnya kalau keliru (dalam bahasa Inggris, seperti di catatan kerja).

- Brainstorm: Ruling: under an hour the status reads "42m", not "0:42", which reads as seconds — cost if wrong: one format function in Rust and the browser stand-in.
- Brainstorm: Ruling: no limit hides the + buttons; durations show only while off — cost if wrong: one more mode in view.ts.
- Brainstorm: Ruling: typed minutes 1–1440, + never past 24 h, nothing persisted across launches, notice channel on with sound — cost if wrong: constants and a manifest default.
- Task 2: Ruling: `unsafe extern "C"` (edition 2024 requires it) — cost if wrong: none.
- Task 3: Ruling: the service is glue over Tauri state, threads and notify, so it is covered by the device check, not unit tests; its logic lives in the tested awake.rs — cost if wrong: a glue bug found on the device.
- Task 4: Ruling: the minutes field is text with numeric input mode, digits only — cost if wrong: one attribute.
- Task 4: Ruling: the page row has no side padding; the panel already insets the module area to 404 px — cost if wrong: CSS only.
- Task 5: Ruling: the clicking steps of the dev run moved into the owner's device check — this session cannot click the native notch panel — cost if wrong: none.
- Final: Ruling: the stale-status fix is self-healing (the next round clears it within ms) rather than posting under the service lock — cost if wrong: a stale status for a few ms.
- Owner: Ruling: the sample status stays text only, as it has no module — cost if wrong: the settings preview looks slightly different from a real status.
- Owner: Ruling: the status icon follows the right-aligned text at 7 px a character (measured 7.33 px in WebKit) — cost if wrong: a 2 px gap error at 6 characters.
