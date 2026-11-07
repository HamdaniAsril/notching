# Desain Kaca buatan Notching: Liquid glass sendiri untuk kartu Intip jendela dan pengalih ⌘Tab

Tanggal: 7 November 2026
Status: pemilik mencoba prototipe, menjawab "Pakai kaca ini", lalu menyetujui gambaran lengkapnya ("Sudah benar", 7 November 2026). Yang diputuskan pemilik ditandai **pemilik**. Selebihnya **keputusan penulis**, dikumpulkan di bagian 8. Pemilik menyetujui seluruh dokumen, termasuk bagian 8 ("Setuju", 7 November 2026).
Prototipe: `docs/superpowers/specs/2026-11-07-kaca-sendiri-mockups/prototipe.html`. Buka di browser dari folder repo (hurufnya diambil dari `node_modules`). Desktop di dalamnya buatan; latarnya gradien, bukan wallpaper Apple. Pemilik menilai versi dengan wallpaper bawaan macOS; kacanya sama.

## 1. Kenapa

Saat menguji bahan Liquid glass di kartu Intip jendela dan pengalih ⌘Tab, pemilik terus meminta kaca yang lebih tembus pandang, dengan blur yang terlihat dan tepi yang membengkokkan isi di belakang "seperti Liquid Glass Apple". Kaca macOS sendiri (`NSGlassEffectView`, gaya Clear) tidak bisa memberi itu di Mac pemilik (macOS 27.0.1):

- kekuatan penuh: terlalu buram untuk pemilik;
- kekuatan 0,3–0,5: beningnya pas, tapi blur dan lengkung tepinya tidak terlihat sama sekali (sekarang di `main` 0,3, pilihan pemilik, commit `4ff83ad`);
- percobaan terpisah dengan `NSGlassEffectView` mentah (Clear dan Regular, di panel dan jendela biasa) juga tidak cukup tembus untuk melihat lengkungnya.

Kartu dan pengalih hanya muncul sebentar. Jadi Notching memotret layar di belakangnya tepat sebelum panel muncul, lalu menggambar kacanya sendiri dari potret itu.

## 2. Bentuk yang disetujui (pemilik)

Kartu Intip jendela dan pengalih ⌘Tab dengan bahan **Liquid glass** memakai kaca buatan Notching, seperti di prototipe:
- latar di belakang panel sedikit buram;
- di tepinya, isi yang tepat di luar tepi ikut terjepit masuk dan melengkung, dengan sedikit pelangi;
- ada kilau di tepi;
- warna kartu (terang atau gelap) di atasnya.

Angka pilihan pemilik di prototipe (dibaca dari catatan prototipe):

| Pengatur | Angka |
|---|---|
| Kepekatan warna | 40% |
| Blur latar | 3,5 pt |
| Lengkung di tepi | 18 pt |
| Lebar tepi kaca | 26 pt |
| Tepi lebih tajam dari tengah | 35% |
| Pelangi di tepi | 35% |
| Kilau tepi | 50% |
| Warna latar lebih hidup | 130% |

Angka ini titik awal. Saat diuji di Mac, angkanya boleh disetel bersama pemilik, karena layar asli berbeda dengan desktop buatan.

Bagian yang ditulis penulis lalu disetujui pemilik dalam gambaran 7 November:
- 40% dipakai, walau permintaan awal "10–15%"; itu ujung penggeser prototipe.
- Berlaku di Terang dan Gelap.
- Menggantikan cara "Liquid glass" digambar sekarang. Tidak ada pilihan baru di Pengaturan.
- Tanpa izin Rekaman Layar, atau saat "Kurangi transparansi" di Mac menyala: tampilan seperti sekarang.
- Pengalih Dari notch juga memakai kaca ini, sudut atasnya tetap rata.
- Saat mengintip jendela (layar menggelap), kacanya ikut gelap.
- Setelah tombol jendela di kartu atau pengalih, kacanya diperbarui sesuai yang ada di belakang.
- Video yang sedang main di belakang panel terlihat diam di dalam kaca. Diterima.
- Dibangun setelah uji pengalih ⌘Tab selesai, karena berkasnya sama.

## 3. Tujuan, bukan tujuan, yang harus dihindari

**Tujuan**
- Kaca kartu dan pengalih di Mac terlihat seperti di prototipe dengan angka di bagian 2.
- Biasanya kacanya sudah siap saat panel muncul. Kartu muncul 350 ms setelah kursor berhenti di ikon Dock (`OPEN_MS`), pengalih 140 ms setelah ⌘Tab (`SHOW_AFTER`). Potret diambil dalam jeda itu.

