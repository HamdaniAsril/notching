# Desain modul Cleaner

Tanggal: 1 November 2026
Status: disetujui pemilik ide (1 November 2026).

Dokumen ini merinci modul baru untuk membersihkan Mac dan menghapus app beserta sisanya. Namanya **Cleaner** dalam bahasa Indonesia dan Inggris. Dokumen ini mengacu ke desain awal (`2026-10-27-notch-design.md`) dan desain halaman (`2026-10-30-halaman-widget-design.md`). Hal yang tidak disebut di sini mengikuti kedua dokumen itu serta pola modul Titipan dan Screenshot.

Cleaner menggantikan modul "Uninstall app" di tahap 3, yang dibatalkan pada 1 November 2026. Fungsi uninstall sekarang kembali sebagai bagian dari Cleaner. Ini modul paling berisiko di Notching, karena menghapus file.

Mockup ada di `2026-11-01-cleaner-mockups/`. Gayanya baru lengkap kalau dibuka lewat alat brainstorming, karena isinya hanya potongan halaman.
- `cleaner-tempat.html`: pemilik memilih **pilihan A**, yaitu semua isi Cleaner ada di dalam notch.
- `cleaner-warna.html`: pemilik memilih **pilihan 1**, yaitu bar isi disk dengan warna cerah seperti Pengaturan Mac.

**Cara membaca keputusan:** sama seperti desain awal. Yang ditulis biasa adalah keputusan pemilik. Yang ditandai **(keputusan penulis)** adalah pilihan penulis yang sudah disampaikan ke pemilik, dan masih bisa diubah.

## 1. Kenapa

Pemilik merasa butuh pembersih saat storage Mac mulai penuh, padahal ia tidak tahu file apa yang memenuhinya. Menurut hitungannya, file dan dokumennya tidak sebanyak itu.

Kutipan permintaannya: "isinya adalah untuk deep cleaning seperti mole https://github.com/tw93/Mole.git dan clean uninstall seperti vorssaint. jadi saat modul cleaner ini dibuka ada 2 pilihan itu."

Dari uninstall Vorssaint, pemilik paling suka bahwa app "bisa bersih sampai ke file file kecil yang sulit dideteksi manual".

## 2. Tujuan, bukan tujuan, dan yang harus dihindari

**Tujuan**
- Saat Cleaner dibuka, langsung terlihat **berapa isi disk dan apa yang memakannya**, dalam bar berwarna.
- Ada dua pilihan di bawah bar: **Deep clean** dan **Clean uninstall**.
- **Deep clean** membersihkan cache, log, dan sampah lain. Hal besar yang bukan sampah juga ditampilkan untuk dipilih sendiri.
- **Clean uninstall** menghapus app sampai ke file-file kecil sisanya.
- **Rincian isi disk** menunjukkan folder dan file terbesar, untuk menjawab pertanyaan "apa yang membuat penuh?".
- Tidak ada yang dihapus sebelum pemilik melihat daftarnya dan menyetujui ringkasan terakhirnya.

**Bukan tujuan**
- Membersihkan file sistem yang butuh kata sandi admin, misalnya log dan cache di `/Library` atau `/private/var` **(keputusan penulis)**.
- Menghapus file dari rincian isi disk. Rincian hanya untuk melihat, dengan tombol "Tampilkan di Finder" (permintaan pemilik).
- Menyeret app ke notch untuk menghapusnya. App dipilih dari daftar saja (permintaan pemilik). Menyeret file ke notch tetap milik Titipan.
- Merawat sistem (seperti `mo optimize` di Mole), memantau CPU, dan mengecilkan app universal.
- Membersihkan otomatis atau terjadwal.
- Versi Windows. Bagian Mac dipisah supaya Windows nanti cukup menambah bagiannya sendiri.

**Yang harus dihindari**
- **Menghapus yang bukan sampah.** Ini kegagalan paling buruk. Mole, yang ide-idenya kita pelajari, pernah:
  - menghapus memori Claude di `~/.claude`,
  - menghapus data alat Terminal yang bernama sama dengan app yang di-uninstall,
  - menganggap data aktif app lain (data bank dan cadangannya) sebagai sisa app,
  - menghapus unduhan yang masih berjalan,
  - menghapus folder itu sendiri, padahal yang dimaksud hanya isinya.

  Semua aturan keamanan di bagian 7 dibuat untuk mencegah hal ini.
