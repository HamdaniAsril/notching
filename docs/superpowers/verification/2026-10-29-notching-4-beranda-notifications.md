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

Angka kecil di baris terakhir muncul saat pemilik memakai Mac, sementara WebContent tetap 0,0. Penyebab pastinya tidak diselidiki. Pemantau mouse di `pointer.rs` hanya aktif saat kursor ada di notch, jadi bukan penyebab utamanya. CPU build rilis diukur di bagian B.

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

## B. Notifikasi

Tanggal: 29–30 Oktober 2026
Perangkat: MacBook Air M4 (layar bawaan ber-notch). Monitor eksternal tidak tersambung saat daftar jendela direkam pukul 23.25.
Cara cek: checklist dicoba pemilik di build dev. Build rilis dibuka dari `src-tauri/target/release/bundle/macos/Notching.app` dan tidak disalin ke `/Applications`.

### Test otomatis

- `npx tsc --noEmit`: lulus.
- `npm test`: 228 lulus, di 30 file (196 setelah bagian A).
- `cargo test --manifest-path src-tauri/Cargo.toml`: 122 lulus, 1 diabaikan (99 setelah bagian A).

### Ukuran

- `Notching.app`: 4,9 MB, sama dengan bagian A.
- `dist/assets`: 212 KB (bagian A: 192 KB).

### CPU (build rilis, sampel tiap sekitar 2 detik)

| Keadaan | `notching` | WebContent notch | WebContent pengaturan |
|---|---|---|---|
| Diam tanpa notifikasi, Mac tidak disentuh (41 sampel, sekitar 80 detik) | 0,0 di semua sampel | 0,0 di semua sampel | belum terbuka |
| Buka pengaturan, klik Kirim contoh, notifikasi dengan cahaya (11 sampel) | 2,5–7,2 | 0,1–9,6 | 0,9–2,0 |
| Setelah notifikasi selesai dan pengaturan ditutup (16 sampel) | paling tinggi 0,1 | paling tinggi 0,1 | sudah tertutup |

Selama notifikasi tampil, CPU sedikit naik karena cahayanya bergerak. Begitu notifikasi selesai, CPU kembali ke 0. Penjadwal yang bangun sekali semenit tidak terlihat di sampel diam.

### Checklist

| # | Cek | Hasil | Catatan |
|---|---|---|---|
| 1 | Kirim contoh: telinga di samping notch, cahaya, dan bunyi Glass. Di monitor: pil kecil. | Lulus | Dilaporkan pemilik. Monitor tidak tersambung saat daftar jendela direkam, jadi bagian monitor hanya berdasarkan laporan pemilik. |
| 2 | Cahaya mati → tanpa cahaya. Lama tampil 6 dtk → lebih lama. Lalu kembali ke bawaan. | Lulus | Dilaporkan pemilik. `settings.json` kembali ke `glow: true` dan `seconds: 3.5`. |
| 3 | Reminder tepat waktu, di layar tempat kursor, dengan bunyi. Klik telinga membuka kartu Beranda. | Lulus | Dilaporkan pemilik. Enam reminder uji tercatat `notified` di `reminders.json`. |
| 4 | Dua reminder di menit yang sama tampil bergantian. | Lulus | Dilaporkan pemilik. "Tes 1" dan "Tes 2" (22.57) keduanya `notified`. |
| 5 | Panel terbuka saat reminder jatuh tempo → notifikasi muncul setelah panel ditutup. | Lulus | Dilaporkan pemilik. |
| 6 | Terlewat: tanda di notch dan di ikon Beranda di pil, lalu hilang setelah panel dibuka. | Lulus setelah perbaikan | Tiga percobaan awal tidak memunculkan titik. Ada dua sebab, dan keduanya diperbaiki (lihat Temuan). Desain titiknya juga diganti dua kali atas pilihan pemilik. Percobaan terakhir dengan video layar penuh (reminder 00.00) dilaporkan pemilik: notch melebar dengan titik merah. Jalur "2 menit tidak menyentuh Mac" belum dicoba terpisah di perangkat. Jalur itu memakai kode yang sama dan sudah diuji di test. |
| 7 | Saklar Tampil mati → reminder tidak muncul. Saklar Suara mati → tanpa bunyi. | Lulus | Dilaporkan pemilik. Pengaturan masih `home.reminder` dengan suara mati saat laporan ini ditulis. |
| 8 | Notifikasi waktu sholat ~~tanpa bunyi~~ dengan bunyi. | Sebagian | Pemilik menyalakan Suara untuk sholat, dan pada 31 Oktober memilih cek dengan bunyi. Waktu dan bunyi terbukti dari log; telinga di layar belum dilihat atau dilaporkan. Lihat "Cek 8: bukti sholat" di bawah. |
| 9 | Cmd+Q lalu jalankan lagi → reminder yang sudah muncul tidak muncul lagi. | Lulus | Dilaporkan pemilik setelah Notching dibuka ulang pukul 23.05. |
| 10 | Perilaku lama: hover, buka-tutup, Esc, klik di luar, menu bar, slider, dan Beranda. | Lulus | Dilaporkan pemilik. |
| 11 | Build rilis: Kirim contoh berbunyi dan bercahaya. | Lulus | Dilaporkan pemilik. |

