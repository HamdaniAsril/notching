# Desain Notching

Tanggal: 27 Oktober 2026
Status: disetujui pemilik ide (27 Oktober 2026)

Dokumen ini merangkum hasil brainstorming. Tujuannya supaya orang yang akan membuat app ini bisa menyusun rencana kerja tanpa perlu bertanya lagi ke pemilik ide.

**Cara membaca keputusan:**
- Yang ditulis biasa adalah keputusan pemilik ide.
- Yang ditandai **(keputusan penulis)** adalah pilihan penulis dokumen, karena belum dibahas. Pemilik ide bisa mengubahnya.
- Yang diserahkan ke pembuat app ada di bagian "Diserahkan ke pembuat".

Mockup yang sudah disetujui ada di folder `2026-10-27-notch-mockups/`, di samping dokumen ini. Mockup itu acuan untuk bentuk, warna, dan gerak. Kode di dalamnya hanya prototipe, bukan kode produk.

---

## 1. Apa ini dan kenapa dibuat

App notch untuk Mac dan Windows yang mengumpulkan tools harian di satu tempat, di bagian tengah atas layar. Contohnya tanggal dan cuaca, waktu sholat, reminder, timer, keep awake, kamera untuk berkaca, dan pengunci keyboard untuk membersihkan laptop.

Pemilik ide sudah lama memakai Vorssaint, app notch dengan fitur paling lengkap. Masalahnya:
- Tampilannya ramai. Terlalu banyak menu muncul sekaligus.
- Meski sudah lama dipakai, mencari sesuatu di sana masih meraba-raba.
- Layout-nya tidak disukai.

Ikut memperbaiki Vorssaint terasa seperti mengacak-acak app orang. Jadi app ini dibuat sendiri.

App notch lain juga punya masalah. Fitur yang dibutuhkan tersebar: ada di app A, tapi fitur lain hanya ada di app B.

**Pembeda utama app ini adalah desain:** tenang, rapi, dan apa pun mudah ditemukan. Setiap fitur adalah modul yang bisa dinyalakan, dimatikan, dipasang, dan dicopot.

Awalnya app ini untuk dipakai sendiri. Setelah itu dirilis gratis ke publik, dengan tombol donasi ala Buy Me a Coffee di landing page.

## 2. Tujuan, bukan tujuan, dan yang harus dihindari

### Tujuan

- **Satu tempat untuk tools harian.** Bisa dibuka dengan satu klik di tengah atas layar.
- **Jalan di Mac dan Windows** dengan tampilan dan perilaku yang sama.
- **Modular.** Setiap fitur bisa dinyalakan, dimatikan, dipasang, dan dicopot.
- **Ukuran awal kecil.**
- **Gratis untuk publik.**

### Bukan tujuan versi pertama

- Notifikasi dari app lain, misalnya WhatsApp atau Slack.
- Modul buatan orang lain dan toko modul.
- Modul tahap 2 dan 3 (lihat bagian 6).
- Akun, sinkron ke cloud, dan login.

### Yang harus dihindari

Kalau salah satu hal di bawah ini terjadi, app dianggap gagal walaupun fungsinya jalan:
- **Tampilan ramai seperti Vorssaint:** banyak menu sekaligus, dan pengguna harus meraba-raba mencari pengaturan.
- **Desain warna-warni atau sibuk.** Satu-satunya pengecualian adalah cahaya notifikasi (bagian 4.4).
- **Notch mengganggu kerja:**
  - menghalangi klik ke menu bar atau app di bawahnya,
  - mencuri fokus keyboard,
  - menutupi konten.
- **Boros baterai atau CPU** saat diam.
- **Iklan, pelacakan, atau telemetri.**

### Tanda berhasil

- **Vorssaint tidak dipakai lagi.** Pemilik ide memakai app ini setiap hari sebagai gantinya.
- **Pengaturan mudah ditemukan.** Pengaturan apa pun bisa ditemukan dalam beberapa detik lewat pencarian atau sidebar.
- **Hemat saat diam.** Pemakaian CPU saat diam mendekati nol.