- **Salah pencet.** Satu klik tidak boleh langsung menghapus. Selalu ada daftar bercentang, lalu konfirmasi.
- **App yang rusak** karena cachenya dihapus saat app sedang berjalan.
- **Notching menjadi berat.** Pemindaian hanya berjalan saat Cleaner dibuka atau sedang membersihkan. Saat diam, CPU tetap hampir nol.
- **Tampilan ramai seperti Vorssaint.**

## 3. Lisensi: ide boleh, kode tidak

Mole berlisensi GPL-3.0, sama seperti Vorssaint. Notching berlisensi MIT. Jadi:
- Kode Mole tidak disalin, dan **daftar path Mole juga tidak disalin**.
- Daftar lokasi yang dibersihkan disusun sendiri dari lokasi standar macOS yang umum diketahui, misalnya dokumentasi Apple tentang `~/Library`, serta dari lokasi cache bawaan setiap alat (npm, Homebrew, Xcode) yang ditulis di dokumentasinya sendiri.
- **Cara kerja boleh dicontoh** kalau penting untuk keamanan (izin pemilik). Contohnya memeriksa ulang sebelum menghapus, melindungi folder tertentu, dan memisahkan yang "pasti" dari yang "mungkin". Catatan riset tentang perilaku Mole ada di catatan sesi (`cleaner-mole-research.md`), dan isinya hanya parafrase.

## 4. Tampilan awal

Acuan: `cleaner-tempat.html` (pilihan A, momen 1) dan `cleaner-warna.html` (pilihan 1).

Semua isi Cleaner ada **di dalam panel notch**, bukan di jendela sendiri. Pemilik memilih ini dengan sadar, walaupun panel hanya sekitar 520 px lebarnya (paling besar 960 × 560) dan menutup saat ada klik di luar.

- **Baris atas:** nama disk di kiri, misalnya "Macintosh HD", dan sisa ruang di kanan, misalnya "Sisa 44 GB".
- **Angka besar:** misalnya "212 GB", dengan keterangan "terpakai dari 256 GB".
- **Bar isi disk berwarna**, dibagi per jenis, dengan keterangan dan ukuran di bawahnya:

| Jenis | Isinya **(keputusan penulis)** | Warna (mockup) |
|---|---|---|
| App | `/Applications` dan `~/Applications` | biru |
| Dokumen | Dokumen, Desktop, Unduhan | oranye |
| Foto | folder Gambar, termasuk perpustakaan Foto | kuning |
| Bisa dibersihkan | hanya kategori Deep clean yang dicentang dari awal (cache dan log), tanpa item yang sedang dipakai dan tanpa pengecualian. Artinya: ruang yang kembali kalau Bersihkan ditekan tanpa mengubah centang. Semuanya ada di `~/Library` atau folder cache alat, jadi tidak bertumpuk dengan App, Dokumen, dan Foto. | merah |
| Lainnya | sisa yang terpakai: sistem, data app, dan lain-lain | abu-abu |
| (kosong) | ruang yang masih tersisa | hitam pekat |

  - **Warna adalah permintaan pemilik.** Ini pengecualian kedua dari aturan "tidak warna-warni" di desain awal bagian 2, setelah cahaya notifikasi. Pengecualian ini hanya untuk bar ini dan keterangannya. Bagian lain Cleaner tetap hitam-putih.
  - Angkanya tidak harus sama persis dengan Pengaturan Mac, karena macOS tidak memberi rincian kategorinya ke app lain. Yang penting jumlahnya masuk akal dan "Lainnya" tidak negatif.
- **Klik bar** untuk membuka rincian isi disk (bagian 6).
- **Di bawah bar ada dua kotak sejajar:**
  - **Deep clean**, dengan ikon sapu dan ringkasan kecil, misalnya "Cache, log, sisa app · 31 GB".
  - **Clean uninstall**, dengan ikon tempat sampah dan ringkasan kecil, misalnya "Hapus app beserta sisanya · 84 app".
