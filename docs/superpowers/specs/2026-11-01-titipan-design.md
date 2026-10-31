# Desain modul Titipan

Status: pemilik ide meminta dikerjakan sampai selesai lalu direview di akhir (1 November 2026).

Dokumen ini merinci modul baru untuk menitipkan file di notch. Pemilik menyetujui nama **Titipan** (bahasa Inggris: **Shelf**). Dokumen ini mengacu ke desain awal (`2026-10-27-notch-design.md`) dan desain halaman (`2026-10-30-halaman-widget-design.md`). Hal yang tidak disebut di sini mengikuti kedua dokumen itu dan pola modul Keep awake, Timer, dan Keyboard Cleaning Mode.

Mockup ada di `2026-11-01-titipan-mockups/`. Gayanya baru lengkap kalau dibuka lewat alat brainstorming, karena isinya hanya potongan halaman.
- `titipan-tempat.html`: pemilik memilih **pilihan A**, yaitu laci sendiri yang didahulukan saat ada titipan.
- `status-banyak.html`: pemilik memilih **pilihan B**, yaitu beberapa status yang dipisah garis titik-titik.

## 1. Kenapa

Pemilik sering ingin menyalin file dengan seret-lepas. Tapi tujuannya sering ada di jendela lain atau workspace (Space) lain yang belum terlihat saat file mulai diseret. Titipan memberi tempat sementara di notch. File ditaruh di sana, lalu pemilik pindah ke tujuan dan menariknya keluar.

Kutipan permintaannya: "user drag file ke notch, lalu notch terbuka tempat penitipan file, user drop file nya kesana, lalu user kembali lagi untuk mengambil filenya untuk dipindahkan ke tempat lain. fitur ini untuk meng-copy file."

## 2. Tujuan, bukan tujuan, dan yang harus dihindari

**Tujuan**
- Seret file atau folder ke notch, dan notch terbuka menjadi tempat penitipan. Lepaskan di sana untuk menitipkan.
- Beberapa file dan folder bisa dititipkan sekaligus, dan laci bisa menampung beberapa titipan.
- Tarik titipan keluar dari laci ke jendela, workspace, atau layar mana pun. Hasilnya **salinan**, dan file asli tetap di tempatnya.
- Titipan yang sudah ditarik keluar langsung hilang dari laci.
- Selama ada titipan, terlihat di samping notch berapa jumlahnya.
- Langsung aktif tanpa perlu dinyalakan dulu.

**Bukan tujuan**
- Menyimpan titipan setelah Notching ditutup atau Mac dinyalakan ulang. Pemilik memilih titipan hilang.
- Memindahkan file. Hasilnya selalu salinan.
- Menitipkan teks, gambar dari browser, atau tautan yang bukan file. Yang diterima hanya file dan folder dari disk **(keputusan penulis)**.
- Membagikan file ke app lain, AirDrop, atau mengompres file. Ide-ide ini ada di app lain, tapi belum diminta.
- Versi Windows. Bagian Mac dipisah supaya Windows nanti cukup menambah bagiannya sendiri.

**Yang harus dihindari**
- **File asli berubah atau hilang.** Titipan tidak boleh memindahkan, mengganti nama, atau menghapus file asli, walaupun tujuannya ada di disk yang sama. Ini kegagalan paling buruk, walaupun hal lain berjalan.
- **File terlepas di tempat yang salah.** Saat file diseret melewati notch tanpa dilepas, notch harus menutup lagi dan tidak menyimpan apa pun.
- **Notch yang menghalangi.** Laci yang terbuka tidak boleh menutupi tujuan saat file sedang ditarik keluar.
- **Menunggu.** File besar harus langsung masuk laci tanpa jeda menyalin.

## 3. Menitipkan

- **Seret file mendekati notch.** Saat kursor yang membawa file sampai di notch, panel terbuka menjadi area **"Lepas untuk menitipkan"**. Area ini menggantikan halaman yang terakhir dibuka.
  - Di layar tanpa notch, lensa yang dipakai sebagai pengganti notch.
  - Kalau panel sudah terbuka di halaman lain saat file diseret masuk, panel juga berganti ke area itu.
