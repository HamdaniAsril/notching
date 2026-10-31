# Desain modul Timer dan strip tipis

Status: pemilik ide meminta dikerjakan sampai selesai lalu direview di akhir (31 Oktober 2026).

Dokumen ini merinci modul Timer dari desain awal (`2026-10-27-notch-design.md` §6) dan desain halaman (`2026-10-30-halaman-widget-design.md` §5, §7, §8, dan §11 langkah 3). Dokumen ini juga menambah satu bentuk widget baru, yaitu **strip tipis**. Hal yang tidak disebut di sini mengikuti kedua desain itu dan desain Keep awake (`2026-10-31-keep-awake-design.md`).

Mockup ada di `2026-10-31-timer-mockups/`:
- `strip-place.html`: letak strip di bawah panel. Gambaran isi strip di file ini sudah diganti oleh `strip-ruler.html`.
- `strip-slider.html`: tiga cara awal memakai slider. Tidak ada yang dipilih. Pemilik meminta slider garis-garis oranye.
- `strip-ruler.html`: **pilihan A, penggaris yang bergeser**. Ini yang dipilih pemilik.

File-file itu potongan halaman untuk alat brainstorming, jadi gayanya baru lengkap kalau dibuka lewat alat itu.

## 1. Kenapa

Pemilik butuh timer yang bisa dijangkau cepat. Contohnya saat merebus telur, atau saat sedang mengerjakan hal lain yang butuh hitungan waktu. Membuka panel, pindah ke halaman Modul, lalu masuk ke halaman Timer terasa terlalu jauh. Jadi Timer juga hadir sebagai strip tipis di bawah panel, yang bisa dipasang di halaman mana pun.

## 2. Tujuan, bukan tujuan, dan yang harus dihindari

**Tujuan**
- Strip tipis selebar 4 kolom di bagian bawah panel. Ini jenis widget baru, dan Timer adalah widget strip pertama. Widget strip lain bisa menyusul nanti.
- Timer dimulai dengan satu gerakan: geser penggaris lalu lepas, ketik jumlah menit lalu Enter, atau (di halaman Timer) klik tombol waktu.
- Penggarisnya berupa garis-garis oranye yang ikut bergeser saat diseret.
- Saat waktunya habis, muncul notifikasi dengan bunyi pendek sekali.
- Status Timer terlihat walau panel tertutup: titik merah di kotak Timer di halaman Modul, dan hitung mundur di samping notch.

**Bukan tujuan**
- Stopwatch. Pemilik tidak membutuhkannya.
- Beberapa timer sekaligus. Hanya ada satu timer pada satu waktu.
- Widget Timer dalam bentuk lain, misalnya 1 kolom di baris atas. Menyusul setelah ada lebih banyak template widget.
- Bunyi berulang sampai dimatikan. Pemilik memilih bunyi sekali saja.
- Mengingat timer setelah Notching keluar.
- Strip di halaman Modul atau di halaman sebuah modul.

**Yang harus dihindari**
- **Timer yang mulai tanpa sengaja.** Klik biasa di penggaris tanpa menggeser tidak memulai apa-apa **(keputusan penulis)**.
- **Hitungan yang meleset setelah Mac tidur.** Kalau tutup laptop ditutup saat timer jalan lalu dibuka setelah jam selesainya lewat, timer langsung selesai dan notifikasinya tetap muncul. Sisa waktu dari sebelum tidur tidak dilanjutkan.
- **Timer yang tetap jalan setelah modulnya dimatikan atau dicopot.** Timer berhenti, statusnya hilang, dan tidak ada notifikasi.
- **Strip yang mengubah halaman lain.** Halaman yang tidak diberi strip tetap persis seperti sekarang.

## 3. Strip tipis