- **Menghitung:** saat Cleaner dibuka dari awal, bar dan ringkasan dihitung ulang. Selama itu tertulis "Menghitung…". Angka yang sudah selesai langsung ditampilkan tanpa menunggu yang lain **(keputusan penulis)**. Ringkasan "31 GB" di kotak Deep clean memakai angka yang sama dengan "Bisa dibersihkan", jadi tidak menunggu pencarian folder build proyek yang lebih lambat. Kategori lain baru dihitung saat daftar Deep clean dibuka.
- **Tanpa izin Full Disk Access:** di bawah kedua kotak ada satu baris keterangan, misalnya "Sebagian folder dilewati. Beri izin Full Disk Access", dengan tombol yang membuka halaman Izin di Notching.
  - **Cleaner tidak pernah memicu permintaan izin macOS satu per satu** **(keputusan penulis)**. Tanpa Full Disk Access, macOS akan bertanya terpisah untuk Dokumen, Desktop, Unduhan, Gambar, dan data app lain, dan setiap pertanyaan itu menutup panel. Jadi tanpa izin, folder-folder itu tidak dibuka sama sekali. Di bar, ukurannya masuk ke "Lainnya", keterangannya bertanda "?", dan kategori yang membutuhkannya di Deep clean tertulis "butuh Full Disk Access".

**Saat panel dibuka lagi (keputusan penulis).** Panel bisa tertutup di tengah jalan, misalnya karena klik di luar, menutup app yang mau dihapus, atau menekan "Tampilkan di Finder". Kalau dibuka lagi dalam 10 menit, Cleaner kembali ke tempat terakhir: daftar yang sama dengan centang yang sama, langkah uninstall yang sama, atau folder rincian yang sama. Status "sedang dipakai" dan "Tutup Spotify dulu" diperiksa ulang saat panel dibuka, jadi tombol hapus sudah aktif kalau app sudah ditutup. Setelah lebih dari 10 menit, atau setelah Notching dibuka ulang, Cleaner mulai dari tampilan awal dengan hitungan baru. Hasil pindaian disimpan di app inti selama 10 menit itu. Karena setiap item diperiksa lagi tepat sebelum dihapus (bagian 7), hasil yang sedikit basi tidak berbahaya.

## 5. Deep clean dan Clean uninstall

Klik salah satu kotak, dan panel notch memanjang ke bawah menampilkan daftar yang bisa digulir (`cleaner-tempat.html`, pilihan A, momen 2). Di kiri atas ada "‹ Deep clean" atau "‹ Clean uninstall" untuk kembali ke tampilan awal.

### 5.1 Deep clean

Daftarnya berupa **kategori dengan kotak centang dan ukuran**. Klik kategori untuk membuka isinya, misalnya cache per app, dan setiap isi juga bisa dicentang sendiri **(keputusan penulis)**.

| Kategori | Dicentang dari awal | Cara menghapus | Catatan |
|---|---|---|---|
| Cache app | ya | permanen | Isi folder cache akun, termasuk cache di dalam container app. |
| Cache browser | ya | permanen | Hanya cache. Riwayat, cookie, kata sandi, dan profil tidak pernah disentuh. |
| Cache alat developer | ya | permanen | Contohnya hasil build sementara Xcode, cache npm, dan cache Homebrew. Hanya lokasi cache yang tertulis di daftar Cleaner sendiri. |
| Log | ya | permanen | Isi folder log akun. |
| Sisa app yang sudah dihapus | tidak | Tempat Sampah | Lihat aturan "yatim" di bagian 7. |
| Tempat Sampah | tidak | permanen (mengosongkan) | Butuh Full Disk Access. |
| Folder build proyek coding | tidak | permanen | Contohnya `node_modules` di samping `package.json`, dan `target` di samping `Cargo.toml`. Ditampilkan per proyek. |
| File installer lama | tidak | Tempat Sampah | File `.dmg`, `.pkg`, dan `.xip` langsung di folder Unduhan. |
| Cadangan iPhone lama | tidak | Tempat Sampah | Ditampilkan per cadangan, dengan nama perangkat dan tanggalnya. Butuh Full Disk Access. |

