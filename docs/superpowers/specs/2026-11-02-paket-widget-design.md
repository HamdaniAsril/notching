# Desain paket widget dari widget.pego

Tanggal: 2 November 2026
Bahan: `desain widget/widget.pego` buatan pemilik ide. Isinya 22 desain widget gaya Nothing dalam empat kelompok: Waktu, Fokus, Rencana, dan Sekitar.
Desain induk: `2026-10-30-halaman-widget-design.md`, yang di bawah disebut "desain halaman".

Pada 2 November 2026 pemilik ide memilih widget.pego sebagai **daftar widget baru**. Pemilik ide minta langsung dikerjakan dan baru direview di akhir. Karena itu semua pilihan di bawah yang ditandai **(keputusan penulis)** belum disetujui pemilik. Pilihan-pilihan ini dibahas bersama saat review.

## 1. Kenapa

Widget yang sudah ada sekarang cuma lima: Tanggal, Jam, Cuaca, Waktu sholat, dan Reminder. Ditambah satu strip Timer. Lewat widget.pego, pemilik ide sudah menggambar widget apa saja yang ingin dipasang di halaman custom. Desain halaman langkah 2 (Jam + tanggal, Jam kerja) dan widget Timer 1 kolom sudah termasuk di dalamnya.

## 2. Tujuan, bukan tujuan, yang harus dihindari

**Tujuan**
- Widget dari widget.pego yang datanya bisa didapat dengan jujur bisa dipasang di halaman custom lewat editor halaman yang sudah ada.

**Bukan tujuan**
- Mengubah widget lama (Tanggal, Jam, Cuaca, Waktu sholat, Reminder, strip Timer).
- Mengubah halaman custom: tetap 4 kolom, tetap ada garis titik antarwidget.

**Harus dihindari**
- Widget yang menampilkan data palsu atau data yang tidak bisa didapat, misalnya agenda kalender, karena modul Kalender sudah dibatalkan.
- Angka negatif atau keadaan "error" yang ribut.
- Widget yang membuat panel berubah ukuran.

## 3. Ukuran sebenarnya dan cara menerjemahkan widget.pego

Di widget.pego, satu kolom digambar 176×176, dua kolom 352×176, dan strip 776×88. Di notch ukurannya jauh lebih kecil:

| Bentuk | Ukuran di notch |
|---|---|
| 1 kolom | 109 × 104 px |
| 2 kolom | 234 × 104 px |
| strip | 484 × 40 px |

Kira-kira 0,6 kali ukuran gambar, dan strip jauh lebih pendek. Jadi widget.pego dipakai sebagai acuan **isi dan susunan**, bukan ukuran persis **(keputusan penulis)**:

- **Huruf.** Label memakai `.lab` yang sudah ada, yaitu Space Mono 10 px huruf besar. Angka besar memakai huruf titik dari `src/kit/dots.ts` dengan ukuran bersama 42 px, sesuai desain halaman §4. Angka kecil memakai huruf titik dengan jarak titik lebih kecil.
- **Huruf Doto tidak dipakai.** Doto tidak dibundel, dan huruf titik Notching sendiri hanya punya angka dan beberapa tanda. Kata yang di widget.pego memakai Doto, misalnya "OKT" di Kalender, ditulis dengan Space Mono.
- **Kotak berwarna tidak dipakai.** Di widget.pego setiap widget adalah kotak bersudut bulat dengan isi hitam, merah, atau putih kertas. Di Notching panel hitam digambar oleh notch, dan widget dipisah garis titik (desain halaman §4). Widget yang di widget.pego berlatar **merah** atau **putih kertas** di notch tetap berlatar hitam. Merahnya dipindah ke satu bagian penting saja, misalnya angka hari ke-, jarum detik, atau titik "sekarang". Tujuannya supaya widget lama dan baru tetap terlihat satu keluarga dalam satu halaman.
- **Strip setinggi 40 px** hanya muat dua baris kecil. Isi strip di widget.pego diringkas supaya muat.
- **Ikon** (matahari, awan, hujan, angin, putar/jeda) diambil dari Lucide, karena widget.pego juga memakai Lucide. Lisensinya ISC dan cocok dengan MIT. Ikon disalin sebagai SVG garis ke dalam kode, dengan catatan lisensi **(keputusan penulis)**.

