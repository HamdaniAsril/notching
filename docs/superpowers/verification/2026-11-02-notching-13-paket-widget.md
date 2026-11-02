# Verifikasi paket widget

Tanggal: 2 November 2026
Perangkat: MacBook Air M4 dengan notch. Percobaan pertama 2 November sore, build uji tidak bertanda tangan.
Cabang: `feat/paket-widget`.

Desain: `docs/superpowers/specs/2026-11-02-paket-widget-design.md`.
Rencana: `docs/superpowers/plans/2026-11-02-notching-13-paket-widget.md`.

## Test otomatis

| Pemeriksaan | Hasil | Di awal |
|---|---|---|
| `npx tsc --noEmit` | lulus | |
| `npm test` | 944 lulus | 735 |
| `npm run build:modules` | lulus, termasuk `waktu`, `fokus`, `rencana`, `sekitar` | |
| `cargo test` | 408 lulus, 1 diabaikan (test jaringan) | 382 |

Test jaringan `live_search_and_forecast_through_macos_tls` juga dijalankan dengan `--ignored`. Hasilnya lulus terhadap Open-Meteo asli: pencarian kota, prakiraan per jam, dan kualitas udara.

## Cek di pratinjau browser

Dicek oleh pembuat dengan `npm run dev` (bridge browser, kota contoh Jakarta).

- **Editor halaman.** Ke-16 widget baru muncul di daftar beserta contoh tampilannya. Filter Waktu, Cuaca, dan Kerja ikut menyaring widget baru.
- **Halaman uji di notch.** Semua widget dipasang bergantian dengan ukuran sebenarnya: 1 kolom 109×104, 2 kolom 234×104, dan strip 484×40.
  - Skrip pemeriksa menelusuri setiap elemen di setiap frame. Tidak ada elemen yang keluar dari frame-nya.
  - Satu label terlihat terpotong, yaitu "BULAN · SEPARUH" di widget Bulan. Sekarang labelnya cukup nama fasenya saja.

## Checklist di Mac

Hasil "Lulus" dicatat setelah dicocokkan dengan file app, bukan hanya dari laporan lisan.

| # | Cek | Hasil | Bukti di file |
|---|---|---|---|
| 1 | Buat halaman baru di Pengaturan → Halaman. Pasang beberapa widget baru dari tiap kelompok (Waktu, Cuaca, Kerja). Widgetnya tampil di notch dan tidak ada yang terpotong. | Lulus sebagian | `settings.json` berisi halaman `p1` (`waktu/clockdate`, `fokus/workday`) dan `p2` (`fokus/breath`, `rencana/week`, `timer/tile`). Belum ada widget `sekitar/…` yang terpasang saat dicek. |
| 2 | Jam + tanggal: kota, tanggal, jam, dan titik jam berjalan. Jam analog: jarum detik bergerak. | Belum | |
| 3 | Kalender, Hari ke-, dan strip Minggu ini menunjukkan tanggal hari ini. | Belum | |
| 4 | Cuaca besar, Matahari, dan Bulan tampil untuk kota yang dipilih. | Belum | `weather.json` |
| 5 | Udara dan strip Cuaca per jam terisi, paling lambat sekitar 5 menit setelah app dibuka. | Lulus (data) | `air.json` ada (AQI 70). `weather.json` berisi 48 jam `hourly`. Keduanya ditulis pukul 15.42. |
| 6 | Pekan ini dan Berikutnya menampilkan reminder yang sama dengan widget Reminder. | Belum | `reminders.json` |
| 7 | Napas: klik untuk mulai, lingkarannya bergerak, dan klik lagi untuk berhenti. | Belum | |
| 8 | Timer kecil: geser untuk memilih menit, klik untuk mulai dan untuk jeda. Waktunya sama dengan strip Timer dan halaman Timer. | Gagal, sudah diperbaiki, cek ulang | Pemilik: setelah dimulai, timer kecil tidak bisa digeser lagi. Penyebabnya, geseran hanya diterima saat diam. Sekarang geseran saat berjalan atau jeda memulai menit baru begitu dilepas, sama seperti strip Timer (`a4b084b`). |
| 9 | Jam kerja: klik, ganti jam dan hari, lalu Simpan. Tampilannya ikut berubah. | Lulus (simpan) | `widget-prefs/fokus.json` berisi 08:00–16:00, Senin–Jumat, ditulis pukul 15.44. Pemilik minta sisa waktu dibuat lebih besar daripada waktu berlalu, sudah diubah (`af7da05`), cek ulang tampilannya. |
| 10 | Zona waktu: klik, pilih dua kota, lalu Simpan. Jamnya sesuai. | Belum | `widget-prefs/waktu.json` belum ada, jadi pilihan kota belum pernah disimpan. |
| 11 | Widget lama (Tanggal, Jam, Cuaca, Waktu sholat, Reminder, strip Timer) tetap seperti sebelumnya. | Belum | |
| 12 | Di monitor luar, halaman yang sama tampil normal. | Belum | |