- **Letak:** di bawah baris 4 kolom, dipisah garis titik-titik mendatar. Lebarnya sama dengan baris, yaitu 4 kolom.
- **Satu halaman paling banyak punya satu strip.** Strip bersifat pilihan.
- **Halaman yang diberi strip lebih tinggi** dari halaman tanpa strip. Tambahannya setinggi garis titik-titik ditambah strip, sekitar 56 px. Angka pastinya ditentukan pembuat **(keputusan penulis)**.
- **Hanya di Beranda dan halaman custom,** karena keduanya bisa diedit. Halaman Modul dan halaman sebuah modul tidak punya strip.
- **Beranda tidak otomatis diberi strip Timer.** Pemilik menambahkannya sendiri di editor, seperti widget lain **(keputusan penulis, mengikuti ucapan pemilik "sama seperti menambahkan widget yang lain")**.
- **Saat sebuah widget tampil penuh,** misalnya daftar Reminder, strip ikut disembunyikan sampai tampilan penuh ditutup **(keputusan penulis)**.
- **Kalau modul pemilik strip dimatikan atau dicopot,** strip hilang dari panel tapi tempatnya tetap tersimpan. Strip muncul lagi saat modulnya dinyalakan, sama seperti widget biasa (desain 30 Oktober §4). Selama strip hilang, halaman kembali setinggi halaman tanpa strip, supaya tidak ada pita kosong di bawah panel **(keputusan penulis)**.

### Di manifest

Widget strip ditulis di manifest seperti widget biasa, dengan lebar 4. Widget biasa tetap 1 atau 2 kolom. Lebar 3 tidak dipakai **(keputusan penulis)**.

### Di editor halaman

- **Pratinjau** menampilkan tempat strip di bawah baris, dipisah garis titik-titik. Kalau kosong, tempat itu bertuliskan "Strip" dengan gaya yang sama seperti tempat kosong di baris.
- **Daftar widget** menampilkan widget strip sebagai kartu selebar 4 kolom, dengan filter jenis yang sama seperti widget lain. Timer masuk jenis **Kerja**.
- **Klik kartu strip** untuk memasangnya di tempat strip. Kalau tempat strip sudah diisi widget strip lain, klik itu menggantinya, karena tempat strip hanya satu **(keputusan penulis)**. Kartu strip yang sudah terpasang redup dengan keterangan "Sudah dipasang".
- **Hapus** strip dengan tombol × di pratinjau, sama seperti widget lain.
- Strip tidak bisa diseret ke baris, dan widget baris tidak bisa diseret ke tempat strip **(keputusan penulis)**.

## 4. Strip Timer (pilihan A)

**Belum jalan**
- Dari kiri: tulisan **TIMER**, penggaris, lalu angka waktu dengan warna redup, misalnya "5:00". Tombol waktu tidak ada di strip, supaya penggarisnya lebih panjang. Ini diminta pemilik saat cek di Mac pada 31 Oktober; semula ada tombol 3m, 5m, 10m, dan 25m.
- **Penggaris:**
  - Ada satu garis putih tegak di tengah yang diam.
  - Garis-garis oranye di bawahnya bergeser saat diseret ke kiri atau kanan, seperti memutar kenop.
  - Jangkauan 1 sampai 60 menit. Satu garis berarti 1 menit, setiap 5 menit garisnya lebih panjang, dan setiap 10 menit diberi angka kecil.
  - Nilainya selalu menit bulat.
  - Garis di kiri tanda putih, yaitu menit yang dipilih, berwarna oranye penuh. Garis di kanannya oranye redup.
  - Kedua ujung penggaris memudar.
  - Warna oranye **#FF6A1A** **(keputusan penulis)**. Ini warna kedua di app selain merah titik. Pemilik sudah diberi tahu dan tetap memilih oranye.
- **Saat penggaris diseret,** angka waktu ikut berubah. **Saat dilepas, timer langsung jalan** dengan nilai itu.
- **Angka waktu bisa diketik** (diminta pemilik saat cek di Mac pada 31 Oktober). Ketik jumlah menit, misalnya "7" atau "7:00", lalu Enter, dan timer langsung jalan. Isian di luar 1–60 menit bulat tidak memulai apa-apa, dan angkanya kembali seperti semula **(keputusan penulis)**. Mengetik saat timer jalan mengganti waktunya, sama seperti menggeser penggaris.
- **Posisi penggaris saat belum jalan** adalah waktu terakhir yang dipakai **(keputusan penulis)**. Waktu bawaan saat app baru dibuka adalah **30 menit**, di tengah jangkauan 1–60, supaya penggaris terlihat penuh di kedua sisi garis putih. Diminta pemilik saat cek di Mac pada 31 Oktober; semula 5 menit.

