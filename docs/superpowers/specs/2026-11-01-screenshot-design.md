# Desain modul Screenshot

Status: pemilik meminta dikerjakan sampai selesai lalu direview di akhir (1 November 2026).

Dokumen ini merinci modul baru untuk mengambil screenshot. Modul ini mengacu ke desain awal (`2026-10-27-notch-design.md`), desain halaman (`2026-10-30-halaman-widget-design.md`), dan desain Titipan (`2026-11-01-titipan-design.md`). Hal yang tidak disebut di sini mengikuti dokumen-dokumen itu dan pola modul yang sudah ada.

Mockup ada di `2026-11-01-screenshot-mockups/`. Gayanya baru lengkap kalau dibuka lewat alat brainstorming, karena isinya hanya potongan halaman.
- `notch-hasil.html`: notch setelah screenshot diambil.
- `halaman-screenshot.html`: halaman Screenshot, versi 2 (5 × 3, tombol di bawah).
- `editor.html`: jendela editor, versi 2 (dengan Sensor, Sudut, dan pemilih warna sendiri).

Pemilik membandingkan modul ini dengan CleanShot X, Shottr, dan Vorssaint. Yang paling sering ia pakai Vorssaint, karena "sangat simple". Seperti aturan di desain awal, yang diambil dari Vorssaint hanya idenya, bukan kode atau tampilannya.

## 1. Kenapa

Pemilik paling sering memotret window yang sedang berjalan, kadang seluruh layar, dan kadang detail kecil. Ia ingin screenshot langsung siap di-paste, terlihat di notch, dan bisa dicoret atau diberi background tanpa membuka app lain.

## 2. Tujuan, bukan tujuan, dan yang harus dihindari

**Tujuan**
- Tiga cara mengambil gambar: **seluruh layar**, **window**, dan **area yang dipilih sendiri**.
- Tombol keyboard: **Cmd+Shift+3** untuk seluruh layar, dan **Cmd+Shift+4** untuk window (klik) atau area (tarik).
- Setiap screenshot **langsung tersalin ke clipboard**, lalu **notch terbuka menampilkan gambarnya** dengan tombol **Salin**, **Simpan**, dan **Hapus**.
- Klik gambar di notch untuk membuka **jendela editor**. Di sana tersedia coretan bebas, bentuk, panah, teks, sensor, sudut membulat, dan background.
- **Halaman Screenshot** di halaman Modul menampilkan **15 screenshot terakhir** dan tiga tombol untuk mengambil screenshot baru.
- Screenshot bisa **diseret** dari notch ke app lain sebagai file PNG.

**Bukan tujuan**
- Rekam layar (video atau GIF), screenshot bergulir, timer, OCR, pin gambar di layar, unggah ke awan, atau watermark. Ide-ide ini ada di app lain, tapi tidak diminta **(keputusan penulis)**.
- Mengganti tombol keyboard di Pengaturan. Tombolnya tetap Cmd+Shift+3 dan Cmd+Shift+4 **(keputusan penulis)**.
- Mematikan screenshot bawaan Mac secara otomatis (bagian 4).
- Status di samping notch. Pemilik memutuskan modul ini tidak punya status.
- Versi Windows. Bagian Mac dipisah supaya Windows nanti cukup menambah bagiannya sendiri.

**Yang harus dihindari**
- **Tombol yang diam saja.** Kalau Cmd+Shift+3 atau 4 ditekan dan tidak terjadi apa-apa, misalnya karena masih direbut screenshot bawaan Mac atau izin belum diberikan, pemilik harus diberi tahu sebabnya. Kegagalan diam-diam adalah kegagalan paling buruk, walaupun hal lain berjalan.
- **Tombol di halaman Screenshot ikut terfoto.** Kalau screenshot dimulai dari tombol di halaman Screenshot, panel harus sudah tertutup sebelum gambar diambil. Selain itu, apa pun yang sedang tampil dari Notching ikut terfoto (bagian 3).
- **Gambar buram.** Screenshot diambil dengan resolusi asli layar, misalnya 2× di layar Retina.
- **Kehilangan hasil edit.** Coretan yang sudah dibuat tidak boleh hilang hanya karena jendela editor ditutup.

