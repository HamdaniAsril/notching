# Catatan desain (brainstorming)

Catatan berjalan dari sesi brainstorming. Sudah dirangkum menjadi dokumen desain di `docs/superpowers/specs/2026-10-27-notch-design.md`. Kalau ada perbedaan, dokumen desain itu yang berlaku.

## Tujuan

- App notch untuk Mac dan Windows yang mengumpulkan tools harian di satu tempat.
- Setiap fitur adalah modul yang bisa dinyalakan, dimatikan, dan idealnya di-install atau di-uninstall, supaya ukuran awal kecil.
- Awalnya untuk dipakai sendiri, lalu dirilis gratis untuk publik. Landing page punya tombol donasi ala Buy Me a Coffee.
- Pembeda utama dari Vorssaint: tampilan dan layout yang lebih rapi, tenang, dan mudah dicari.

## Gaya visual dan bahasa

- **Gaya visual: Nothing OS.** Monokrom (hitam dan putih), sangat minim, satu jenis huruf, sedikit elemen per layar, terasa tenang. Ini acuan utama untuk Beranda dan kartu lain.
- **Gaya bahasa: seperti web DynamicNotch** (dynamicnotch.evgeniy-petrukovich.workers.dev):
  - Kalimat pendek dan tegas. Judul berupa dua ketukan sejajar, misalnya "X. Untuk Y."
  - Menyapa pembaca sebagai "kamu" atau "Mac-mu". Tidak memakai sudut pandang "kami".
  - Membangun kepercayaan: gratis, tanpa iklan, tanpa pelacakan, open source, hemat baterai.
  - Angka sebagai bukti: "20+ fitur", "100% privat".
  - Nama fitur berupa frasa deskriptif biasa, bukan nama merek buatan.
  - Dipakai untuk landing page dan teks di dalam app.
- **Bahasa antarmuka versi pertama: Indonesia dan Inggris.**
  - Bahasa otomatis mengikuti bahasa perangkat, dan bisa diganti di pengaturan.
  - Semua teks disimpan di file terjemahan terpisah, jadi bahasa lain bisa ditambah dengan satu file baru.
  - Gaya bahasanya sama di kedua bahasa.

## Bentuk notch

- **Tanpa notch fisik (Windows, Mac tanpa notch):** saat diam tampil sebagai lensa tipis di tengah atas (bentuk B3, tebal 4px).
- **Mac dengan notch:** saat diam tidak terlihat sama sekali.
- **Hover:** muncul satu tetesan yang menyatu dengan notch, kedalaman 9px, kenyal dan cepat.
- **Klik:** panel mengembang dari notch dengan sedikit pantulan (sekitar 3%). Kekenyalan panel tidak ikut slider kenyal tetesan.
- **Bentuk panel:** normal dan simetris. Bentuk organik atau asimetris sudah ditolak.
- **Navigasi:** pil hitam tipis berisi ikon garis kecil tanpa latar, di bawah panel. Muncul sekitar 0,32 detik setelah klik.
- Panel selalu membuka kartu terakhir yang dibuka.
- Menutup panel: klik di luar panel atau tekan Esc.

## Banyak monitor

- **Notch muncul di semua layar.**
  - Di MacBook dengan notch, notch tetap tidak terlihat saat diam.
  - Di layar lain, notch tampil sebagai lensa tipis.
- **Panel hanya terbuka di layar yang diklik.**
- **Notifikasi muncul di layar yang sedang ada kursornya.**
- **Pengaturan:** notch bisa dibatasi ke satu layar saja, misalnya layar utama.

## Halaman pengaturan

- **Jendela biasa**, bukan di dalam notch, dibuka dari ikon ⋯ di ujung kanan pil.
- **Struktur terpilih: S1, sidebar per bagian.**
  - Sidebar berisi enam bagian: Umum, Tampilan notch, Notifikasi, Modul, Izin, Tentang.
  - Halaman Modul berisi daftar modul terpasang. Setiap modul punya tombol nyala/mati dan ukurannya. Klik modul untuk masuk ke halaman pengaturannya sendiri. Ada tombol "+ Tambah modul".
  - Setiap modul punya halaman sendiri yang memuat semua pengaturannya dan tombol "Copot modul".
  - Kotak pencarian selalu ada di atas sidebar. Pencarian juga mencari nama modul.
  - Alasan memilih S1: sidebar tetap pendek, berapa pun modul yang terpasang.
- **Gaya:** Nothing OS, sama dengan Beranda.
- Mockup: `.superpowers/brainstorm/9766-1793049475/content/settings.html`.

## Pengaturan tampilan notch

Empat slider masuk ke pengaturan. Nilai bawaannya:

| Slider | Bawaan |
|---|---|
| Kenyal | 100 (maksimal) |
| Kecepatan | 200 (maksimal) |
| Jarak tetesan | 9px |
| Tebal notch | 4px |

## Notifikasi

