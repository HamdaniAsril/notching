# Desain modul Keyboard Cleaning Mode

Status: pemilik ide meminta dikerjakan sampai selesai lalu direview di akhir (31 Oktober 2026).

Dokumen ini merinci modul "Freeze keyboard" dari desain awal (`2026-10-27-notch-design.md` §6). Pemilik menamainya **Keyboard Cleaning Mode**. Dokumen ini juga mengacu ke desain halaman (`2026-10-30-halaman-widget-design.md` §7, §8). Hal yang tidak disebut di sini mengikuti dokumen-dokumen itu dan pola Keep awake serta Timer.

Mockup ada di `2026-10-31-keyboard-clean-mockups/clean-look.html`. Yang dipilih pemilik adalah **pilihan C**, yaitu lima tombol "esc" yang menyala. File itu potongan halaman untuk alat brainstorming, jadi gayanya baru lengkap kalau dibuka lewat alat itu.

## 1. Kenapa

Pemilik ingin membersihkan keyboard laptop tanpa mengetik atau menekan apa pun secara tidak sengaja. Selama mode ini menyala, keyboard terkunci dan layar menggelap, supaya jelas bahwa Mac sedang tidak menerima ketikan.

## 2. Tujuan, bukan tujuan, dan yang harus dihindari

**Tujuan**
- Menyalakan dengan satu klik: kotak **Clean KB** di halaman Modul.
- Saat menyala:
  - semua tombol keyboard terkunci;
  - semua layar menggelap 90%;
  - keterangan pilihan C tampil di tengah layar;
  - ikon keyboard tampil di samping notch.
- Mematikan dengan menekan Esc 5 kali.
- Cmd+Q tetap menutup Notching, sehingga kunci terlepas.

**Bukan tujuan**
- Mengunci trackpad atau mouse. Pemilik membolehkan trackpad tetap aktif.
- Mengunci tombol power dan Touch ID. macOS tidak mengizinkan app biasa melakukannya.
- Halaman modul tersendiri, atau pilihan durasi.
- Versi Windows. Desain awal menyebut hook keyboard tingkat rendah untuk Windows, yang dibuat nanti.

**Yang harus dihindari**
- **Pemilik terkunci dan tidak bisa keluar.** Esc 5×, Cmd+Q, dan pengaman 10 menit harus selalu berfungsi. Kalau Notching keluar atau mati mendadak, kunci keyboard ikut lepas, karena kuncinya hidup di dalam proses Notching.
- **Cmd+Q menutup app lain di bawah layar gelap.** Cmd+Q ditangkap Notching dan hanya menutup Notching **(keputusan penulis, disetujui pemilik saat playback)**.
- **Tidak bisa mengetik kata sandi.** Mode mati saat Mac tidur atau layar terkunci.
- **Klik buta.** Klik di layar gelap tidak boleh menembus ke app di bawahnya.
- **Layar gelap tanpa kunci.** Kalau kunci keyboard tidak bisa dipasang, misalnya karena izin belum ada, layar tidak boleh menggelap.

## 3. Menyalakan

- Di halaman Modul ada kotak **Clean KB** dengan ikon keyboard bergaris. Urutannya setelah Timer. Semula bernama "Keyboard"; diganti atas permintaan pemilik saat cek di Mac pada 31 Oktober. "Cleaning mode" juga ditawarkan pemilik, tapi terlalu panjang untuk kotak selebar itu **(keputusan penulis)**.
- **Klik kotak itu langsung menyalakan mode ini.** Kotak ini tidak membuka halaman modul. Panel menutup, lalu mode menyala. Saat mode menyala, kotaknya putih, dan klik lagi mematikannya.
- **Izin Aksesibilitas:**
  - Kalau izin belum diberikan, mode tidak menyala. macOS menampilkan permintaan izinnya.
  - Notch juga menampilkan notifikasi "Izinkan Aksesibilitas", dengan keterangan kira-kira "Agar Notching bisa mengunci keyboard". Kata-kata pastinya ditentukan pembuat.
  - Setelah izin diberikan, klik kotaknya lagi.
- **Input aman:** kalau ada app yang sedang memakai input aman, misalnya kolom kata sandi yang aktif atau Secure Keyboard Entry di Terminal, macOS tidak meneruskan ketikan ke Notching. Kunci keyboard tidak akan berfungsi, dan ketikan tetap sampai ke app itu. Karena itu mode tidak menyala, dan notch menampilkan "Input aman sedang aktif" dengan keterangan cara mematikannya. Ini ditemukan pemeriksa kode **(keputusan penulis)**.
- Notifikasi izin dan input aman memakai satu saluran, "Keyboard tidak bisa dikunci" (bawaan menyala, tanpa suara).
- **Halaman Izin di Pengaturan** sekarang menampilkan modul ini: nama modul, izin yang dibutuhkan (Aksesibilitas), keadaannya (diizinkan atau belum), dan tombol untuk membuka Pengaturan Sistem di bagian itu. Ini mengikuti desain awal, yang menyebut modul berizin muncul di halaman Izin.

## 4. Saat menyala (pilihan C)

- **Setiap layar** ditutup lapisan hitam dengan kegelapan 90%, termasuk layar tanpa notch dan monitor kedua.
- **Notch tetap terlihat** di atas lapisan gelap, dengan ikon keyboard di sampingnya.
- **Di tengah setiap layar:**
  - judul **"Keyboard sedang dibersihkan"**;
  - di bawahnya, lima tombol kecil bertuliskan **esc**;
  - di bawahnya lagi, keterangan **"Tekan Esc 5× untuk keluar"** dengan label huruf besar abu-abu.