## 3. Mengambil screenshot

**Cmd+Shift+3: seluruh layar**
- Yang difoto adalah **layar tempat window aktif berada**. Kalau window aktif ada di monitor luar, yang difoto monitor luar.
- Kalau tidak ada window aktif, misalnya setelah Desktop diklik, yang difoto adalah layar yang ada kursornya **(keputusan penulis)**.
- **Notch dan statusnya tetap ikut terfoto,** tidak disembunyikan. Pemilik menyetujui ini.
- **Panel yang sedang terbuka juga ikut terfoto,** misalnya hasil screenshot sebelumnya, Beranda, Titipan, atau notifikasi. Panel tidak ditutup dulu. Ini keputusan pemilik setelah pemeriksaan desain. Aturan ini juga berlaku untuk Cmd+Shift+4. Kecuali yang disebut di bagian "Dari halaman Screenshot", Notching tidak menyembunyikan apa pun.

**Cmd+Shift+4: window atau area**
- Layar sedikit diredupkan dan kursor berubah menjadi tanda tambah **(keputusan penulis)**.
- **Window di bawah kursor diberi sorotan.** **Klik** untuk memotret window itu.
- **Tarik** untuk memilih area sendiri. Gambar diambil saat tombol mouse dilepas. Selama menarik, ukuran area ditampilkan dalam piksel **(keputusan penulis)**.
- Sorotan dan kotak pilihan mengikuti kursor di layar mana pun. Area tidak bisa melewati batas satu layar **(keputusan penulis)**.
- **Esc** membatalkan tanpa mengambil gambar **(keputusan penulis)**.
- Window difoto tanpa bayangan bawaan macOS. Sudut window yang membulat dibiarkan transparan **(keputusan penulis)**. Bayangan bisa ditambahkan lewat background di editor.

**Dari halaman Screenshot**
- Tombol **Layar** sama dengan Cmd+Shift+3. Layar yang difoto adalah layar tempat panel dibuka.
- Tombol **Window** sama dengan Cmd+Shift+4, tapi hanya klik window yang berlaku **(keputusan penulis)**.
- Tombol **Area** sama dengan Cmd+Shift+4, tapi tanpa sorotan window, jadi hanya tarik yang berlaku **(keputusan penulis)**.
- Panel menutup dulu, lalu gambar diambil setelah panel benar-benar hilang.

**Setelah gambar diambil**
- Terdengar bunyi jepret kamera seperti screenshot bawaan Mac **(keputusan penulis)**.
- Gambar langsung masuk clipboard.
- Gambar masuk daftar 15 screenshot terakhir (bagian 6).
- Notch terbuka menampilkan gambarnya (bagian 5) di layar tempat gambar diambil.

## 4. Tombol keyboard dan screenshot bawaan Mac

- Di Mac pemilik, Cmd+Shift+3 dan 4 masih dipakai screenshot bawaan Mac. Selama tombol bawaan itu menyala, tombol tersebut direbut macOS dan tidak sampai ke Notching.
- **Notching tidak mematikan tombol bawaan Mac sendiri.** Notching memberi tahu dan menunjukkan caranya **(keputusan penulis, pemilik tidak keberatan saat playback)**:
  - Halaman Screenshot dan Pengaturan → Modul → Screenshot menampilkan keterangan "Cmd+Shift+3 dan 4 masih dipakai screenshot bawaan Mac" selama tombol bawaan masih menyala.
  - Keterangan itu dilengkapi tombol untuk membuka Pengaturan Sistem → Keyboard → Pintasan Keyboard → Screenshot.
  - Keterangan hilang sendiri setelah tombol bawaan dimatikan.