**Bukan tujuan**
- Jendela Pengaturan. Itu punya desain sendiri (kaca buram biasa macOS, disetujui 6 November).
- Panel notch dan panel Notching lain.
- Kaca yang hidup (latar bergerak di dalam kaca). Potretnya diam.
- Versi Windows.
- Mac sebelum macOS 14: tampilan seperti sekarang.

**Yang harus dihindari**
- **Izin atau permintaan izin baru.** Kaca ini hanya memakai Rekaman Layar yang sudah dipakai untuk gambar jendela. Tanpa izin itu, Notching tidak memanggil apa pun yang bisa memunculkan permintaan izin macOS; langsung tampilan sekarang.
- **CPU tidak lagi 0,0% saat diam.** Potret hanya diambil saat kartu atau pengalih akan muncul atau sedang terbuka. Tidak ada potret di belakang layar dan tidak ada potret berkala.
- **Potret disimpan atau dikirim.** Potret hanya ada di memori dan dibuang saat panel tersembunyi. Tidak pernah ditulis ke disk, tidak pernah dikirim ke mana pun.
- **Panel muncul lebih lambat dari sekarang.** Panel tidak pernah menunggu potret. Kalau potret belum siap, panel tampil dengan tampilan sekarang dan kacanya menyusul.
- **Panel itu sendiri ada di dalam kacanya.** Kartu, lapisan intip, dan pengalih tidak boleh ikut terpotret.
- **Panel ditutup.** Panel nspanel hanya disembunyikan, seperti semua panel Notching.

## 4. Perilaku rinci

**Kapan memotret**
- **Kartu:** saat jeda 350 ms dimulai, yaitu saat kursor berhenti di ikon app yang jalan, potret layar tempat Dock itu berada mulai diambil.
  - Kalau kursor pergi sebelum kartu muncul, potretnya dibuang.
  - Selama kartu terbuka, potret yang sama dipakai lagi, juga saat kartu pindah ke ikon lain di layar yang sama.
  - Kalau ikon berikutnya di layar lain, layar itu dipotret.
- **Pengalih:** saat ⌘Tab mulai membuka pengalih, potret layar tempat pengalih akan muncul mulai diambil. Potret dipakai selama pengalih terbuka.
- Hanya satu potret yang sedang diambil pada satu waktu. Kursor yang menyapu Dock tidak menumpuk potret. **(keputusan penulis)**
- ⌘Tab yang dilepas sebelum pengalih muncul: potretnya dibuang (dibatalkan kalau bisa). **(keputusan penulis)**
- Potret dibuang saat panelnya tersembunyi.

**Kalau potret terlambat atau gagal** **(keputusan penulis)**
- Panel tampil tepat waktu dengan tampilan sekarang: kaca macOS di kekuatan 0,3 (macOS 26 ke atas) atau efek popover (macOS 14–25).
- Begitu kaca buatan siap, kaca itu muncul dengan pudar 150 ms.
- Kalau dalam 1 detik potret belum ada atau gagal, tampilan sekarang tetap dipakai selama panel itu terbuka. Kegagalan dicatat di log, sekali per jalannya app.

**Saat panel berubah**
- Kartu berubah ukuran atau pindah ke ikon lain: kaca digambar ulang dari potret yang sama di tempat baru. Tidak ada potret baru.
- Setelah tombol jendela (minimize, pulihkan, tutup, keluar) di kartu atau pengalih: potret baru diambil setelah panel menyegarkan daftar jendelanya. Selama menunggu, kaca lama tetap tampil. Kaca baru masuk dengan pudar 150 ms.
- **Keadaan hover Dock (kartu saja):** potret pertama diambil saat kursor masih di ikon Dock. Saat itu Dock bisa sedang menampilkan nama app di atas ikon (tepat di bagian bawah kartu, tempat lengkung tepi paling kuat), ikon yang membesar (pembesaran Dock), atau Dock sembunyi-otomatis yang sedang tampil. Begitu kursor pindah ke kartu, semua itu hilang dari layar. Syaratnya: setelah kursor masuk ke kartu, kaca tidak boleh terus menampilkan keadaan hover Dock lebih lama dari satu potret ditambah pudar 150 ms. Saran cara: jendela label nama milik Dock tidak ikut dipotret, dan satu potret baru diambil saat kursor pertama kali masuk ke kartu. Ini satu-satunya pengecualian dari aturan "potret yang sama selama kartu terbuka". **(keputusan penulis)**
- **Mengintip jendela (kartu saja):** saat lapisan intip tampil (layar digelapkan 55% dan gambar jendela di tempatnya dengan cincin aksen), kaca digambar dari potret yang juga digelapkan 55%, dengan gambar jendela yang sama di tempatnya. Kaca jadi cocok dengan sekelilingnya. Saat intip selesai, kaca kembali ke potret biasa. Tidak ada potret baru, karena semua yang digambar lapisan intip adalah milik Notching. **(keputusan penulis)**