- **Permanen atau Tempat Sampah (pemilik setuju dengan jalan tengah ini).** Yang akan dibuat ulang sendiri oleh app atau alatnya dihapus permanen, supaya ruang disk langsung kembali. Yang tidak bisa dibuat ulang dipindah ke Tempat Sampah.
- **Item yang sedang dipakai dilewati.** Cache milik app yang sedang terbuka tidak dicentang dan tidak bisa dicentang. Di sampingnya tertulis "sedang dipakai". Contohnya cache Chrome selama Chrome terbuka.
- **"Jangan pernah bersihkan":** setiap item punya pilihan ini, lewat tombol kecil yang muncul saat kursor di atasnya **(keputusan penulis untuk bentuknya)**. Item itu hilang dari daftar dan masuk daftar pengecualian di Pengaturan.
- **Mencari folder build proyek (keputusan penulis):** dicari di folder rumah sampai beberapa tingkat ke dalam. `~/Library`, folder tersembunyi, iCloud Drive, dan folder yang dilindungi (bagian 7) dilewati. Kedalaman pastinya diserahkan ke pembuat.
- **Di bagian bawah:** keterangan kecil "Dipilih 25,9 GB", lalu tombol **Bersihkan 25,9 GB**.

### 5.2 Clean uninstall

**Langkah 1, memilih app.**
- Daftar semua app di `/Applications` dan `~/Applications`, termasuk subfoldernya, **diurutkan dari yang terbesar**. Di atasnya ada kolom cari.
- Setiap baris menampilkan ikon app, nama, dan ukuran.
- App bawaan macOS di `/System/Applications` tidak ditampilkan, karena memang tidak bisa dihapus. App Apple dari App Store yang ada di `/Applications`, seperti Xcode, Pages, dan iMovie, tetap ditampilkan **(keputusan penulis)**.
- Satu app dihapus dalam sekali jalan **(keputusan penulis)**.

**Langkah 2, app dan sisanya.** Klik app, lalu daftar berganti menjadi app itu beserta file sisanya, dikelompokkan per jenis: pengaturan, cache, data app, container, program latar belakang (LaunchAgent), dan lain-lain.
- **"Pasti milik app ini":** dicentang. Contohnya file atau folder yang namanya memakai kode resmi app (bundle ID, seperti `com.spotify.client`), atau container app itu sendiri.
- **"Mungkin milik app ini":** **tetap ditampilkan, tapi tidak dicentang, dan diberi keterangan** kenapa dianggap "mungkin", misalnya "nama mirip" (permintaan pemilik). Contohnya folder yang hanya namanya sama dengan nama app.
- **"Data pribadi" (disetujui pemilik, mengikuti cara Mole):** data milik app itu yang termasuk daftar perlindungan (bagian 7) **hanya** ditawarkan saat app itu sendiri yang di-uninstall. Contohnya profil Chrome atau Firefox (riwayat, bookmark, kata sandi tersimpan, cookie), data Docker atau mesin virtual, dan pengaturan VPN. Data ini tampil sebagai kelompok terpisah **"Data pribadi"** dengan keterangan isinya, **tidak dicentang**, dan dipindah ke Tempat Sampah kalau dicentang sendiri. Syaratnya, kecocokannya harus "pasti" (bundle ID). Data pribadi yang hanya "mungkin" tidak ditawarkan.
- **App yang punya uninstaller resmi tidak dihapus.** Ini untuk app keamanan, app manajemen perangkat kantor (MDM), dan VPN yang memasang ekstensi sistem. App seperti ini tetap ada di daftar, tapi saat dipilih hanya muncul pesan "Pakai uninstaller bawaan app ini", tanpa tombol hapus. Cara mengenalinya, misalnya app yang membawa ekstensi sistem atau ekstensi jaringan ditambah daftar kecil yang disusun sendiri, diserahkan ke pembuat. Kalau ragu, app dianggap punya uninstaller resmi.
- **App itu sendiri** selalu dicentang dan tidak bisa dihilangkan centangnya. Kalau hanya ingin membersihkan sisa, gunakan Deep clean **(keputusan penulis)**.
- **Semuanya dipindah ke Tempat Sampah,** baik app maupun sisanya.
- **App yang sedang terbuka tidak bisa dihapus.** Muncul pesan "Tutup Spotify dulu", dan tombol hapus tidak aktif. Begitu app ditutup, tombol aktif sendiri. Cleaner tidak menutup app untuk pengguna, supaya tidak ada salah pencet (permintaan pemilik).
- **Di bagian bawah:** tombol **Hapus Spotify · 1,2 GB**.

