# Desain gaya widget "Notching Volt"

Tanggal: 2 November 2026
Sumber: `desain widget/widget-volt.pego`, salinan dari `~/Downloads/widget.pego` yang disimpan pemilik pada 2 Nov, 22.25.
Acuan gambar: `docs/superpowers/specs/volt/*.png`, satu gambar untuk tiap widget dan tiga contoh panel notch (`notch-1..3.png`).
Acuan ukuran: `docs/superpowers/specs/volt/tree.txt`, yaitu pohon desain tiap widget lengkap dengan token `$lu-…`.
Cabang: `feat/paket-widget`, yang melanjutkan paket widget (`2026-11-02-paket-widget-design.md`).

Tanda **(keputusan penulis)** artinya pemilik belum memutuskan hal itu. Pemilik berkata "kerjakan saja dulu, nanti review di akhir", lalu "Ya, mulai" untuk usulan di chat. Semua keputusan penulis dibawa ke review akhir.

## 1. Kenapa

Pemilik mengganti arah desain widget. Gaya Nothing (angka titik, label Space Mono, merah, garis titik di antara widget) diganti dengan "Volt":
- kartu hitam pekat yang menyatu dengan kamera,
- angka condensed yang tegas dan mudah dibaca sekilas,
- satu aksen limau untuk hal yang sedang terjadi.

## 2. Tujuan, bukan tujuan, yang harus dihindari

**Tujuan**
- Semua widget halaman notch tampil seperti gambar Volt, baik widget paket baru maupun widget lama (Tanggal, Jam tumpuk, Waktu shalat, Reminder, Cuaca kecil, strip Timer, Timer kecil).
- Panel halaman widget ikut desain: tiap widget dalam kartu sendiri, tanpa garis titik, strip setinggi setengah baris, dan nama halaman serta nomornya di atas.
- Contoh widget di editor Pengaturan → Halaman ikut tampil gaya Volt.

**Bukan tujuan**
- Data, pengaturan, inti Rust, dan cara kerja widget (klik, geser, tampilan penuh) tidak berubah, kecuali yang disebut di §6.
- Halaman modul tetap seperti sekarang: Sistem, Tetap Nyala, Cermin, Cleaner, Titipan, Screenshot, halaman Timer penuh, dan halaman Modul. **(keputusan penulis)**
- Jendela Pengaturan, pil navigasi, dan notifikasi di telinga notch tidak diubah.
- Musik dan Musik strip belum dibuat, karena masih menunggu bagian C (membaca lagu yang sedang diputar).

**Yang harus dihindari**
- Teks terpotong atau keluar dari kartu. Pemeriksa "tidak ada elemen keluar frame" dari paket widget tetap harus lulus.
- Teks lebih kecil dari 9 px.
- Lebih dari satu warna aksen. Merah lama tidak dipakai lagi di widget.
- Gaya Volt bocor ke jendela Pengaturan atau halaman modul.

## 3. Ukuran

Desain memakai kotak 176×176, kartu dua kolom 352×176, dan strip 776×88. Di app, kotak satu kolom 109×104 dan dua kolom 234×104. Jadi faktor skalanya k ≈ 0,62.

| Hal | Desain | App |
|---|---|---|
| Kartu 1 kolom | 176×176 | 109×104 (tetap) |
| Kartu 2 kolom | 352×176 | 234×104 (tetap) |
| Strip | 776×88, "Baris 0.5" | 484×**52**, sebelumnya 40 |
| Jarak antarkolom | 24 | 16 (tetap) |
| Jarak baris ke strip | 24 | **16**, garis titik dihapus. Sebelumnya 20. |
| Sudut kartu | 28 (`$lu-radius`) | **17 px** |
| Isi kartu (padding) | 20 (`$lu-pad`) | **12 px**. Widget yang di desain tanpa padding (Jam analog, Timer, Napas, Bulan) tetap 0. |
| Huruf | ukuran desain | ukuran desain × 0,62, dibulatkan, paling kecil 9 px |

Tinggi halaman widget dengan strip menjadi 104 + 16 + 52 = 172 px. Tanpa strip, tingginya tetap 104 px.

Pemeriksaan teks paling panjang tetap berlaku. Kalau suatu teks tidak muat di ukuran hasil skala, ukurannya boleh turun sampai 9 px. Setelah itu, yang dipendekkan teksnya, bukan dibiarkan terpotong.

