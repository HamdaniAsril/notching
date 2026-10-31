# Desain halaman custom, widget, dan halaman Modul

Status: disetujui pemilik ide (30 Oktober 2026).

Dokumen ini mengubah sebagian desain awal di `2026-10-27-notch-design.md`. Bagian yang diganti dirangkum di bagian 10. Untuk hal lain, desain awal tetap berlaku.

Mockup ada di `2026-10-30-halaman-widget-mockups/`. File-file ini potongan halaman untuk alat brainstorming, jadi gayanya baru lengkap kalau dibuka lewat alat itu.
- `page-layout.html`: pilihan **C**.
- `modules-page.html`: pilihan **A**.
- `live-status.html`: pilihan **A** untuk layar ber-notch, pilihan **B** untuk layar tanpa notch.

## 1. Kenapa

Pemilik ide ingin Notching benar-benar modular dari sisi pengguna, tidak hanya dari sisi kode. Kamu menyusun sendiri halaman yang kamu lihat di notch dari widget, seperti membuat modul sendiri tanpa menulis kode.

Sampai sekarang, setiap modul punya ikon sendiri di pil, dan Beranda punya tata letak tetap (N2). Dengan desain ini:
- **Pil berisi halaman, bukan modul.** Jadi pil tetap pendek berapa pun modul yang terpasang.
- **Alat** seperti Timer dan Keep awake dikumpulkan di satu halaman Modul.
- **Hal yang cukup dilihat sekilas** seperti tanggal, cuaca, dan reminder menjadi widget yang bisa ditaruh di halaman mana pun.

## 2. Tujuan, bukan tujuan, dan yang harus dihindari

**Tujuan**
- Kamu bisa menambah halaman custom, memberinya nama dan ikon, lalu mengisinya dengan widget pilihanmu, semua tanpa menulis kode.
- Beranda menjadi halaman custom pertama yang sudah tersedia dari awal.
- Semua modul ada di satu halaman Modul.
- Modul yang sedang berjalan, seperti Timer, bisa terlihat di samping notch walau panel tertutup.

**Bukan tujuan di desain ini**
- Widget buatan orang lain atau katalog widget untuk diunduh. Itu ikut katalog modul di tahap 2.
- Lebih dari satu baris widget per halaman.
- Tampilan baru System stat. Pemilik ide akan merancangnya sendiri nanti.

**Yang harus dihindari**
- **Halaman yang berantakan.** Aturan tata letak sengaja ketat, supaya hasilnya selalu rapi: satu baris, 4 kolom, dan widget hanya selebar 1 atau 2 kolom. Ini pembeda utama Notching dari Vorssaint.
- **Notch yang ramai saat diam.** Di samping notch, paling banyak satu status modul dan satu titik notifikasi.
- **Beranda hilang atau rusak selama perombakan.** Notching harus tetap bisa dipakai setiap hari di setiap langkah.

## 3. Pil dan jenis halaman

Urutan isi pil dari kiri ke kanan:
1. **Beranda.**
2. **Halaman custom buatanmu**, dengan urutan yang kamu atur.
3. **Modul.**
4. **⋯** untuk membuka pengaturan.

Posisi Modul dan ⋯ di ujung kanan tetap **(keputusan penulis)**.

Jenis halaman:
- **Halaman custom** disusun dari widget. Beranda termasuk di sini.
- **Halaman Modul** berisi tombol-tombol ke tiap modul (bagian 7).
- **Halaman sebuah modul**, misalnya Timer, dibuka dari halaman Modul. Halaman ini tidak punya ikon sendiri di pil.

Beranda selalu di urutan pertama, dan Modul selalu di urutan terakhir sebelum ⋯ **(keputusan penulis)**. Yang bisa diurutkan hanya halaman custom di antara keduanya.

Jumlah halaman custom tidak dibatasi. Pil makin lebar setiap kali halaman bertambah. Di lebar panel sekitar 520 px, pil muat kira-kira 15 ikon, dan itu cukup untuk pemakaian wajar. Kalau ikonnya lebih banyak dari itu, pil boleh lebih lebar dari panel **(keputusan penulis)**. Setiap halaman custom punya nama dan ikon. Ikonnya dipilih dari kumpulan ikon garis yang disediakan Notching.

Panel tetap membuka halaman terakhir yang dibuka, seperti sekarang. Titik putih kecil di bawah ikon pil (tanda notifikasi terlewat) kini ditaruh di ikon halaman yang berisi widget pengirim notifikasi itu **(keputusan penulis)**.

## 4. Halaman custom