- **Lepaskan di area itu,** dan file masuk laci. Lalu panel menampilkan laci.
- **Kalau file dibawa keluar tanpa dilepas,** area itu hilang. Panel menutup, atau kembali ke halaman sebelumnya kalau tadi sudah terbuka.
- **Setelah file dilepas, panel menutup sendiri saat kursor meninggalkan panel** **(keputusan penulis)**. Pada saat itu panel belum menjadi jendela aktif, jadi menunggu klik di luar akan terasa macet. Klik di luar dan Esc tetap menutup panel seperti biasa.
- **Isi yang diterima:** file dan folder, satu atau banyak sekaligus. Folder dititipkan sebagai satu titipan, dan isinya ikut tersalin saat ditarik keluar.
- **Titipan ganda:** file yang sudah ada di laci, kalau dititipkan lagi, tidak menjadi dua titipan. Titipan lama tetap di tempatnya **(keputusan penulis)**.
- **Jumlah:** tidak dibatasi. Laci menampilkan 6 titipan per baris, seperti halaman Modul. Baris berikutnya menambah tinggi panel sampai 3 baris. Lebih dari itu, laci bisa digulir **(keputusan penulis)**.
- **Urutan:** titipan terbaru ada di akhir **(keputusan penulis)**.

## 4. Laci

Acuan: `titipan-tempat.html`, pilihan A, momen 3.

- **Selama ada titipan, klik notch langsung membuka laci,** bukan halaman yang terakhir dibuka.
- **Pil mendapat ikon laci** di antara halaman custom dan Modul, tapi hanya selama ada titipan. Halaman lain tetap bisa dibuka dari pil.
- **Di atas laci** tertulis "Titipan · 3" di kiri, dan "Seret keluar untuk menyalin" di kanan.
- **Setiap titipan tampil sebagai pratinjau**, sama seperti gambar yang terlihat saat file diseret (permintaan pemilik):
  - foto, PDF, dan file lain yang punya pratinjau di Finder tampil sebagai gambar kecil isinya;
  - file lain dan folder tampil dengan ikon Finder-nya.

  Di bawah pratinjau ada nama file. Nama yang terlalu panjang dipotong di tengah supaya ekstensinya tetap terlihat, misalnya "laporan-ta…2026.pdf" **(keputusan penulis)**.
- **Memilih:** klik titipan untuk memilihnya. Cmd-klik dan Shift-klik memilih beberapa sekaligus, seperti di Finder.
- **Menarik keluar:** seret titipan dari laci. Kalau titipan yang diseret sedang terpilih bersama titipan lain, semuanya ikut diseret. Yang diseret memakai pratinjau yang sama.
- **Membuang tanpa menyalin:** setiap titipan punya tombol × kecil yang muncul saat kursor di atasnya. Di pojok laci juga ada tombol "Kosongkan". Membuang titipan tidak menyentuh file aslinya.
- **Laci kosong:** isinya keterangan "Seret file ke notch untuk menitipkan". Laci kosong dibuka dari kotak Titipan di halaman Modul (bagian 7).
- **Saat titipan terakhir diambil atau dibuang,** panel kembali ke halaman yang terakhir dibuka sebelum laci, dan ikon laci hilang dari pil.

## 5. Menarik keluar

- **Hasilnya selalu salinan.** Saat ditarik ke Finder, file disalin walaupun tujuannya di disk yang sama, padahal biasanya Finder memindahkan file di disk yang sama. App tujuan lain menerima file seperti biasa.
- **Setelah tujuan menerima titipan, titipan itu hilang dari laci.** Kalau tarikan dibatalkan, misalnya file dilepas di tempat yang tidak menerima file atau Esc ditekan, titipan tetap ada.
  - **"Diterima" sudah cukup (keputusan penulis, belum ditanyakan ke pemilik).** macOS hanya memberi tahu Notching bahwa tujuan menerima file. macOS tidak memberi tahu apakah salinannya berhasil. Jadi titipan juga hilang saat dilepas di ikon app di Dock (file dibuka, bukan disalin), di Terminal (yang masuk hanya alamat file), atau saat Finder dihentikan karena nama file bentrok.
  - Cara lain adalah Notching menyalin sendiri. Tapi Finder tidak lagi menunjukkan kemajuan menyalin, dan sebagian app tujuan, misalnya kolom unggah di browser, menolak file seperti itu. Karena file asli tetap ada, titipan yang hilang tanpa tersalin tidak membuat data hilang. File bisa dititipkan lagi dari tempat aslinya.
