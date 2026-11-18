# Desain Fokus jendela: semua yang di belakang jendela aktif menjadi blur

Tanggal: 18 November 2026
Status: disetujui pemilik, termasuk bagian 10 ("Setuju semua", 18 November 2026). Yang diputuskan pemilik ditandai **pemilik**. Selebihnya **keputusan penulis**, dikumpulkan di bagian 10.

## 1. Kenapa

Pemilik ingin fokus ke satu pekerjaan, yaitu satu jendela. Saat Fokus jendela menyala, semua yang ada di belakang jendela itu menjadi blur. Jendela pekerjaan tetap jelas, sedangkan jendela lain, desktop, dan monitor lain mundur dari perhatian. **(pemilik)**

## 2. Bentuk

Satu **alat latar** baru, **Fokus jendela** (id `window-focus`), satu kelompok dengan Potong file, Atur jendela, dan Intip jendela. Alat ini dipasang dari Pengaturan → Katalog → Alat, dan punya halaman sendiri di Pengaturan berisi saklar, status izin, dan setelan di bagian 6. Tidak ada kotak di halaman Modul di notch. **(keputusan penulis)**

Nama "Fokus" saja tidak dipakai karena sudah menjadi nama paket widget (`modules/fokus`). **(keputusan penulis)**

## 3. Tujuan, bukan tujuan, yang harus dihindari

**Tujuan**
- Perilaku di bagian 4, dengan blur hidup dari macOS (bagian 5).
- Fokus ke satu jendela, atau dua jendela pilihan pengguna.

**Bukan tujuan**
- Mengatur kekuatan blur dengan bebas. Cara 1 memakai bahan blur macOS yang kekuatannya ditentukan macOS. Kalau blurnya terasa kurang kuat setelah dicoba, cara 3 (blur window server dengan radius bebas) bisa ditambah sebagai pilihan "blur lebih kuat" di pekerjaan berikutnya. **(pemilik)**
- Memotret layar untuk blur. Blurnya sendiri tidak butuh izin Screen Recording; hanya intip yang butuh (bagian 4.4, diputuskan pemilik 18 November 2026).
- Fokus lebih dari dua jendela.
- Mengingat mode fokus setelah Notching ditutup atau Mac dinyalakan ulang. Mode fokus hanya ada di memori. **(keputusan penulis)**
- Versi Windows.

**Yang harus dihindari**
- **CPU tidak lagi 0,0% saat alat mati.** Saat mode fokus mati, tidak ada panel, observer, atau pelacak yang berjalan. Saat menyala pun tidak ada polling: Notching hanya bangun karena pemberitahuan macOS (app aktif berganti, jendela fokus berganti, jendela dibuat atau ditutup) dan gerakan kursor di atas lapisan blur.
- **Kedip yang mengganggu** saat fokus pindah. Lapisan blur diurutkan ulang tanpa disembunyikan dulu.
- **Mengunci pengguna.** ⌘Tab, Mission Control, menu bar, Dock, dan Notching sendiri tetap bekerja seperti biasa.

## 4. Perilaku

### 4.1 Menyalakan, mematikan, dan menambah jendela

- **⌃⌥F** di jendela yang sedang aktif: mode fokus menyala. Jendela itu jelas, yang lain blur. **(pemilik)**
- **⌃⌥F di jendela yang sedang difokuskan** mematikan mode fokus. **(keputusan penulis)**
- **⌃⌥F di jendela lain yang jelas tapi belum difokuskan**, misalnya jendela baru di 4.3: fokus pindah ke jendela itu saja, dan yang lain blur. **(pemilik)**
- **⌃⌥⇧F menambah jendela kedua.** **(pemilik: fokus di dua jendela pilihan pengguna; caranya keputusan penulis)** Ada dua cara memilih jendela kedua:
  - **⇧-klik jendela yang ter-blur** (bagian 4.4): jendela itu ikut difokuskan, dan fokus yang ada tetap.
  - **⌃⌥⇧F** setelah klik biasa memindahkan fokus ke jendela B (4.2): jendela yang difokuskan sebelumnya ikut kembali jelas. Hasilnya, sebelumnya plus B.
  - Kalau sudah ada dua, menambah jendela ketiga menggantikan yang paling lama difokuskan.