### 5.3 Konfirmasi (keduanya)

Setelah tombol Bersihkan atau Hapus ditekan, muncul ringkasan di panel (permintaan pemilik):
- "18,0 GB dihapus permanen", "7,9 GB dipindah ke Tempat Sampah", dan jumlah itemnya.
- Tombol **Ya, bersihkan** (atau **Ya, hapus**) dan **Batal**.
- Esc dan klik di luar panel sama dengan Batal **(keputusan penulis)**.

### 5.4 Saat membersihkan dan sesudahnya

- Panel menampilkan kemajuan, misalnya bar dan "12 dari 40". Ada tombol **Berhenti** untuk berhenti setelah item yang sedang dikerjakan. Yang sudah terhapus tetap terhapus **(keputusan penulis)**.
- **Panel boleh ditutup.** Pembersihan tetap berjalan di app inti, dan di samping notch tampil status Cleaner berupa ikon sapu dan persen kemajuan.
- **Setelah selesai:** panel atau status menampilkan hasilnya, misalnya "+25,9 GB". Item yang dilewati tercantum dengan alasannya, misalnya "sedang dipakai", "dilindungi", atau "berubah sejak dipindai". Status hasil hilang setelah Cleaner dibuka atau setelah 10 menit **(keputusan penulis)**.
- **Semua yang dihapus dicatat** di log Cleaner (bagian 8).

## 6. Rincian isi disk

- Klik bar di tampilan awal untuk membuka rincian.
- Isinya daftar folder dan file terbesar, diurutkan dari yang terbesar, dengan bar ukuran tipis di setiap baris. Mulainya dari folder rumah, dengan baris tambahan untuk App **(keputusan penulis)**.
- Klik folder untuk masuk. Ada "‹" untuk kembali.
- Setiap baris punya tombol **Tampilkan di Finder**. Rincian **tidak bisa menghapus apa pun** (permintaan pemilik).
- Notching hanya mengingat ringkasan folder dan file besar, bukan daftar semua file, supaya hemat memori.
- Folder yang tidak bisa dibaca tanpa Full Disk Access diberi keterangan "tidak bisa dibaca".

## 7. Aturan keamanan (keputusan penulis, berdasarkan pelajaran dari Mole)

Pemilik tidak tahu persis apa yang berisiko, dan menyerahkannya ke penulis. Aturan ini berlaku di app inti (Rust), di satu tempat yang dilewati **setiap** penghapusan, bukan di masing-masing fitur.

**Daftar perlindungan bawaan.** Item berikut tidak pernah dihapus, dipindah, atau ditawarkan, walaupun dicentang. Satu-satunya pengecualian adalah kelompok "Data pribadi" milik app yang sedang di-uninstall (bagian 5.2):
- folder pribadi: Dokumen, Desktop, Unduhan, Gambar dan perpustakaan Foto, Musik, Film, iCloud Drive, dan data Mail. Pengecualian satu-satunya adalah file installer langsung di Unduhan (bagian 5.1);
- folder tersembunyi di folder rumah, misalnya `~/.claude`, `~/.config`, `~/.ssh`, dan `~/.local`. Folder ini tidak pernah ditebak dari nama app. Satu-satunya yang boleh disentuh adalah subfolder cache tertentu milik alat developer yang tertulis di daftar Cleaner, misalnya cache npm;
- Keychain, pengelola kata sandi, riwayat browser, cookie, dan profil browser;
- data VPN dan proxy, mesin virtual dan container (Docker, UTM, Parallels), dan app keamanan atau manajemen perangkat yang punya uninstaller resmi;
- semua yang ada di luar folder rumah, kecuali app di `/Applications` untuk Clean uninstall;
- folder level atas itu sendiri, seperti `/Applications`, folder rumah, `~/Library`, dan `~/Library/Caches`. Yang dihapus selalu **isi** folder cache, bukan foldernya;
- data Notching sendiri.

