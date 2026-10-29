# Verifikasi: Beranda dan notifikasi (rencana 4)

Rencana ini dicek dua tahap atas pilihan pemilik: bagian A (Beranda) dulu, lalu bagian B (notifikasi).

## A. Beranda

Tanggal: 29 Oktober 2026
Perangkat: MacBook Air M4 (layar bawaan ber-notch) dan monitor eksternal "L24i-40".
Cara cek: checklist dicoba pemilik di build dev (`npm run tauri dev`). Build rilis dibuka dari `src-tauri/target/release/bundle/macos/Notching.app` dan tidak disalin ke `/Applications`.

### Test otomatis

- `npx tsc --noEmit`: lulus.
- `npm test`: 196 lulus, di 29 file (153 di awal rencana).
- `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml`: 99 lulus, 1 diabaikan (70 di awal rencana). Yang diabaikan adalah `live_search_and_forecast_through_macos_tls`, yang memanggil Open-Meteo sungguhan. Test ini lulus saat dijalankan manual di Task 3.

### Ukuran

- `Notching.app`: 4,9 MB (rencana 3: 4,4 MB). Tambahan 0,5 MB berasal dari `ureq` dengan TLS bawaan macOS dan `chrono`.
- `dist/assets`: 192 KB (rencana 3: 184 KB).

### Jaringan

- `dig`: `api.open-meteo.com` → 167.114.211.86 dan 188.40.99.226. `geocoding-api.open-meteo.com` → 202.61.206.6.
- **Build rilis tanpa cache cuaca.** `weather.json` sengaja dipindahkan dulu, lalu `lsof -nP -iTCP -iUDP` atas `notching` dan proses WebKit Networking miliknya dicatat tiap 0,1 detik selama 5 menit.
  - Satu-satunya koneksi: `notching` → 167.114.211.86:443 (Open-Meteo), saat app baru jalan.
  - `weather.json` baru tertulis 2 detik kemudian.
  - Tidak ada koneksi lain.
- **Build dev dengan cache cuaca yang masih segar** (umur di bawah 30 menit). Sampel tiap sekitar 2 detik selama 5 menit, dengan kartu Beranda dibuka dua kali.
  - Tidak ada koneksi keluar dari `notching`.
  - Satu-satunya koneksi adalah WebKit Networking ke server Vite di `[::1]:1420`, yang hanya ada di build dev.

### File

- `settings.json` memuat `home` dengan kota pilihan pemilik, `prayerMethod: "kemenag"`, dan `showClock: true`.
- `reminders.json` memuat dua reminder, satu selesai dan satu belum, dengan `nextId: 3`.
- `~/Library/Caches/id.web.notching/weather.json` memuat suhu, kode cuaca, min/maks, waktu ambil, dan koordinat yang sudah dibulatkan ke 2 desimal.

### CPU (build dev, sampel tiap sekitar 2 detik, 119 sampel per proses)

| Keadaan | `notching` | WebContent |
|---|---|---|
| Panel tertutup, Mac tidak disentuh (26 sampel) | 0,0, satu sampel 0,2 | 0,0 |
| Kartu Beranda muncul (2–3 detik, dua kali) | 1,3–7,7 | 1,4–8,5 |
| Kartu Beranda terbuka dan diam | 0,0 | 0,0 |
| Panel tertutup, pemilik memakai Mac | 0,0, sesekali 0,1–1,9 | 0,0 |

Angka kecil di baris terakhir berasal dari pemantau gerakan mouse Notching (`pointer.rs`), karena WebContent tetap 0,0. CPU build rilis tidak diukur ulang di bagian ini.

### Checklist

| # | Cek | Hasil | Catatan |
|---|---|---|---|
| 1 | Sebelum kota diatur, Beranda mengajak mengatur kota. | Lulus | Dilaporkan pemilik. |
| 2 | Atur kota di Pengaturan → Modul → Beranda, dan cuaca muncul. Kelima waktu sholat cocok dengan jadwal Kemenag, dengan selisih paling banyak 1 menit. | Lulus | Dilaporkan pemilik. Lihat "API ournoor" di bawah. |
| 3 | Reminder dengan jam dan tanpa jam, tandai satu selesai, lalu Cmd+Q dan jalankan lagi. | Lulus, sebagian | Dilaporkan pemilik. Reminder dibuat setelah Notching dibuka ulang, jadi Notching dibuka ulang sekali lagi. Pemilik melaporkan reminder "masih ada". `reminders.json` hanya berisi dua reminder, keduanya berjam. Reminder tanpa jam tidak tercatat dicoba di perangkat; test `a reminder without a time is for today` menutupnya. |
| 4 | Wi-Fi mati: cuaca terakhir tetap tampil, dan mencari kota memberi "Tidak bisa mencari. Periksa internetmu." | Lulus | Dilaporkan pemilik. |
| 5 | Jam dimatikan lalu hilang. Metode Karachi mengubah Isya. Kembali ke Kemenag. | Lulus | Dilaporkan pemilik. `settings.json` kembali ke `kemenag` dan `showClock: true`. |
| 6 | Bahasa English untuk kartu dan pengaturan. | Lulus | Dilaporkan pemilik. |
| 7 | Mengetik di daftar reminder saat TextEdit terbuka, lalu Esc mengembalikan ketikan ke TextEdit. | Lulus | Dilaporkan pemilik. |
| 8 | Perilaku lama: klik di luar menutup panel, menu bar dekat tengah bisa diklik, dan System stat jalan. | Lulus | Dilaporkan pemilik. |
| 9 | Build rilis: cuaca muncul. | Lulus | Dilaporkan pemilik, dengan cache cuaca dikosongkan lebih dulu. Ini membuktikan TLS jalan di build rilis. |

Tampilan dan teks kartu serta halaman pengaturan dinilai pemilik dan disetujui tanpa perubahan.

### Temuan dan catatan

- **API ournoor.** Pemilik meminta jadwal sholat diambil dari `ournoor.com/api/sholat`. Sebagai bahan keputusan, keduanya dibandingkan dengan jadwal Bimas Islam Kemenag bulan Oktober 2026 untuk kota pemilik (155 waktu, dari detik.com yang mengutip Bimas Islam).
  - Hitungan Notching: 141 sama persis, 14 lebih lambat 1 menit (12 Maghrib, 1 Subuh, 1 Dzuhur), dan tidak pernah lebih awal.
  - ournoor: 51 sama persis, dan 104 lebih awal 1–2 menit (Dzuhur selalu lebih awal).
  - ournoor juga hanya melayani koordinat di Indonesia, butuh internet, dan akan mengirim lokasi kota ke layanan kedua.
  - Pemilik memilih tetap memakai hitungan sendiri. Kode dan spec tidak berubah.
- **Tidak ada perbaikan kode selama cek di perangkat.** Satu-satunya perubahan sesudah Task 6 adalah tinggi kartu di rencana, dari 148 menjadi 156, supaya sesuai dengan kode.