- **Setiap Esc menyalakan satu tombol "esc"** menjadi putih. Kalau 3 detik berlalu tanpa Esc, kelima tombol kembali redup dan hitungan mulai dari nol.
- **Keyboard:** semua tombol diabaikan, termasuk tombol kecerahan, volume, dan media. Esc tetap dihitung, dan Cmd+Q tetap menutup Notching. Tidak ada ketikan yang sampai ke app lain.
- **Trackpad** tetap menggerakkan kursor. Klik di lapisan gelap tidak berbuat apa-apa.
- **Notch tetap bisa dipakai seperti biasa**, karena trackpad aktif. Arahkan kursor ke notch untuk membuka panel, lalu klik kotak Keyboard yang putih di halaman Modul untuk mematikan mode ini **(keputusan penulis)**. Tidak ada tombol "Selesai" di tengah layar, sesuai pilihan C.
- **Layar tetap menyala selama mode menyala.** Ketikan yang dibuang dan gerakan membersihkan belum tentu dihitung macOS sebagai aktivitas. Tanpa penahan, layar bisa mati di tengah membersihkan, lalu Mac terkunci. Modul ini memakai penahan layar yang sama jenisnya dengan Keep awake, tapi terpisah dari keadaan Keep awake, dan melepasnya saat mode mati **(keputusan penulis)**.
- Gaya mengikuti desain awal bagian 5: monokrom, Space Grotesk untuk judul, dan Space Mono untuk label dan tulisan "esc".

## 5. Status di samping notch dan di halaman Modul

- Selama mode menyala, modul melaporkan **menyala** (`Activity::On`), sehingga kotaknya di halaman Modul berwarna putih.
- **Di samping notch hanya tampil ikon keyboard, tanpa teks.** Ini diminta pemilik. Status biasa selalu bertuliskan teks. Status tanpa teks adalah bentuk baru yang hanya dipakai modul ini.
- Saklar "tampilkan status" per modul tetap berlaku. Aturan satu status (yang paling akhir dinyalakan) juga tetap berlaku, sesuai desain 30 Oktober §8.

## 6. Mematikan

- **Klik kotak Keyboard yang putih** di halaman Modul (bagian 4).
- **Esc 5×:** tekanan kelima mematikan mode. Lapisan gelap hilang, keyboard berfungsi lagi, dan ikon di samping notch hilang.
- **Cmd+Q:** menutup Notching seperti biasa. Kunci dan lapisan gelap ikut hilang bersama prosesnya.
- **Pengaman 10 menit:** mode mati sendiri 10 menit setelah dinyalakan **(keputusan penulis, disetujui pemilik saat playback)**.
- **Mac tidur atau layar terkunci:** mode langsung mati.
- **Modul dimatikan atau dicopot** di Pengaturan selama mode menyala: mode mati. Dalam keadaan biasa ini tidak bisa terjadi karena keyboard terkunci, tapi aturannya tetap ada.
- **Tidak ada notifikasi** saat mode berakhir.

## 7. Cara kerja

- **Kunci keyboard dipegang app inti (Rust):** sebuah event tap macOS yang membuang ketikan, sama seperti Keep awake yang menahan Mac di app inti. Event tap hanya ada selama mode menyala, dan dilepas di semua cara mematikan.
- **Hitungan Esc, batas 3 detik, dan pengaman 10 menit** berjalan di app inti dengan jam dinding. Logikanya dipisah dari bagian macOS supaya bisa dites.
- **Lapisan gelap** adalah jendela milik app inti, satu per layar. Jendela ini dibuat saat pertama dipakai lalu disembunyikan saat mode mati, dan tidak pernah ditutup (aturan panel tauri-nspanel). Jendela ini menangkap klik, tidak menjadi jendela aktif, dan berada di bawah panel notch.
- **Kemampuan di manifest:** modul ini menyebut kemampuan untuk mode ini, ditambah `status` dan `notify`, serta izin `accessibility`. Klik kotak di halaman Modul memanggil kemampuan itu lewat gate, sama seperti panggilan lain.
- **Kotak yang menjalankan perintah:** manifest bisa menyebut bahwa kotaknya di halaman Modul menjalankan perintah, bukan membuka halaman. Ini bentuk baru. Modul seperti ini tidak punya halaman, tapi tetap tampil di halaman Modul.
- **Keadaan tidak disimpan ke disk.** Notching yang dibuka lagi selalu mulai dengan mode mati.

## 8. Pemasangan

- Ikut di dalam app sebagai modul bawaan, seperti modul lain. Pengguna yang sudah memakai Notching langsung mendapatkannya dalam keadaan menyala.
- Di halaman Modul, urutannya setelah Timer.
- Modul ini butuh izin Aksesibilitas, sehingga muncul di halaman Izin (bagian 3).

## 9. Diserahkan ke pembuat

- Nama modul (id) dan nama kemampuan, serta bentuk pesan antara app inti, halaman notch, dan lapisan gelap.
- Cara memasang event tap, mengecek izin Aksesibilitas, dan memantau tidur atau kunci layar di macOS.
- Tingkat jendela lapisan gelap. Syaratnya: lapisan ini menutupi app, Dock, dan menu bar, tapi panel notch tetap di atasnya.
- Ukuran dan kata-kata pasti di tengah layar dan di notifikasi izin, dalam bahasa Indonesia dan Inggris.
- Gambar pasti ikon keyboard.