## 4. Bahasa visual

### Warna (token `$lu-…` di `tree.txt`)

| Nama di app | Nilai | Dipakai untuk |
|---|---|---|
| kartu | `#000000` | latar kartu |
| ring | `#FFFFFF14` | garis tepi kartu 1 px, digambar sebagai bayangan 0 0 0 1px |
| ink | `#F3F5F0` | angka dan judul |
| ink-2 | `#C4C8BF` | teks kedua |
| muted | `#8C9187` | label |
| dim | `#80857B` | teks redup |
| faint | `#454941` | garis jam, hari di luar bulan |
| track | `#23251F` | jalur progres, segmen kosong |
| accent | `#C8F04A` | yang sedang terjadi: detik, hari ini, progres, waktu berikutnya |
| accent-soft | `#1D260B` | latar pil aksen |
| on-accent | `#0F1404` | teks di atas aksen |

### Huruf

- **Barlow Condensed** (600–700) untuk angka besar, judul, dan nama penting, seperti di gambar. Angka titik (`big()` / `small()` di `src/kit/widget.ts`) tidak dipakai lagi di widget halaman.
- **Inter** (500–600) untuk label dan teks kecil. Label Volt tidak huruf besar semua dan tanpa jarak huruf lebar, contohnya "Jakarta", "Shalat berikutnya", "menit lagi".
- Keduanya dipasang sebagai paket `@fontsource`, sama seperti Space Grotesk sekarang. App tidak memuat huruf dari internet.

### Kartu dan panel

- **Kartu.** Tiap slot widget dan strip digambar oleh panel (host) sebagai kartu hitam dengan sudut 17 px dan ring 1 px. Isi widget di iframe tetap transparan dan berada di dalam kartu.
- **Kepala halaman.** Kepala hanya ada di halaman widget, tidak di halaman lain.
  - Kiri: nama halaman (Inter 600, warna ink). Halaman tanpa nama ditulis "Halaman n" atau "Page n". **(keputusan penulis)**
  - Kanan: titik aksen 6 px dan "n / N" berwarna muted. N adalah jumlah halaman widget.
  - Di Mac dengan notch, kepala ada di baris kamera: nama di kiri notch, nomor di kanan. Kepala disembunyikan selama notifikasi tampil di telinga. Di layar tanpa notch, kepala menjadi baris setinggi 16 px di atas widget, dengan jarak 10 px. **(keputusan penulis)**
- Garis titik antarwidget dan di atas strip dihapus.

## 5. Daftar widget dan acuannya