## 4. Daftar widget

### Dibuat

| Widget | Dari widget.pego | Jenis | Lebar | Paket | Data |
|---|---|---|---|---|---|
| Jam + tanggal | Jam | Waktu | 2 | waktu | jam Mac |
| Jam analog | Jam Analog | Waktu | 1 | waktu | jam Mac |
| Kalender | Kalender | Waktu | 2 | waktu | jam Mac |
| Hari ke- | Hari Ke | Waktu | 1 | waktu | jam Mac |
| Minggu ini (strip) | Tanggal Strip | Waktu | strip | waktu | jam Mac |
| Zona waktu | Zona Waktu | Waktu | 2 | waktu | jam Mac + kota pilihan |
| Timer kecil | Timer | Kerja | 1 | timer | modul Timer |
| Napas | Napas | Kerja | 1 | fokus | tidak ada |
| Jam kerja | (desain halaman) | Kerja | 1 | fokus | jam kerja pilihan |
| Pekan ini | Minggu Ini | Kerja | 2 | rencana | reminder |
| Berikutnya | Agenda | Kerja | 2 | rencana | reminder |
| Cuaca besar | Cuaca | Cuaca | 2 | sekitar | cuaca yang sudah ada |
| Matahari | Matahari | Cuaca | 2 | sekitar | hitungan matahari lokal |
| Bulan | Bulan | Cuaca | 1 | sekitar | hitungan bulan lokal |
| Udara | Udara | Cuaca | 1 | sekitar | Open-Meteo kualitas udara (baru) |
| Cuaca per jam (strip) | Cuaca Per Jam | Cuaca | strip | sekitar | Open-Meteo per jam (baru) |

### Tidak dibuat, beserta alasannya (keputusan penulis)

- **Tanggal, Waktu Shalat.** Widget 1 kolom dengan isi yang sama sudah ada.
- **Jam Tumpuk.** Jam 1 kolom yang sudah ada sudah menumpuk jam di atas menit.
- **Tugas.** Isinya reminder hari ini, sama dengan widget Reminder 2 kolom yang sudah ada.
- **Timer Strip.** Strip Timer sudah ada. Yang di widget.pego punya "FOKUS 25M · SESI 2/4", padahal Timer tidak punya sesi pomodoro.
- **Agenda dan Minggu Ini, dalam bentuk kalender.** Butuh data Kalender, padahal modul Kalender dibatalkan. Keduanya tetap dibuat, tapi dengan isi **reminder**: Agenda menjadi "Berikutnya", Minggu Ini menjadi "Pekan ini". Ruang dan lokasi rapat tidak ada, karena reminder tidak menyimpannya.
- **Musik dan Musik Strip (Now playing).** Desain halaman mengharuskan cara membaca lagu dicoba dulu di Mac pemilik. Mac pemilik memakai macOS 27, dan sejak macOS 15.4 Apple membatasi app lain membaca lagu yang sedang diputar. Jadi Now playing menjadi **bagian C** yang terpisah, dimulai dengan percobaan, dan baru dikerjakan kalau pemilik setuju saat review.
- **Catatan cepat.** Tidak ada di widget.pego, dan modul Catatan dibatalkan pada 31 Oktober.

## 5. Isi tiap widget

Yang ditulis di sini adalah isinya. Susunan dan ukurannya mengikuti §3.

