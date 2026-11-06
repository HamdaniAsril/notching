# Desain Intip jendela: intip dari Dock, klik Dock, dan pengalih jendela

Tanggal: 5 November 2026
Status: cara kerja dan tampilannya disetujui pemilik lewat tiga prototipe di browser ("cara kerja nya sudah sangat benar, semuanya sudah pas"). Yang diputuskan pemilik ditandai **pemilik**. Selebihnya **keputusan penulis**, dikumpulkan di bagian 11. Pemilik menyetujui seluruh dokumen, termasuk bagian 11 ("Setuju", 5 November 2026).
Prototipe terakhir: `docs/superpowers/specs/2026-11-05-intip-jendela-mockups/prototipe.html`. Buka di browser; tombol di atasnya mengganti semua pilihan, termasuk tampilan "Di Pengaturan".

## 1. Kenapa

Contoh dari pemilik: tiga file Word terbuka. Satu di depan, satu tertutup jendela lain, satu di-minimize. Klik ikon Word di Dock hanya memunculkan Word, bukan file yang dicari. ⌘Tab hanya pindah antar app: jendela kedua dari app yang sama tidak terlihat, dan yang di-minimize tidak muncul sama sekali. Makin banyak app yang terbuka, makin sering pengguna menebak.

Intip jendela membuat setiap jendela terlihat isinya, termasuk yang tertutup dan yang di-minimize, lalu pengguna langsung memilih jendela yang tepat.

## 2. Bentuk yang disetujui (pemilik)

Satu alat latar baru, **Intip jendela**, dengan tiga bagian:

1. **Intip dari Dock.** Kursor diam sebentar di ikon app di Dock, lalu muncul panel berisi gambar semua jendela app itu, masing-masing dengan judulnya. Jendela yang di-minimize ikut, dengan tanda "Diminimize". Jendela terdepan bertanda "Di depan".
   - Kursor di atas sebuah gambar: jendela itu "diintip". Jendela lain meredup, jendela itu tampil di posisinya, juga kalau sedang di-minimize.
   - Klik gambar: jendela itu muncul di depan dan panel menutup. Kalau di-minimize, jendela itu dipulihkan.
   - App yang jalan tanpa jendela: panel berkata "Tidak ada jendela yang terbuka". App yang tidak jalan: hanya nama app, seperti Dock biasa.
2. **Klik ikon Dock.**
   - Kalau app itu sedang di depan dan ada jendelanya yang terlihat, semua jendela itu di-minimize sekaligus.
   - Kalau tidak, semua jendela app itu dimunculkan ke depan. Termasuk yang di-minimize, juga yang di-minimize pengguna sendiri sebelumnya (pemilik: "ya").
   - Klik gambar di panel intip tetap hanya membuka satu jendela itu.
