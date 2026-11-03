# Desain katalog modul

Tanggal: 4 November 2026
Status: disetujui pemilik ide (4 November 2026). Dikerjakan tanpa sesi tanya-jawab ("kerjakan sampai selesai dulu"). Semua keputusan ditulis sebagai **keputusan penulis**, lalu pemilik ide menyetujui daftar di bagian 10 tanpa perubahan.

Dokumen ini menyelesaikan sisa tahap 2 di `2026-10-27-notch-design.md` (§6, "Sistem modul") dan katalog yang disebut di `2026-10-30-halaman-widget-design.md` §2 dan §11. Untuk hal lain, kedua desain itu tetap berlaku.

## 1. Kenapa

Notching dijanjikan modular: setiap fitur bisa dipasang dan dicopot. Sekarang janji itu baru separuh jalan.
- Modul bisa dicopot, tapi tempat memasangnya lagi hanya berupa daftar polos "+ Tambah modul". Isinya hanya modul yang pernah dicopot.
- Paket widget (Waktu, Sekitar, Rencana, Fokus, Musik) selalu terpasang. Orang yang tidak butuh widget musik tidak bisa membuangnya.
- Tidak ada satu tempat untuk melihat semua yang bisa dimiliki Notching.

Katalog menjadi tempat itu: semua isi Notching dalam satu halaman, masing-masing dengan tombol Pasang atau Copot.

## 2. Tujuan, bukan tujuan, dan yang harus dihindari

**Tujuan**
- Satu halaman yang menampilkan semua modul dan paket widget bawaan, lengkap dengan statusnya.
- Paket widget bisa dicopot dan dipasang lagi, sama seperti modul.
- Sebelum memasang, kamu tahu apa yang kamu dapat: isi paket, izin sistem yang dibutuhkan, dan ukurannya.
- Tetap tanpa internet. Semua isi katalog sudah ada di dalam app.

**Bukan tujuan**
- Modul atau widget buatan orang lain, atau unduhan dari GitHub atau URL (lihat bagian 7).
- Update modul terpisah dari app. Modul tetap diperbarui bersama app.
- Katalog di dalam notch. Notch tetap tenang; memasang dan mencopot dilakukan di jendela Pengaturan.

**Yang harus dihindari**
- **Toko yang ramai.** Tidak ada banner, peringkat, "populer", atau warna-warni. Kartu tenang dengan gaya Volt.
- **Mencopot tanpa sengaja.** Copot selalu butuh klik kedua, seperti di halaman modul.
- **Halaman custom yang rusak** setelah paket dicopot. Posisi widget tetap disimpan dan kembali sendiri saat paketnya dipasang lagi (desain halaman §4).

## 3. Isi katalog

- **Semua modul bawaan:** System stat, Keep awake, Timer, Keyboard clean, Cermin, Titipan, Screenshot, Cleaner. Yang terpasang maupun yang belum.
- **Semua paket widget bawaan, kecuali paket Beranda (`home`).** Jadi Waktu, Sekitar, Rencana, Fokus, dan Musik.
  - Paket Beranda tidak bisa dicopot. Ia berisi widget Tanggal, Jam, Cuaca, Waktu sholat, dan Reminder, serta notifikasi reminder dan waktu sholat. Beranda harus selalu bisa dipakai (desain halaman §2). Karena tidak ada yang bisa dilakukan dengannya, paket ini tidak ditampilkan di katalog.
- **Urutan:** urutan katalog app (`modules/index.json`), modul dulu lalu paket widget. Urutannya tetap, jadi kartu tidak melompat setelah tombol diklik.

## 4. Tempat katalog

- **Di Pengaturan, bagian Modul.** Tombol "+ Tambah modul" di kanan atas diganti tombol **"Katalog"**. Katalog adalah halaman di dalam bagian Modul, dengan tombol kembali ke Modul, sama seperti halaman sebuah modul. Sidebar tetap enam bagian (desain awal §8).
- **Halaman lama "Tambah modul" diganti katalog.** Semua jalan yang dulu menuju ke sana (pencarian, tombol) kini menuju katalog.
- **Dari editor halaman:** kalau ada paket widget yang belum terpasang, di bawah daftar widget muncul satu baris "Widget lain ada di Katalog" yang membuka katalog.
- **Pencarian Pengaturan:** setiap modul dan paket widget bisa dicari dengan namanya. Modul yang terpasang membuka halamannya. Modul yang belum terpasang dan semua paket widget membuka katalog, dengan kartunya disorot.
- **Notch tidak berubah.** Halaman Modul di notch tetap hanya berisi modul yang terpasang dan menyala.

## 5. Tampilan

Gaya Volt yang sama dengan bagian Pengaturan lain: kartu gelap, label Space Mono kapital kecil, aksen hanya untuk tombol utama.

**Kepala halaman**
- Judul "Katalog", dengan keterangan: "Semua isi Notching. Sudah ada di app, tanpa unduhan."
- Di bawahnya, saringan berbentuk chip, gayanya sama dengan saringan di editor halaman: **Semua · Modul · Widget**. Bawaannya Semua.

**Kartu**
Kartu disusun dalam grid dua kolom, dan menjadi satu kolom kalau jendela sempit.
- **Atas:** ikon, nama, dan label jenis di kanan ("MODUL" atau "WIDGET").
- **Keterangan:** satu kalimat dari file bahasa modul.
- **Isi:**
  - Paket widget: pratinjau kecil widget-widgetnya, digambar seperti di editor halaman, ditambah jumlahnya ("6 widget").
  - Modul: izin sistem yang dibutuhkan ("Butuh izin: Kamera"), atau "Tanpa izin sistem".