- **Satu baris berisi 4 kolom sama lebar.** Widget menempati 1 atau 2 kolom.
- **Widget dipisah garis titik-titik vertikal**, seperti Beranda N2 sekarang.
- **Kolom yang kosong dibiarkan kosong** di notch.
- **Ukuran panel (keputusan penulis):**
  - Semua halaman custom memakai ukuran yang sama, supaya panel tidak berubah ukuran saat berpindah antarhalaman custom.
  - Lebarnya sekitar 520 px, sesuai simulasi ukuran panel tanggal 29 Oktober.
  - Tingginya cukup untuk widget tertinggi.
  - Angka pastinya ditentukan pembuat.
- **Angka besar di semua widget memakai huruf titik-titik dengan ukuran yang sama** **(keputusan penulis, dari permintaan pemilik ide untuk menyamakan ukuran huruf)**. Ukurannya sekitar 42 px, hasil simulasi 29 Oktober.
- **Satu widget boleh dipakai di lebih dari satu halaman.** Datanya sama. Misalnya reminder di Beranda dan di halaman Kerja adalah daftar yang sama.
- **Pengaturan widget juga dipakai bersama** **(keputusan penulis)**. Jam kerja yang dipasang di dua halaman memakai jam mulai dan jam selesai yang sama.
- **Dalam satu halaman, sebuah widget hanya boleh dipasang sekali** **(keputusan penulis)**.
- **Widget boleh membuka tampilan penuh di dalam panel** **(keputusan penulis)**:
  - Tampilan penuh menutupi seluruh halaman dan punya tombol kembali, sama seperti halaman sebuah modul. Ukuran panel tidak berubah.
  - Contohnya, klik widget Reminder membuka daftar reminder lengkap dengan kolom untuk menambah reminder. Nanti Catatan cepat juga bisa memakai cara ini.
- **Kalau sumber widget hilang,** misalnya modulnya dimatikan atau dicopot, posisinya di halaman tetap disimpan **(keputusan penulis)**:
  - Di notch, tempatnya kosong.
  - Di editor, widgetnya tampil redup dengan keterangan "modul dimatikan".
  - Widget kembali muncul sendiri begitu modulnya dinyalakan atau dipasang lagi.

## 5. Widget

### Aturan umum

- Satu widget bisa berisi beberapa data sekaligus, misalnya jam dan tanggal.
- Setiap widget punya jenis, yang dipakai untuk filter di editor: Waktu, Cuaca, Ibadah, Kerja, Media.
- **Widget bisa berasal dari Notching sendiri atau dari sebuah modul.** Contohnya, modul Timer menyediakan widget Timer. Hitung mundurnya tampil di halaman custom, dan kontrol lengkapnya ada di halaman modul Timer.
- **Widget memakai sistem paket yang sama dengan modul** **(keputusan penulis)**:
  - Widget adalah paket web yang terdaftar di manifest.
  - Widget hanya boleh memakai kemampuan sistem yang disebut di manifest itu.
  - Satu paket boleh menyediakan halaman modul, widget, atau keduanya.
- **Widget yang punya pengaturan sendiri diatur di editor halaman**, misalnya jam kerja **(keputusan penulis)**.

### Daftar widget dan kapan dibuat

| Widget | Jenis | Lebar | Isi | Langkah |
|---|---|---|---|---|
| Tanggal | Waktu | 1 | Titik merah dan nama hari, tanggal dengan huruf titik-titik, bulan dan tahun | 1 |
| Cuaca | Cuaca | 1 | Kota, suhu dengan huruf titik-titik, kondisi, terendah/tertinggi | 1 |
| Waktu sholat | Ibadah | 1 | Sholat berikutnya dan jamnya, baris titik, sisa waktu | 1 |
| Reminder | Kerja | 2 | Tiga reminder terdekat (semula dua; diubah atas permintaan pemilik saat cek bagian A). Klik untuk membuka daftar lengkap dan menambah reminder, sebagai tampilan penuh (bagian 4) | 1 |
| Jam | Waktu | 1 | Jam dengan huruf titik-titik | 1 |
| Jam + tanggal | Waktu | 2 | Jam dan tanggal dalam satu widget | 2 |
| Jam kerja | Kerja | 1 | Lihat bawah | 2 |
| Catatan cepat | Kerja | 2 | Catatan teks yang disimpan lokal. Fokus keyboard boleh masuk ke panel saat mengetik. | 2 |
| Timer | Kerja | 1 | Hitung mundur dari modul Timer | 3 |
| Now playing | Media | 2 | Lagu yang sedang diputar | Tahap 2, bersama modul Music |

Widget langkah 1 berasal dari isi Beranda yang sekarang. Datanya tetap sama:
- Kota yang diketik sekali.
- Open-Meteo untuk cuaca.
- Rumus Adhan dengan metode Kemenag RI untuk waktu sholat.
- Reminder disimpan lokal.

### Jam kerja