3. **Pengalih jendela**, pengganti ⌘Tab. Tahan ⌘, tekan Tab: muncul panel berisi jendela. Tab berikutnya, ⇧Tab sebelumnya, lepas ⌘ untuk membuka yang dipilih, Esc batal. Klik dengan mouse juga bisa.
   - **Per jendela:** semua jendela semua app sejajar, terbaru dulu, yang di-minimize di akhir. Pilihan awal adalah jendela kedua, sama seperti ⌘Tab.
   - **App tanpa jendela di sini** tetap bisa dicapai, seperti dengan ⌘Tab bawaan: app yang jalan tapi tidak punya jendela di Space ini (jendelanya di Space lain, layar penuh, disembunyikan dengan ⌘H, atau memang tanpa jendela). Di Per jendela, app ini tampil paling akhir sebagai kartu app (ikon dan nama, tanpa gambar). Di Per app, app ini ada di baris app seperti biasa. Memilihnya mengaktifkan app itu, dan macOS sendiri yang pindah ke Space-nya. **(keputusan penulis)**
   - **Per app:** baris app seperti ⌘Tab macOS, dengan jumlah jendela di ikonnya. Di bawahnya jendela app yang dipilih. ↓ atau ` pindah antar jendela app itu.
   - **Tengah layar** atau **Dari notch**. Dari notch, panel turun dari notch seperti panel Notching, dan notch fisiknya tetap hitam di atas panel.

**Tombol di setiap gambar jendela** (pemilik), di panel intip dan di pengalih. Muncul saat kursor di atas gambar, dan di pengalih juga pada jendela yang sedang dipilih:
- **–** minimize. Untuk jendela yang sudah di-minimize, tombol ini menjadi **pulihkan**.
- **×** tutup jendela.
- **⏻** keluar dari app jendela itu.

Panel tetap terbuka setelah tombol diklik, jadi hasilnya langsung terlihat. Di pengalih, tombol keyboard **M** minimize atau pulihkan, **W** tutup, **Q** keluar. Ketiganya berlaku untuk jendela yang dipilih. **(keputusan penulis)**

**Tampilan, semuanya di Pengaturan** (pemilik, "semuanya ada di settingan"):
- Warna kartu: Sistem, Terang, Gelap.
- Bahan: Pekat (tidak tembus pandang; di Gelap hitam penuh seperti panel Notching), atau Liquid glass (yang di belakang panel terlihat buram, dengan kilau di pinggirnya).
- Pengalih: Per jendela atau Per app, Tengah layar atau Dari notch.
- Klik ikon Dock: Minimize / munculkan, atau Bawaan macOS.

## 3. Tujuan, bukan tujuan, yang harus dihindari

**Tujuan**
- Ketiga bagian di bagian 2, sebagai satu alat latar yang dipasang dari Katalog.
- Tampilan mengikuti prototipe: kartu dengan gambar jendela dan judul, tanda kecil huruf kapital sempit (Barlow Condensed), aksen untuk yang dipilih, tombol satu warna yang memerah hanya untuk × dan ⏻ saat kursor di atasnya.

**Bukan tujuan**
- Versi Windows. Itu pekerjaan Ari, di cabang lain.
- Jendela di Space lain dan app layar penuh. Versi ini hanya Space yang sedang dilihat, di semua layar, ditambah jendela yang di-minimize. **(keputusan penulis)**
- Menata ulang Dock, mengganti ikonnya, atau menu klik kanan Dock.
- Animasi minimize buatan sendiri. Notching memakai animasi minimize dan pulihkan milik macOS.

**Yang harus dihindari**
- **CPU tidak lagi 0,0% saat diam.** Tidak ada polling. Kursor di Dock dan klik di Dock didengar lewat pemberitahuan Aksesibilitas dan event tap, yang tidak membangunkan Notching selama tidak ada yang terjadi. Gambar jendela hanya diambil selama panel intip atau pengalih terbuka, dan sekali tepat sebelum Notching me-minimize jendela. Tidak ada pengambilan gambar di belakang layar.
- **Merusak Dock.** Menyeret ikon untuk menyusun ulang, menahan klik untuk membuka menu, dan klik pada app yang tidak jalan harus tetap seperti biasa.
- **⌘Tab hilang.** Tanpa izin Aksesibilitas, saat alat mati, atau saat pengalih dimatikan, ⌘Tab bekerja seperti macOS biasa.
- **Menyimpan gambar jendela ke disk.** Gambar hanya ada di memori dan tidak pernah dikirim ke mana pun.

## 4. Letak di Notching

- **Katalog:** kartu alat "Intip jendela" berlabel ALAT, kategori **Jendela & Dock**, dengan izin yang dibutuhkan. Id paket `window-peek`, kemampuan `peek`, manifest seperti `window-keys`.
- **Tidak langsung terpasang**, juga bagi pengguna yang memperbarui app. Pengguna memasangnya dari Katalog. Alasannya, alat ini mengubah cara Dock dan ⌘Tab bawaan Mac bekerja, jadi tidak boleh muncul tiba-tiba setelah update. Ini berbeda dari Potong file dan Atur jendela, yang langsung terpasang. **(keputusan penulis)**
- **Pengaturan → Pintasan → Alat latar:** baris "Intip jendela" yang terbuka di tempat, seperti Potong file dan Atur jendela. Isinya:

| Baris | Kontrol | Bawaan |
|---|---|---|
| Kepala: ikon, nama, keterangan | saklar alat | menyala setelah dipasang |
| Izin | Rekam Layar dan Aksesibilitas: "Diizinkan" atau tombol ke Pengaturan Sistem | |
| Intip dari Dock | saklar | nyala |
| Klik ikon Dock | Minimize / munculkan · Bawaan macOS | Minimize / munculkan |
| Pengalih jendela | tombol pintas yang bisa diganti, plus saklar | ⌘Tab, nyala |
| Tampilkan | Per jendela · Per app | Per jendela |
| Muncul di | Tengah layar · Dari notch | Tengah layar |
| Warna kartu | Sistem · Terang · Gelap | Sistem |
| Bahan | Pekat · Liquid glass | Pekat |
| Jendela yang diminimize | saklar, "Ikut ditampilkan, dengan tanda" | nyala |

Nilai bawaan di tabel adalah **keputusan penulis**, mengikuti nilai awal prototipe.

- **Halaman Izin** di Pengaturan: keterangan Aksesibilitas dan Rekam Layar menyebut Intip jendela.
- **Notifikasi:** satu saluran "Izin". Tanpa izin, saat bagian alat dipakai: "Intip jendela butuh izin …", paling sering sekali per menit, seperti Atur jendela.
- **Pencarian Pengaturan:** setiap baris di atas bisa dicari, dalam kedua bahasa.

## 5. Izin

- **Aksesibilitas** (sudah dipakai Potong file dan Atur jendela) untuk membaca ikon Dock di bawah kursor, mendengar klik di Dock dan tombol pengalih, membaca daftar jendela app, dan memunculkan, me-minimize, atau menutup jendela.
- **Rekam Layar** (sudah dipakai Screenshot) untuk gambar isi jendela.
- Tanpa Rekam Layar, semua tetap bekerja, tapi gambar jendela diganti ikon app dan judul. **(keputusan penulis)**
- Tanpa Aksesibilitas, alat tidak melakukan apa-apa: Dock dan ⌘Tab seperti biasa.
- Saat alat dinyalakan tanpa izin, macOS diminta menampilkan permintaannya sendiri, seperti alat lain.

## 6. Perilaku rinci

**Intip dari Dock**
- Panel muncul setelah kursor diam 350 ms di ikon. Pindah ke ikon lain saat panel terbuka langsung mengganti isinya. Panel menutup 220 ms setelah kursor meninggalkan ikon dan panel. Angka dari prototipe; pembangun boleh menyesuaikan setelah dicoba di Mac.
- Panel menempel di sisi ikon yang menghadap ke tengah layar: di atas Dock bawah, di kanan Dock kiri, di kiri Dock kanan. Panel tidak keluar dari layar.
- Dock yang sembunyi otomatis tetap didukung. Panel muncul setelah Dock tampil.
- Urutan gambar: terbaru dulu, yang di-minimize di akhir.
- Mengintip: jendela lain meredup, dan gambar jendela itu dalam ukuran asli tampil di posisinya di atas semuanya. Urutan jendela yang sebenarnya tidak diubah. **(keputusan penulis)** Begitu kursor meninggalkan gambar, layar kembali seperti semula.
- Klik ikon Dock saat panel terbuka menutup panel, lalu menjalankan aturan klik ikon.

**Klik ikon Dock** (pilihan "Minimize / munculkan")
- "App di depan" adalah app pemilik jendela terdepan yang terlihat.
- Minimize semua: setiap jendela app itu yang terlihat di-minimize.
- Munculkan semua: setiap jendela app itu yang di-minimize dipulihkan, lalu app itu aktif dengan semua jendelanya di depan, urutannya tetap.
- App tanpa jendela atau app yang tidak jalan: klik diteruskan ke Dock seperti biasa (macOS membuka app atau jendela baru).
- Menyeret ikon dan menahan klik untuk menu tidak terpengaruh. Hanya klik pendek yang dilepas di atas ikon yang sama yang diambil alih.
- Pilihan "Bawaan macOS": klik tidak disentuh sama sekali.
- Dengan setelan bawaan macOS, jendela yang di-minimize menjadi ikon tersendiri di ujung kanan Dock, bukan masuk ke ikon app-nya. Notching tidak mengubah setelan Dock. Kalau setelan macOS "Minimize jendela ke ikon app" mati, baris Klik ikon Dock di Pengaturan menampilkan petunjuk dengan tombol yang membuka Pengaturan Sistem → Desktop & Dock. **(keputusan penulis)**

**Pengalih jendela**
- Muncul di layar tempat kursor berada. **(keputusan penulis)**
- Tombol bawaan ⌘Tab bisa diganti dengan tombol lain, memakai perekam tombol yang sama dengan Pintasan. Tombol pengalih ikut aturan bentrok tombol Notching: Screenshot, Atur jendela, Keep awake, dan Shelf tidak boleh memakai tombol yang sama.
- Saat panel terbuka, tombol tambahan yang sudah ada di prototipe berlaku: Tab dan ⇧Tab, ← →, ↓ ↑ atau ` (di Per app), Enter membuka, Esc batal, M, W, Q.
- Kursor di atas kartu memilih kartu itu, dan klik membukanya.
- Kalau semua jendela tertutup lewat tombol, panel menutup sendiri.
- Setelah sebuah tombol jendela dipakai (M, W, Q, atau klik tombol), melepas ⌘ tidak lagi membuka apa pun. Panel tetap terbuka sampai Enter, Esc, atau klik, supaya pengguna yang sedang merapikan jendela tidak terlempar ke jendela yang tidak ia pilih. **(keputusan penulis)**