- **Saat kursor yang membawa titipan keluar dari panel, panel menutup** supaya tidak menutupi tujuan. Tarikannya tetap berjalan.
- **Bisa pindah workspace atau layar saat menarik,** seperti tarikan file biasa di Mac.
- **Melepas titipan kembali ke laci** tidak terjadi apa-apa **(keputusan penulis)**.

## 6. Apa yang disimpan

- **Laci hanya mengingat letak file asli,** tanpa membuat salinan cadangan. Titipan apa pun ukurannya langsung masuk dan tidak memakan ruang disk. Salinan baru dibuat saat titipan dijatuhkan di tujuan. Pemilik menyetujui ini saat playback.
- **Kalau file asli dihapus, dipindah, atau ganti nama sebelum diambil,** titipan itu tampil redup dengan keterangan "Tidak ditemukan", dan hanya bisa dibuang. Pemeriksaan dilakukan setiap kali laci dibuka **(keputusan penulis)**.
- **Isi laci disimpan di memori saja.** Notching yang ditutup, Mac yang dinyalakan ulang, atau Titipan yang dimatikan di Pengaturan membuat laci kosong.
- **File yang belum ada di disk (keputusan penulis, belum ditanyakan ke pemilik).** Beberapa sumber hanya "menjanjikan" file yang baru ditulis saat dilepas. Contohnya lampiran Mail, Foto, dan sebagian app chat. Gambar kecil hasil screenshot di pojok layar juga mirip, karena filenya berada di folder sementara yang dipindahkan macOS beberapa detik kemudian. Pemilik meminta "copy file apapun", jadi sumber seperti ini tetap diterima:
  - Notching menerima filenya ke folder Titipan sendiri di cache app. Selama file ditulis, titipan tampil redup dengan keterangan "Menerima…".
  - Ini satu-satunya keadaan Titipan menulis ke disk. File asli di app sumber tetap tidak disentuh.
  - File di folder sementara sistem (`/private/var/folders`) diperlakukan sama, yaitu disalin dulu ke folder Titipan. Dengan begitu, screenshot tidak menjadi "Tidak ditemukan" beberapa detik kemudian.
  - Folder Titipan dikosongkan saat Notching dibuka dan saat Notching keluar. Salinan tidak dihapus tepat saat titipan diambil, karena Finder masih menyalin setelah file dilepas.
- **Isi laci sama di semua layar.** File bisa dititipkan di monitor luar lalu diambil di MacBook, atau sebaliknya.

## 7. Halaman Modul dan Pengaturan

- **Titipan ikut di dalam app sebagai modul bawaan,** seperti Keep awake. Modul ini **langsung menyala** untuk pengguna baru dan untuk pengguna yang memperbarui app.
- **Kotak Titipan di halaman Modul** memakai ikon laci, dengan urutan setelah Cermin **(keputusan penulis)**. Klik kotak untuk membuka laci. Ini satu-satunya jalan ke laci saat laci kosong. Kotak ini tidak menyalakan atau mematikan apa pun.
  - Selama ada titipan, kotak diberi titik merah kecil, sama seperti modul yang sedang berjalan.
- **Pengaturan → Modul → Titipan** memakai saklar yang sudah ada untuk modul bawaan:
  - mematikan modul, yang juga mengosongkan laci dan menghentikan area "Lepas untuk menitipkan";
  - saklar "tampilkan status".
- Titipan tidak butuh izin sistem, jadi tidak muncul di halaman Izin. Membaca letak file yang dilepas pengguna tidak butuh izin tambahan.

## 8. Status di samping notch

Acuan: `status-banyak.html`, pilihan B.

- **Selama ada titipan,** samping notch menampilkan ikon laci dan jumlah titipan, misalnya "3". Lebih dari 99 ditulis "99+".
- **Semua status tampil bersamaan (permintaan pemilik).** Aturan ini mengganti aturan "satu status saja" di desain 30 Oktober §8, dan berlaku untuk semua modul.
  - Notch melebar ke kanan secukupnya. Di layar tanpa notch, pil di bawah lensa juga melebar.
  - Antarstatus dipisah garis titik-titik tegak.
  - **Urutan:** yang lebih dulu menyala paling dekat ke notch. Dengan begitu, status yang sudah tampil tidak bergeser saat ada yang baru **(keputusan penulis)**.
  - Setiap status tetap berupa ikon modul dan teks pendek (paling banyak sekitar 6 karakter), atau ikon saja seperti Keyboard Cleaning Mode.
  - Titik notifikasi terlewat tetap di sisi kiri.
  - Contoh status dari Pengaturan ikut berjajar seperti status lain, tanpa ikon.