- **Notching tidak bisa tahu saat tombol yang direbut macOS ditekan,** karena tekanannya tidak sampai ke Notching. Jadi pemberitahuannya dikirim lebih dulu **(keputusan penulis)**:
  - Saat Notching dibuka atau modul dinyalakan dan tombolnya masih direbut, notch menampilkan notifikasi biasa sekali, misalnya "Cmd+Shift+3 masih dipakai Mac". Klik notifikasi itu membuka halaman Screenshot, tempat keterangan dan tombolnya berada.
  - Notifikasi ini paling banyak sekali setiap Notching dibuka.
  - Yang diperiksa hanya Cmd+Shift+3 dan Cmd+Shift+4 bawaan Mac, masing-masing sendiri. Versi dengan Ctrl dan Cmd+Shift+5 memakai tombol lain, jadi tidak bentrok. Keterangan hanya menyebut tombol yang masih direbut.
  - Kalau tombol dipakai app lain, misalnya CleanShot X atau Shottr, Notching gagal mendaftarkan tombol itu. Keterangannya berbunyi "Cmd+Shift+4 dipakai app lain", tanpa tombol ke Pengaturan Sistem.
- Tombol Layar, Window, dan Area di halaman Screenshot tetap bisa dipakai walaupun tombol keyboard masih direbut.
- Tombol keyboard hanya aktif selama modul menyala. Kalau modul dimatikan atau dicopot, Notching melepas tombol itu.

## 5. Notch setelah screenshot

Acuan: `notch-hasil.html`.

- **Isi panel:**
  - label kecil di atas, misalnya "Screenshot · Window";
  - gambar screenshot di kiri, dengan keterangan "Klik untuk edit";
  - di kanan, tulisan "Tersalin ke clipboard" dan ukuran gambar, misalnya "2940 × 1718";
  - tombol **Salin**, **Simpan**, dan **Hapus**.
- **Panel tetap terbuka sampai** pemilik mengklik di luar panel, menekan Esc, menekan Salin atau Cmd+C, atau menekan Hapus. Panel tidak menutup sendiri setelah beberapa detik.
  - Supaya Cmd+C dan Esc langsung bekerja, panel menjadi jendela aktif saat terbuka, tanpa perlu diklik dulu.
- **Salin atau Cmd+C** menyalin gambar ke clipboard lagi, lalu menutup panel. Kalau gambar sudah diedit, yang disalin adalah hasil editnya.
- **Esc atau klik di luar** hanya menutup panel. Gambar sudah ada di clipboard sejak diambil.
- **Simpan** menaruh file PNG di **Desktop**.
  - Nama filenya mengikuti bahasa app, misalnya "Screenshot 2026-11-01 14.02.05.png" **(keputusan penulis)**.
  - Setelah disimpan, tombolnya berganti menjadi "Tersimpan" dan panel tetap terbuka **(keputusan penulis)**.
  - Kalau gambar diedit setelah disimpan, Simpan bisa ditekan lagi. File baru diberi nomor di belakang namanya, dan file lama tidak ditimpa **(keputusan penulis)**.
- **Hapus** membuang screenshot itu dari daftar 15, lalu menutup panel. File yang sudah disimpan ke Desktop dan isi clipboard tidak disentuh **(keputusan penulis)**.
- **Klik gambar** untuk membuka jendela editor (bagian 7). Panel menutup.
- **Seret gambar** ke app lain, misalnya WhatsApp atau Finder, dan app itu menerima file PNG dengan nama yang sama seperti Simpan. Saat kursor yang membawa gambar keluar dari panel, panel menutup supaya tidak menutupi tujuan, seperti Titipan.
- **Screenshot baru saat panel masih terbuka** menggantikan isi panel dengan screenshot baru **(keputusan penulis)**.
- **Layar tanpa notch:** panel yang sama terbuka dari lensa.

## 6. Halaman Screenshot dan daftar 15 terakhir

Acuan: `halaman-screenshot.html`, versi 2.

- **Kotak Screenshot** ada di halaman Modul, dengan urutan setelah Titipan **(keputusan penulis)**. Klik kotak untuk membuka halaman Screenshot. Kotak ini tidak menyala putih dan tidak punya titik merah.
- **Isi halaman:**
  - bar "‹ Modul" di atas, dengan label "Screenshot · 15" di kanan;
  - **15 screenshot terakhir dalam 5 kolom × 3 baris**, dengan yang terbaru di kiri atas, dan di bawah setiap gambar ada jamnya ("14.02", "Kemarin", atau "30 Okt");
  - **tiga tombol di bawah**, yaitu **Layar** (keterangan "⌘⇧3"), **Window** ("⌘⇧4 + klik"), dan **Area** ("⌘⇧4 + tarik"). Di bahasa Inggris, keterangannya "click" dan "drag".