**Tombol jendela**
- Minimize dan pulihkan memakai minimize macOS sendiri.
- Tutup menekan tombol tutup jendela itu. Kalau app bertanya ("Simpan perubahan?"), pertanyaannya muncul seperti biasa.
- Keluar meminta app keluar dengan sopan, sama seperti ⌘Q. Notching tidak memaksa app keluar dan tidak bertanya lagi. **(keputusan penulis)**

## 7. Tampilan

- Ukuran, jarak, dan warna mengikuti prototipe:
  - kartu gambar 184 × 118 di panel intip dan 186 × 116 di pengalih per jendela,
  - sudut 20 px untuk panel intip, 26 px untuk pengalih tengah, dan 0 0 30 30 untuk pengalih dari notch.
- Huruf Inter, dengan tanda kecil Barlow Condensed kapital, seperti seluruh app.
- Warna aksen mengikuti aksen yang dipilih di Tampilan notch. Di kartu terang dipakai warna aksen yang gelap, seperti di Pengaturan mode terang.
- **Pekat:**
  - Gelap: `#000`, persis seperti panel Notching.
  - Terang: `#f7f7f5` dengan teks gelap.
- **Liquid glass:** yang di belakang panel (jendela app lain, wallpaper) harus terlihat buram, jadi blur dari CSS di dalam halaman saja tidak cukup. Pembangun memakai efek kaca dari macOS sendiri di bawah halaman yang tembus pandang, dengan tiga syarat:
  - Gelap lebih gelap dari kaca biasa, supaya teks tetap terbaca di atas jendela putih. Di prototipe ini perlu diatur ulang.
  - Ada kilau tipis di pinggir atas.
  - Di macOS 26 boleh memakai kaca baru macOS; di versi lama, efek buram yang sudah dipakai jendela Pengaturan.
