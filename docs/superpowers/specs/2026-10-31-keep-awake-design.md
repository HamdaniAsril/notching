# Desain modul Keep awake

Status: disetujui pemilik ide (31 Oktober 2026).

Dokumen ini merinci modul Keep awake dari desain awal (`2026-10-27-notch-design.md` §6) dan desain halaman (`2026-10-30-halaman-widget-design.md` §7, §8, dan §11 langkah 3). Hal yang tidak disebut di sini mengikuti kedua desain itu.

Mockup ada di `2026-10-31-keep-awake-mockups/page-layout.html`. Yang dipilih pemilik adalah **pilihan B**. File itu berupa potongan halaman untuk alat brainstorming, jadi gayanya baru lengkap kalau dibuka lewat alat itu.

## 1. Kenapa

Pemilik sering menjalankan prompt yang lama di Mac. Kadang layar mati di tengah jalan, lalu prosesnya ikut berhenti. Keep awake menahan Mac tetap menyala selama waktu yang dipilih, supaya proses itu jalan terus.

## 2. Tujuan, bukan tujuan, dan yang harus dihindari

**Tujuan**
- Selama Keep awake menyala, **layar tetap terang dan Mac tidak tidur**. Pemilik memilih ini (pilihan B), bukan "layar boleh mati asal Mac tidak tidur".
- Durasi dipilih dengan satu klik: 1 jam, 2 jam, atau tanpa batas. Bisa juga mengetik jumlah menit sendiri.
- Waktu bisa ditambah tanpa mengulang dari awal: +15 menit, +30 menit, +1 jam.
- Saat waktunya habis, muncul notifikasi.
- Status Keep awake terlihat walau panel tertutup: kotaknya putih di halaman Modul, dan sisa waktu tampil di samping notch.

**Bukan tujuan**
- Mencegah Mac tidur saat tutup laptop ditutup. macOS tidak mengizinkan app biasa melakukannya.
- Menyala sendiri saat Notching dibuka, atau mengingat keadaan setelah app keluar.
- Aturan otomatis, misalnya menyala saat app tertentu dibuka atau berhenti saat baterai tinggal sedikit. Ide ini dari app lain dan belum diminta.
- Versi Windows. Kodenya tetap dipisah supaya Windows nanti cukup menambah bagiannya sendiri dengan `SetThreadExecutionState`.

**Yang harus dihindari**
- **Mac tetap tertahan setelah Keep awake mati.** Ini terjadi kalau Keep awake dimatikan, waktunya habis, modulnya dimatikan atau dicopot, atau Notching keluar. Kalau penahan tidak dilepas, baterai habis diam-diam. Ini kegagalan paling buruk, walaupun hal lain berjalan.
- **Hitungan yang meleset setelah Mac tidur.** Contohnya, tutup laptop ditutup selama Keep awake menyala, lalu dibuka lagi setelah jam selesainya lewat. Keep awake harus langsung selesai, tidak menghitung sisa dari sebelum tidur.
- **Notch yang ramai atau boros.** Sisa waktu di samping notch cukup diperbarui per menit.

## 3. Halaman Keep awake (pilihan B)

Halaman ini dibuka dari kotak Keep awake di halaman Modul. Di atasnya ada bar "‹ Modul", sama seperti System stat.

**Saat mati**
- Di kiri ada kotak besar berisi ikon cangkir kopi dan tulisan "Mati". Klik kotak ini untuk menyalakan Keep awake selama **1 jam**.
- Di kanan ada tombol "Nyalakan selama": **1 jam**, **2 jam**, **∞** (tanpa batas), dan kolom angka **menit**. Durasi di kolom mulai berjalan saat Enter ditekan.
- Di bawahnya ada keterangan kecil: "Klik kotak: 1 jam".

**Saat menyala dengan batas waktu**
- Kotak berwarna putih dan menampilkan sisa waktu, misalnya "1:42".
- Di kanan tertulis "Menyala sampai 15.20" dengan jam selesai dalam waktu setempat, mengikuti bahasa app ("15.20" atau "15:20"). Di bawahnya ada tombol **+15 m**, **+30 m**, dan **+1 jam**.
- Ada juga keterangan "Klik kotak untuk mematikan". Klik kotak untuk mematikan Keep awake.

**Saat menyala tanpa batas** **(keputusan penulis)**
- Kotak berwarna putih dan menampilkan ∞.
- Tulisannya "Menyala tanpa batas".
- Tombol + disembunyikan karena tidak ada waktu yang bisa ditambah.

**Aturan lain (keputusan penulis)**
- Menekan tombol durasi saat Keep awake sudah menyala tidak terjadi, karena tombol durasi hanya ada saat mati. Untuk mengganti ke tanpa batas, matikan dulu lalu pilih ∞.
- Kolom menit menerima 1 sampai 1440 menit, atau paling lama 24 jam. Angka di luar batas itu atau isian kosong tidak memulai apa-apa.
- Tombol + tidak boleh membuat sisa waktu lebih dari 24 jam. Kalau melewati batas, sisa waktunya menjadi tepat 24 jam.
- Gaya mengikuti desain awal bagian 5. Teks memakai Space Grotesk dan Space Mono, label huruf besar abu-abu, dan putih untuk keadaan menyala, sama seperti kotak di halaman Modul.
- Panel Keep awake menyesuaikan kotak 96 px dengan baris tombol. Angka pastinya ditentukan pembuat dalam batas manifest, yaitu tinggi 40–240 px.