- **Kaki:** versi dan ukuran ("v1.0.0 · 48 KB"), lalu tombol:
  - Belum terpasang: **Pasang** (tombol aksen).
  - Terpasang: tanda "Terpasang" dan tombol **Copot** (merah). Klik pertama mengubahnya menjadi "Yakin? Klik lagi" selama 4 detik, sama seperti di halaman modul.
- Kalau dibuka dari pencarian, kartunya disorot sebentar dan digulir ke tengah.

## 6. Perilaku

- **Pasang modul:** salinan dari app dipasang lagi dan modul langsung menyala, seperti "+ Tambah modul" sekarang. Kamu tetap di katalog; kartunya berubah menjadi "Terpasang".
- **Copot modul:** sama dengan tombol "Copot modul" di halaman modul. Layanannya berhenti (Keep awake, Timer, dan lainnya), dan kamu tetap di katalog.
- **Pasang paket widget:** widgetnya muncul lagi di daftar widget editor halaman, dan di halaman mana pun yang dulu memakainya.
- **Copot paket widget:**
  - Folder aktifnya dihapus. Salinan aslinya tetap ada di app.
  - Widgetnya hilang dari daftar widget editor halaman.
  - Di halaman custom yang memakainya, posisinya tetap disimpan dan tempatnya kosong di notch. Di editor, tempat itu tampil redup, seperti widget dari modul yang dimatikan.
  - Musik: layanan Now playing (perl) ikut berhenti, seperti saat modul dimatikan.
- **Gagal:** kalau memasang atau mencopot gagal, tombol kembali seperti semula dan pesan kesalahan tampil dengan cara yang sama seperti penyimpanan Pengaturan lain.
- **Update app:** paket yang dicopot tetap tercopot setelah app diperbarui. Paket yang terpasang diganti dengan versi baru, seperti modul sekarang.

## 7. Modul dari luar: belum sekarang

Modul buatan orang lain tidak masuk versi ini. Alasannya:
- Desain awal §6 menaruh unduhan, pemeriksaan tanda tangan, dan penguncian versi API bersama "modul pertama yang perlu diunduh". Modul seperti itu belum ada.
- Versi Windows sedang dikerjakan, jadi API modul masih bisa berubah.

Yang sudah siap untuk nanti:
- Halaman modul sudah tanpa jaringan (CSP `connect-src 'none'`) dan hanya bisa memakai kemampuan yang disebut di manifest-nya (`gate.rs`).
- Kartu katalog sudah menampilkan izin sistem sebelum memasang. Modul dari luar nanti cukup menambah baris "Kemampuan yang dipakai".

Syarat saat modul dari luar dibuat nanti, supaya tidak dilupakan:
- Sumbernya hanya GitHub Releases, diunduh oleh bagian Rust app.
- Paket ditandatangani, dan tanda tangannya diperiksa sebelum dipasang.
- Sebelum memasang, layar persetujuan menampilkan izin dan kemampuan yang dipakai.
- Versi API modul dikunci dan ditulis di manifest.

## 8. Catatan teknis untuk pembuat

- `ModuleStore::uninstall` dan `reinstall` kini menerima paket widget juga, kecuali `home`. Paket `home` ditolak dengan kesalahan tersendiri.
- `Settings.uninstalled_modules` menyimpan id paket widget juga. Nama field-nya tetap, supaya file pengaturan lama tetap terbaca.
- `ModuleStore::sync` menghapus paket widget yang tercopot, sama seperti modul.
- `ModuleStore::list` menandai paket widget yang tercopot sebagai `installed: false, enabled: false`. Kode yang sudah ada di app inti (`width_of`, gate, protokol) dan di tampilan (`widgetCatalog`) sudah menyaring dengan `installed && enabled`, jadi paket yang tercopot otomatis hilang dari mana-mana.
- `set_enabled` tetap hanya untuk modul. Paket widget tidak punya saklar nyala/mati; ia terpasang atau tidak.
- Rute `add` di Pengaturan diganti rute `catalog`. Sorotan dari pencarian memakai cara yang sudah ada: setiap kartu punya `data-row="catalog.<id>"`.
- Bridge browser (`npm run dev`) ikut mendukung memasang dan mencopot paket widget.

## 9. Pengujian

- Rust: menyimpan, memasang, dan mencopot paket widget; `home` ditolak; `sync` menghapus paket yang tercopot; `list` menandainya.
- Tampilan: kartu modul dan paket, saringan, tombol Pasang dan Copot dua klik, sorotan dari pencarian, baris "Widget lain ada di Katalog" di editor halaman, dan kedua bahasa.
- Di app: memasang dan mencopot satu modul dan satu paket widget, lalu memeriksa notch, editor halaman, dan file pengaturan. Hasilnya ditulis di dokumen verifikasi.

## 10. Keputusan penulis untuk diperiksa pemilik ide

1. Katalog hanya berisi isi bawaan; modul dari luar ditunda (bagian 7).
2. Katalog ada di Pengaturan, sebagai halaman di bagian Modul. Notch tidak berubah.
3. Paket widget kini bisa dicopot, kecuali paket Beranda, yang juga tidak ditampilkan di katalog.
4. Kartu dalam grid dua kolom, dengan pratinjau widget untuk paket dan izin sistem untuk modul.
5. Saringan Semua · Modul · Widget.
6. Setelah Pasang atau Copot, kamu tetap di katalog.
7. Urutan kartu tetap mengikuti urutan app, tidak dipisah antara yang terpasang dan yang belum.
8. Editor halaman diberi baris "Widget lain ada di Katalog" kalau ada paket yang belum terpasang.