- **Tinggi panel menyesuaikan jumlah baris.** Dengan 5 screenshot atau kurang, daftar hanya satu baris.
- **Daftar kosong** menampilkan keterangan singkat, misalnya "Tekan ⌘⇧3 atau ⌘⇧4 untuk screenshot pertama" **(keputusan penulis)**.
- **Pada setiap gambar (keputusan penulis, pemilik tidak keberatan saat playback):**
  - saat kursor di atas gambar, muncul tombol kecil Salin, Simpan, dan Hapus, yang fungsinya sama dengan tombol di notch;
  - klik gambar untuk membuka jendela editor;
  - gambar bisa diseret ke app lain sebagai file PNG, sama seperti di notch.
- **Screenshot ke-16** membuat yang paling lama hilang dari daftar, beserta filenya di folder Notching.
- **Daftar tetap ada** walaupun Notching ditutup atau Mac dinyalakan ulang. Daftar disimpan di folder data Notching, bukan di Desktop.
- **Modul dimatikan:** daftar tetap tersimpan dan muncul lagi saat modul dinyalakan. **Modul dicopot:** daftar dan filenya ikut dihapus **(keputusan penulis)**.

## 7. Jendela editor

Acuan: `editor.html`, versi 2.

**Membuka dan menutup**
- Editor adalah **jendela sendiri**, bukan bagian dari panel notch, karena panel notch terlalu kecil (paling besar 960 × 560) dan menutup saat ada klik di luar. Pemilik menyetujui ini.
- Editor dibuka dengan mengklik gambar di notch atau di halaman Screenshot.
- Jendela terbuka di layar tempat gambar diklik, dengan ukuran yang pas untuk gambarnya, paling besar sekitar 80% layar. Gambar selalu muat di jendela, tanpa kontrol zoom **(keputusan penulis)**.
- Hanya ada satu jendela editor. Membuka screenshot lain saat editor terbuka mengganti isinya, dan suntingan yang sedang dikerjakan tetap tersimpan **(keputusan penulis)**.
- **Salin atau Cmd+C** menyalin hasil edit ke clipboard, lalu menutup jendela.
- **Simpan** menaruh hasil edit di Desktop, dengan aturan nama yang sama seperti bagian 5. Jendela tetap terbuka **(keputusan penulis)**.
- **Jendela ditutup dengan tombol merah** tanpa Salin atau Simpan: suntingan tetap tersimpan bersama screenshot itu di daftar, tapi tidak masuk clipboard **(keputusan penulis)**.

**Bar kiri: alat**
- **Pilih/geser:** memilih coretan, bentuk, atau teks yang sudah dibuat, lalu menggeser, mengubah ukuran, atau menghapusnya dengan Delete.
- **Coretan:** gambar bebas.
- **Panah**, **Kotak**, **Lingkaran**, dan **Garis**. Tahan Shift untuk garis lurus 45° atau bentuk sama sisi **(keputusan penulis)**.
- **Teks:** klik di gambar, lalu ketik.
- **Sensor:** tarik kotak di atas bagian rahasia, dan bagian itu menjadi kotak-kotak buram (pixelate). Permintaan pemilik.

**Bar bawah**
- **Warna** untuk coretan, bentuk, dan teks. Ada 6 pilihan: merah, kuning, hijau, biru, hitam, dan putih **(keputusan penulis)**.
- **Tebal garis**, 3 pilihan. Untuk teks, pilihan ini menjadi ukuran huruf **(keputusan penulis)**.
- **Sudut:** penggeser untuk membulatkan sudut screenshot. Permintaan pemilik. Tanpa background, sudut yang dibulatkan menjadi transparan **(keputusan penulis)**.
- **Background:** membuka kotak pilihan background, seperti di mockup.