| Widget di app | Gambar acuan | Catatan isi |
|---|---|---|
| `waktu/clockdate` (2) | `jam.png` | Kota di kiri atas, "Sab, 31 Okt" di kanan atas. Jam.menit besar, detik kecil beraksen. Garis progres hari dengan tulisan "40% hari". Baris titik jam diganti garis ini. |
| `home/date` (1) | `tanggal.png` | Nama hari dan titik aksen. Tanggal besar. "Oktober 2026". |
| `waktu/zones` (2) | `zona-waktu.png` | **Tiga kolom**: kota sendiri (label aksen, "Di sini"), lalu dua kota pilihan dengan selisih jam ("+2 jam", "−7 jam · malam"). Kota yang sedang malam angkanya redup. Kepala "Zona waktu · 3 kota". Pilihan di prefs tetap dua kota. |
| `home/prayer` (1) | `waktu-shalat.png` | "Shalat berikutnya". Nama shalat beraksen. Jam besar. Lima segmen, segmen shalat berikutnya beraksen. "1 j 57 m lagi". |
| `waktu/analog` (1) | `jam-analog.png` | Garis jam redup, jarum putih, jarum detik dan titik tengah beraksen, nama kota di bawah tengah. |
| `home/clock` (1) | `jam-tumpuk.png` | Jam putih di atas, menit beraksen di bawah, "pagi" di kanan atas, "WIB" di kanan bawah. |
| `waktu/calendar` (2) | `kalender.png` | Kiri: "Kalender", lalu nama bulan besar dan tahun. Kanan: kisi tanggal, hari ini dalam pil aksen. |
| `waktu/yearday` (1) | `hari-ke.png` | "Hari ke" dan tahun. Angka besar beraksen. Garis progres. "61 hari lagi". |
| `waktu/weekstrip` (strip) | `tanggal-strip.png` | Kiri: hari dan tanggal. Tengah: tujuh hari, hari ini dalam pil aksen. Kanan: "Minggu ke 44". |
| `timer/tile` (1) | `timer.png` | Cincin progres beraksen. "Fokus", menit besar, "menit lagi". Geser dan klik tetap seperti sekarang. Saat diam, cincin kosong dan angkanya menit pilihan. |
| `fokus/breath` (1) | `napas.png` | Lingkaran bertumpuk beraksen. "Tarik napas", "4 detik · 3 dari 5". Animasi tetap. |
| `timer/strip` (strip) | `timer-strip.png` | Kiri: label dan jam selesai. Tengah: penggaris dengan penanda aksen. Kanan: keterangan dan sisa menit beraksen. |
| `rencana/week` (2) | `minggu-ini.png` | "Minggu ini", "Minggu 44". Tujuh kolom berisi huruf hari dan tanggal, hari ini dalam lingkaran aksen. Di bawah, satu reminder berikutnya. |
| `rencana/next` (2) | `agenda.png` | "Berikutnya" dan pil aksen-lembut "18 menit lagi". Judul besar. Keterangan di kiri bawah, jam beraksen di kanan bawah. |
| `home/reminders` (2) | `tugas.png` | Kepala "Hari ini · 1 dari 3 selesai". Daftar dengan lingkaran centang. Yang berikutnya beraksen, jamnya di kanan. |
| `sekitar/sun` (2) | `matahari.png` | Busur dengan titik aksen. "Terbenam 8 j 7 m lagi". "05.32 terbit", "terbenam 17.48". |
| `sekitar/bigweather` (2) | `cuaca.png` | Kota, suhu besar, kondisi, ikon beraksen di kanan atas, tertinggi dan terendah di kanan bawah. |
| `sekitar/moon` (1) | `bulan.png` | Gambar bulan, "Cembung 68%", "Purnama 3 hari lagi". |
| `sekitar/air` (1) | `udara.png` | "Kualitas udara". Angka besar dan "AQI". Lima segmen. Saran singkat. |
| `sekitar/hourly` (strip) | `cuaca-per-jam.png` | Kiri: "Per jam" dan suhu kini. Tengah: jam, ikon, dan suhu, dengan "Kini" tebal. Kanan: hujan berikutnya beraksen, lalu lamanya. |
| `home/weather` (1) | tidak ada | Pakai gaya `cuaca.png` versi satu kolom: kota, suhu besar, kondisi, ikon beraksen. **(keputusan penulis)** |
| `fokus/workday` (1) | tidak ada | Gaya Volt dengan isi yang sama. Label "Jam kerja", sisa waktu besar, garis progres hari kerja, "Sudah 1 j 18 m". **(keputusan penulis)** |

Tampilan penuh widget (pengaturan Jam kerja dan Zona waktu) ikut memakai huruf dan warna Volt. Susunannya tetap.

## 6. Isi yang tidak ada datanya

Desain kadang menampilkan hal yang belum dimiliki app, misalnya "Sesi 2 dari 4", "Baik untuk lari", atau "Selama 2 jam".
- Kalau datanya bisa dihitung di widget dari data yang sudah ada, tampilkan. Contohnya lama hujan dari data per jam, atau saran dari angka AQI.
- Kalau tidak bisa, pakai teks terdekat yang ada datanya, atau kosongkan tempatnya.
- Tidak ada data baru dari inti Rust.

Setiap pilihan seperti ini dicatat pembuat sebagai keputusan penulis di laporan tugasnya.

## 7. Pembagian kerja

1. **Kit Volt.** Huruf, token warna, CSS dasar widget, dan helper kecil (angka, garis progres, segmen) di `src/kit/`. Kit ini dipakai paket widget saja.
2. **Panel.** Kartu, jarak, strip 52 px, kepala halaman, dan bingkai contoh di editor Pengaturan.
3. **Paket per paket**: waktu, home, sekitar, rencana dan fokus, lalu timer. Tiap paket juga memperbarui CSS contohnya di `src/settings/settings.css`.

## 8. Diserahkan ke pembuat

Ketebalan huruf yang tepat, jarak kecil di dalam kartu, bentuk ikon cuaca (lucide, seperti di desain), dan cara menggambar cincin atau busur (SVG). Patokannya selalu gambar acuan dan `tree.txt`.
