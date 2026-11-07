# Verifikasi: kaca buatan Notching

Desain: `docs/superpowers/specs/2026-11-07-kaca-sendiri-design.md`. Rencana: `docs/superpowers/plans/2026-11-07-kaca-sendiri.md`.

## Cek 1: tanda rekaman layar dan lama memotret (7 November 2026)

Build uji dari commit `d4a8bb2` (potret saja, kaca belum digambar), dijalankan lewat `open -n`, log di folder sementara sesi. Pemilik memberi izin Kontrol Perangkat dan Akses Data serta Rekaman Layar & Audio Sistem ke build uji. Bahan Liquid glass, macOS 27.0.1, layar 1470 × 956 pt @2x.

| Yang dicoba | Hasil | Lulus? |
|---|---|---|
| Menyorot ikon Dock dengan Liquid glass (8 kartu yang memotret) | log: `glass picture 2940x1912 px in` 74, 59, 48, 54, 53, 48, 50, 49 ms. Median 51,5 ms, terlama 74 ms, semua jauh di bawah jeda kartu 350 ms. | Lulus |
| Kartu app tanpa jendela dengan Pekat | log: `peek card shown for pid 18618 (0 windows)` tanpa baris `glass picture`: Pekat tidak memotret. | Lulus |
| Tanda rekaman layar dengan Liquid glass | Pemilik: ikon rekam layar ungu muncul di bar menu. | — |
| Tanda rekaman layar dengan Pekat, kartu yang menampilkan gambar jendela | Pemilik: "Ya, muncul juga". Log: dua kali `peek card shown for pid 704 (1 windows)` tanpa baris `glass picture`, jadi ikon itu datang dari gambar jendela yang sudah ada, bukan dari potret layar. | Lulus |
| Kembali ke Liquid glass | log: `glass picture … in 49 ms`, lalu `Liquid Glass under peek at strength 0.3` (kaca lama, kaca baru belum digambar). | Lulus |

Kesimpulan: memotret satu layar penuh tidak menambah tanda rekaman layar yang baru atau berbeda dibanding gambar jendela sekarang (syarat desain bagian 7, langkah 0). Pekerjaan lanjut ke Tugas 4.

## Cek 2: kaca kartu di Mac (7 November 2026)

Build uji dari commit `6e54dda` (kaca kartu tergambar; pengalih belum), dijalankan lewat `open -n`, log di folder sementara sesi. Pemilik memberi ulang izin ke build uji. Pengaturan: kartu Terang, bahan Liquid glass, pengalih per app di tengah. Angka kaca: angka pemilik dari prototipe, tanpa `NOTCHING_GLASS_LOOK`.

| Yang dicoba | Hasil | Lulus? |
|---|---|---|
| Kaca kartu Dock | log: 72 kali `glass drawn in`, median 4 ms, terlama 57 ms; potret 32–45 ms; kernel siap sekitar 1 detik setelah app dibuka. | Lulus |
| Kaca pengalih | log: `Liquid Glass under switcher at strength 0.3`: masih kaca macOS, karena Tugas 7 belum dibangun. | Belum |

Revisi pemilik sesudah cek ini:
1. Huruf judul Intip diganti. Pemilik memilih "Judul Intip saja": judul kartu dan jumlah di pengalih memakai Inter; angka di notch tetap.
2. Pengalih belum memakai kaca buatan Notching: dikerjakan di Tugas 7.
3. Kartu gelap seharusnya membuat pengalih gelap juga. Keduanya sudah memakai pilihan warna yang sama. Dugaan: pengalih tampak terang karena kaca macOS yang tipis dengan warna 12%. Dicek lagi setelah pengalih memakai kaca sendiri.
4. Keterangan di bawah gambar dalam mode gelap dibuat lebih terang.
5. Tombol minimize, tutup, dan keluar memakai warna Mac. Keluar berwarna ungu.

## Cek 3: seluruh kaca di Mac (7 November 2026)

Build uji dari commit `a0579a3`: Tugas 7, judul pengalih yang terang, dan perbaikan dari tinjauan akhir. Perbaikan itu: kaca dihitung pada nilai layar sendiri, bukan cahaya linear; kaca dipanaskan saat app dibuka; Dock dipotret ulang setelah tenang; semua panel Notching tidak ikut terpotret. Build dijalankan lewat `open -n`, log di folder sementara sesi. Pemilik memberi ulang izin. Angka kaca: angka pemilik, tanpa `NOTCHING_GLASS_LOOK`. Pemilik mencoba semua butir kecuali monitor kedua (tidak ada) dan menjawab "semuanya aman". Jawabannya dicocokkan dengan log dan pengaturan.