## 3. Batasan

### Tech stack: Tauri 2

- **Satu kode untuk Mac dan Windows.**
- **Tampilan** ditulis dengan HTML, CSS, dan JavaScript, sehingga animasi dari mockup bisa dipakai ulang.
- **Bagian yang menyentuh sistem** ditulis dengan Rust: keyboard, keep awake, statistik sistem, dan posisi jendela.
- **Di Mac**, jendela di atas notch memakai plugin [`tauri-nspanel`](https://github.com/ahkohd/tauri-nspanel).
- **Alternatif yang ditolak:**
  - Swift + C#: dua app terpisah, terlalu berat untuk satu orang.
  - Flutter: modul tidak bisa diunduh terpisah.
  - Electron: lebih dari 100 MB.

### Urutan pengerjaan dan perangkat uji

- **Mac dulu.** App dibuat dan diuji di MacBook Air M4 milik pemilik ide. Laptop ini punya notch, dan dipakai dengan dua monitor. Jadi notch fisik, lensa di monitor tambahan, dan perilaku banyak monitor bisa langsung dicoba.
- **Windows belum dibuat.** Versi Windows dikerjakan setelah versi Mac nyaman dipakai sehari-hari, dan harus selesai sebelum rilis publik.
  - Kode tetap ditulis supaya bagian khusus Mac terpisah dari bagian bersama, sehingga Windows nanti tinggal menambah bagiannya sendiri.
  - Belum ada PC Windows untuk menguji. Ini perlu disiapkan sebelum tahap Windows dimulai.
- **Tahapan:**
  1. Versi Mac untuk dipakai sendiri.
  2. Versi Windows.
  3. Rilis publik (bagian 9).

### Sistem yang didukung (keputusan penulis)

- **macOS 13 ke atas, di Apple Silicon.** Dukungan Intel belum bisa diuji, jadi ditunda.
- **Windows 10 dan 11, saat tahap Windows.** WebView2 sudah ada di Windows 11, dan dipasang otomatis oleh installer di Windows 10.

### Privasi

- Tidak ada akun, iklan, atau telemetri.
- App hanya terhubung ke internet untuk:
  - cuaca (Open-Meteo),
  - mencari nama kota,
  - mengunduh modul dan update.
- Hanya bagian Rust app yang terhubung ke internet. Halaman notch, pengaturan, dan modul tidak punya akses jaringan. Diputuskan pemilik ide pada 29 Oktober 2026.
  - Ke pencarian kota Open-Meteo hanya dikirim nama kota yang diketik dan bahasa. Kota dicari saat Enter ditekan, tidak sambil mengetik.
  - Ke cuaca Open-Meteo hanya dikirim koordinat kota yang dibulatkan ke 2 desimal (sekitar 1 km).

### Hemat daya

- Loop animasi hanya berjalan selama ada yang bergerak.
- Saat diam, app tidak boleh menggambar ulang terus-menerus.

### Jangan meniru Vorssaint

Vorssaint berlisensi GPL-3.0, dan nama serta tampilannya milik pembuatnya. Yang boleh diambil hanya idenya, tidak boleh kodenya.

### Font

- **Huruf titik-titik** untuk angka besar digambar sendiri. Font milik Nothing tidak dipakai.
- **Font teks:** Space Grotesk untuk teks biasa dan Space Mono untuk label. Keduanya berlisensi OFL, jadi boleh disertakan di dalam app **(keputusan penulis)**.

## 4. Notch: bentuk, gerak, dan notifikasi

Acuan: `full-flow-v3.html` untuk layar tanpa notch, dan `full-flow-notch.html` untuk Mac dengan notch.

### 4.1 Saat diam

- **Layar tanpa notch fisik** (Windows, Mac tanpa notch, monitor tambahan): notch tampil sebagai lensa hitam tipis di tengah atas.
  - Bentuknya seperti tetesan air yang hampir jatuh. Ini bentuk "B3 Lensa": tengah sedikit menggembung, ujungnya meruncing.
  - Tebal bawaannya 4px.
- **Mac dengan notch fisik:** tidak terlihat sama sekali. Yang tampak hanya notch kamera bawaan MacBook.

### 4.2 Hover dan klik

- **Hover:**
  - Notch menggembung menjadi satu tetesan yang menyatu dengan notch. Tetesannya tidak boleh terlihat terpisah, dan tidak boleh terlihat seperti tetesan besar dan kecil.
  - Kedalaman tetesan bawaannya 9px. Gerakannya kenyal dan cepat, sedikit bernapas, dan sedikit mengikuti posisi kursor ke kiri atau kanan.
  - Di Mac dengan notch, tetesan turun dari bawah notch fisik.
- **Klik:**
  - Panel hitam mengembang dari notch dengan pantulan kecil, sekitar 3%.
  - Kekenyalan panel tetap, tidak ikut slider "Kenyal".
  - Di Mac dengan notch, isi panel mulai di bawah kamera supaya tidak tertutup.
- **Bentuk panel:**
  - Persegi panjang biasa dan simetris, sudut bawah membulat.
  - Kedua sudut atas melengkung keluar ke tepi layar, seperti notch MacBook.
  - Bentuk organik dan asimetris sudah dicoba dan ditolak.
- **Pil navigasi:**
  - Pil hitam tipis di bawah panel, berisi ikon garis kecil tanpa latar, satu ikon per modul aktif.
  - Ikon modul yang sedang terbuka diberi titik kecil putih di bawahnya.
  - Ikon ⋯ di ujung kanan membuka jendela pengaturan.
  - Pil muncul 320 ms setelah panel hampir terbuka penuh. Angka ini untuk kecepatan 100, dan ikut dipercepat oleh slider "Kecepatan".
- **Mengingat kartu terakhir:** panel selalu membuka kartu terakhir yang dibuka, juga setelah app dimulai ulang **(keputusan penulis)**.
- **Menutup panel:** klik di luar panel atau tekan Esc.
- **Ukuran panel (keputusan penulis):** setiap kartu menentukan ukurannya sendiri. Saat berganti kartu, panel bergerak ke ukuran baru dengan pegas yang sama. Beranda memakai lebar sekitar 540px.

### 4.3 Parameter gerak

Semua gerak memakai simulasi pegas. Pegas dihitung dengan metode Euler semi-implisit, dengan 6 sub-langkah per frame. Lihat `full-flow-v3.html` untuk rumus bentuk tetesan, yaitu campuran profil lensa dan profil manik.

| Pegas | Kekakuan | Redaman | Mengatur |
|---|---|---|---|
| W | 110 | 13 | Setengah lebar bagian cair |
| H | 80 | 6 | Kedalaman |
| s | 90 | 14 | Campuran bentuk lensa ke manik |
| bx | 60 | 9 | Geser mengikuti kursor (maks ±6px) |
| pw | 170 | 18,5 | Lebar panel |
| ph | 150 | 17,5 | Tinggi panel |

- Redaman pegas tetesan dikali `1,7 − (kenyal / 100) × 1,3`.
- Redaman pegas panel dikali 1, jadi tidak ikut slider kenyal.
- Waktu simulasi dikali `kecepatan / 100`.

Empat slider ada di Pengaturan, bagian Tampilan notch:

| Slider | Rentang | Bawaan |
|---|---|---|
| Kenyal | 0–100 | 100 |
| Kecepatan | 40–200 | 200 |
| Jarak tetesan | 2–28 px | 9 px |
| Tebal notch | 2–14 px | 4 px |

### 4.4 Notifikasi

Acuan: `notif-v1.html` dan `glow-options.html`.

- **Mac dengan notch:**
  - Notch melebar ke kiri dan kanan seperti "telinga", setinggi notch fisik.
  - Telinga kiri berisi ikon modul. Telinga kanan berisi keterangan singkat, misalnya "Timer selesai · 25.00".
  - Setelah sekitar 3,5 detik, notch kembali seperti semula.
- **Layar tanpa notch:** lensa membuka menjadi pil kecil dengan isi yang sama, lalu kembali.
- **Cahaya G2:**
  - Pinggiran notch atau pil menyala dengan gradasi pelangi yang bergerak (#ff6ec4, #7873f5, #4adede, #ffd166). Karena penuh warna, cahayanya terlihat di wallpaper terang maupun gelap.
  - Ini satu-satunya pengecualian dari aturan monokrom.
  - Bisa dinyalakan atau dimatikan di Pengaturan, bagian Notifikasi. Bawaannya menyala **(keputusan penulis)**.
- **Isi notifikasi versi pertama:** hanya dari modul sendiri:
  - timer selesai,
  - reminder jatuh tempo,
  - masuk waktu sholat (kalau dinyalakan).
- **Ikon (keputusan penulis):** putih di atas hitam, mengikuti gaya Nothing. Di mockup lama ikonnya masih berwarna.
- **Klik notifikasi** membuka kartu modulnya **(keputusan penulis)**.
- **Beberapa notifikasi sekaligus** ditampilkan bergantian, tidak ditumpuk **(keputusan penulis)**.
- **Suara (keputusan penulis):**
  - Timer selesai dan reminder jatuh tempo membunyikan suara pendek bawaan sistem.
  - Notifikasi waktu sholat bawaannya tanpa suara, dan bisa diberi nada pendek lewat pengaturan.
  - Rekaman adzan tidak disertakan di versi pertama, karena ukurannya besar dan ada urusan lisensi.
  - Pengaturan suara ada di bagian Notifikasi, satu tombol nyala/mati per jenis notifikasi. Diputuskan pemilik ide pada 29 Oktober 2026:
    - Setiap modul mendaftarkan jenis notifikasinya. Beranda punya dua: Reminder dan Waktu sholat.
    - Setiap jenis punya saklar tampil dan saklar suara.
    - Bawaannya: Reminder tampil dan bersuara. Waktu sholat mati, dan tanpa suara kalau dinyalakan.
- **Notifikasi yang terlewat (keputusan penulis):**
  - Notifikasi tetap tampil seperti biasa. Kalau pengguna tidak sedang memakai komputer (2 menit tanpa ketikan atau gerakan mouse), atau layarnya sedang menampilkan app layar penuh, notch juga diberi titik kecil putih sebagai tanda ada notifikasi yang mungkin terlewat. Diperjelas pemilik ide pada 29 Oktober 2026.
  - Titik yang sama muncul di ikon modulnya di pil.
  - Titik hilang setelah panel dibuka.
- **Mac yang tidur:** jadwal yang lewat lebih dari 10 menit saat Mac tidur atau app tidak jalan tidak dikirim lagi, supaya notch tidak dibanjiri notifikasi lama.

### 4.5 Banyak monitor

- **Notch muncul di semua layar.**
  - Di MacBook dengan notch, notch tidak terlihat saat diam.
  - Di layar lain, notch tampil sebagai lensa.
- **Panel hanya terbuka di layar yang diklik.**
- **Notifikasi muncul di layar yang sedang ada kursornya.**
- **Pengaturan:** notch bisa dibatasi ke satu layar saja.
- **Saat ada app layar penuh** (film, game, presentasi), notch tetap tampil dan tetap bisa dipakai di layar itu. Diputuskan pemilik ide pada 28 Oktober 2026, menggantikan keputusan penulis sebelumnya untuk menyembunyikannya.

### 4.6 Perilaku jendela

Ini syarat yang wajib dipenuhi, cara mewujudkannya diserahkan ke pembuat.
- **Tidak menghalangi klik.** Di luar area notch dan panel, klik harus tembus ke menu bar dan app di bawahnya.
- **Tidak mencuri fokus.** Panel tidak mengambil fokus keyboard dari app yang sedang dipakai, kecuali saat pengguna mengetik di dalam panel, misalnya di Catatan.
- **Tetap di atas.** Notch selalu tampil di atas jendela lain dan di semua desktop atau Spaces.

## 5. Gaya visual dan bahasa

### Gaya visual: Nothing OS

- **Warna:** hitam, putih, dan tiga tingkat abu-abu.
- **Aksen:** merah (#E8262E) hanya untuk satu titik kecil per layar.
- **Huruf titik-titik:**
  - Angka besar memakai huruf titik-titik 5x7 yang digambar sendiri, untuk digit 0–9 dan °.
  - Kalau nanti butuh huruf atau tanda lain, tambahkan dengan cara yang sama.
- **Label:** huruf kapital kecil dengan Space Mono, jarak antarhuruf agak lebar, berwarna abu.
- **Pemisah:** garis titik-titik, bukan garis lurus.
- **Ruang dan isi:** sedikit elemen per layar, dengan banyak ruang kosong.

### Gaya bahasa: seperti web DynamicNotch

- **Kalimat:** pendek dan tegas.
- **Judul:** dua ketukan sejajar, misalnya "Selalu gratis. Untuk semua."
- **Sapaan:** pembaca disapa "kamu". Tidak ada sudut pandang "kami".
- **Kepercayaan:** tekankan gratis, tanpa iklan, tanpa pelacakan, dan hemat baterai.
- **Angka sebagai bukti:** misalnya "7 modul", "0 pelacak".
- **Nama fitur:** frasa biasa yang menjelaskan isinya, bukan nama merek buatan.

### Bahasa antarmuka

- **Indonesia dan Inggris** sejak versi pertama.
  - Bawaannya mengikuti bahasa perangkat, dan bisa diganti di pengaturan.
  - Semua teks ada di file terjemahan terpisah, satu file per bahasa.
- **Format waktu:**
  - Indonesia: "10.25", "Selasa, 27 Oktober 2026".
  - Inggris: "10:25", "Tuesday, 27 October 2026".
  - Keduanya memakai format 24 jam **(keputusan penulis)**.
- **Tema jendela (keputusan penulis):**
  - Panel notch selalu hitam.
  - Jendela pengaturan mengikuti mode terang atau gelap perangkat. Mockup-nya versi gelap.

## 6. Modul

### Pembagian tahap

| Tahap | Modul |
|---|---|
| 1 (versi pertama) | Beranda, Timer, Keep awake, Freeze keyboard, Kamera cermin, Catatan, System stat |
| 2 | Music player dan lirik, Kalender, Pantau agent |
| 3 | Uninstall app |

- **Tahap 1** berisi modul harian yang relatif mudah dibuat sama baiknya di Mac dan Windows.
- **Tahap 2** butuh izin sistem atau data dari luar. Contohnya, macOS membatasi app lain membaca lagu yang sedang diputar.
- **Tahap 3** paling berisiko karena menghapus file.

### Sistem modul

- **Bagian tampilan dan logika** setiap modul adalah paket web: HTML, CSS, dan JavaScript, plus sebuah manifest.
- **Isi manifest:**
  - nama dan ikon,
  - versi,
  - ukuran kartu,
  - izin yang dibutuhkan,
  - kemampuan sistem yang dipakai.
- **Kemampuan sistem** ditulis dengan Rust di dalam app inti, lalu dibuka untuk modul lewat API yang terbatas. Contohnya mengunci keyboard, menahan laptop tetap menyala, dan membaca CPU.
- **Akses modul dibatasi manifest.** Modul hanya boleh memakai kemampuan yang ia sebutkan di manifest-nya. Ini penting sejak awal, supaya nanti modul buatan orang lain aman dipasang.
- **Status modul:**
  - Dimatikan: modul tetap terpasang, tapi hilang dari pil dan berhenti bekerja.
  - Dicopot: paketnya dihapus dari disk.
- **Pemasangan versi pertama (keputusan penulis):**
  - Ketujuh modul tahap 1 ikut di dalam installer, supaya app langsung bisa dipakai tanpa internet.
  - Mencopot modul menghapusnya dari folder modul aktif. Salinan aslinya tetap tersimpan di dalam app.
  - "+ Tambah modul" di versi pertama hanya menampilkan modul bawaan yang pernah dicopot, untuk dipasang lagi tanpa internet.
  - Modul ikut diperbarui bersama app, tidak terpisah. Jadi API antara modul dan app inti masih boleh berubah sampai tahap 2.
  - **Tahap 2:** katalog unduhan di GitHub Releases, pemeriksaan tanda tangan, dan update modul terpisah. Semua ini dibuat bersamaan dengan modul pertama yang perlu diunduh. API modul baru dikunci versinya saat itu.
  - **Alasan:**
    - Paket web modul hanya puluhan sampai ratusan KB.
    - Ukuran app hampir seluruhnya berasal dari app inti Tauri, sekitar 5–15 MB. Angka ini tetap jauh lebih kecil dari Vorssaint (27 MB).
    - Jadi di versi pertama, mencopot modul membuat app lebih rapi, tapi hampir tidak mengurangi ukuran.
- **Urutan ikon di pil** sama dengan urutan di halaman Modul.

### Modul tahap 1

Setiap modul punya kartu sendiri di panel dan halaman sendiri di pengaturan.

- **Beranda:** lihat bagian 7.
- **Timer:**
  - Hitung mundur dan stopwatch.
  - Sisa waktunya tampil di status mini Beranda.
  - Notifikasi saat selesai.
- **Keep awake:**
  - Menahan laptop supaya tidak tidur, dengan durasi pilihan atau tanpa batas.
  - Di Mac memakai power assertion, di Windows memakai `SetThreadExecutionState`.
  - Saat aktif, tampil di status mini Beranda.
- **Freeze keyboard:**
  - Mengunci semua tombol keyboard, misalnya untuk membersihkan keyboard laptop.
  - Kartunya menampilkan hitung mundur dan tombol "Selesai" yang diklik dengan mouse atau trackpad.
  - **Pengaman (keputusan penulis):** kunci terbuka otomatis setelah 60 detik, dan durasinya bisa diatur. Tanpa pengaman, pengguna bisa terkunci kalau mouse tidak berfungsi.
  - Di Mac butuh izin Aksesibilitas. Di Windows memakai hook keyboard tingkat rendah.
- **Kamera cermin:**
  - Menampilkan kamera depan yang dibalik seperti cermin, untuk merapikan diri sebelum rapat.
  - Kamera hanya menyala selama kartu ini terbuka.
  - Butuh izin Kamera.
- **Catatan:**
  - Catatan cepat berupa teks, disimpan lokal.
  - Fokus keyboard boleh masuk ke panel saat sedang mengetik.
- **System stat:** CPU, memori, dan jaringan, diperbarui setiap 1–2 detik selama kartu terbuka.

## 7. Beranda

Acuan: `beranda-nothing.html`, pilihan **N2**.

### Isi

- tanggal,
- cuaca,
- jam (opsional),
- reminder,
- waktu sholat berikutnya,
- status mini modul yang sedang berjalan.

Yang sengaja tidak dimasukkan: agenda, baterai, dan zona waktu kedua.

### Layout N2: tiga kolom dipisah garis titik-titik

1. **Hari ini:**
   - Titik merah dan nama hari.
   - Tanggal besar dengan huruf titik-titik putih.
   - "Oktober 2026".
2. **Cuaca:**
   - Nama kota.
   - Suhu besar dengan huruf titik-titik, sama besar dengan tanggal tetapi lebih redup. Ini yang membuat urutan bacanya jelas: tanggal dulu, baru cuaca.
   - Kondisi cuaca dan suhu terendah/tertinggi hari ini.
3. **Berikutnya:**
   - Nama dan jam sholat berikutnya.
   - Baris titik yang menunjukkan berapa jauh waktu sudah berjalan sejak sholat sebelumnya, ditambah sisa waktunya ("1 j 22 m").
   - Di bawahnya, dua reminder terdekat.

Di bagian bawah ada garis titik-titik. Di bawah garis itu tampil status mini modul yang sedang berjalan, misalnya timer dan keep awake. Kalau tidak ada yang berjalan, baris ini kosong. Jam kecil ada di pojok kanan bawah dan bisa dimatikan.

### Sumber data

| Data | Sumber |
|---|---|
| Lokasi | Nama kota diketik sekali di pengaturan Beranda. Pencariannya memakai Open-Meteo Geocoding. Lokasi perangkat jadi pilihan tambahan, bawaannya mati, dan dikerjakan di rencana 5 bersama halaman Izin (diputuskan pemilik ide pada 29 Oktober 2026). Cuaca dan sholat memakai kota yang sama. |
| Cuaca | [Open-Meteo](https://open-meteo.com): gratis, tanpa akun, tanpa kunci API. Diperbarui setiap 30 menit **(keputusan penulis)**, hanya selama kartu Beranda terbuka. Saat offline, tampilkan data terakhir. |
| Waktu sholat | Dihitung di perangkat, tanpa internet, dengan rumus Adhan. Bawaannya metode Kemenag RI, bisa diganti di pengaturan. Diputuskan pemilik ide pada 29 Oktober 2026: <ul><li>Dihitung di bagian Rust app dengan crate [salah](https://github.com/insha/salah) (MIT), terjemahan Rust dari Adhan. Rumusnya sama dengan [adhan-js](https://github.com/batoulapps/adhan-js), tetapi notifikasi sholat tetap jalan walau kartu Beranda tertutup.</li><li>Kemenag RI: Subuh 20°, Isya 18°, Ashar mazhab Syafi'i, ihtiyat Subuh +2, Dzuhur +3, Ashar +2, Maghrib +3, Isya +2 menit, dibulatkan ke atas. Hasilnya sama dengan jadwal resmi Kemenag untuk Jakarta pada 29 dan 30 Oktober 2026.</li></ul> |
| Reminder | Disimpan lokal. Sinkron dengan Apple Reminders atau Google menyusul di tahap 2, bersama Kalender. |

### Cara menambah reminder (keputusan penulis)

Klik kolom "Berikutnya" untuk membuka daftar reminder lengkap di dalam kartu Beranda. Di sana ada kolom isian untuk reminder baru, berisi judul dan jam. Klik lingkaran di depan reminder untuk menandainya selesai.

Diputuskan pemilik ide pada 29 Oktober 2026:
- Jam boleh kosong. Reminder tanpa jam berlaku untuk hari dibuatnya dan tidak memberi notifikasi.
- Jam yang sudah lewat hari ini berarti besok.
- Reminder yang selesai hilang mulai hari berikutnya.

## 8. Pengaturan

Acuan: `settings.html`, pilihan **S1**.

### Bentuk dan cara membuka

- **Jendela biasa**, bukan di dalam notch, karena butuh ruang untuk slider dan daftar.
- **Cara membuka:** lewat ikon ⋯ di pil.
- **Ikon Dock:** selama jendela pengaturan terbuka, ikon Notching muncul di Dock dan Cmd+Tab, lalu hilang lagi saat jendela ditutup. Diputuskan pemilik ide pada 28 Oktober 2026.

### Sidebar

- Kotak pencarian selalu ada di atas sidebar. Pencarian mencari semua pengaturan, termasuk nama modul.
- Sidebar hanya berisi enam bagian dan tidak bertambah panjang berapa pun modul yang terpasang:

| Bagian | Isi |
|---|---|
| Umum | Bahasa, mulai saat login, layar tempat notch muncul. Ekspor dan impor pengaturan (ide dari Vorssaint) ditunda sampai pengaturan modul lebih banyak; diputuskan pemilik ide pada 28 Oktober 2026. |
| Tampilan notch | Empat slider dengan pratinjau langsung |
| Notifikasi | Cahaya G2 nyala/mati, lama tampil (bawaan 3,5 detik), tombol kirim contoh, dan saklar tampil serta suara per jenis notifikasi |
| Modul | Daftar modul terpasang: ikon, nama, keterangan singkat, ukuran, tombol nyala/mati. Klik untuk masuk ke halaman modul. Ada tombol "+ Tambah modul". |
| Izin | Setiap izin sistem, keterangan gunanya, modul yang memakainya, statusnya, dan tombol ke pengaturan sistem. Contohnya: Aksesibilitas untuk Freeze keyboard, Kamera untuk Kamera cermin, Lokasi untuk Beranda (opsional). Ide ini dari Vorssaint. |
| Tentang | Versi, cek update, tautan donasi |

### Halaman modul

- Berisi semua pengaturan modul itu dan tombol "Copot modul". Pengaturan satu modul tidak tersebar ke tempat lain.
- Contoh halaman Beranda: tampilkan jam, kota, pakai lokasi perangkat, metode hitung sholat, dan notifikasi saat masuk waktu sholat.

## 9. Rilis publik

Bagian ini dikerjakan setelah versi Mac nyaman dipakai sendiri dan versi Windows selesai.

- **Open source.** Kode dibuka untuk umum di GitHub. Lisensinya MIT **(keputusan penulis)**: paling sederhana dan memudahkan orang lain ikut membuat modul.
- **Nama app: Notching.**
  - Dibaca hampir sama dengan "Nothing", dan mengandung kata "notch". Maknanya merendah: app ini "tidak ada apa-apa", dan memang tidak terlihat saat diam.
  - Domain: `notching.web.id`, sudah dibeli.
  - Bundle ID: `id.web.notching` **(keputusan penulis)**. Nama dan bundle ID dipakai sejak build pertama, karena izin sistem dan lokasi data terikat ke keduanya.
  - **Jaga jarak dari merek Nothing.** Namanya mirip, dan gaya visualnya juga terinspirasi Nothing OS.
    - Jangan memakai kata "Nothing" di app, landing page, atau materi promosi.
    - Jangan memakai logo, font, atau aset milik Nothing. Huruf titik-titik sudah digambar sendiri.
    - Logo Notching harus punya bentuk sendiri, misalnya bentuk tetesan atau lensa.
    - Sebelum rilis, cek merek dagang "Notching" di kelas software.
- **Tanda tangan digital:** diputuskan sebelum rilis publik.
  - Mac: Apple Developer Program, 99 dolar AS per tahun. Dibutuhkan supaya macOS tidak memblokir app yang diunduh, dan supaya izin Aksesibilitas dan Kamera tidak hilang setiap kali app diperbarui.
  - Windows: bisa gratis lewat SignPath Foundation untuk proyek open source. Syaratnya: lisensi open source resmi, repo publik, dan build otomatis.
  - Selama dipakai sendiri, cukup tanda tangan lokal yang gratis.
- **Landing page:**
  - Memakai gaya bahasa di bagian 5.
  - Tombol donasi ala Buy Me a Coffee.
  - Tautan unduhan untuk Mac dan Windows.
- **Update otomatis:** memakai updater bawaan Tauri **(keputusan penulis)**.

## 10. Diserahkan ke pembuat

- Struktur folder, pembagian kode, dan cara pengujian.
- Cara teknis menaruh jendela di atas notch dan menembuskan klik, asalkan perilaku di bagian 4.6 terpenuhi.
- Format penyimpanan pengaturan, catatan, dan reminder.
- Bentuk persis API antara modul dan app inti, asalkan aksesnya dibatasi manifest.
- Cara mendeteksi Mac yang punya notch dan app yang sedang layar penuh.
- Detail tampilan kartu Timer, Keep awake, Freeze keyboard, Kamera cermin, Catatan, dan System stat, asalkan mengikuti gaya di bagian 5. Kartu-kartu ini belum punya mockup.