- Kedua shortcut bisa diganti di Pengaturan → Pintasan, seperti shortcut alat lain. Notching menolak kombinasi yang sudah dipakai shortcutnya sendiri.
- Selama mode fokus menyala, notch menampilkan ikon alat ini tanpa teks, seperti Keyboard Cleaning Mode. **(keputusan penulis)**

### 4.2 Fokus ikut pindah saat pengguna pindah (pemilik)

- **⌘Tab ke app lain:** fokus pindah ke jendela terdepan app itu, dan jendela yang difokuskan sebelumnya ikut blur. Kalau app itu adalah app milik salah satu dari dua jendela fokus, pasangan tetap. **(pemilik untuk ⌘Tab; keputusan penulis untuk pasangan)**
- **Klik jendela di area blur:** fokus pindah ke jendela itu.
- **Pindah jendela di dalam app yang sama** lewat ⌘\` atau menu Window, ke jendela yang tadinya di belakang blur: diperlakukan seperti klik, jadi fokus pindah. **(keputusan penulis)**
- **App aktif tidak punya jendela di Space ini**, misalnya Finder tanpa jendela atau app yang disembunyikan: blur dijeda (lapisan disembunyikan), lalu muncul lagi begitu ada jendela yang aktif. **(keputusan penulis)**
- **Jendela yang difokuskan ditutup atau di-minimize:** fokus pindah ke jendela yang lalu diaktifkan macOS. Kalau tidak ada, blur dijeda seperti di atas. **(keputusan penulis)**

### 4.3 Jendela baru dari app yang difokuskan (pemilik)

App yang sedang difokuskan membuka jendela baru, misalnya dialog Simpan, jendela Preferences, atau dokumen baru:
- Jendela baru itu muncul **jelas** di atas blur.
- Jendela yang difokuskan **tetap jelas** juga.
- Jendela baru itu bukan bagian dari fokus. Ia tetap jelas selama ada di atas blur, dan begitu ia tertutup tidak ada yang berubah.
- Tekan ⌃⌥F di jendela baru itu kalau ingin hanya dia yang fokus (4.1).

Yang dihitung "jendela baru" adalah jendela yang dibuat setelah fokus terakhir dipilih, oleh app yang sama. Jendela lama yang dimunculkan dari belakang blur mengikuti 4.2, bukan 4.3. **(keputusan penulis)**

### 4.4 Klik dan intip di area blur (pemilik, 18 November 2026)

- **Klik** jendela yang ter-blur: fokus pindah ke jendela itu (4.2). **(pemilik, 18 November 2026: sempat dimatikan, "di area blur buat tidak bisa di klik", lalu diaktifkan lagi: "sekarang aktifkan lagi ya")**
- **⇧-klik** jendela yang ter-blur menambahkannya sebagai jendela fokus kedua (4.1). **(pemilik: "aku mau ada shift klik")**
- **Intip:** kursor di atas jendela yang ter-blur menampilkan **gambar jendela itu, utuh**, di posisinya, di atas lapisan blur. Jendela yang tertutup jendela lain tetap tampil utuh, karena yang tampil adalah gambarnya. Urutan jendela tidak diubah, dan blur tidak dilubangi. **(pemilik memilih cara 1: "kembalikan fitur intip, kali ini buat lebih serius")**
  - Gambar diambil dengan ScreenCaptureKit, sama seperti Intip jendela (`peek_capture.rs`, `PictureSize::Full`), dan hanya disimpan di memori selama mode fokus menyala.
  - Sudut gambar mengikuti jendela aslinya, karena ScreenCaptureKit mengembalikan bentuk jendela beserta sudutnya yang transparan.
  - Intip menunggu kursor diam di atas jendela yang sama selama **0,5 detik**, lalu gambarnya muncul **perlahan** (pudar 400 ms). Kursor yang pindah sebelum itu membatalkan intipnya. Gambarnya diambil sambil menunggu. Intip hilang cepat (120 ms). Dari satu jendela ke jendela lain, gambar lama langsung hilang. **(pemilik, 18 November 2026: "dijeda 0.5 detik lalu mengintipnya dibuat perlahan"; 400 ms dan 120 ms dari penulis)**
  - Gambarnya diam: isi jendela tidak bergerak selama diintip.
  - Tanpa izin Screen Recording, intip tidak muncul. ⇧-klik dan blur tetap jalan.
  - **Pengaturan → Intip: Utuh / Bagian atas** (bawaan Utuh). Bagian atas: 20% teratas gambar tampil, lalu memudar dengan kurva *ease* sampai 50%, dan di bawahnya blur. Yang di-mask hanya gambar milik Notching, bukan blur macOS. **(pemilik, 18 November 2026: "coba lagi intip blur setengah", sebagai pilihan supaya bisa dibandingkan tanpa build ulang; angka dari penulis)**
- Klik dan ⇧-klik di desktop yang ter-blur tidak melakukan apa-apa.

  Riwayat: intipan sempat dibuat dengan melubangi blur (setengah, sepertiga, seperlima dengan gradasi, lalu jendela utuh dengan sudut membulat, dan sempat menaikkan jendela yang diintip). Hasilnya tetap berkedip walaupun log menunjukkan pemilihan jendelanya benar. Lihat catatan verifikasi nomor 6 sampai 14.

### 4.5 Mouse di area blur (pemilik, "setuju", 18 November 2026)

- **Klik hanya memindahkan fokus.** Klik itu tidak diteruskan ke jendela di belakang: tidak menekan tombol, tidak memindah kursor teks, dan tidak memulai seret judul jendela. Sama seperti klik pertama di jendela yang tidak aktif di banyak app Mac.
- **Scroll, klik kanan, dan klik tengah** di area blur tidak melakukan apa-apa. Pengguna pindah fokus dulu.
- **Drag-and-drop tetap jalan.** Selama pengguna menyeret sesuatu, misalnya file dari jendela fokus, lapisan blur membiarkan semua event mouse lewat (`ignoresMouseEvents`), sehingga file bisa dijatuhkan ke jendela di belakang blur. Intipan tidak berjalan selama menyeret. Seret dikenali dengan pendeteksi seret yang sudah dipakai Shelf (`shelf_watch.rs`). Setelah seret selesai, lapisan kembali menangkap mouse.

### 4.6 Layar, Space, dan app layar penuh

- **Setiap monitor punya mode fokusnya sendiri.** ⌃⌥F di jendela pada sebuah monitor menyalakan atau mematikan mode fokus monitor itu saja. Monitor tanpa mode fokus tetap normal: klik atau ⌘Tab ke jendela di sana tidak menyentuh fokus monitor lain. Untuk mematikan semuanya, ⌃⌥F ditekan di masing-masing monitor. Pasangan dua jendela berlaku di dalam satu monitor; ⌃⌥⇧F di monitor yang mode fokusnya mati menyalakan mode fokus monitor itu. Jendela fokus yang diseret ke monitor yang mode fokusnya mati membawa mode fokusnya ikut pindah. Jendela yang diseret ke monitor yang punya mode fokus sendiri menjadi jendela fokus monitor itu, dan monitor asalnya melepasnya (dijeda kalau tidak ada jendela fokus lain). Ini berlaku untuk jendela fokus maupun jendela biasa. **(pemilik, 18 November 2026, setelah jendela yang ditarik tetap tercatat milik monitor asalnya)** Tanpa jendela (desktop), monitor tempat kursor berada yang menentukan. **(pemilik, 18 November 2026)**
- **Menu bar, Dock, menu yang terbuka, notifikasi, dan panel Notching** tetap jelas, karena semuanya ada di level jendela di atas lapisan blur.
- **Pindah Space:** lapisan ikut ke Space yang baru, dan fokus pindah ke jendela aktif di sana, sama seperti ⌘Tab. **(keputusan penulis)**
- **App layar penuh:** tidak ada blur, karena di sana tidak ada jendela lain untuk di-blur. **(keputusan penulis)**
- **Mission Control dan App Exposé:** lapisan blur tidak boleh muncul sebagai jendela di sana, dan tidak menghalangi tampilannya. **(keputusan penulis)**
- **Pengalih jendela Intip jendela, ⌘Tab bawaan, dan Screenshot** tidak menampilkan lapisan blur sebagai jendela. **(keputusan penulis)**

## 5. Cara kerja (pemilik memilih cara 1)

**Lapisan blur.** Satu panel per layar, seukuran layar, berisi blur bawaan macOS (`NSVisualEffectView`, mode `behindWindow`) dengan bahan gelap. Panel ini tidak pernah menjadi key window, tidak mengaktifkan Notching saat diklik, dan tidak masuk Mission Control. Pola panelnya mengikuti `keyclean_dim.rs`: dibuat sekali, setelah itu hanya disembunyikan dan dimunculkan.

Blurnya hidup dan dikerjakan oleh window server di GPU: video di belakang tetap bergerak, dan Notching tidak menggambar apa-apa sendiri.

**Urutan jendela.** Panel ada di level jendela biasa (0) dan diurutkan **tepat di bawah** jendela yang difokuskan (`orderWindow:relativeTo:` dengan nomor jendela dari `ax::window_id`). Dengan dua jendela fokus, keduanya dinaikkan lewat Accessibility (`ax::raise`), lalu panel diurutkan tepat di bawah yang lebih rendah. Jendela baru (4.3) otomatis berada di atas panel karena macOS menaruh jendela baru di paling depan.

**Mengikuti perubahan.** Saat mode fokus menyala, Notching mendengarkan:
- Pemberitahuan NSWorkspace bahwa app aktif berganti (4.2, ⌘Tab).
- Observer Accessibility (`ax::Observer`) di app aktif untuk `AXFocusedWindowChanged`, `AXWindowCreated`, `AXUIElementDestroyed`, dan `AXWindowMiniaturized`. Observer dipindah setiap kali app aktif berganti.
- Pergantian Space dan perubahan susunan layar.

Semua pendengar dilepas saat mode fokus mati.

**Mengintip (cara baru, bagian 4.4).** Panel punya tracking area. Saat kursor bergerak di atasnya, Notching mencari jendela teratas di bawah kursor (`windows_below`, `window_at`). Gambar jendela itu diambil di thread lain dan dipasang sebagai lapisan gambar di atas blur dan lapisan gelap, seukuran bingkai jendela. Uraian cara lama, yang sudah tidak dipakai: Panel punya tracking area. Selama kursor bergerak di atasnya, Notching mencari jendela teratas di bawah kursor dari daftar jendela window server (`CGWindowListCopyWindowInfo`, hanya jendela di bawah panel, tanpa jendela Notching sendiri). Bingkai jendela itu lalu dilubangi dari blur dengan mask: transparan seukuran jendela dengan sudut membulat; bagian yang tertutup jendela blur lain tetap blur. Daftar jendela dibaca sekali saat kursor masuk ke jendela baru, bukan di setiap gerakan.

**Klik di blur.** Panel menerima klik. Klik pada jendela teratas di bawah kursor mengaktifkan app-nya, menaikkan jendela itu (`ax::set_frontmost`, `ax::raise`), lalu fokus diperbarui seperti 4.2.

**Aturan tanpa AppKit.** Keputusan tentang siapa yang difokuskan ada di modul aturan tersendiri (misalnya `focus_rules.rs`), bebas AppKit, dan diuji unit. Isinya: kumpulan jendela fokus dan perubahannya karena shortcut, app aktif, jendela fokus, jendela dibuat, dan jendela ditutup. Polanya sama dengan `win_rules.rs` dan `peek_rules.rs`.

## 6. Pengaturan

Halaman Fokus jendela di Pengaturan berisi:
- Saklar nyala/mati alat (bukan mode fokus; mode fokus dinyalakan dengan shortcut).
- Status izin Accessibility, seperti alat lain.
- **Intip:** Utuh atau Bagian atas (bagian 4.4). Bawaannya Utuh.
- **Gelapkan:** Tidak, Sedikit, atau Banyak, yaitu lapisan hitam tipis di atas blur (0 %, 15 %, 35 %). Bawaannya Sedikit. **(keputusan penulis)** Ini satu-satunya cara mengatur seberapa "mundur" latar belakang dengan cara 1.

Pengaturan → Pintasan memuat ⌃⌥F dan ⌃⌥⇧F.

## 7. Izin

Accessibility, untuk semua fitur. Screen Recording, hanya untuk intip (bagian 4.4), sama seperti Intip jendela. Tanpa Screen Recording, intip tidak muncul. Kalau izin belum ada saat shortcut ditekan, notch menampilkan pemberitahuan izin seperti alat lain, paling sering sekali per menit. Mode fokus tidak menyala tanpa izin.

## 8. Risiko dan uji pertama

Langkah pertama pembangunan adalah uji kecil (spike) untuk tiga hal yang belum pernah dipakai Notching:
1. Panel Notching bisa diurutkan tepat di bawah jendela **app lain** dengan `orderWindow:relativeTo:`, dan urutan itu bertahan saat pengguna mengklik jendela fokus.
2. `NSVisualEffectView` mode `behindWindow` di panel transparan mem-blur jendela app lain di belakangnya, bukan hanya desktop.
3. Mask gradasi di atas `NSVisualEffectView` membuat lubang jelas dengan gradasi halus.
4. Dua jendela fokus dari **app berbeda**: setelah app A diaktifkan (klik atau ⌘Tab), jendela B dari app yang tidak aktif bisa dinaikkan lewat `ax::raise` sampai di atas jendela-jendela lain milik A, sehingga hanya A dan B yang jelas.

Kalau nomor 1 atau 2 gagal, pembangunan berhenti dan penulis kembali ke pemilik dengan pilihan cara lain (cara 3, atau cara 2 dengan gambar diam).

Kalau nomor 3 gagal (blur tidak menerima mask lembut), intipan memakai lubang bertepi tegas di bagian atas jendela, dan penulis memberi tahu pemilik saat menyerahkan hasil uji. **(keputusan penulis)**

Kalau nomor 4 gagal, pembangunan berhenti di bagian pasangan dan penulis kembali ke pemilik dengan pilihan: pasangan hanya dari app yang sama, atau jendela lain milik app aktif ikut jelas dalam mode pasangan. Fokus satu jendela tetap dikerjakan. **(keputusan penulis)**

Setelah dokumen ini disetujui, termasuk bagian 10, modul aturan dan test-nya boleh dikerjakan lebih dulu, sejajar dengan uji ini.

Risiko lain yang harus dicek di Mac sungguhan:
- Kedip sebentar saat ⌘Tab: jendela app baru sempat tampil di atas blur bersama jendela lama sebelum panel diurutkan ulang.
- Dialog sheet yang menempel di jendela fokus (ikut jendelanya, harusnya aman).
- Jendela yang menolak dinaikkan lewat Accessibility.

## 9. Pengujian

- Unit test untuk modul aturan (bagian 5): setiap baris di bagian 4 menjadi minimal satu test.
- Uji manual di Mac yang dicatat di `docs/superpowers/verification/`: satu dan dua monitor, ⌘Tab, klik di blur, ⇧-klik, dialog Simpan, ⌘\`, Space dan layar penuh, Mission Control, serta CPU saat alat mati (0,0%) dan saat mode fokus diam.

## 10. Keputusan penulis yang perlu dicek pemilik

1. Nama **Fokus jendela**, id `window-focus`, sebagai alat latar di Katalog.
2. ⌃⌥F di jendela yang sedang difokuskan mematikan mode fokus.
3. (Diganti pemilik untuk jendela yang diseret ke monitor yang punya fokus sendiri, bagian 4.6.) Cara memilih jendela kedua: ⇧-klik jendela yang ter-blur, atau ⌃⌥⇧F setelah pindah fokus untuk mengembalikan jendela sebelumnya. Jendela ketiga menggantikan yang paling lama.
4. Saat fokus di dua jendela, ⌘Tab ke app milik salah satunya tidak memecah pasangan.
5. ⌘\` ke jendela lama di app yang sama dianggap pindah fokus, bukan jendela baru.
6. App aktif tanpa jendela, atau jendela fokus ditutup tanpa pengganti: blur dijeda, bukan dimatikan.
7. (Tidak berlaku lagi: intipan dihapus pemilik.)
8. Klik di desktop yang ter-blur tidak melakukan apa-apa.
9. Pindah Space memindah fokus. App layar penuh tanpa blur. (Bagian monitor diganti pemilik: hanya monitor jendela fokus yang di-blur, bagian 4.6.)
10. Ikon alat tanpa teks di samping notch selama mode fokus menyala.
11. Setelan Gelapkan: Tidak, Sedikit (bawaan), Banyak.
12. Mode fokus tidak diingat setelah Notching ditutup.
13. (Tidak berlaku lagi: intipan kini tanpa gradasi.)
14. Pasangan dari dua app berbeda diuji di langkah pertama; kalau gagal, pemilik memilih jalan keluarnya.