| Yang dicoba | Bukti | Lulus? |
|---|---|---|
| Kaca dipanaskan saat app dibuka | log: `glass kernels ready in 48 ms`, gambar pertama 57 ms terjadi saat pemanasan, lalu `glass warmed in 101 ms`. | Lulus |
| Lama menggambar sesudahnya | 164 gambar: median 4 ms, p90 9 ms, terlama 29 ms (cek 2: terlama 57 ms, pada pemakaian pertama). | Lulus |
| Lama memotret | kartu 26–79 ms, pengalih 32–58 ms, jauh di bawah jeda kartu 350 ms dan jeda pengalih 140 ms. | Lulus |
| Tampilan kaca, Terang dan Gelap, dibanding prototipe | Pemilik: aman. | Lulus |
| Judul pengalih terbaca di kartu Gelap | Pemilik: aman. | Lulus |
| Mengintip jendela: kaca ikut gelap, jendela di tempatnya | Pemilik: aman. | Lulus |
| Tombol tutup dan minimize di kartu: kaca menyusul | log: `peek button Close`, `peek button Minimize`, masing-masing diikuti `glass picture … (Card)` setelah kartu tampil lagi. | Lulus |
| Pindah antar-ikon dan Dock yang tenang | log: potret ulang di kartu yang sama setelah kartu pindah ikon. Pemilik: aman. | Lulus |
| Pengalih di tengah dan di notch | log: `switcher shown` dengan potret Switcher sebelumnya, tanpa `Liquid Glass under switcher`. Pengaturan sekarang: posisi `notch`, susunan `apps`. Pemilik: aman. | Lulus |
| ⌘Tab cepat | log: beberapa potret Switcher tanpa `switcher shown`: dilepas sebelum tampil, tidak ada yang berkedip (pemilik). | Lulus |
| M/W/Q di pengalih | Pemilik: aman. Log tidak mencatat tombol pengalih tersendiri. | Lulus (laporan pemilik) |
| Kurangi transparansi | log: `Liquid Glass under switcher at strength 0.3` dan `Liquid Glass under peek at strength 0.3`, lalu kartu tampil berkali-kali tanpa potret; potret kembali setelah dimatikan. `reduceTransparency` sekarang 0. | Lulus |
| Ikon rekam layar ungu di bar menu | Pemilik: sama seperti cek 1, tidak ada tanda baru. | Lulus |
| Monitor kedua | Tidak dicoba: tidak ada monitor kedua. | Belum dicek |
| Tanpa Rekaman Layar | Tidak dicoba di build ini. `begin` dan `retake` memeriksa izin lebih dulu, jadi tidak ada yang meminta izin (tinjauan akhir). | Belum dicek di Mac |

### CPU saat diam

Diukur dengan waktu CPU `notching` (`ps -o time`) selama satu menit tanpa sentuhan mouse dan keyboard (`HIDIdleTime`). Panel-panel dicek dengan `sample` untuk melihat apakah display link WebKit menyala.

| Pengukuran | Hasil |
|---|---|
| Sesi uji pertama, sekitar 1 jam pemakaian, Jaga terjaga menyala | 0,36 detik dalam semenit (0,6%). `sample`: display link WebKit di proses UI menyala terus, sementara proses WebContent diam. |
| Sesi yang sama, Jaga terjaga dimatikan | 0,30 detik dalam semenit (0,5%), display link masih menyala. Jadi bukan Jaga terjaga. |
| Build yang sama dibuka ulang, belum dipakai | waktu CPU tidak bertambah, display link mati. |
| Sesudah kartu Dock, ⌘Tab, dan mengintip | 0,02 detik dalam 30 detik (0,07%, sebatas ketelitian `ps`), display link mati. |
| Sesudah Pengaturan (ganti warna kartu), Kurangi transparansi nyala-mati, dan kartu dengan kaca macOS | Display link menyala hanya selama dipakai, lalu mati. 0,02 detik dalam 30 detik (0,07%). |

Kesimpulan: kaca buatan Notching tidak meninggalkan beban saat diam. Pada sesi pertama, ada satu langkah yang membuat display link WebKit terus menyala sampai app ditutup, dengan beban 0,5–0,6%. Langkah itu belum ditemukan. Dua putaran percobaan, yaitu kartu, ⌘Tab, mengintip, Pengaturan, Kurangi transparansi, dan Jaga terjaga, tidak bisa memunculkannya lagi. Tidak diketahui apakah ini sudah ada sebelum pekerjaan kaca. Lihat bagian "Untuk nanti".

## Untuk nanti

- **Display link yang menyala terus** (lihat CPU di atas): cari langkah pemicunya dengan pengamat (`sample` + log) selama pemakaian biasa, termasuk di Notching terpasang yang belum punya kaca sendiri.
- **Belum dicek di Mac:** monitor kedua dengan skala lain, dan keadaan tanpa izin Rekaman Layar.
- **Minor dari tinjauan akhir yang ditunda**: daftarnya ada di laporan akhir sesi (ledger).