**Setelan terakhir** (diminta pemilik pada 1 November 2026)
- Editor dibuka dengan alat, warna, dan tebal garis yang terakhir dipakai.
- Screenshot yang belum pernah diedit dibuka dengan Sudut, Jarak, dan Background yang terakhir dipakai. Setelan ini sudah terpasang sejak editor dibuka, jadi bukan langkah yang bisa diurungkan.
- Screenshot yang sudah pernah diedit tetap dibuka dengan setelannya sendiri, dan membukanya tidak mengubah setelan terakhir.
- Background berupa gambar (Wallpaper Mac atau Pilih file…) tidak diingat karena ukurannya besar. Screenshot berikutnya dibuka tanpa background, tapi Sudut dan Jarak tetap diingat **(keputusan penulis)**.
- Setelan disimpan di penyimpanan lokal jendela editor, dengan kunci `notching.editor`.

**Kotak Background**
- **Tanpa background** adalah pilihan bawaan, sampai ada setelan terakhir **(keputusan penulis)**.
- **Warna solid:** beberapa warna siap pakai, ditambah **lingkaran warna untuk memilih warna sendiri**.
- **Gradient:** beberapa gradient siap pakai, ditambah **gradient sendiri dari dua warna** yang dipilih dengan lingkaran warna.
- **Wallpaper Mac:** wallpaper desktop yang sedang dipakai di layar itu. Kalau wallpaper-nya bukan gambar biasa, misalnya wallpaper bergerak bawaan macOS, pilihan ini disembunyikan **(keputusan penulis)**.
- **Pilih file…:** gambar sendiri dari file. Gambar dipotong supaya memenuhi background tanpa gepeng.
- **Jarak:** penggeser untuk mengatur lebar background di sekeliling screenshot.
- Saat background dipasang, screenshot diberi bayangan halus **(keputusan penulis)**.

**Lainnya**
- **Undo dan redo,** lewat tombol di kanan atas, Cmd+Z, dan Cmd+Shift+Z **(keputusan penulis)**.
- **Ukuran hasil** sama dengan resolusi asli screenshot, ditambah jarak background.
- **Suntingan bisa dilanjutkan.** Screenshot asli disimpan bersama suntingannya, jadi membuka editor lagi menampilkan coretan yang masih bisa digeser atau dihapus. Gambar kecil di daftar, Salin, Simpan, dan seret memakai hasil edit **(keputusan penulis)**.
- **Gaya:** hitam-putih ala Notching, dengan Space Grotesk dan Space Mono. Susunannya mirip Vorssaint: alat di kiri, warna di bawah, Salin dan Simpan di kanan atas. Tombol Salin berwarna putih sebagai tombol utama.

## 8. Izin Perekaman Layar

- macOS mewajibkan izin **Perekaman Layar** untuk memotret layar dan window app lain.
- Saat screenshot pertama diambil, macOS menampilkan permintaan izin.
- Kalau izin belum diberikan atau ditolak, notch menampilkan notifikasi "Screenshot butuh izin Perekaman Layar", dengan tombol ke Pengaturan Sistem. Tidak ada gambar kosong yang disimpan **(keputusan penulis)**.
- Modul Screenshot tampil di **Pengaturan → Izin** dengan izin Perekaman Layar, seperti Cermin dengan Kamera.
- Selama Notching masih build tes yang belum ditandatangani resmi, setiap build ulang perlu memberi izin lagi, seperti yang terjadi pada izin Aksesibilitas di Keyboard Cleaning Mode. Hal ini perlu diingat saat cek di Mac.

## 9. Layar tanpa notch dan monitor kedua

- **Cmd+Shift+3** memotret layar tempat window aktif berada (bagian 3).
- **Cmd+Shift+4** bekerja di layar mana pun kursornya berada.
- **Hasil tampil di notch atau lensa layar tempat gambar diambil.** Di layar tanpa notch, lensa membuka panel yang sama seperti di MacBook.
- **Layar yang tidak dipilih** di Pengaturan → Tampilan notch tidak punya notch. Screenshot di layar itu tetap diambil dan masuk clipboard serta daftar. Hasilnya tampil di notch layar yang ada kursornya, atau kalau tidak ada, di layar utama **(keputusan penulis)**.
- **Jendela editor** terbuka di layar tempat gambar diklik.

## 10. Pemasangan, Pengaturan, dan ikon

