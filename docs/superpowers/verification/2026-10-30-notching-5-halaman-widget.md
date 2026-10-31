# Verifikasi: halaman dan widget (rencana 5)

Rencana ini dicek dua tahap, seperti rencana 4: bagian A (halaman di notch) dulu, lalu bagian B (editor halaman dan status di samping notch).

## A. Halaman di notch

Tanggal: 30–31 Oktober 2026
Perangkat: MacBook Air M4 (layar bawaan ber-notch). Monitor eksternal tidak tersambung saat cek ini (lihat cek 7).
Cara cek: checklist dicoba pemilik di build dev (`npm run tauri dev`) dari worktree `.claude/worktrees/halaman`, cabang `feat/halaman`. Build rilis dibuka dari `src-tauri/target/release/bundle/macos/Notching.app` di worktree itu dan tidak disalin ke `/Applications`.

### Test otomatis

- `npx tsc --noEmit`: lulus.
- `npm test`: 284 lulus (228 di awal rencana).
- `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml`: 149 lulus, 1 diabaikan (122 di awal rencana). Yang diabaikan masih `live_search_and_forecast_through_macos_tls`, yang memanggil Open-Meteo sungguhan.

### Pindahan pengaturan

Salinan data asli disimpan di `~/Library/Application Support/id.web.notching/before-plan-5/` sebelum app baru jalan. Notching lama sempat dipakai lagi setelah salinan itu dibuat, jadi `lastCard` berubah dari `"home"` ke `"system-stat"`. Karena itu file tepat sebelum app baru jalan juga disalin (`settings-just-before-run.json`, `reminders-just-before-run.json`), dan pindahan dicocokkan dengan salinan itu.

- **Sebelum** (`version: 1`): bahasa `auto`, layar `null`, `lastCard: "system-stat"`, tidak ada modul yang mati atau dicopot, slider 100/200/9/4, kota Pekanbaru (Riau), `prayerMethod: "kemenag"`, `showClock: true`, saluran `home.prayer` dan `home.reminder` sama-sama tampil dan bersuara.
- **Sesudah** (`version: 2`):
  - Bahasa, layar, modul, slider, kota, metode, glow, lama tampil, dan kedua saluran sama persis.
  - `showClock` dan `lastCard` hilang.
  - `pages` berisi Beranda saja: `home/date` kolom 0, `home/weather` kolom 1, dan `home/reminders` kolom 2 selebar 2.
  - `lastPage: "module:system-stat"`, terjemahan dari `lastCard` lama.
- `settings.json.v1` sama persis dengan `settings-just-before-run.json` (`diff` kosong).
- `reminders.json` sama persis dengan salinannya (10 reminder, `nextId: 13`) sampai pemilik menambah reminder di cek 2.

### Jaringan

- `dig`: `api.open-meteo.com` → 188.40.99.226 dan 167.114.211.86. `geocoding-api.open-meteo.com` → 202.61.206.6.
- **Build dev tanpa cache cuaca.** `weather.json` dipindahkan dulu, lalu app dijalankan ulang. `lsof -nP -a -iTCP -iUDP` atas `notching` dan WebKit Networking dicatat tiap sekitar 2 detik, dengan localhost tidak dihitung, dari 22.21 sampai 08.11 keesokan paginya.
  - Sebelum Beranda dibuka, tidak ada koneksi keluar sama sekali.
  - Satu-satunya koneksi: `notching` → 188.40.99.226:443 (Open-Meteo), pukul 08.09.21, saat pemilik membuka Beranda.
  - `weather.json` baru tertulis pukul 08.09.22.

### CPU (build dev, sampel tiap sekitar 2 detik)

| Keadaan | `notching` | WebContent notch |
|---|---|---|
| Panel tertutup, Mac tidak dipakai semalam (877 sampel) | paling tinggi 0,2 | paling tinggi 0,1 |
| Panel dibuka, pindah ke Beranda, cuaca diambil (sekitar 20 detik) | 0,8–13,5 | 0,1–15,2 |
| Beranda terbuka dan diam, lalu panel ditutup dan diam (52 sampel, 08.09.23–08.11.15) | 0,0, satu sampel 0,1 | 0,0, paling tinggi 0,3 |

Semua keadaan diam ada di bawah 1,0. Lonjakan hanya terjadi saat panel bergerak dan cuaca dimuat.

### Ukuran