**Daftar pengecualian milik pemilik** ("Jangan pernah bersihkan") ditambahkan di atas daftar bawaan. Kalau file pengecualian tidak bisa dibaca, Cleaner **tidak membersihkan apa pun** dan menampilkan pesan, bukan berjalan tanpa pengecualian.

**Setiap path diperiksa sebelum dihapus:**
- harus path lengkap, tanpa `..`, tanpa karakter aneh, dan tidak kosong;
- tidak boleh melewati symlink yang mengarah ke tempat lain. Symlink dihapus sebagai symlink, dan isinya tidak diikuti;
- harus berada di dalam salah satu lokasi yang memang diizinkan untuk kategorinya;
- **diperiksa dua kali:** saat dipindai dan tepat sebelum dihapus. Kalau file sudah berubah (identitas file berbeda, atau ukuran atau tanggalnya berubah jauh), item itu dilewati dengan alasan "berubah sejak dipindai".

**"Tidak tahu" berarti jangan dihapus.** Kalau Cleaner tidak bisa memastikan sesuatu, misalnya apakah app sedang berjalan, siapa pemilik file, atau apakah app masih terpasang, item itu dilewati.

**Sisa app "yatim" (kategori "Sisa app yang sudah dihapus" di Deep clean).** Item hanya dianggap sisa app yang sudah dihapus kalau semua syarat ini terpenuhi:
- namanya berbentuk kode app (bundle ID, misalnya `com.contoh.app`);
- tidak ada app terpasang dengan kode itu, menurut daftar app di disk **dan** menurut macOS (Launch Services atau Spotlight), termasuk app di Tempat Sampah dan di disk lain;
- tidak berubah selama 30 hari atau lebih;
- hanya dicari di folder cache, log, dan status jendela tersimpan (Saved Application State) **(keputusan penulis)**.

Selain itu, kategori ini tidak dicentang dari awal dan dipindah ke Tempat Sampah.

**Mencari sisa app saat uninstall:**
- dicari di folder standar `~/Library`: Application Support, Caches, Preferences, Saved Application State, Containers, Group Containers, HTTPStorages, WebKit, Cookies, Logs, LaunchAgents, dan Application Scripts;
- "pasti" kalau nama cocok dengan bundle ID, atau Group Container yang namanya berakhiran bundle ID atau ID tim app itu. Untuk LaunchAgent, "pasti" kalau programnya ada di dalam app itu;
- "mungkin" kalau hanya cocok dengan nama app sebagai kata utuh. Nama yang terlalu pendek (kurang dari 4 huruf) atau terlalu umum (misalnya "Helper", "Update", "Data") tidak dicocokkan;
- kalau ada salinan lain app yang sama (bundle ID sama) di tempat lain, sisa app tidak ditawarkan, karena masih dipakai salinan itu;
- setelah app dipindah ke Tempat Sampah, Cleaner memeriksa lagi bahwa tidak ada salinan lain sebelum memindahkan sisanya.

**App milik admin.** App yang dipasang lewat installer `.pkg` sering dimiliki sistem. Memindahkannya ke Tempat Sampah dilakukan dengan cara yang membuat macOS sendiri meminta kata sandi admin. Notching tidak pernah meminta atau memegang kata sandi. Caranya diserahkan ke pembuat.

**App dari Homebrew** diperlakukan seperti app biasa. Catatan Homebrew-nya tidak ikut diperbarui **(keputusan penulis)**.

## 8. Log

- Setiap item yang dihapus atau dipindah dicatat dalam satu baris di file log Cleaner. Isinya: waktu, kategori, path, ukuran, cara (permanen atau Tempat Sampah), dan hasil (berhasil, dilewati beserta alasannya, atau gagal) **(keputusan penulis)**.
- File log berada di folder log Notching, misalnya `~/Library/Logs/Notching/cleaner.log`, dan tetap ada setelah Notching ditutup. Lokasi pastinya diserahkan ke pembuat.
- Log ini juga dipakai untuk mencocokkan hasil uji di Mac (bagian 11).