**Jam + tanggal (2 kolom).**
- Baris atas: nama kota dan zona waktu di kiri, misalnya "JAKARTA · WIB", lalu hari dan tanggal di kanan, misalnya "SEN 02.11".
- Tengah: jam dan menit dengan huruf titik besar, "09:41".
- Bawah: 24 titik untuk 24 jam. Jam yang sudah lewat putih, jam sekarang merah dan sedikit lebih besar, dan sisanya redup.
- Kalau kota belum diisi, cuma zona waktu yang tampil.

**Jam analog (1 kolom).** Lingkaran jam dengan 12 tanda (tanda 12, 3, 6, dan 9 lebih besar), jarum jam, jarum menit, jarum detik merah, pin merah, dan singkatan zona waktu kecil. Jarumnya bergerak setiap detik.

**Kalender (2 kolom).**
- Kiri: label "KALENDER", nama bulan pendek yang besar, dan tahun.
- Kanan: kisi tanggal sebulan, dengan Senin sebagai hari pertama.
- Hari ini ditandai bulatan merah. Akhir pekan agak redup.
- Tidak ada acara di dalamnya.

**Hari ke- (1 kolom).**
- Label "HARI KE" dan tahun.
- Nomor hari dalam setahun, dengan angka titik merah.
- Baris 12 garis untuk 12 bulan: bulan yang lewat putih, bulan ini merah, sisanya redup.
- "SISA 61 HARI".

**Minggu ini (strip).**
- Kiri: nama hari ini dan tanggalnya.
- Tengah: tujuh hari Senin sampai Minggu, masing-masing nama hari pendek dan tanggal. Hari ini terang dengan titik merah, hari yang belum lewat redup.
- Kanan: "MGG 45", yaitu nomor minggu menurut ISO.

**Zona waktu (2 kolom).**
- Tiga kota. Masing-masing berisi kode tiga huruf, selisih jam dari kota sendiri, jam dengan huruf titik kecil, dan garis penanda. Kota pertama selalu zona waktu Mac, dengan garis putih.
- Bawaan dua kota lainnya adalah Tokyo dan London **(keputusan penulis)**.
- Klik widget membuka tampilan penuh untuk memilih dua kota itu dari daftar kira-kira 40 kota besar (§6).

**Timer kecil (1 kolom, dari paket timer).**
- Tidak berjalan: label "TIMER", angka menit besar yang dipilih, dan penggaris menit kecil yang bisa digeser, sama seperti penggaris di modul Timer. Klik angkanya untuk mulai.
- Berjalan: sisa waktu besar dan titik merah. Klik untuk jeda, klik lagi untuk lanjut.
- Waktunya sama dengan modul Timer, karena timernya cuma satu (milik inti app).

**Napas (1 kolom).**
- Latihan napas kotak: tarik 4 detik, tahan 4, buang 4, tahan 4, sebanyak lima putaran **(keputusan penulis)**.
- Klik untuk mulai dan klik lagi untuk berhenti.
- Saat berjalan, lingkaran membesar dan mengecil sesuai fase, dan widget menampilkan nama fase ("TARIK", "TAHAN", "BUANG"), sisa detik, dan putaran "3/5".
- Saat diam: "NAPAS" dan "Klik untuk mulai".
- Tidak ada data yang disimpan.

**Jam kerja (1 kolom).** Aturannya mengikuti desain halaman, subbagian "Jam kerja":
- Di jam kerja: sisa waktu dengan angka besar, misalnya "6 J 42 M", baris titik kemajuan, lalu lama bekerja, misalnya "SUDAH 1 J 18 M". Sisa waktu dibuat besar atas permintaan pemilik (2 November).
- Di luar jam kerja: "Selesai". Di hari libur: "Libur".
- Bawaannya 09.00–17.00, Senin sampai Jumat.
- Pengaturannya lewat tampilan penuh (§6).

**Pekan ini (2 kolom).**
- Atas: nama bulan dan "MGG 45".
- Tengah: tujuh hari. Hari ini berupa bulatan putih. Hari yang punya reminder belum selesai diberi titik kecil di bawahnya.
- Bawah: reminder berikutnya yang belum selesai di pekan ini, dengan jam dan judulnya. Kalau tidak ada: "Pekan ini kosong".

