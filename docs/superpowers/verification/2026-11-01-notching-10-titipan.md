# Verifikasi Titipan

Tanggal: 1 November 2026
Perangkat: MacBook Air M4, dengan layar bawaan ber-notch.
Cara cek: build rilis dari cabang `feat/titipan` dijalankan langsung dari folder build, dengan log dicatat ke file. Notching di `/Applications` ditutup dulu dengan cara biasa, atas izin pemilik.

Desain: `docs/superpowers/specs/2026-11-01-titipan-design.md`. Rencana: `docs/superpowers/plans/2026-11-01-notching-10-titipan.md`.

## Test otomatis

- `npx tsc --noEmit`: lulus.
- `npm test`: 443 lulus (410 di awal).
- `cargo test`: 248 lulus, 1 diabaikan (220 di awal).

## Data

- Salinan data sebelum cek ada di `~/Library/Application Support/id.web.notching/before-titipan/`.
- Modul `shelf` terpasang sendiri di folder modul dalam keadaan menyala.
- Ukuran `Notching.app` (rilis): 5,41 MiB.
- File contoh ada di `~/titipan-cek/asal`: PDF, foto, teks, folder `Desain` berisi subfolder, dan `besar.bin` 200 MB. Checksum semua file asli dicatat sebelum cek.

## Checklist di Mac

| # | Cek | Hasil | Catatan |
|---|---|---|---|
| 1 | Seret file dari Finder ke notch. Area "Lepas untuk menitipkan" muncul. File dilepas, lalu masuk laci. | Lulus | Log 03.13: `shelf kept 1 new item(s)`. |
| 2 | Banyak file dan folder sekaligus, serta titipan ganda. | Dilaporkan pemilik | Pemilik melapor "sudah cek semua normal". Tidak ada jejak di log atau di disk. Log baru dipasang setelah putaran pertama. |
| 3 | Tarik titipan ke folder Finder di disk yang sama. Hasilnya salinan, file asli tetap ada, dan titipan hilang dari laci. | Lulus | Log: `shelf drag of 1 item(s) ended, operation 1, kept: false`. Operation 1 adalah Copy. `tujuan/foto-01.jpg` punya SHA-1 `de8082ba…` yang sama dengan aslinya. Semua file di `asal` tidak berubah. Pindah Space saat menarik tidak tercatat. |
| 4 | Tarik folder keluar. | Dilaporkan pemilik | Tidak ada salinan folder di disk. |
| 5 | Seret file melewati notch tanpa melepasnya. | Dilaporkan pemilik | Tidak meninggalkan jejak di file, jadi hanya berdasarkan laporan pemilik. |
| 6 | Gambar kecil screenshot dan file dari Mail atau Foto. | Belum terbukti | Folder `~/Library/Caches/id.web.notching/titipan/` tidak pernah terisi, dan log tidak mencatat titipan lain. |
| 7 | File asli dipindah saat dititipkan, sehingga laci menampilkan "Tidak ditemukan". | Dilaporkan pemilik | |
| 8 | Beberapa status berjajar dengan garis titik-titik. | Dilaporkan pemilik | Tampilan sudah dicek di browser dan dengan test. |
| 9 | Monitor luar tanpa notch. | Dilaporkan pemilik | Tidak tercatat apakah monitor luar tersambung. |
| 10 | Notching keluar, lalu folder cache Titipan kosong. | Belum teruji | Setelah dua kali keluar, `~/Library/Caches/id.web.notching/` memang tidak berisi folder `titipan`. Tapi folder itu tidak pernah terisi (cek 6), jadi pembersihannya belum benar-benar dicoba. Pembersihan ini punya test otomatis (`empty_cache_dir_removes_only_titipan`). |

## Temuan saat cek di Mac

- **Laci kosong terlalu tipis** (pemilik). Sekarang laci kosong setinggi satu baris titipan (84 px) dan diberi garis putus-putus.
- **"Sudah dicoba" tanpa jejak di disk.** Setelah putaran pertama, folder tujuan masih kosong dan tidak ada salinan di bagian mana pun di folder rumah. Karena itu log untuk titipan dan tarikan keluar ditambahkan. Uji singkat sesudahnya meninggalkan bukti di log dan di disk (cek 1 dan 3).

## Temuan pemeriksa kode

Pemeriksa kode tidak menemukan masalah kritis. Empat masalah penting sudah diperbaiki, masing-masing dengan test:
- panel tidak lagi berkedip atau kehilangan file saat file diseret ke laci yang sudah tinggi;
- pembaruan laci dikumpulkan, dan pratinjau tidak lagi dibuat di tengah proses melepas file;
- sumber tarikan disimpan sampai tarikan berikutnya;
- file yang hilang dicek lagi sebelum ditarik.

Masalah kecil yang ditunda untuk pemilik:
- file di folder sementara bisa dititipkan dua kali;
- notifikasi yang sedang tampil bisa menimpa area untuk melepas file;
- dua poll bisa berjalan bersamaan;
- melepas file di layar B saat layar A sedang menunggu file;
- modul dimatikan di tengah proses melepas file;
- jendela Pengaturan menerima tarikan keluar, sehingga titipan hilang tanpa salinan, walaupun file aslinya aman;
- pemeriksaan file di jalur utama, yang bisa lambat untuk volume jaringan.

## Keputusan pembuat

- Laci digambar notch sendiri, bukan halaman modul di frame, karena seret-lepas membutuhkan jendela notch. Modul `shelf` tetap ada untuk kotak di halaman Modul, status, dan saklar di Pengaturan.
- File yang hanya "dijanjikan" sumbernya, dan file di folder sementara sistem, diterima ke folder cache Titipan. Ini belum ditanyakan ke pemilik (desain §6).
- Titipan hilang setelah tujuan menerimanya, tanpa memastikan salinannya jadi. Ini juga belum ditanyakan ke pemilik (desain §5).
- Nama file dipotong di tengah sampai 12 karakter. Sebelumnya 14 karakter, dan itu melebihi lebar kotak.