Tampilan telinga, cahaya, pil, halaman Notifikasi, dan saklar sholat di Beranda dinilai pemilik di pratinjau browser sebelum Task 12 di-commit, dan disetujui tanpa perubahan.

### Temuan dan catatan

- **Titik di ikon pil tidak pernah terlihat.** Titik dihapus saat panel terbuka, padahal pil baru muncul sesudah panel terbuka. Sekarang titik baru dihapus saat panel ditutup. Diperbaiki di `bf63685` dengan test.
- **App layar penuh tidak dikenali di MacBook ber-notch.** Daftar jendela yang direkam saat Arc layar penuh menunjukkan dua hal:
  - Jendela layar penuh mulai di bawah strip notch (y 33, area aman 32), bukan di y 0.
  - Space layar penuh tidak punya jendela desktop Dock (layer 20), sedangkan Space biasa punya.

  `covers_screen` sekarang juga menghitung jendela yang mulai di bawah strip notch, asal di Space itu tidak ada jendela desktop Dock. Diperbaiki di `72d9a69` dengan test dari angka rekaman tadi.
- **Desain titik terlewat diganti atas pilihan pemilik.** Dari titik putih di bawah notch menjadi titik hitam berpinggiran putih di kiri notch (`13a483b`), lalu titik merah aksen di dalam notch yang melebar 20 px ke kiri (`5481ad2`). Di layar tanpa notch, titiknya ada di bawah lensa. Spec bagian 4.4 diperbarui.
- **Pemilik menimbang titik pelangi beranimasi** dan memilih merah. Animasi yang terus berjalan akan membuat Notching tidak pernah benar-benar diam.
- **Nilai "3,5 dtk" di halaman Notifikasi** sempat terpotong menjadi dua baris. Ini diperbaiki sebelum Task 12 di-commit.
- **Sesi lain di folder yang sama** menambahkan gradasi panel (`c4d3082`) di cabang ini, di antara Task 11 dan Task 12. Perubahan itu tidak termasuk rencana ini, tetapi ikut terlihat di semua cek bagian B.
- **Isya lewat tengah malam (pemeriksaan akhir).** Di lintang tinggi saat musim panas, Isya bisa jatuh lewat tengah malam, dan notifikasinya tidak pernah terkirim. Penyebabnya, jadwal hanya menghitung hari ini dan besok. Sekarang kemarin ikut dihitung. Diperbaiki dengan test London 21 Juni.
- **Batas yang diketahui:**
  - **Pengenalan layar penuh di layar ber-notch bergantung pada jendela desktop Dock.** Kalau Dock ada di monitor lain dan "Displays have separate Spaces" menyala, jendela yang dimaksimalkan di layar MacBook bisa dianggap layar penuh, sehingga muncul titik merah yang tidak perlu.
  - **Bunyi diputar saat notifikasi datang, bukan saat telinganya muncul.** Kalau panel sedang terbuka, bunyinya terdengar sekarang, sedangkan telinganya baru muncul setelah panel ditutup.


### Cek 8: bukti sholat (31 Oktober 2026)

Jadwal dihitung dengan `home/prayer.rs` milik app, Pekanbaru, Kemenag: Subuh 04.39 (30/10) atau 04.38 (31/10), Dzuhur 12.01, Ashar 15.20, Maghrib 18.04, Isya 19.14. `settings.json` berisi `home.prayer: {on: true, sound: true}` sejak paling lambat 30 Oktober 06.05 (salinan `before-plan-5`).

Bunyi dibuktikan lewat `log show`: `notching` membuka output audio baru (`AudioQueueObject: New output`) saat bunyi Glass diputar. Keadaan Mac diambil dari `pmset -g log`.

| Waktu | Mac | Notching | Output audio |
|---|---|---|---|
| 30/10 Subuh 04.39 | bangun | PID 831 | 04.39.00 |
| 30/10 Dzuhur, Ashar, Maghrib, Isya | tidur | berjalan | tidak ada |
| 31/10 Subuh 04.38 | tidur | berjalan | tidak ada |
| 31/10 Dzuhur 12.01 | bangun | tidak berjalan (11.08–12.18) | tidak ada |
| 31/10 Ashar 15.20 | tidur (clamshell) | PID 16612 | tidak ada |
| 31/10 Maghrib 18.04 | bangun | PID 20495 | 18.04.00.026 |
| 31/10 Isya 19.14 | tidur, bangun 19.24.02 | PID 20495 | tidak ada |

- Bunyi terdengar tepat di menit sholat setiap kali Mac bangun dan Notching berjalan.
- Saat Mac tidur, tidak ada bunyi. Isya 31/10 telat 10 menit 2 detik saat Mac bangun, jadi sesuai `LATE_MS` (10 menit) notifikasinya tidak dikirim.
- Di `notify.rs`, bunyi diputar di fungsi yang sama yang mengirim telinga ke layar di bawah kursor. Tetapi telinga di layar tidak meninggalkan jejak di log. Karena itu statusnya Sebagian sampai pemilik melihatnya di waktu sholat berikutnya, saat Mac bangun.