**Berikutnya (2 kolom).**
- Reminder berikutnya yang belum selesai dan punya jam.
- Isinya label "BERIKUTNYA", sisa waktu ("18 MNT", atau "2 J" kalau lebih dari satu jam), judul besar yang terpotong dengan elipsis kalau terlalu panjang, nama harinya ("Hari ini", "Besok", atau nama hari), dan jamnya dengan huruf titik.
- Kalau tidak ada: "Tidak ada yang dijadwalkan".
- Widget ini tidak bisa diklik. Daftar lengkap reminder tetap dibuka lewat widget Reminder **(keputusan penulis)**.

**Cuaca besar (2 kolom).**
- Kiri: kota, suhu besar dengan huruf titik, dan kondisi.
- Kanan: ikon kondisi, "T 27°" (tertinggi), dan "R 18°" (terendah).
- Datanya sama dengan widget Cuaca.

**Matahari (2 kolom).**
- Atas: label "MATAHARI" dan sisa waktu sampai matahari terbenam, atau sampai terbit kalau sudah malam.
- Tengah: busur dari terbit sampai terbenam. Bagian yang sudah lewat putih, sisanya redup, dan titik merah menandai posisi matahari.
- Bawah: jam terbit dan jam terbenam.
- Dihitung dari koordinat kota dengan rumus yang sama seperti waktu sholat, jadi tidak perlu internet.

**Bulan (1 kolom).**
- Gambar fase bulan, persen bagian yang terang, nama fase ("SABIT", "SEPARUH", "CEMBUNG", "PURNAMA", "BARU"), dan "Purnama 3 hari" atau "Bulan baru 5 hari".
- Dihitung di app tanpa internet.

**Udara (1 kolom).**
- Angka indeks kualitas udara (US AQI) dari Open-Meteo, dengan huruf titik.
- Kategori pendek: "Baik", "Sedang", "Tidak sehat bagi sebagian", "Tidak sehat", "Sangat tidak sehat", atau "Berbahaya".
- Skala lima titik dengan titik merah di posisi sekarang.
- Diperbarui bersama cuaca setiap 30 menit.

**Cuaca per jam (strip).**
- Kiri: suhu sekarang.
- Tengah: delapan jam ke depan. Tiap jam berisi suhu dan ikon di satu baris, lalu jamnya di baris bawah.
- Kanan: "HUJAN 16.00" kalau ada jam dengan peluang hujan 50% atau lebih dalam 12 jam ke depan. Kalau tidak ada: "CERAH".

Kalau kota belum diisi, widget yang butuh kota (Cuaca besar, Matahari, Udara, Cuaca per jam) menampilkan "Isi kota di Pengaturan", sama seperti widget Cuaca sekarang.

## 6. Pengaturan widget lewat tampilan penuh (keputusan penulis)

Desain halaman §5 menyebut pengaturan widget diatur di editor halaman. Untuk bagian ini pengaturannya dipindah ke **tampilan penuh widget itu sendiri**. Klik Jam kerja atau Zona waktu membuka tampilan penuh berisi pengaturannya, sama seperti Reminder membuka daftar lengkapnya. Alasannya:

- Pengaturan bisa diubah langsung dari notch, tanpa membuka Pengaturan.
- Widget tetap menjadi paket yang berdiri sendiri. Paket dari luar nantinya juga bisa punya pengaturan tanpa editor perlu tahu bentuknya.
- Pengaturan tetap dipakai bersama oleh semua halaman (desain halaman §4), karena disimpan per paket, bukan per penempatan.

Caranya adalah kemampuan sistem baru, **`prefs`**, dengan dua metode:
- `read`: membaca satu objek JSON milik paket itu sendiri.
- `write`: menyimpannya, paling besar 16 KB.