**Animasi membuka** **(keputusan penulis)**
- Kaca buatan terlihat jelas, jadi kaca harus ikut animasi membuka halaman, bukan muncul utuh lalu halaman bergerak di atasnya:
  - kartu: muncul pudar sambil naik 8 pt, 160 ms, ease-out;
  - pengalih tengah: muncul pudar, 120 ms;
  - pengalih Dari notch: turun terbuka dari notch, 260 ms, `cubic-bezier(.2, .9, .3, 1.15)`, dari `inset(0 40% 92% 40%)` sampai penuh.
- Caranya bebas, selama di Mac terlihat seirama:
  - lapisan kaca memainkan animasi yang sama di Core Animation (opacity, posisi, topeng); atau
  - selama kaca buatan aktif, animasi CSS diganti satu animasi native untuk seluruh panel.
- Pemilik menilainya saat uji di Mac.
- Kaca yang datang terlambat (setelah animasi selesai) tetap memakai pudar 150 ms.

**Pengalih Dari notch**
- Sudut atas rata, seperti sekarang. Tepi atasnya ada di tepi layar, jadi di tepi atas tidak ada lengkung dan kilau. Sudut bawah 30 pt. **(keputusan penulis)**

**Kapan tampilan sekarang dipakai** (tanpa kaca buatan)
- Bahan Pekat (tidak berubah).
- Tidak ada izin Rekaman Layar.
- macOS sebelum 14.
- "Kurangi transparansi" di Mac menyala.
- Potret gagal atau terlambat lebih dari 1 detik.

Warna kartu di tampilan sekarang tetap seperti sekarang (10% terang, 12% gelap). Warna 40% hanya untuk kaca buatan. **(keputusan penulis)**

## 5. Tampilan

Rumus kaca di prototipe (`GLASS` di `prototipe.html`) adalah acuan tampilannya. Prototipe di folder mockup itu memakai angka pilihan pemilik sebagai nilai awal. Uji di Mac membandingkan dengan file ini. Satuan dalam pt; di layar Retina dikali skala layar.

Detail dari prototipe yang ikut jadi acuan:
- arah `n` dihitung dari perubahan jarak ke tepi (selisih ±0,5 pt di x dan y), lalu dinormalkan;
- arah cahaya `L₁` dan `L₂` dinormalkan;
- kecerahan untuk saturasi memakai bobot Rec. 709 (0,2126, 0,7152, 0,0722);
- 1 pt terluar tepi dihaluskan: `a = clamp(0,5 − 2d, 0, 1)` dengan `d` dalam pt.

Untuk setiap titik di dalam bentuk panel (persegi bersudut bulat, sudut 20 kartu, 26 pengalih tengah, 30 bawah pengalih dari notch):
1. `d` = jarak ke tepi panel; `n` = arah keluar tegak lurus tepi.
2. `u` = kedalaman dari tepi dibagi lebar tepi kaca (26), dibatasi 0..1.
3. Geser keluar sejauh `m = 18 × (1 − √(1 − (1 − u)²))`: 18 pt tepat di tepi, 0 pada kedalaman 26 pt.
4. Ambil warna latar di titik yang digeser, dari potret tajam dan dari potret yang diburamkan (Gaussian σ 3,5 pt):
   - merah digeser `m × (1 + 0,175)`, hijau `m`, biru `m × (1 − 0,175)`. Pelangi 35% berarti 0,175.