- **Sistem:** mengikuti mode terang atau gelap Mac, dan berubah saat mode Mac berubah.

## 8. Cara kerja teknis

Bagian ini menetapkan batasannya. Pilihan teknis di dalamnya adalah **keputusan penulis**, dan pembangun boleh menggantinya selama batasannya tetap terpenuhi.

- **Ikon di bawah kursor:** pengamat Aksesibilitas pada proses Dock (`com.apple.dock`), memakai pemberitahuan berubahnya anak yang terpilih pada daftar Dock. Dari item itu dibaca app-nya (URL bundle) dan bingkainya. Tidak ada polling.
- **Klik di Dock dan tombol pengalih:** satu event tap sesi yang bisa menahan event, di thread sendiri seperti Potong file. Untuk mouse, tap hanya melihat klik di atas area Dock. Untuk keyboard, tap hanya mengenali tombol pengalih dan, selama pengalih terbuka, tombol navigasinya. Ketikan lain langsung diteruskan.
- **Daftar jendela:** per app lewat Aksesibilitas, termasuk status minimize. Hanya jendela biasa, tanpa panel kecil, sheet, dan menu. Urutan terbaru dari urutan jendela di layar menurut macOS.
- **Gambar jendela:** diambil hanya selama panel terbuka, ditambah satu kali tepat sebelum Notching sendiri me-minimize jendela (klik Dock, tombol –, M). Panel tampil dulu dengan ikon app dan judul, lalu gambar mengisi begitu siap.
  - Jendela yang terlihat: ScreenCaptureKit.
  - **Jendela yang di-minimize** (pemilik: "cara tidak resmi"): cara resmi macOS tidak bisa mengambil gambarnya, jadi dipakai fungsi window server macOS yang tidak didokumentasikan, seperti yang dipakai AltTab, supaya isi jendela yang di-minimize sebelum Notching melihatnya tetap terlihat (contoh pemilik: file Word ketiga). Fungsi ini bisa berubah di update macOS. Kalau gagal atau hilang, Notching tidak boleh macet: urutan cadangannya gambar terakhir di memori, lalu ikon app dan judul. Kegagalan dicatat di log, sekali per jalannya app.
  - Gambar hanya di memori, diperkecil seukuran yang dibutuhkan panel, dibuang saat jendelanya tertutup atau Notching keluar, dan dibatasi jumlahnya (yang paling lama tidak dipakai dibuang dulu). Tidak pernah ditulis ke disk.
