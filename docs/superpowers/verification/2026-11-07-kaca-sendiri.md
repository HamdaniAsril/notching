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