Lokasi file:
- `settings.json`, `reminders.json`, dan `widget-prefs/` ada di folder data app.
- `weather.json` dan `air.json` ada di folder cache app.

Pemilik melaporkan "semuanya berjalan". Cek 2, 3, 4, 6, 7, 11, dan 12 tidak punya bukti di file atau belum dicoba khusus, jadi tetap "Belum" sampai dicek bersama.

## Keputusan penulis yang perlu dilihat pemilik

1. **Tampilan.** Kotak berwarna merah dan putih dari `widget.pego` tidak dipakai. Semua widget tetap berlatar hitam dengan garis titik di antaranya. Merahnya hanya dipakai di satu bagian per widget.
2. **Ukuran dan huruf.** Ukuran mengikuti panel notch, kira-kira 0,6 kali gambar. Huruf Doto diganti huruf titik Notching untuk angka dan Space Mono untuk kata. Strip setinggi 40 px diringkas menjadi dua baris.
3. **Widget yang tidak dibuat.**
   - Tanggal, Waktu Shalat, Jam Tumpuk, Tugas, dan Timer Strip, karena sudah ada.
   - Musik dan Musik Strip, yang menunggu bagian C.
   - Catatan cepat, karena modul Catatan dibatalkan.
4. **Agenda dan Minggu Ini memakai reminder, bukan kalender.** Namanya menjadi "Berikutnya" dan "Pekan ini". Keduanya tidak bisa diklik.
5. **Pengaturan Jam kerja dan Zona waktu ada di tampilan penuh widgetnya**, bukan di editor halaman. Pengaturan ini disimpan per paket, jadi sama di semua halaman.
6. **Jam kerja sebelum jam mulai menampilkan "Mulai 09.00".** Tulisan "Selesai" baru muncul setelah jam selesai.
7. **Napas** memakai pola 4-4-4-4 detik sebanyak 5 putaran.
8. **Zona waktu** bawaannya Tokyo dan London, dari 41 kota yang bisa dipilih.
9. **Udara.** "AQI" dipindah ke label atas supaya angka sampai 500 muat. App sekarang mengirim ke tiga alamat Open-Meteo. Yang ketiga khusus kualitas udara dan hanya menerima koordinat yang sudah dibulatkan.
10. **Matahari.** Jam terbit dan terbenam ditaruh bertumpuk di dua sisi, karena kalau dibuat satu baris tidak muat di 234 px.
11. **Bulan** dihitung di app tanpa internet. Hari menuju purnama atau bulan baru bisa meleset satu hari kalau jaraknya masih tiga minggu.
12. **Timer kecil saat berjalan.** Menggeser timer yang sedang berjalan atau dijeda langsung memulai menit baru begitu dilepas, seperti strip Timer. Saat diam, geseran hanya memilih menit dan klik yang memulai.
13. **Jam kerja.** Angka besar sekarang sisa waktu. Di bawah titik ada "SUDAH 1 J 18 M" (bahasa Inggris "1 H 18 M DONE"). Label terpanjang, "SUDAH 10 J 59 M", lebarnya sekitar 108,6 px di frame 109 px. Jadi masih muat, tapi pas sekali.

## Masih terbuka

- **Bagian C (Now playing).** Belum dikerjakan. Dimulai dengan percobaan membaca lagu yang sedang diputar di macOS 27, kalau pemilik setuju.
- **Utang kecil yang tercatat dari review akhir.**
  - Format durasi berbeda-beda antarwidget.
  - Aturan "malam" di Cuaca besar dan Cuaca per jam berbeda kalau jam matahari tidak ada.
  - CSS contoh widget di editor menyalin CSS paketnya.
  - Data udara lama tetap tampil kalau Mac lama offline.