Paket hanya bisa membaca dan menulis miliknya sendiri. Datanya disimpan di folder data app (`widget-prefs/<paket>.json`).

Kalau pemilik ide tetap ingin pengaturannya di editor, bagian ini bisa dipindah nanti tanpa mengubah widgetnya.

## 7. Paket

Satu paket paling banyak berisi 8 widget, dan paket `home` sudah berisi 5. Jadi widget baru dibagi ke paket-paket baru mengikuti kelompok di widget.pego **(keputusan penulis)**:

- **`waktu`**: Jam + tanggal, Jam analog, Kalender, Hari ke-, Minggu ini, Zona waktu. Kemampuan: `prefs`, ditambah `home.data` karena Jam + tanggal butuh nama kota.
- **`fokus`**: Napas, Jam kerja. Kemampuan: `prefs`.
- **`rencana`**: Pekan ini, Berikutnya. Kemampuan: `home.data` saja. Widget ini hanya membaca reminder.
- **`sekitar`**: Cuaca besar, Matahari, Bulan, Udara, Cuaca per jam. Kemampuan: `home.data`.
- **`timer`** (paket yang sudah ada) mendapat widget `tile` 1 kolom.

Paket tanpa halaman modul tidak muncul di halaman Modul, sama seperti `home`. Kode yang dipakai bersama, misalnya `el`, `big`, ikon, dan format waktu, dipindah ke `src/kit/`.

## 8. Data baru di inti app

- **Matahari:** `HomeSnapshot` mendapat `sun: { rise, set } | null` untuk hari ini, dihitung dengan `SolarTime` yang sudah ada di `prayer.rs`. Untuk malam hari, widget memakai jam terbit besok, yang dihitung dengan cara yang sama.
- **Cuaca per jam:** permintaan Open-Meteo yang sudah ada ditambah `hourly=temperature_2m,weather_code,precipitation_probability` dan `forecast_days=2`. `Weather` mendapat `hourly: [{ at, temp, code, rain }]`.
- **Udara:** permintaan kedua, ke alamat Open-Meteo ketiga. Sebelumnya app hanya mengirim ke dua alamat Open-Meteo, dan sekarang menjadi tiga, semuanya milik Open-Meteo.
  Permintaannya ke `https://air-quality-api.open-meteo.com/v1/air-quality` dengan `current=us_aqi`, dengan jadwal yang sama seperti cuaca (30 menit, coba lagi setelah 5 menit). Hasilnya `air: { aqi, fetchedAt } | null`. Kalau permintaan ini gagal, cuaca tetap jalan.
- **Prefs:** kemampuan `prefs` (§6).

Semua tambahan ini opsional di snapshot, jadi cache `weather.json` yang lama tetap terbaca.

## 9. Urutan kerja

- **Bagian A: widget yang datanya sudah ada.** Jam + tanggal, Jam analog, Kalender, Hari ke-, Minggu ini, Napas, Pekan ini, Berikutnya, Cuaca besar, Bulan, dan Timer kecil.
- **Bagian B: widget yang butuh data atau kemampuan baru.**
  - Matahari dan Cuaca per jam, dari `sun` dan `hourly`.
  - Udara.
  - `prefs`, beserta Jam kerja dan Zona waktu.
- **Bagian C (menunggu persetujuan pemilik): Now playing.**
  - Dimulai dengan percobaan membaca lagu yang sedang diputar di macOS 27.
  - Kalau berhasil, dibuat widget Musik (2 kolom) dan Musik strip, sesuai desain halaman subbagian "Now playing".

Setiap widget mendapat contoh tampilan di editor halaman (`widget-preview.ts`), nama di kedua bahasa, dan test.

## 10. Diserahkan ke pembuat

- Ukuran persis tiap bagian di dalam widget, selama muat di ukuran §3 dan angka besarnya tetap 42 px.
- Daftar kota untuk Zona waktu.
- Ikon Lucide mana yang dipakai.