**Sedang jalan**
- Titik merah kecil di depan tulisan TIMER.
- Penggaris pelan-pelan bergeser kembali ke 0, mengikuti sisa waktu.
- Angka waktu berwarna putih dan menghitung mundur per detik, dalam bentuk menit dan detik, misalnya "6:42".
- Di kanan ada tombol **Jeda** dan **Stop**.
- **Menggeser penggaris saat jalan** mengganti waktunya. Selama diseret, angkanya mengikuti penggaris. Saat dilepas, timer jalan lagi dari angka baru itu.

**Dijeda** **(keputusan penulis)**
- Penggaris dan angka berhenti di tempatnya.
- Tombol Jeda berganti menjadi **Lanjut**. Tombol Stop tetap ada.
- Titik merah tetap tampil, karena timer belum selesai.
- Menggeser penggaris saat dijeda menjalankan timer dengan waktu baru.

**Selesai**
- Bunyi pendek sekali, dan notch menampilkan notifikasi (bagian 7).
- Strip kembali ke keadaan belum jalan, dengan penggaris di waktu terakhir yang dipakai.

**Stop**
- Timer berhenti tanpa notifikasi, dan strip kembali ke keadaan belum jalan.

## 5. Halaman Timer

Halaman ini dibuka dari kotak Timer di halaman Modul. Di atasnya ada bar "‹ Modul", sama seperti modul lain.