- Saat widget ini ditambahkan, editor meminta jam mulai dan jam selesai. Keduanya bisa diubah nanti di editor.
- Widget menunjukkan dua hal:
  - sudah berapa lama kamu bekerja hari ini, dihitung dari jam mulai, misalnya "2 j 30 m",
  - berapa lama lagi sampai jam selesai.
- Hitungannya memakai jam yang kamu isi, bukan waktu kamu mulai memakai Mac.
- Di luar jam kerja, widget menampilkan keadaan yang tenang, misalnya "Selesai", bukan angka negatif.
- Akhir pekan juga ditampilkan tenang, misalnya "Libur". Hari kerja bawaannya Senin–Jumat dan bisa diubah di editor **(keputusan penulis)**.

## 6. Beranda baru

- **Isinya: Tanggal (1 kolom), Cuaca (1 kolom), dan Reminder (2 kolom).**
- **Baris bawah N2 dihapus.** Baris itu berisi status mini dan jam kecil. Pengaturan "tampilkan jam" ikut hilang.
- **Status modul yang sedang berjalan pindah ke samping notch** (bagian 8).
- **Waktu sholat tidak lagi ada di Beranda,** tapi tetap tersedia sebagai widget untuk halaman lain.
- **Notifikasi waktu sholat tetap berjalan** walau widgetnya tidak dipasang di mana pun.
- **Beranda bisa diubah isinya di editor** seperti halaman custom lain, tapi tidak bisa dihapus.

## 7. Halaman Modul

Acuan: `modules-page.html`, pilihan A.

- **Kotak ikon seperti Pusat Kontrol:** ikon garis besar dengan nama kecil di bawahnya.
- **Satu baris berisi 6 kotak.** Modul berikutnya turun ke baris baru, dan panel memanjang ke bawah.
- **Modul yang sedang menyala tampil putih,** misalnya Keep awake.
- **Modul yang sedang berjalan diberi titik merah kecil,** misalnya Timer.
- **Klik kotak, panel berganti ke halaman modul itu.**
  - Halaman modul punya tombol kembali ke halaman Modul.
  - Esc dan klik di luar tetap menutup panel.
- **Isi halaman Modul:**
  - Langkah 1: System stat.
  - Langkah 3: Timer, Keep awake, Freeze keyboard, Kamera cermin.
  - Tahap 3: Uninstall app.
- **System stat memakai tampilan kartunya yang sekarang** sampai pemilik ide merancang ulang **(keputusan penulis)**.
- **Urutan kotak** sama dengan urutan di Pengaturan, bagian Modul.

## 8. Status di samping notch

Acuan: `live-status.html`.

Saat panel tertutup, modul yang sedang berjalan bisa menampilkan status singkat di samping notch. Contohnya hitung mundur Timer "18:42".

- **Layar ber-notch (pilihan A):**
  - Status ada di sisi kanan. Notch melebar ke kanan setinggi notch fisik, dan status ditulis putih dengan huruf monospace.
  - Titik notifikasi terlewat tetap di sisi kiri, seperti sekarang.
  - Kalau keduanya ada, notch melebar ke dua arah.
- **Layar tanpa notch (pilihan B):**
  - Lensa membuka menjadi satu pil kecil berisi titik merah (kalau ada) dan status.
  - Kalau hanya ada titik, titik tetap menggantung di bawah lensa seperti sekarang.
- **Satu status saja.** Kalau beberapa modul ingin tampil, yang tampil hanya yang paling akhir dinyalakan.
- **Muncul di layar yang ada kursornya,** sama seperti notifikasi.
- **Bisa dimatikan per modul** di halaman pengaturan modul itu.
- **Saat notifikasi tampil,** "telinga" notifikasi menggantikan status sementara. Setelah notifikasi selesai, status kembali **(keputusan penulis)**.
- **Modul menyatakan di manifest bahwa ia memakai status samping notch.** Statusnya teks pendek, paling banyak sekitar 6 karakter, atau ikon kecil **(keputusan penulis)**.
- **Status ini menggantikan "status mini" di Beranda lama.**

## 9. Editor halaman di Pengaturan

- **Bagian baru "Halaman"** di sidebar pengaturan, ditaruh sebelum bagian Modul. Sidebar jadi tujuh bagian.
- **Daftar halaman:**
  - Beranda, halaman-halaman custom, dan Modul, dengan urutan yang sama seperti di pil.
  - Halaman custom diurutkan dengan diseret. Beranda tetap di urutan pertama, dan Modul tetap di ujung.
  - Halaman custom bisa diganti nama, diganti ikon, dan dihapus. Beranda dan Modul tidak bisa dihapus.