- **Mac dengan notch:** "telinga" muncul di kiri dan kanan notch selama sekitar 3,5 detik. Logo app di kiri, keterangan di kanan.
- **Tanpa notch:** lensa langsung membuka menjadi pil kecil dengan isi yang sama.
- **Glow G2:** pinggiran pelangi penuh warna, supaya terlihat di latar apa pun. Bisa dinyalakan atau dimatikan di pengaturan notifikasi.

## Beranda (kartu pertama)

- **Isi:**
  - Tanggal
  - Cuaca
  - Jam (opsional)
  - Reminder
  - Waktu sholat berikutnya
  - Status mini modul yang sedang berjalan
- **Tidak dimasukkan:** agenda, baterai, zona waktu kedua.
- **Arah layout:**
  - 2–3 kolom, terlihat profesional dan tenang.
  - Tanggal dan cuaca dibuat besar.
  - Hirarkinya jelas.
- **Layout terpilih: N2, tiga kolom dengan pemisah garis titik-titik.**
  - Kolom 1: titik merah dan nama hari, tanggal besar (angka titik-titik, putih), bulan dan tahun.
  - Kolom 2: kota, suhu besar (angka titik-titik, sama besar dengan tanggal tetapi lebih redup), kondisi cuaca dan suhu terendah/tertinggi.
  - Kolom 3 ("Berikutnya"): sholat berikutnya dengan baris titik hitung mundur, lalu reminder.
  - Bawah: garis titik-titik, status mini (lagu, timer, agent), dan jam kecil di kanan.
  - Mockup: `.superpowers/brainstorm/9766-1793049475/content/beranda-nothing.html`.
- **Bahan gaya Nothing OS yang dipakai:**
  - Angka titik-titik 5x7 yang digambar sendiri (bukan font milik Nothing).
  - Label kecil huruf kapital monospace.
  - Satu titik merah.
  - Garis titik-titik sebagai pemisah.
  - Jam kecil di pojok kanan bawah.
  - Titik kecil di bawah ikon aktif di pil.

### Sumber data Beranda

| Data | Sumber |
|---|---|
| Lokasi | Nama kota diketik sekali di pengaturan. Lokasi perangkat jadi pilihan tambahan. Cuaca dan sholat memakai kota yang sama. |
| Cuaca | Open-Meteo: gratis, tanpa akun, tanpa kunci API. |
| Waktu sholat | Dihitung di perangkat dengan adhan-js (MIT), tanpa internet. Bawaannya metode Kemenag RI, bisa diganti di pengaturan. |
| Reminder | Disimpan lokal di dalam app. Sinkron dengan Apple Reminders atau Google menyusul di tahap 2, barengan dengan Kalender. |

## Tech stack

- **Tauri 2.**
  - Satu kode untuk Mac dan Windows.
  - Tampilan dibuat dengan HTML, CSS, dan JavaScript, jadi animasi dari mockup bisa dipakai ulang.
  - Bagian yang menyentuh sistem ditulis dengan Rust.
- **Di Mac:** jendela di atas notch memakai plugin `tauri-nspanel`.
- **Modul:** bisa diunduh terpisah sebagai paket web. Kalau nanti modul dibuka untuk orang lain, mereka cukup menulis JavaScript.
- **Ditolak:**
  - Swift + C#: dua app terpisah.
  - Flutter: modul tidak bisa diunduh terpisah.
  - Electron: lebih dari 100 MB.

## Modul per tahap

| Tahap | Modul |
|---|---|
| 1 (versi pertama) | Beranda, Timer, Keep awake, Freeze keyboard, Kamera cermin, Catatan, System stat |
| 2 | Music player dan lirik, Kalender, Pantau agent |
| 3 | Uninstall app |

- **Kenapa urutannya begini:**
  - Tahap 1 berisi modul harian yang relatif mudah dibuat sama baiknya di Mac dan Windows. Jumlahnya cukup untuk menguji sistem pasang-copot modul.
  - Tahap 2 butuh izin sistem operasi atau data dari luar. Contohnya, macOS membatasi app lain membaca lagu yang sedang diputar.
  - Tahap 3 paling berisiko karena menghapus file.
- **Notifikasi versi pertama:** hanya dari modul sendiri (timer selesai, reminder, waktu sholat, agent selesai). Notifikasi dari app lain seperti WhatsApp atau Slack ditunda, karena macOS tidak memberi akses resmi ke sana.

## Referensi

- Disukai: gaya Nothing OS, dan bahasa di web DynamicNotch.
- Sempat ditandai: boring.notch dan DynamicNotch (app notch open source).
- Dari Vorssaint, ide yang layak dipinjam (idenya saja, bukan kodenya):
  - Halaman izin yang menjelaskan setiap izin dan fitur mana yang memakainya.
  - Preset dan ekspor pengaturan.

## Belum diputuskan

Semua topik brainstorming sudah diputuskan. Langkah berikutnya: menulis dokumen desain.