5. Campur tajam dan buram: bobot buram `mix(1, smoothstep(0, 0,85, u), 0,35)`. Tepi 35% lebih tajam dari tengah.
6. Saturasi 130%.
7. Kilau: campur ke putih sebanyak `0,5 × (1 − u)³ × (max(n·L₁, 0) + 0,55 × max(n·L₂, 0)) × 0,55`, dengan `L₁` = arah kiri-atas `(−0,55, −0,85)` (y ke bawah) dan `L₂` arah sebaliknya.
8. Halaman di atasnya tetap seperti sekarang: warna kartu 40% (terang `rgba(255,255,255,.40)`, gelap `rgba(16,17,15,.40)`), kilap gradien, dan garis tepi dalam dari `mat-glass`.

Di luar bentuk panel tidak ada yang digambar. Bayangan panel tetap bayangan macOS seperti sekarang.

## 6. Cara kerja teknis

Bagian ini menetapkan batasannya. Pilihan teknis di dalamnya adalah **keputusan penulis**, dan pembangun boleh menggantinya selama batasan di bagian 3 dan 4 tetap terpenuhi.

- **Memotret:** ScreenCaptureKit `SCScreenshotManager`, satu layar penuh dalam piksel asli layar.
  - Yang dikecualikan hanya jendela kartu, lapisan intip, dan pengalih (`SCContentFilter` dengan display dan `excludingWindows`).
  - Jendela Notching lain (Pengaturan, editor, notch) tetap ikut terpotret, karena memang ada di belakang panel.
  - Periksa izin dulu dengan cara yang sudah ada (`shot_service::screen_access()`), supaya tidak ada permintaan izin.
- **Menggambar:** Core Image di Metal.
  - Potong area panel ditambah tepian (minimal 18 pt + 3σ), buramkan, lalu jalankan kernel bagian 5.
  - Hasilnya jadi `contents` sebuah view berlapis di bawah halaman. Tempatnya sama dengan `NSGlassEffectView` sekarang (`set_glass` di `src-tauri/src/peek_service.rs`), dengan topeng bentuk panel dari `peek_rules::glass_shape`.
  - Kernel boleh ditulis dengan Core Image Kernel Language. Bahasa ini usang sejak macOS 10.14, tapi masih jalan di macOS 27 (terbukti di percobaan). Bisa juga kernel Metal, yang butuh langkah build metallib. Pilih yang paling tidak rapuh.
- **Hasil percobaan di Mac pemilik** (macOS 27.0.1, layar 1470 × 956 pt @2x), dengan gambar buatan:
  - menggambar sampai jadi gambar: kartu 3 jendela 2,2 ms, kartu terbesar 4,4 ms, pengalih 6 jendela 4,0 ms, seluruh layar 9,3 ms;
  - sekali di awal sekitar 60 ms untuk mengompilasi kernel. Ini boleh dilakukan saat app mulai.
  - Kecepatan memotret **belum terukur**, karena sesi percobaan tidak punya izin Rekaman Layar. Perkiraan 30–100 ms, belum terbukti.
- **Log:** setiap kali panel dibuka dengan kaca buatan, satu baris log berisi lama memotret dan lama menggambar. Uji di Mac membutuhkannya.
- **Thread:** potret di antrean ScreenCaptureKit, gambar di luar main thread, pasang ke view di main thread.
- **Memori:** satu potret layar penuh sekitar 22 MB selama panel terbuka, dibuang saat panel tersembunyi.
- **Halaman:** halaman perlu tahu kaca mana yang aktif, supaya warna 40% hanya dipakai dengan kaca buatan. Misalnya kelas tambahan di `#peek` dan `#sw`, di samping `mat-glass`.
- **Menyetel angka saat uji:** angka bagian 2 boleh diganti lewat variabel lingkungan saat uji, seperti `NOTCHING_GLASS_ALPHA` sekarang. Tidak ada pilihan di Pengaturan.
- **Kode yang disentuh:**
  - `dress_window` dan `set_glass` di `peek_service.rs`;
  - pemanggilan `dress_window` di `switch_service.rs`;
  - jalur hover dan lapisan intip di `peek_service.rs`;
  - aturan `mat-glass` di `src/peek/peek.css` dan `src/peek/switcher.css`;
  - fitur baru objc2 untuk Core Image dan Core Animation di `src-tauri/Cargo.toml`.

**Risiko yang diketahui**
- Video atau animasi di belakang panel diam di dalam kaca (diterima pemilik).
- Kalau memotret lebih lama dari 140 ms, pengalih sempat tampil dengan tampilan sekarang sebelum kacanya muncul.
- Core Image Kernel Language bisa dihapus di macOS mendatang. Cadangannya kernel Metal.
- Banyak layar, Space, dan app layar penuh perlu dicoba di Mac.
- Periksa apakah memotret satu layar penuh mengubah tanda rekaman layar macOS di bar menu dibanding memotret satu jendela seperti sekarang.