- `Notching.app`: 4,9 MB (4,89 MiB menurut Tauri) (rencana 4: 4,9 MB).
- `dist/assets`: 220 KB (rencana 4: 212 KB).

### Checklist

| # | Cek | Hasil | Catatan |
|---|---|---|---|
| 1 | Beranda berisi Tanggal, Cuaca, dan Reminder, tanpa baris bawah dan jam kecil. Kota, cuaca, dan reminder lama masih ada. | Lulus | Dilaporkan pemilik. Isi `pages` dan kota di `settings.json` cocok (lihat Pindahan). |
| 2 | Klik Reminder membuka daftar lengkap. Tambah reminder sambil TextEdit terbuka. "Kembali" ke Beranda, Esc menutup panel. | Lulus setelah perubahan | Pemilik meminta daftar lengkap menampilkan 6 baris, bukan 2 (lihat Temuan). Setelah itu dilaporkan lulus. Reminder baru "tes panjang" (id 13) tercatat di `reminders.json`. |
| 3 | Pil berisi Beranda, Modul, dan ⋯. Kotak System stat membuka kartunya dengan "‹ Modul", dan "‹ Modul" kembali. Panel berubah ukuran dengan pegas yang sama. | Lulus | Dilaporkan pemilik. `lastPage` sempat tercatat `"modules"`. |
| 4 | Tutup panel di System stat, Cmd+Q, jalankan lagi → panel terbuka di System stat. | Lulus | Laporan pertama "oke semua" ternyata belum mencakup cek ini: app masih proses yang sama dan `lastPage` masih `"modules"`. Setelah diulang, app keluar tanpa galat dengan `lastPage: "module:system-stat"`, dijalankan ulang, dan pemilik melihat System stat. |
| 5 | Notifikasi reminder. Mac diam 2 menit sebelum jamnya → titik merah di notch dan titik putih di ikon Beranda. Klik notifikasi membuka Beranda. | Lulus setelah diulang | Percobaan pertama ("Tesuuu", 22.09) terkirim (`notified: true`) tanpa titik, karena Mac belum diam 2 menit. Petunjuk awal kurang jelas soal ini. Titik juga dicek di browser dengan `?missed=home.reminder`: titik merah dan kelas `missed` di ikon Beranda muncul. Percobaan kedua ("reminder baru", 22.14) memunculkan kedua titik menurut pemilik. "uuu" (22.16) juga terkirim. |
| 6 | Pengaturan: tujuh bagian, Halaman berisi kota dan metode sholat, Beranda tidak ada di Modul, English mengubah nama widget dan "Home". | Lulus | Dilaporkan pemilik. `settings.json` berisi `language: "en"` pukul 22.18, jadi bahasa memang diganti. Pemilik belum mengembalikannya. |
| 7 | Monitor eksternal. | Dilewati | Saat dicek, `system_profiler` hanya menemukan layar bawaan. Pemilik memilih melewatinya. Dicoba lagi di bagian B. |
| 8 | Klik di luar menutup panel, dan menu bar dekat tengah bisa diklik. | Lulus | Dilaporkan pemilik. |
| — | Build rilis: Beranda tampil. | Lulus | Dilaporkan pemilik. Program di `Notching.app` dibuat 08.13.27 dan dibuka 08.18.34 (waktu akses file). `lastPage` sudah `"home"`, jadi `settings.json` tidak berubah. |

### Temuan dan catatan

- **Daftar Reminder lengkap terlalu pendek.** Di halaman 104 px hanya 2 reminder yang terlihat. Atas permintaan pemilik, widget sekarang meminta tinggi saat membuka tampilan penuh. `notching:expand` membawa `height` (opsional). Reminder meminta 193 px: kepala dan isian 53 px, ditambah 6 baris 20 px dengan jarak 4 px. Host membatasinya antara 104 dan 240 px (`FULL_PAGE_MAX`). Panel kembali ke 104 px saat "Kembali", saat pindah halaman, atau saat ditutup. Dibuat di `789065a` dengan test.
- **Font tidak termuat di build dev worktree.** `node_modules` worktree semula berupa tautan ke folder utama, sehingga Vite menolak file font di luar daftar izinnya. Tautan diganti dengan `npm ci` di worktree. Ini hanya terjadi di build dev worktree; build rilis membawa fontnya sendiri.
- **Notching lama sempat dipakai setelah salinan data dibuat.** Tidak ada yang hilang. Pindahan dicocokkan dengan file tepat sebelum app baru jalan.
- **Bahasa masih English** setelah cek 6.
