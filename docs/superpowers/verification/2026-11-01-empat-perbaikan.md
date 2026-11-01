# Verifikasi empat perbaikan kecil

Tanggal: 1 November 2026
Perangkat: MacBook Air M4, dengan layar bawaan ber-notch.
Cara cek: build rilis dari cabang `fix/empat-perbaikan` (commit `3cd399b`) dijalankan langsung dari folder build. Log app dicatat ke file. Notching di `/Applications` ditutup dulu dengan cara biasa pukul 22.04, atas izin pemilik. Izin Perekaman Layar diberikan ulang ke versi uji oleh pemilik.

Permintaan pemilik:
1. Editor screenshot langsung memakai setelan yang terakhir dipakai.
2. Pilihan kota dan waktu sholat pindah ke Umum.
3. Halaman Modul 4 kolom, selalu rata tengah, ukuran panel menyesuaikan.
4. Titipan punya tombol kembali.

## Test otomatis

- `npx tsc --noEmit`: lulus.
- `npm test`: 732 lulus (718 di awal).
- `cargo test --lib`: 379 lulus, 1 diabaikan (tidak ada perubahan Rust).

## Cek di browser (`npm run dev`)

- Halaman Modul: 8 kotak 76 × 64 dalam 2 baris berisi 4. Dengan 7 kotak, baris kedua berisi 3 kotak di tengah.
- Kepala Titipan dengan "‹ Modul", jumlah, petunjuk, dan Kosongkan muat dalam satu baris (484 px).
- Pengaturan → Umum menampilkan "Kota & waktu sholat" di bawah Bahasa, Layar, dan Login.
- Editor: Panah, biru, tipis tetap terpilih setelah halaman dimuat ulang.

## Checklist di Mac

| # | Cek | Hasil | Catatan |
|---|---|---|---|
| 1 | Halaman Modul 4 × 2, rata tengah | Dilaporkan pemilik | Tidak meninggalkan jejak di file. |
| 2 | Titipan punya "‹ Modul" yang kembali ke halaman Modul | Dilaporkan pemilik | Tidak meninggalkan jejak di file. |
| 3 | Kota & waktu sholat ada di Umum, tidak lagi di Halaman | Dilaporkan pemilik | Hanya dilihat; `settings.json` tidak berubah sejak 21.58, sesuai karena tidak ada yang diubah. |
| 4 | Screenshot baru memakai Sudut, Jarak, dan Background terakhir | Lulus | Screenshot 17 diberi gradasi `#F7971E → #FFD200` dan Jarak 160. Screenshot 18 (diambil 22.07.12, disimpan 22.07.18), 19, dan 20 terbuka dengan gradasi dan Jarak yang sama. |
| 5 | Background gambar tidak diingat | Lulus | Screenshot 16 memakai wallpaper. Penyimpanan editor hanya menyimpan gradasi yang dipilih sesudahnya, tanpa gambar. |
| 6 | Alat, warna, dan tebal garis diingat | Lulus | Di screenshot 17 (22.09.42) dipilih Panah, biru, tebal. Screenshot baru 20 (diambil 22.09.46, disimpan 22.10.01) berisi panah `#2F80ED` setebal 14. Penyimpanan editor: `{"tool":"arrow","color":3,"width":2,…}`. |
| 7 | Screenshot lama tetap dengan setelannya sendiri | Lulus | Screenshot 8 (dari 17.22) dibuka lagi pukul 22.10.34. `edits.json`-nya tetap background wallpaper dengan coretannya sendiri, bukan gradasi. |

Percobaan pertama (22.06–22.08) belum menguji nomor 6 dan 7, karena alat tetap Coretan, merah, sedang (sama dengan bawaan), dan belum ada screenshot lama yang dibuka. Keduanya dicoba ulang atas permintaan, pukul 22.09–22.10.

## Bukti

- Log app: `notching: screenshot 15 … 20 taken`, tanpa galat.
- Penyimpanan editor: `~/Library/WebKit/id.web.notching/WebsiteData/Default/…/LocalStorage/localstorage.sqlite3`, kunci `notching.editor`.
- Suntingan: `~/Library/Application Support/id.web.notching/screenshots/<nomor>/edits.json`.

## Tambahan: tiga perbaikan Cleaner (2 November 2026)

Ditemukan pemilik setelah versi baru dipasang di `/Applications`. Dikerjakan di cabang `fix/cleaner-fda`.

| # | Masalah | Penyebab | Perbaikan | Hasil |
|---|---|---|---|---|
| 1 | Full Disk Access sudah diberi, tapi Cleaner tetap bilang belum | Cleaner mengecek dengan membuka `~/Library/Application Support/com.apple.TCC`. Folder ini tidak ada sama sekali di macOS 27.0.1 (26A434), jadi hasilnya selalu "belum". Tidak ketahuan saat cek Cleaner karena mode coba melewati pengecekan ini. | `b6571fc`: cukup salah satu folder terkunci yang bisa dibuka: `/Library/Application Support/com.apple.TCC` (selalu ada, menolak tanpa izin), folder TCC di home, `~/Library/Safari`, atau `~/Library/Mail`. | Lulus. Daftar izin sistem berubah 22.34.06, Notching dibuka ulang 22.34.11, dan pemilik melaporkan izinnya terbaca. |
| 2 | Setelah selesai menghitung, tombol Deep clean dan Clean uninstall terpotong di bawah | Tinggi halaman awal dipatok 188 px. Dengan ukuran asli, keterangan warna memanjang jadi 2 baris (+11 px). Ini ditiru di browser: 185 → 196 px. | `3665047`: halaman awal mengukur tingginya sendiri setelah digambar (juga lewat ResizeObserver), dan panel mengambil yang lebih besar antara 188 px dan tinggi itu. | Dilaporkan pemilik ("Semua beres"). |
| 3 | Cleaner belum punya tombol kembali ke halaman Modul | Belum ada. | `c99e0ae`: "‹ Modul" di kiri atas halaman awal, sama seperti Titipan. | Dilaporkan pemilik. |

Test: `npm test` 735 lulus, `cargo test --lib` 382 lulus, 1 diabaikan. Versi `c99e0ae` terpasang di `/Applications` pukul 06.33. Izin diberikan ulang pukul 06.34.06, dan app dibuka ulang 06.34.11.