## 9. Halaman Modul, Pengaturan, dan Izin

- **Cleaner ikut di dalam app sebagai modul bawaan** dengan id `cleaner`, dan langsung menyala **(keputusan penulis)**. Modul ini tidak melakukan apa pun sebelum dibuka. Hati-hati: `src/clean` sudah dipakai oleh Keyboard Cleaning Mode.
- **Kotak Cleaner di halaman Modul** memakai ikon sapu, dengan urutan setelah Screenshot. Klik kotak untuk membuka Cleaner. Selama pembersihan berjalan, kotak diberi titik merah seperti modul yang sedang berjalan.
- **Pengaturan → Modul → Cleaner:**
  - saklar modul dan saklar "tampilkan status", seperti modul bawaan lain;
  - **daftar "Jangan pernah bersihkan"**, berisi item yang dikecualikan pemilik, dan setiap item bisa dihapus dari daftar;
  - tombol untuk membuka log Cleaner di Finder **(keputusan penulis)**.
- **Halaman Izin:** baris baru **Full Disk Access**, dengan keterangan untuk apa izin ini dipakai dan tombol yang membuka bagian itu di Pengaturan Mac. Catatan untuk pengujian: build yang tidak ditandatangani perlu dihapus lalu ditambahkan lagi di daftar izin setiap kali build berganti.

## 10. Status di samping notch

- Selama membersihkan: ikon sapu dan persen, misalnya "42%".
- Setelah selesai: ikon sapu dan hasilnya, misalnya "25,9GB" (paling banyak sekitar 6 karakter), sampai Cleaner dibuka atau 10 menit berlalu.
- Mengikuti aturan status dari desain Titipan bagian 8: semua status tampil bersamaan dan dipisah garis titik-titik.

## 11. Mencoba dengan aman di Mac

Pemilik meminta cara mencoba yang tidak menyentuh data aslinya.

**Mode coba (keputusan penulis).**
- Notching bisa dijalankan dengan satu pengaturan rahasia, misalnya variabel lingkungan `NOTCHING_CLEANER_ROOT=~/cleaner-cek`. Dalam mode ini, Cleaner menganggap `~/cleaner-cek/home` sebagai folder rumah dan `~/cleaner-cek/Applications` sebagai folder app. Pemindaian, rincian, dan penghapusan tidak keluar dari folder itu.
- Mode ini **hanya bisa mempersempit** wilayah Cleaner, tidak pernah memperluasnya. Mode ini juga tidak bisa dinyalakan dari tampilan app.
- Selama mode coba aktif, panel Cleaner menampilkan label **MODE COBA** yang jelas.
- Bar isi disk tetap membaca disk asli, karena hanya membaca. Kategori "Bisa dibersihkan" dan kedua daftar berasal dari folder contoh.
- File yang "dipindah ke Tempat Sampah" pada mode coba masuk ke Tempat Sampah asli. Isinya hanya file contoh, jadi aman.

**Isi folder contoh** dibuat dengan skrip di repo **(keputusan penulis)**:
- cache palsu dari beberapa app, log, folder build proyek tiruan (`node_modules` dan `target`), file `.dmg` contoh di Unduhan tiruan, dan cadangan iPhone tiruan;
- sisa app yatim tiruan yang tanggalnya dibuat lebih dari 30 hari, plus satu yang baru (harus tidak ditawarkan);
- app contoh **"Coba Cleaner.app"** yang bisa dibuka (untuk menguji "Tutup dulu"), beserta sisa yang "pasti" dan yang "mungkin";
- umpan yang **tidak boleh** tersentuh: `.claude` tiruan, Dokumen tiruan, cookie browser tiruan, symlink cache yang mengarah ke Dokumen tiruan, dan folder bernama mirip app lain.

Checksum semua file contoh dicatat sebelum uji, lalu dicocokkan dengan log Cleaner setelahnya.

**Tahap kedua di Mac asli:** Cleaner dibuka tanpa mode coba, hanya untuk melihat bar, rincian, dan kedua daftar. Konfirmasi tidak ditekan, kecuali pemilik sendiri memutuskan untuk membersihkan.

