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