- **Panel intip dan pengalih:** panel Notching yang tidak mengaktifkan diri dan tidak pernah ditutup, hanya disembunyikan, sama dengan aturan semua panel Notching. "Dari notch" boleh memakai overlay notch yang sudah ada.
- **Memunculkan, minimize, tutup:** Aksesibilitas (atribut minimize, aksi raise, tombol tutup), ditambah mengaktifkan app. Keluar: meminta app keluar.

### Mengambil alih ⌘Tab (pemilik, 6 November 2026)

macOS menangani ⌘Tab sebelum event tap app lain menerimanya. Jadi, selama pengalih menyala dengan tombol ⌘Tab (atau ⌘⇧Tab), Notching mematikan ⌘Tab bawaan lewat fungsi macOS yang tidak resmi (`CGSSetSymbolicHotKeyEnabled`, seperti AltTab). Pemilik memilih ini dengan tahu risikonya: kalau Notching crash, ⌘Tab bawaan tetap mati sampai Notching dibuka lagi.

⌘Tab bawaan dinyalakan kembali:
- saat pengalih atau alatnya dimatikan,
- saat izin Aksesibilitas dicabut,
- saat Notching keluar,
- setiap Notching dibuka, sebelum hal lain, supaya crash sebelumnya pulih.

Dengan tombol lain, ⌘Tab bawaan tidak disentuh.

## 9. Teks (keputusan penulis)