- **Tombol "+ Tambah halaman"** langsung membuka halaman kosong:
  - **Di atas:** pratinjau baris 4 kolom yang kosong.
  - **Di bawah:** semua widget yang tersedia, dengan filter per jenis.
  - **Menambah widget:** klik widgetnya untuk mengisi tempat kosong pertama yang cukup lebar, atau seret ke tempat tertentu.
  - **Mengurutkan:** seret widget di pratinjau.
  - **Menghapus widget:** dari pratinjau.
  - Widget yang tidak muat karena kolomnya sudah penuh ditampilkan redup di daftar.
- **Pengaturan data bersama** seperti kota dan metode hitung sholat pindah ke bagian Halaman, karena dipakai beberapa widget **(keputusan penulis)**.
- **Bagian Modul tetap ada** untuk menyalakan, mematikan, mencopot, dan masuk ke pengaturan tiap modul. Beranda tidak lagi muncul di daftar modul.

## 10. Yang berubah dari desain 27 Oktober

| Desain awal | Sekarang |
|---|---|
| §4.4 Klik notifikasi membuka kartu modulnya | Membuka halaman pertama yang berisi widget pengirimnya. Kalau tidak ada, membuka Beranda. Notifikasi dari modul membuka halaman modul itu **(keputusan penulis)**. |
| §4.4 Titik putih di ikon modul di pil | Titik putih di ikon halaman (bagian 3) |
| §6 Setiap modul punya ikon sendiri di pil | Pil berisi halaman. Modul ada di halaman Modul. |
| §6 Beranda adalah modul | Beranda adalah halaman custom dari widget |
| §6 Catatan adalah modul | Catatan cepat adalah widget |
| §6 Timer dan Keep awake tampil di status mini Beranda | Tampil di samping notch (bagian 8) |
| §7 Layout N2, tiga kolom dengan baris bawah | Tanggal, Cuaca, Reminder. Baris bawah dan jam kecil dihapus. |
| §7 Klik kolom "Berikutnya" untuk daftar reminder | Klik widget Reminder |
| §8 Enam bagian di sidebar | Tujuh, ditambah bagian Halaman |
| Rangkaian rencana: Rencana 5 adalah lima modul tahap 1 | Lihat bagian 11 |

Simulasi ukuran panel tanggal 29 Oktober (`2026-10-27-notch-mockups/panel-sizes.html`) tidak dikerjakan terpisah. Hasilnya, yaitu ukuran huruf titik-titik yang sama dan lebar sekitar 520 px, dipakai di bagian 4.

## 11. Urutan pengerjaan

1. **Langkah 1: ekosistem, memakai isi yang sudah ada**
   - Sistem halaman di pil.
   - Halaman custom dengan baris 4 kolom.
   - Editor halaman.
   - Widget Tanggal, Cuaca, Waktu sholat, Reminder, dan Jam.
   - Beranda baru.
   - Halaman Modul dengan System stat.
   - Status samping notch. Bisa diuji dengan status contoh, karena Timer belum ada.

   Notching harus tetap bisa dipakai setiap hari selama langkah ini.
2. **Langkah 2: widget baru.** Jam + tanggal, Jam kerja, dan Catatan cepat.
3. **Langkah 3: modul baru.**
   - Timer, dengan widget dan status samping notch.
   - Keep awake.
   - Freeze keyboard.
   - Kamera cermin.

   Detail tiap modul mengikuti §6 desain awal.
4. **Sesudah itu, seperti rencana awal:**
   - tahap 2 (Music dan Now playing, Kalender, Pantau agent, katalog modul),
   - tahap 3 (Uninstall app),
   - versi Windows,
   - rilis publik.

Pada 31 Oktober 2026 pemilik ide memilih mengerjakan **langkah 3 sebelum langkah 2**, dimulai dari **Keep awake** (desainnya di `2026-10-31-keep-awake-design.md`). Urutan modul langkah 3 berikutnya dan langkah 2 diputuskan setelah Keep awake selesai.

Setiap langkah boleh menjadi satu rencana kerja atau lebih.

## 12. Diserahkan ke pembuat

- Ukuran pasti panel halaman custom, tinggi widget, dan jarak antarwidget, dalam batas bagian 4.
- Kumpulan ikon untuk halaman custom. Ikonnya garis, sejalan dengan ikon pil yang sudah ada, kira-kira 20–30 ikon.
- Bentuk manifest untuk widget dan status samping notch, dan cara data seperti reminder dibagi antarwidget.
- Cara memindahkan pengaturan dan data yang sudah ada:
  - urutan pil,
  - kartu terakhir,
  - modul `home` yang lama,
  - reminder dan kota yang tersimpan.

  Tidak ada data pengguna yang boleh hilang.
- Gerak saat berpindah dari halaman Modul ke halaman sebuah modul, mengikuti pegas yang sudah ada.