Isinya memakai keadaan dan aturan yang sama dengan strip. Bentuknya diubah pemilik saat cek di Mac pada 31 Oktober:
- **Di atas:** penggaris yang lebih besar (garis lebih tinggi, 12 px per menit), dengan angka menit yang lebih besar di kanannya. Angka ini juga bisa diketik.
- **Di bawah:** tulisan TIMER dengan tombol **3m**, **5m**, **10m**, **25m** saat belum jalan, atau titik merah dengan **Jeda**/**Lanjut** dan **Stop** saat jalan. Tombol waktu tetap ada di halaman ini karena pemilik hanya meminta tombol itu dihapus dari strip **(keputusan penulis)**.
- Angka besar dari huruf titik-titik di atas, yang semula ada, dihapus.

Timer yang dijalankan dari halaman ini sama dengan timer di strip, karena hanya ada satu timer.

Ukuran pasti panel ditentukan pembuat dalam batas manifest, yaitu tinggi 40–240 px.

## 6. Cara kerja

- **Hitungan berjalan di app inti (Rust), bukan di halaman modul atau di strip.** Strip dan halaman modul ditutup saat panel tertutup, sedangkan timer harus terus berjalan. Strip dan halaman hanya membaca keadaan dan mengirim perintah: mulai, jeda, lanjut, stop. Polanya sama dengan Keep awake.
- **Jam selesai disimpan sebagai waktu jam dinding.** Kalau Mac sempat tidur, saat bangun hitungan dicocokkan dengan jam dinding. Kalau jam selesai sudah lewat, timer langsung selesai dan notifikasi dikirim.
- **Saat dijeda,** yang disimpan adalah sisa waktunya. Waktu tidur Mac tidak mengurangi timer yang dijeda.
- **Memulai saat timer sudah jalan atau dijeda** mengganti timer itu dengan yang baru.
- **Batas:** 1 sampai 60 menit, menit bulat. Perintah di luar batas itu ditolak.
- **Keadaan tidak disimpan ke disk.** Notching yang dibuka lagi selalu mulai tanpa timer, dengan waktu bawaan 30 menit.
- **Kemampuan di manifest:** modul ini menyebut kemampuan untuk Timer, ditambah `status` dan `notify`. Semua panggilan dari halaman modul dan dari strip lewat gate, sama seperti modul lain.
- **Tampilan di strip dan halaman** membaca keadaan sekali sedetik selama panel terbuka, lalu menggerakkan penggaris dan angka dengan jam sendiri di antara dua bacaan. Dengan begitu geraknya halus, dan strip serta halaman tetap sama walau timer diubah dari tempat lain **(keputusan penulis)**.

## 7. Notifikasi

- Saat waktunya habis, notch menampilkan notifikasi **"Timer selesai"**, dengan keterangan berisi waktu yang dipakai, misalnya "5 menit sudah habis". Kalau waktunya diganti saat jalan, yang dipakai adalah waktu terakhir yang dipilih **(keputusan penulis)**. Kata-kata pastinya ditentukan pembuat dengan gaya bahasa desain awal bagian 5.
- Saluran notifikasinya bawaan **menyala dan bersuara**, dengan bunyi pendek sekali. Saluran ini bisa diatur di Pengaturan → Notifikasi seperti saluran lain.
- Klik notifikasi membuka halaman Timer **(keputusan penulis)**.
- Stop dengan tangan tidak mengirim notifikasi.
- Kalau jam selesai lewat saat Mac tidur, notifikasi tetap dikirim begitu Mac bangun.

## 8. Status di samping notch dan di halaman Modul

- Selama timer jalan atau dijeda, modul melaporkan **berjalan** (`Activity::Running`). Kotak Timer di halaman Modul diberi titik merah kecil (desain 30 Oktober §7).
- **Teks di samping notch** adalah sisa waktu dalam menit dan detik, misalnya "6:42" atau "60:00". Teksnya diperbarui per detik, karena untuk timer detik itu penting **(keputusan penulis)**. Saat dijeda, teksnya berhenti di sisa waktu terakhir.
- Di kiri teks ada ikon Timer, sesuai desain 30 Oktober §8.
- Saklar "tampilkan status" per modul tetap berlaku. Kalau dimatikan, titik merah tetap ada, tapi teks di samping notch tidak tampil.
- Aturan desain 30 Oktober §8 tetap berlaku: hanya satu status yang tampil, yaitu yang paling akhir dinyalakan. Status muncul di layar yang ada kursornya, dan disembunyikan sementara saat notifikasi tampil.

## 9. Pemasangan

- Timer ikut di dalam app sebagai modul bawaan, seperti System stat dan Keep awake.
- Di halaman Modul, urutannya setelah Keep awake.
- Pengguna yang sudah memakai Notching langsung mendapat modul ini dalam keadaan menyala saat app diperbarui. Ini cara yang sama dengan modul bawaan lain.
- Timer tidak butuh izin sistem, jadi tidak muncul di halaman Izin.

## 10. Ikon

Ikon Timer adalah **stopwatch bergaris**: lingkaran dengan satu jarum dan tombol kecil di atas **(keputusan penulis)**. Ikon ini dipakai di kotak halaman Modul dan di samping notch.

## 11. Yang berubah dari desain 30 Oktober

| Desain 30 Oktober | Sekarang |
|---|---|
| §4 Satu baris 4 kolom per halaman | Satu baris 4 kolom, ditambah strip tipis yang bersifat pilihan di bawahnya |
| §4 Semua halaman custom sama tinggi | Halaman yang diberi strip lebih tinggi |
| §5 Widget selebar 1 atau 2 kolom | Ditambah widget strip selebar 4 kolom |
| §5 Widget Timer, 1 kolom, langkah 3 | Strip Timer. Bentuk 1 kolom menyusul nanti |
| §6 desain awal: hitung mundur dan stopwatch | Hitung mundur saja |

## 12. Diserahkan ke pembuat

- Nama kemampuan di manifest dan bentuk pesan antara strip, halaman modul, dan app inti.
- Bentuk data strip di pengaturan halaman, dengan syarat file pengaturan lama tetap terbaca.
- Ukuran pasti strip, halaman Timer, tombol, dan jarak antar garis penggaris.
- Gambar pasti ikon Timer.
- Kata-kata pasti notifikasi dan label, dalam bahasa Indonesia dan Inggris.