| | Indonesia | English |
|---|---|---|
| Nama | Intip jendela | Window peek |
| Keterangan | Lihat semua jendela app dari Dock dan dari pengalih jendela | See every window of an app from the Dock and the window switcher |
| Jumlah | {n} jendela | {n} window(s) |
| Tanda | Di depan · Diminimize | In front · Minimized |
| Kosong | Tidak ada jendela yang terbuka | No open windows |
| Tombol | Minimize · Pulihkan · Tutup jendela · Keluar dari {app} | Minimize · Restore · Close window · Quit {app} |
| Pengalih | {n} jendela · {n} app | {n} window(s) · {n} app(s) |
| Tanpa izin | Intip jendela butuh izin Aksesibilitas · Buka Pengaturan → Izin | Window peek needs Accessibility access · Open Settings → Permissions |

Label pengaturan mengikuti tabel di bagian 4.

## 10. Urutan pembangunan dan pengujian

Dibangun dan dicoba bertahap, setiap tahap selesai dengan uji di Mac. **(keputusan penulis)**
1. Alat dan Pengaturan: paket, Katalog, baris di Pintasan, semua pilihan tersimpan, izin. Inti jendela: daftar jendela, gambar jendela, minimize, pulihkan, tutup, keluar.
2. Intip dari Dock dan klik ikon Dock.
3. Pengalih jendela.

**Tes otomatis:**
- aturan klik ikon (minimize semua atau munculkan semua),
- urutan jendela,
- pemilihan awal pengalih,
- navigasi tombol,
- posisi panel terhadap Dock bawah, kiri, kanan, dan tepi layar,
- penyimpanan pengaturan dan nilai bawaannya,
- tombol bentrok,
- tampilan baris di Pengaturan dan pencarian dalam kedua bahasa.

**Di Mac:**
- contoh pemilik (tiga file Word),
- dua layar,
- Dock sembunyi otomatis dan Dock di samping,
- menyeret ikon Dock dan menahan klik,
- ⌘Tab tanpa izin,
- CPU 0,0% saat diam dan pemakaian selama panel terbuka.

Hasilnya ditulis di dokumen verifikasi, dengan bukti log.

## 11. Keputusan penulis untuk diperiksa pemilik

1. Alat **tidak langsung terpasang**. Pengguna memasangnya dari Katalog, karena alat ini mengubah Dock dan ⌘Tab bawaan Mac.
2. Nilai bawaan di tabel bagian 4: semua bagian menyala, Per jendela, Tengah layar, warna Sistem, bahan Pekat, minimize ikut tampil.
3. Hanya Space yang sedang dilihat, ditambah jendela yang di-minimize. Space lain dan app layar penuh belum.
4. Tanpa Rekam Layar, gambar jendela diganti ikon app dan judul. Gambar jendela yang di-minimize memakai fungsi tidak resmi macOS sesuai pilihan pemilik; kalau gagal, gambar terakhir di memori, lalu ikon.
5. Mengintip menampilkan gambar jendela di posisinya tanpa mengubah urutan jendela yang sebenarnya.
6. Keluar meminta app keluar dengan sopan, tanpa konfirmasi dari Notching.
7. Tombol M, W, Q di pengalih. Setelah tombol jendela dipakai, melepas ⌘ tidak membuka apa pun; panel menunggu Enter, Esc, atau klik.
8. Pengalih muncul di layar tempat kursor berada.
9. Nama "Intip jendela" / "Window peek" dan teks di bagian 9.
10. Dibangun dalam tiga tahap seperti bagian 10.
11. App tanpa jendela di Space ini (Space lain, layar penuh, ⌘H, tanpa jendela) tetap ada di pengalih sebagai kartu app, supaya tidak ada yang hilang dibanding ⌘Tab.
12. Notching tidak mengubah setelan Dock macOS. Kalau "Minimize jendela ke ikon app" mati, Pengaturan hanya memberi petunjuk dan tombol ke Desktop & Dock.
