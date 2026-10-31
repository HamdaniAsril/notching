# Desain modul Cermin

Status: pemilik meminta langsung dibangun untuk dicoba setelah melihat mockup versi 6 (31 Oktober 2026). Rencana terpisah tidak dibuat.

Mockup ada di `.superpowers/brainstorm/84456-1793453460/content/`. Yang dipilih adalah `cermin-v6.html`. File `cermin.html` sampai `cermin-v5.html` adalah langkah-langkah sebelumnya.

## 1. Kenapa

Pemilik ingin mengecek kamera sebelum meeting online. Membuka app kamera terpisah terasa terlalu jauh.

## 2. Tujuan, bukan tujuan, dan yang harus dihindari

**Tujuan**
- Kotak **Cermin** di halaman Modul membuka halaman Cermin. Halaman ini menampilkan kamera yang dibalik seperti cermin.
- **Zoom** diatur dengan penggaris garis-garis oranye, dengan konsep yang sama seperti Timer.
- Tombol **Flip** menampilkan gambar tanpa dibalik, yaitu seperti yang dilihat peserta meeting.
- Tombol **Lampu** berfungsi sebagai ring light darurat.
- **Pilihan kamera** hanya tampil kalau ada lebih dari satu kamera.

**Bukan tujuan** (pemilik menolak usulan ini): cek cahaya, garis bantu posisi, level mic.

**Yang harus dihindari**
- **Kamera yang tetap menyala** setelah panel ditutup atau setelah pindah halaman.
- **Kecerahan layar yang tertinggal di maksimal** setelah Lampu mati, panel ditutup, modul dimatikan, atau Notching keluar.

## 3. Halaman Cermin

- Halaman ini memakai bar "‹ Modul" seperti modul lain. Ukuran kartunya **600 × 400**. Itu sebabnya batas tinggi kartu di manifest naik dari 240 ke 420, dan area notch membesar dari 640 × 360 menjadi 960 × 560 **(keputusan penulis)**.
- **Tampilan kamera** mengisi sisa tinggi, dengan sudut membulat. Label kecil di pojok kiri bawah berbunyi "Cermin" atau "Flip".
- **Penggaris zoom** berjangkauan 1.0× sampai 3.0×. Satu garis berarti 0.1×, garisnya lebih panjang setiap 0.5×, dan ada angka setiap 1×. Angka zoom ditampilkan di kanan penggaris. Zoom selalu mulai dari 1.0× **(keputusan penulis)**.
- **Baris bawah** berisi "● Kamera nyala" di kiri. Di kanan ada tombol pilihan kamera (kalau kameranya lebih dari satu), **Flip**, dan **Lampu**.
- **Kalau kamera tidak bisa dibuka,** misalnya karena izin ditolak, tampilan kamera menunjukkan pesan singkat.

## 4. Lampu

- **Saat dinyalakan:**
  - Panel melebar 130 px ke kiri dan ke kanan.
  - Bagian tengah panel berwarna putih. Sisi kiri dan kanannya berwarna sesuai suhu cahaya.
  - Glow tipis dengan kontras tinggi keluar dari kiri, kanan, dan bawah panel.
  - Kecerahan layar naik ke maksimal.
- **Penggaris warna cahaya** muncul di bawah penggaris zoom. Jangkauannya dari dingin 6500K di kiri ke hangat 2700K di kanan, satu garis 100K, dengan nilai awal 4500K. Garis-garisnya diwarnai sesuai suhunya. Supaya tinggi panel tidak berubah, tampilan kamera memendek setinggi penggaris itu **(keputusan penulis; di mockup panelnya ikut memanjang)**.
- **Saat dimatikan, saat panel ditutup, atau saat pindah halaman:** panel kembali ke ukuran semula, dan kecerahan kembali ke nilai sebelum Lampu dinyalakan.
- **Kecerahan** diatur lewat fungsi sistem macOS yang tidak resmi (DisplayServices), hanya untuk layar bawaan. Kalau fungsi itu tidak ada, misalnya pada monitor eksternal, Lampu tetap menyala tetapi tanpa menaikkan kecerahan.
- **Kalau Notching keluar** saat Lampu menyala, kecerahan dikembalikan ke nilai semula.

## 5. Cara kerja

- **Kamera** dibuka oleh halaman modul lewat `getUserMedia`. Frame modul yang izinnya mencantumkan `camera` diberi `allow="camera"`. Notching mencantumkan alasan pemakaian kamera di Info.plist, jadi macOS menanyakan izin saat Cermin pertama kali dibuka.
- **Kemampuan baru `lamp`** punya dua method: `on` (simpan kecerahan lalu naikkan ke maksimal) dan `off` (kembalikan kecerahan). Notch menampilkan efek Lampu hanya kalau panggilan `on` diterima gate. Kalau frame Cermin ditutup saat Lampu menyala, notch sendiri yang memanggil `off`.
- **Pesan frame baru `notching:lamp`** berisi `{ on, color }` dan dikirim dari modul ke notch.

## 6. Diserahkan ke pembuat

Ikon, kata-kata pasti, dan ukuran-ukuran kecil.