Hasilnya dicatat di `docs/superpowers/verification/` seperti modul sebelumnya. Laporan "sudah dicek" dari pemilik dicocokkan dengan log Cleaner dan isi folder contoh sebelum ditulis lulus.

## 12. Kata-kata

Kata-kata mengikuti gaya bahasa desain awal bagian 5. Kata-kata pastinya ditentukan pembuat, kira-kira:

| Tempat | Bahasa Indonesia | English |
|---|---|---|
| Nama modul | Cleaner | Cleaner |
| Sisa ruang | Sisa 44 GB | 44 GB free |
| Angka besar | terpakai dari 256 GB | used of 256 GB |
| Jenis di bar | App · Dokumen · Foto · Bisa dibersihkan · Lainnya | Apps · Documents · Photos · Cleanable · Other |
| Kotak 1 | Deep clean · Cache, log, sisa app | Deep clean · Caches, logs, leftovers |
| Kotak 2 | Clean uninstall · Hapus app beserta sisanya | Clean uninstall · Remove apps and leftovers |
| Menghitung | Menghitung… | Measuring… |
| Tombol | Bersihkan 25,9 GB | Clean 25.9 GB |
| Konfirmasi | Ya, bersihkan · Batal | Yes, clean · Cancel |
| Sedang dipakai | sedang dipakai | in use |
| File mungkin | mungkin · nama mirip | maybe · similar name |
| App terbuka | Tutup Spotify dulu | Quit Spotify first |
| Pengecualian | Jangan pernah bersihkan | Never clean |
| Tanpa izin | Sebagian folder dilewati. Beri izin Full Disk Access | Some folders were skipped. Allow Full Disk Access |
| Rincian | Tampilkan di Finder | Show in Finder |
| Mode coba | MODE COBA | TEST MODE |

## 13. Cara kerja (keputusan penulis, untuk pembuat)

- **Semua yang menyentuh disk ada di app inti (Rust):** pemindaian, ukuran, pemeriksaan keamanan, penghapusan, Tempat Sampah, log, dan pemeriksaan app yang berjalan. Halaman modul hanya menampilkan data dan mengirim perintah lewat gate dengan kemampuan baru di manifest (misalnya `cleaner`), ditambah `status`.
- **Halaman modul tidak pernah mengirim path untuk dihapus.** Halaman hanya mengirim id item dari hasil pindaian terakhir. App inti yang menyimpan path-nya dan memeriksanya lagi. Dengan begitu, halaman modul yang bermasalah tidak bisa meminta penghapusan file sembarangan.
- **Pemindaian di thread latar**, bisa dibatalkan. Pemindaian yang belum selesai berhenti saat panel ditutup (kecuali saat membersihkan). Hasil yang sudah selesai disimpan 10 menit (bagian 4).
- **Tempat Sampah** memakai cara resmi macOS (NSFileManager `trashItem` atau NSWorkspace), supaya "Kembalikan" di Finder bekerja.
- **App yang berjalan** dicek dengan daftar app yang berjalan dari macOS (NSWorkspace) dan, untuk cache, dengan memeriksa apakah ada proses yang membuka file di dalamnya kalau perlu.
- **Ukuran disk** dari informasi volume macOS. Rinciannya diserahkan ke pembuat.
- **Test otomatis** memakai folder sementara dengan struktur `~/Library` tiruan, termasuk semua umpan di bagian 11. Setiap aturan di bagian 7 punya test yang membuktikan umpannya tidak tersentuh.

## 14. Diserahkan ke pembuat

- Daftar pasti lokasi cache browser dan alat developer, disusun sendiri dari dokumentasi masing-masing (bagian 3).
- Nama kemampuan di manifest dan bentuk pesan antara halaman modul dan app inti.
- Ukuran pasti panel untuk tampilan awal, daftar, dan rincian, dalam batas panel 960 × 560.
- Kedalaman pencarian folder build proyek, dan batas waktu pemindaian.
- Cara memindahkan app milik admin ke Tempat Sampah supaya macOS sendiri yang meminta kata sandi.
- Format pasti file log dan file pengecualian.
- Ikon sapu, mengikuti gaya ikon garis yang sudah ada.