## 7. Urutan pembangunan dan pengujian

Mulai setelah uji pengalih ⌘Tab (rencana `docs/superpowers/plans/2026-11-06-intip-jendela-2-pengalih.md`) selesai dan masuk `main`. Dibangun bertahap, setiap tahap selesai dengan uji di Mac. **(keputusan penulis)**
0. Langkah pertama tahap 1: potret saja, dengan log waktu, lalu diuji di Mac sebelum kaca digambar.
   - Lulus: bar menu dan Pusat Kontrol tidak menunjukkan tanda rekaman layar yang baru atau berbeda dibanding gambar jendela sekarang.
   - Kalau ada yang berbeda, berhenti dan tanya pemilik dulu: diterima, atau kaca buatan dibatalkan.
1. Kartu: potret, gambar, tampilan cadangan, pudar, animasi membuka, keadaan hover Dock, log waktu. Uji di Mac bersama pemilik, termasuk menyetel angka.
2. Kartu: lapisan intip yang menggelapkan kaca, dan potret ulang setelah tombol jendela.
3. Pengalih: tengah layar dan dari notch.

**Tes otomatis** (bagian yang tidak butuh layar):
- area potong dengan tepian, dibatasi tepi layar;
- rumus geser tepi;
- tabel kapan kaca buatan atau tampilan sekarang dipakai (bahan, izin, versi macOS, Kurangi transparansi, keadaan potret);
- aturan memakai ulang potret (layar sama, panel masih terbuka);
- CSS: warna 40% hanya dengan kelas kaca buatan, warna tampilan sekarang tidak berubah.

**Di Mac:**
- pemilik menilai Terang dan Gelap di atas latar ramai (teks, garis, foto) dan latar polos;
- log waktu: apakah potret selesai sebelum 350 ms (kartu) dan 140 ms (pengalih);
- tanpa Rekaman Layar: tampilan sekarang, tanpa permintaan izin;
- Kurangi transparansi menyala;
- dua layar;
- kartu pindah antar ikon;
- minimize dan tutup lewat tombol kartu;
- mengintip jendela;
- pengalih tengah dan dari notch;
- CPU 0,0% saat diam;
- tanda rekaman layar di bar menu.

Hasilnya ditulis di dokumen verifikasi, dengan bukti log.

## 8. Keputusan penulis untuk diperiksa pemilik

Sudah disetujui pemilik dalam gambaran 7 November: lihat daftar di akhir bagian 2.

Baru di dokumen ini:
1. Hanya satu potret yang diambil pada satu waktu, dan potret dibuang saat panel tersembunyi.
2. Kalau potret belum siap, panel tampil dengan tampilan sekarang, lalu kaca buatan masuk dengan pudar 150 ms. Lebih dari 1 detik: tampilan sekarang selama panel itu terbuka.
3. Saat mengintip, kaca digambar ulang dengan gelap 55% dan gambar jendela, tanpa potret baru.
4. Pengalih Dari notch: tidak ada lengkung dan kilau di tepi atas.
5. Tampilan sekarang tetap memakai warna 10% / 12%. Warna 40% hanya untuk kaca buatan.
6. Hanya kartu, lapisan intip, dan pengalih yang tidak ikut terpotret. Jendela Notching lain tetap terlihat di dalam kaca.
7. macOS 14 ke atas. Mac yang lebih lama memakai tampilan sekarang.
8. Angka bisa disetel lewat variabel lingkungan saat uji, tanpa pilihan di Pengaturan.
9. Dibangun dalam tiga tahap seperti bagian 7, mulai setelah uji pengalih selesai.
10. Nama app di atas ikon Dock, ikon yang membesar, dan Dock sembunyi-otomatis tidak boleh tertinggal di kaca setelah kursor masuk ke kartu. Caranya satu potret baru saat kursor masuk ke kartu, ditambah label Dock tidak ikut dipotret.
11. Kaca ikut animasi membuka kartu dan pengalih (naik dan pudar, pudar, turun dari notch).
12. Tanda rekaman layar di bar menu diuji paling awal. Kalau berbeda dari sekarang, pembangunan berhenti sampai pemilik memutuskan.
13. ⌘Tab yang dilepas sebelum pengalih muncul: potretnya dibuang.