- **Aturan lain dari desain 30 Oktober §8 tetap berlaku.** Status muncul di layar yang ada kursornya, disembunyikan sementara saat notifikasi tampil, dan bisa dimatikan per modul.
- **Batas lebar (keputusan penulis):** status dengan teks panjang bisa menutupi ikon menu bar di sebelah kanan. Dalam pemakaian wajar, paling banyak empat modul punya status sekaligus, jadi status tidak dibatasi. Kalau ternyata mengganggu saat dicoba di Mac, batasnya dibahas lagi dengan pemilik.

## 9. Layar tanpa notch dan monitor kedua

- **Area "Lepas untuk menitipkan" terbuka di layar tempat file diseret ke notch atau lensa.** Di layar tanpa notch, lensa membuka panel yang sama seperti di MacBook.
- **Laci sama di semua layar** (bagian 6).
- **Status muncul di layar yang ada kursornya,** sama seperti notifikasi.
- **Layar yang tidak dipilih** di Pengaturan → Tampilan notch tidak punya notch, jadi juga tidak punya Titipan.

## 10. Ikon dan kata-kata

- **Ikon Titipan:** laci bergaris, sesuai mockup. Ikon ini dipakai di kotak halaman Modul, di pil, dan di samping notch.
- **Kata-kata** mengikuti gaya bahasa desain awal bagian 5. Kata-kata pastinya ditentukan pembuat, kira-kira:

| Tempat | Bahasa Indonesia | English |
|---|---|---|
| Nama modul | Titipan | Shelf |
| Area saat menyeret | Lepas untuk menitipkan | Drop to keep here |
| Judul laci | Titipan · 3 | Shelf · 3 |
| Petunjuk laci | Seret keluar untuk menyalin | Drag out to copy |
| Laci kosong | Seret file ke notch untuk menitipkan | Drag files to the notch to keep them here |
| File asli hilang | Tidak ditemukan | Not found |
| File sedang diterima | Menerima… | Receiving… |
| Tombol | Kosongkan | Clear |

## 11. Cara kerja (keputusan penulis, untuk pembuat)

- **Mendeteksi file yang diseret ke notch.** Panel notch biasanya tembus klik di luar notch. Sensor di bawah notch (`sensor.rs`) menerima tanda saat ada file yang diseret masuk. Panel notch di layar itu lalu berhenti tembus klik dan membuka area "Lepas untuk menitipkan". Setelah itu, webview panel yang menerima file yang dilepas.
- **Isi laci di app inti (Rust),** bukan di halaman modul, karena laci harus sama di semua layar dan tetap ada saat panel tertutup. Halaman modul hanya membaca isi laci dan mengirim perintah: buang, kosongkan, dan mulai tarik. Perintah itu lewat gate dengan kemampuan baru di manifest, ditambah `status`.
- **Laci dan area "Lepas untuk menitipkan" ditampilkan halaman modul Titipan** di dalam panel, seperti halaman modul lain. App inti yang membuka halaman itu saat file diseret masuk dan saat panel dibuka selama ada titipan.
- **Pratinjau** dibuat dengan Quick Look, yang juga dipakai Finder, lalu dikirim ke halaman sebagai gambar. Kalau tidak ada pratinjau, ikon Finder dipakai. Pratinjau disimpan di memori bersama titipannya.
- **Tarikan keluar** adalah sesi seret milik macOS yang dimulai app inti dari panel. Sesi itu hanya menawarkan "salin", jadi Finder tidak bisa memindahkan file. Saat sesi selesai, titipan yang tersalin dibuang dari laci.
- **Status beberapa modul:** `status.rs` mengirim daftar status yang tampil, bukan satu status. `view.ts` menggambar semuanya dengan pemisah.

## 12. Diserahkan ke pembuat

- Nama kemampuan di manifest dan bentuk pesan antara halaman modul dan app inti.
- Ukuran pasti laci, pratinjau, tombol ×, dan area "Lepas untuk menitipkan", dalam batas manifest.
- Cara memanggil Quick Look dan sesi seret dari Rust.
- Gerak saat panel berganti ke area "Lepas untuk menitipkan", mengikuti pegas yang sudah ada.
- Cara memeriksa di Mac bahwa file asli tetap ada dan salinannya benar, misalnya dengan membandingkan isi file.
