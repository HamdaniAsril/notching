# Desain ulang System stat

Tanggal: 4 November 2026
Status: rancangan visual dari pemilik ide (`~/Pego/notching.pego`, halaman Modules, bingkai "Notching - System Stats"). Pemilik menyetujui dua hal: rincian penyimpanan diambil dari Cleaner, dan grafik pemakaian disk dibuang. Setelah itu pemilik meminta "kerjakan sampai selesai". Semua keputusan lain ditulis sebagai **keputusan penulis** dan dikumpulkan di bagian 8 untuk ditinjau di akhir.

## 1. Kenapa

System stat adalah modul paling tua. Isinya tiga kotak kecil (CPU, memori, jaringan) di kartu 400 × 80. Pemilik sudah menggambar versi baru di Pego: satu kartu besar untuk memantau Mac sekilas, bergaya Volt seperti modul lain.

## 2. Tujuan, bukan tujuan, dan yang harus dihindari

**Tujuan**
- Kartu notch sesuai rancangan Pego dengan tiga baris: grafik dan aplikasi teratas, suhu dan jaringan, lalu penyimpanan.
- Semua angka asli dari Mac, bukan contoh.

**Bukan tujuan**
- Widget System stat untuk halaman. Komponen Pego bernama "Widget/…", tetapi tugas ini hanya kartu notch. **(keputusan penulis)**
- Status di samping notch.
- Grafik pemakaian disk dari hari ke hari. Sudah dibuang bersama pemilik.

**Yang harus dihindari**
- **Kehilangan klaim "CPU 0,0% saat diam".** Tidak ada pencatatan di latar belakang. Data hanya dibaca selama kartu terlihat. Kartu ditutup berarti frame modul dibuang dan pembacaan ikut berhenti.
- **Memindai disk.** System stat tidak pernah menghitung ukuran folder sendiri.

## 3. Isi kartu

Kartu berukuran 760 × 394. **(keputusan penulis)** Batas lebar kartu modul dinaikkan dari 600 menjadi 760 supaya rancangan Pego yang selebar 776 muat. Jendela overlay selebar 960, jadi panel 760 tetap muat. Kepala panel ("‹ Modul", nama modul) tetap milik notch, sama seperti modul lain. Titik "Langsung" dari rancangan tidak dipasang. **(keputusan penulis)**

**Baris atas (tinggi 176)**
- **Beban CPU:** angka besar (Barlow Condensed 48) dengan "%" kecil. Di bawahnya grafik garis 1 menit berwarna lime dengan isian tipis, tiga garis bantu (100, 50, 0), dan titik "sekarang" di ujung kanan. Label kanan "1 mnt".
- **Tekanan memori:** bentuknya sama, garis berwarna kapur (`--v-ink2`). Angkanya adalah tekanan memori macOS: `100 − kern.memorystatus_level`, ukuran yang sama yang dipakai kernel untuk menilai "memori sesak". Ini bukan "memori terpakai". **(keputusan penulis)**
- **Aplikasi teratas:** empat aplikasi dengan CPU terbesar, kolom CPU dan Memori.
  - Proses dikelompokkan per aplikasi, yaitu bundle `.app` paling luar di path-nya. Jadi Chrome dan semua helper-nya menjadi satu baris "Google Chrome". Proses yang tidak berada di dalam `.app`, misalnya `kernel_task` dan `mdworker`, tidak ikut. **(keputusan penulis)**
  - CPU aplikasi ditampilkan sebagai bagian dari seluruh Mac (jumlah CPU proses dibagi jumlah inti), supaya bisa dibandingkan dengan angka Beban CPU. Memori adalah jumlah memori fisik proses-prosesnya. **(keputusan penulis)**
  - Baris pertama ditandai lime (titik dan angka CPU), baris lain abu-abu, sesuai rancangan.

**Grafik "1 mnt"**
- Rust menyimpan pembacaan 60 detik terakhir (CPU dan tekanan memori), tetapi hanya pembacaan yang terjadi saat kartu terbuka. Saat dibuka pertama kali, grafik kosong lalu terisi dari kanan. Kalau kartu dibuka lagi dalam semenit, bagian yang tadi masih tampil. Celah lebih dari 5 detik (sama dengan batas basi di Rust) memutus garis, jadi waktu kartu tertutup tidak digambar sebagai garis lurus. **(keputusan penulis)**

**Baris tengah (tinggi 124)**
- **Suhu:** dua angka °C.
  - Kiri **Chip**: suhu die tertinggi dari sensor `PMU tdie*` (dibaca lewat sysinfo). Mac Apple Silicon M4 tidak punya sensor GPU tersendiri, jadi label "CPU" dan "GPU" dari rancangan diganti. **(keputusan penulis)**
  - Kanan **Baterai** (sensor `gas gauge battery`). Kalau tidak ada baterai, dipakai **SSD** (`NAND`). Kalau keduanya tidak ada, ditampilkan "—". **(keputusan penulis)**
  - Label kanan atas memakai penilaian macOS sendiri (`NSProcessInfo.thermalState`): Normal, Hangat, Panas, Kritis.