## 4. Cara kerja

- **Penahan di Mac:** power assertion yang menahan layar tetap menyala. Penahan ini juga membuat Mac tidak tidur. Hanya ada satu penahan pada satu waktu.
- **Hitungan berjalan di app inti (Rust), bukan di halaman modul.** Halaman modul ditutup saat panel tertutup, sedangkan Keep awake harus terus berjalan. Halaman modul hanya membaca keadaan dan mengirim perintah: nyalakan, tambah, matikan.
- **Jam selesai disimpan sebagai waktu jam dinding.** Kalau Mac sempat tidur, saat bangun hitungan dicocokkan dengan jam dinding. Kalau jam selesai sudah lewat, Keep awake langsung selesai.
- **Penahan dilepas** saat Keep awake dimatikan, waktunya habis, modulnya dimatikan atau dicopot, atau Notching keluar. Proses yang keluar juga membuat macOS melepas penahannya sendiri.
- **Kalau penahan gagal dipasang,** Keep awake tetap mati dan halaman modul menampilkan keadaan mati **(keputusan penulis)**.
- **Keadaan tidak disimpan ke disk.** Notching yang dibuka lagi selalu mulai dengan Keep awake mati.
- **Kemampuan di manifest:** modul ini menyebut kemampuan untuk Keep awake, ditambah `status` dan `notify`. Semua panggilan dari halaman modul lewat gate, sama seperti modul lain.

## 5. Status di samping notch dan di halaman Modul

- Selama Keep awake menyala, modul melaporkan **menyala** (`Activity::On`). Kotaknya di halaman Modul jadi putih. Keep awake tidak memakai titik merah "berjalan".
- **Teks di samping notch (keputusan penulis):**
  - Sisa 1 jam atau lebih: jam dan menit, misalnya "1:42".
  - Sisa kurang dari 1 jam: menit, misalnya "42m". Bentuk "0:42" tidak dipakai karena bisa terbaca 42 detik, seperti hitungan Timer nanti.
  - Tanpa batas: "∞".
  - Menit dibulatkan ke atas, jadi sisa 30 detik tampil "1m".
  - Teks diperbarui per menit, bukan per detik.
  - Di kiri teks ada ikon modul, yaitu cangkir kopi, supaya terlihat modul mana yang sedang berjalan. Ini diminta pemilik saat cek di Mac pada 31 Oktober. Aturan ini berlaku untuk status semua modul (lihat desain 30 Oktober §8).
- Saklar "tampilkan status" per modul yang sudah ada di Pengaturan → Modul → Keep awake tetap berlaku. Kalau saklar dimatikan, kotak tetap putih, tapi teks di samping notch tidak tampil.
- Aturan desain 30 Oktober §8 tetap berlaku. Hanya satu status yang tampil, yaitu yang paling akhir dinyalakan. Status muncul di layar yang ada kursornya, dan disembunyikan sementara saat notifikasi tampil.
- **Celah yang ikut ditutup:** catatan verifikasi rencana 5, temuan kecil ke-6. Sekarang status belum dihitung ulang saat modul dimatikan atau dicopot, dan saat overlay layar baru dibuat. Keep awake adalah modul pertama yang memakai status, jadi celah ini diperbaiki di sini.

## 6. Notifikasi

- Saat waktunya habis, notch menampilkan notifikasi "Keep awake selesai". Keterangannya kira-kira "Mac kembali tidur seperti biasa". Kata-kata pastinya ditentukan pembuat dengan gaya bahasa desain awal bagian 5.
- Saluran notifikasinya bawaan **menyala dan bersuara** **(keputusan penulis)**. Saluran ini bisa diatur di Pengaturan → Notifikasi seperti saluran lain.
- Klik notifikasi membuka halaman Keep awake, sesuai desain 30 Oktober §10.
- Kalau Keep awake dimatikan dengan tangan, tidak ada notifikasi.
- Kalau jam selesai lewat saat Mac tidur, notifikasi tetap dikirim begitu Mac bangun **(keputusan penulis)**.

## 7. Pemasangan

- Keep awake ikut di dalam app sebagai modul bawaan, seperti System stat.
- Di halaman Modul, urutannya setelah System stat.
- Pengguna yang sudah memakai Notching langsung mendapat modul ini dalam keadaan menyala saat app diperbarui. Ini cara yang sama dengan modul bawaan lain.
- Keep awake tidak butuh izin sistem, jadi tidak muncul di halaman Izin.

## 8. Ikon

Ikon Keep awake adalah **cangkir kopi** bergaris. Ikon ini dipakai di kotak halaman Modul, di kotak besar halaman Keep awake, dan di samping notch. Pemilik memintanya saat cek di Mac pada 31 Oktober, menggantikan ikon matahari di mockup.

## 9. Diserahkan ke pembuat

- Nama kemampuan di manifest dan bentuk pesan antara halaman modul dan app inti.
- Ukuran pasti panel dan tombol.
- Cara memanggil power assertion dari Rust.
- Cara memeriksa di Mac bahwa penahan benar-benar terpasang dan dilepas, misalnya `pmset -g assertions`.