- Screenshot ikut di dalam app sebagai **modul bawaan** dan **langsung menyala**, untuk pengguna baru maupun yang memperbarui app. Caranya sama seperti modul bawaan lain.
- **Pengaturan → Modul → Screenshot** memakai saklar menyala/mati yang sudah ada. Di sini juga muncul keterangan tombol bawaan Mac dari bagian 4. Saklar "tampilkan status" tidak ada, karena modul ini tidak punya status.
- **Nama modul:** "Screenshot" dalam bahasa Indonesia dan Inggris, karena pemilik sendiri memakai kata itu **(keputusan penulis)**.
- **Ikon:** bingkai bidik, yaitu empat sudut siku dengan titik di tengah **(keputusan penulis)**. Ikon ini dipakai di kotak halaman Modul.
- **Kata-kata** mengikuti gaya bahasa desain awal bagian 5. Kata-kata pastinya ditentukan pembuat, kira-kira:

| Tempat | Bahasa Indonesia | English |
|---|---|---|
| Label notch | Screenshot · Window | Screenshot · Window |
| Keterangan gambar | Klik untuk edit | Click to edit |
| Setelah diambil | Tersalin ke clipboard | Copied to clipboard |
| Tombol | Salin · Simpan · Hapus | Copy · Save · Delete |
| Setelah disimpan | Tersimpan | Saved |
| Tombol ambil | Layar · Window · Area | Screen · Window · Area |
| Tombol bawaan Mac | Cmd+Shift+3 dan 4 masih dipakai screenshot bawaan Mac | Cmd+Shift+3 and 4 are still taken by the Mac's own screenshots |
| Izin | Screenshot butuh izin Perekaman Layar | Screenshot needs Screen Recording access |

## 11. Cara kerja (keputusan penulis, untuk pembuat)

- **Tombol keyboard** didaftarkan app inti (Rust) sebagai tombol global, bukan oleh halaman modul. Dengan begitu, tombol tetap bekerja saat panel tertutup. Notching memeriksa apakah screenshot bawaan Mac masih memakai tombol itu, misalnya dengan membaca pengaturan pintasan macOS.
- **Pengambilan gambar** dilakukan app inti, misalnya dengan ScreenCaptureKit. Notching mendukung macOS 13 ke atas. Kalau cara yang dipilih hanya ada mulai macOS 14, macOS 13 butuh cara cadangan.
- **Pemilih window dan area** untuk Cmd+Shift+4 adalah jendela transparan milik app inti di atas setiap layar. Jendela itu bukan panel notch. Daftar dan letak window bisa dibaca tanpa izin, seperti yang sudah dipakai notifikasi (`notify.rs`).
- **Daftar 15 terakhir** disimpan app inti di folder data Notching, misalnya `screenshots/`. Setiap screenshot berisi gambar asli, data suntingan, dan gambar hasil edit kalau ada. Halaman modul hanya membaca daftar dan mengirim perintah lewat gate, dengan kemampuan baru di manifest.
- **Halaman notch setelah screenshot** ditampilkan halaman modul Screenshot di dalam panel. App inti membuka panel di layar yang tepat dan membuatnya menjadi jendela aktif, mirip cara Titipan membuka laci.
- **Jendela editor** adalah jendela Tauri biasa, seperti jendela Pengaturan. Aturan "jangan menutup panel nspanel" berlaku untuk panel notch, bukan untuk jendela ini. Gambar hasil edit dibuat di jendela editor, lalu diserahkan ke app inti untuk clipboard, Desktop, dan daftar.
- **Seret ke app lain** memakai sesi seret milik macOS, seperti tarikan keluar di Titipan.
- **Wallpaper Mac** dibaca dari macOS untuk layar tempat editor terbuka.

## 12. Diserahkan ke pembuat

- Nama kemampuan di manifest dan bentuk pesan antara halaman modul, jendela editor, dan app inti.
- Ukuran pasti panel, gambar, tombol, dan jendela editor.
- Pilihan warna siap pakai, gradient siap pakai, dan nilai penggeser Sudut serta Jarak.
- Cara mengambil gambar dan menggambar sorotan window.
- Pembagian pekerjaan menjadi beberapa langkah, misalnya pengambilan dan notch dulu, lalu editor.
- Cara memeriksa di Mac bahwa gambar benar-benar tersimpan dan masuk clipboard, misalnya dengan membaca folder `screenshots/`, Desktop, dan isi clipboard.