- **Jaringan:** Unggah dan Unduh dalam angka besar, misalnya "2,4" dengan satuan "MB/s" kecil. Loopback tidak dihitung, sama seperti sekarang. Label kanan atas dikosongkan. "Wi-Fi" dari rancangan butuh SystemConfiguration hanya untuk satu kata. **(keputusan penulis)**

**Baris bawah: penyimpanan (tinggi 92)**
- Kiri: terpakai dalam angka besar, misalnya "312" dengan "dari 512 GB". Angkanya diambil dari volume `/` dengan cara yang sama seperti Cleaner (kapasitas dan ruang kosong untuk pemakaian penting, versi Finder), dalam satuan desimal seperti Cleaner.
- Kanan: bar bersegmen dan legenda dari hasil terakhir yang diukur Cleaner selama app menyala: App (lime), Dokumen (kapur), Foto (redup), Lainnya (samar, termasuk "bisa dibersihkan"), lalu sisa kosong.
  - Kalau Cleaner belum mengukur sejak app menyala, bar hanya berisi Terpakai dan Kosong, dengan keterangan "Buka Cleaner untuk rinciannya". Kartu tidak membuka Cleaner sendiri, karena modul belum bisa membuka modul lain. **(keputusan penulis)**
  - Kotak "Pemakaian" dibuang (disetujui pemilik), jadi bar mendapat lebar penuh.

## 4. Ringan

- Sama seperti sekarang: dibaca sekali, lalu 1,5 detik setelah setiap jawaban, dan hanya selama frame modul hidup.
- Daftar proses (sekitar 20 ms) dibaca setiap kali. Sensor suhu (sekitar 45 ms) dan penyimpanan dibaca paling sering setiap 5 detik. Di antara itu dipakai nilai terakhir. **(keputusan penulis)**
- Saat kartu tertutup tidak ada timer, thread, atau sensor yang aktif.

## 5. Data dari Rust

`system.stats` / `read` tetap satu panggilan. Isinya ditambah, field lama tidak dibuang:

```
cpu, memUsed, memTotal, rx, tx            // seperti sebelumnya
pressure: number | null                   // 0–100
history: { ago, cpu, pressure }[]         // detik sejak pembacaan, terlama dulu
apps: { name, cpu, mem }[]                // maks. 4, CPU terbesar dulu
temps: { chip: number|null, other: number|null, otherKind: 'battery'|'ssd'|null,
         state: 'nominal'|'fair'|'serious'|'critical' }
disk: { total, free, parts: { apps, documents, photos, cleanable } | null }
```

Cleaner menyimpan hasil `cleaner_parts` terakhirnya di memori, dan `system.stats` membacanya dari sana.

## 6. Bahasa

Indonesia dan Inggris, mengikuti app. Nama modul tetap "System stat" dan nama pendek "Sistem". Deskripsi berubah menjadi "CPU, memori, suhu, jaringan, disk".

## 7. Test

- Rust: pengelompokan aplikasi, pemilihan sensor, pemotongan riwayat 60 detik, tekanan dari level, dan batas lebar kartu yang baru.
- TypeScript: susunan kartu, format angka, grafik dan pemutusan celah, aplikasi teratas, suhu "—", penyimpanan dengan dan tanpa hasil Cleaner, serta polling yang tetap sekali jalan.
- Pemeriksaan di browser (`?notch=1`) dan di app asli. Untuk CPU 0,0% saat diam, diukur dengan `ps` setelah kartu ditutup.

## 8. Daftar keputusan penulis (untuk ditinjau)

1. Hanya kartu notch, tanpa widget halaman.
2. Lebar kartu 760, dan batas lebar kartu modul dinaikkan ke 760.
3. Titik "Langsung" di kepala tidak dipasang.
4. Tekanan memori = 100 − `kern.memorystatus_level`.
5. Aplikasi teratas dikelompokkan per `.app` paling luar. Proses sistem di luar `.app` tidak ikut.
6. CPU aplikasi dihitung sebagai bagian dari seluruh Mac.
7. Grafik hanya berisi pembacaan saat kartu terbuka, dan celah memutus garis.
8. Suhu: Chip dan Baterai (atau SSD), bukan CPU dan GPU.
9. Label "Wi-Fi" di jaringan dikosongkan.
10. Kartu tidak membuka Cleaner; hanya ada keterangan "Buka Cleaner untuk rinciannya".
11. Suhu dan penyimpanan dibaca paling sering setiap 5 detik.
