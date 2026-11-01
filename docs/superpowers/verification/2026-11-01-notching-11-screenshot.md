# Verifikasi modul Screenshot

Tanggal: 1 November 2026
Perangkat: MacBook Air M4, dengan layar bawaan ber-notch.

Cara cek:
- Notching di `/Applications` ditutup dulu dengan cara biasa, atas izin pemilik.
- Build rilis dari cabang `feat/screenshot` dijalankan langsung dari folder build lewat `open`, dengan log dicatat ke file.
- Setiap laporan pemilik dicocokkan dengan folder `~/Library/Application Support/id.web.notching/screenshots/`, Desktop, isi clipboard (`osascript -e 'clipboard info'`), dan log.

Desain: `docs/superpowers/specs/2026-11-01-screenshot-design.md`. Rencana: `docs/superpowers/plans/2026-11-01-notching-11-screenshot.md`.

## Test otomatis

- `npx tsc --noEmit`: lulus.
- `npm test`: 662 lulus (443 di awal).
- `cargo test`: 311 lulus, 1 diabaikan (248 di awal).
- `cargo build --release`: tanpa peringatan.

## Data

- Salinan data sebelum cek ada di `~/Library/Application Support/id.web.notching/before-screenshot/`.
- Modul `screenshot` terpasang sendiri di folder modul dalam keadaan menyala.
- Ukuran `Notching.app` (rilis): 5,70 MiB.
- Sebelum cek, tombol bawaan Mac untuk Cmd+Shift+3 dan 4 (`com.apple.symbolichotkeys` 28 dan 30) masih menyala.

## Checklist di Mac

| # | Cek | Hasil | Catatan |
|---|---|---|---|
| 1 | Saat Notching dibuka, muncul notifikasi bahwa tombol masih dipakai Mac. | Dilaporkan pemilik | Pemilik: "muncul". Notifikasi tidak meninggalkan jejak di disk. |
| 2 | Izin Perekaman Layar diminta, lalu screenshot berhasil setelah izin diberikan. | Lulus setelah perbaikan | Lihat temuan 1 dan 2. Log: `screenshot 1 taken, 2940×1718`. |
| 3 | Window dari halaman Screenshot: gambar masuk clipboard, notch menampilkan hasil. | Lulus | `index.json` item 1 jenis `window`, 2940 × 1718 piksel (Retina penuh). Pemilik: "sempurna". |
| 4 | Editor: kotak, sensor, lingkaran, panah, coretan, teks, background wallpaper, Jarak. Salin dari editor. | Lulus | `2/edits.json` berisi `rect, sensor, ellipse, arrow, pen, text`, background `image` dari `wallpaper`, padding 160. Isi clipboard PNG 2.241.743 byte, sama persis dengan `2/edited.png`. |
| 5 | Simpan dari halaman daftar ke Desktop. | Lulus | `~/Desktop/Screenshot 2026-11-01 15.19.44.png` berukuran 576.823 byte, sama dengan `1/original.png`. Item 1 tercatat `saved`. |
| 6 | Tombol Layar. | Lulus | Item 3 jenis `screen`, 2940 × 1912 piksel. |
| 7 | Seret gambar dari notch ke WhatsApp. | Lulus | Log: `screenshot drag of 1 item(s) ended, operation 1, kept: true`. Operation 1 adalah Copy. Pemilik menyeret ke WhatsApp, jadi tidak ada salinan di disk. Salinan sumbernya ada di `~/Library/Caches/id.web.notching/shot-drag/0/Screenshot 2026-11-01 15.24.43.png`. |
| 8 | Tombol bawaan Mac dimatikan, lalu Cmd+Shift+3. | Lulus | Hotkey 28 dan 30 sekarang `enabled: false`. Item 4 jenis `screen`, 2940 × 1912 piksel. |
| 9 | Cmd+Shift+4: klik window. | Lulus | Item 5 jenis `window`, 2940 × 1718 piksel. |
| 10 | Cmd+Shift+4: tarik area. | Lulus | Item 6 jenis `area`, 814 × 720 piksel. |
| 11 | Esc saat memilih. | Dilaporkan pemilik | Pembatalan tidak meninggalkan jejak. Tidak ada item kosong di daftar. |
| 12 | Hapus, membuka editor lagi untuk melanjutkan coretan, warna sendiri, Pilih file…, Cmd+Q dari menu saat editor terbuka, monitor luar. | Belum dicoba | Tidak ada di putaran cek ini. |

## Temuan saat cek di Mac

1. **Screenshot tidak pernah tersimpan dan tidak ada yang memberi tahu.**
   - Log menulis `screencapture: cannot write file to intended destination, …/screenshots/.take-0.png`.
   - `screencapture` menolak nama file yang diawali titik, tapi tetap keluar dengan kode 0. Masalah ini sudah dikenal di forum pengembang Apple.
   - Diperbaiki: nama file sementara sekarang `take-N.png` (test `capture_file_name_has_no_leading_dot`).
   - Screenshot yang gagal sekarang memunculkan notifikasi "Screenshot gagal diambil" (test `notices_are_in_the_module_locales`).
2. **Izin Perekaman Layar untuk build tes.**
   - Build tes hanya ditandatangani ad hoc. macOS menganggap setiap build sebagai app yang berbeda, jadi saklar Notching yang menyala di Pengaturan tidak berlaku untuk build baru.
   - "Keluar & Buka Lagi" membuka Notching di `/Applications`, bukan build tes. Restart Mac juga membuka versi itu.
   - Cara yang berhasil:
     1. Hapus entri Notching di Perekaman Layar.
     2. Tambahkan build tes lewat Finder.
     3. Tutup Notching lama, lalu buka build tes.
   - Versi yang ditandatangani resmi tidak akan mengalami ini.

## Temuan pemeriksa kode

Setiap langkah rencana diperiksa terpisah, lalu seluruh cabang diperiksa sekali lagi. Masalah yang sudah diperbaiki, masing-masing dengan test:
- penyimpanan yang gagal tidak lagi membuang screenshot terlama;
- notifikasi tombol membedakan "dipakai Mac" dan "dipakai app lain";
- Esc menutup pemilih walaupun halamannya bermasalah;
- Simpan atau Salin yang gagal terlihat di tombolnya, dan jendela editor tidak menutup;
- hasil edit tidak hilang saat Cmd+Q, termasuk Cmd+Q di menu app dan saat Keyboard Cleaning Mode menyala;
- pengatur waktu tutup editor tidak lagi bisa menutup jendela yang lebih baru;
- garis dan panah lurus bisa dimiringkan;
- editor tetap lancar pada screenshot besar;
- hasil screenshot tidak lagi terbuka di semua layar, dan pemilih tidak lagi memakai daftar window layar lain;
- notifikasi tombol saat Notching dibuka menunggu notch siap;
- file seret keluar tidak lagi dihapus oleh tarikan berikutnya.

Masalah kecil yang ditunda (daftar lengkap ada di catatan pembuatan):
- halaman daftar dan Pengaturan tidak memperbarui keterangan tombol selama halaman terbuka;
- dua tombol "Buka Pengaturan Sistem" yang sama di halaman Izin kalau kedua izin dibutuhkan;
- background gambar disimpan di riwayat undo, sehingga data suntingan bisa besar (di cek ini 908 KB);
- folder screenshot tanpa entri di indeks tidak dibersihkan;
- menu Window tidak lagi menampilkan daftar jendela, dan menu Help hilang.

## Keputusan pembuat

- Hapus di halaman daftar tidak menutup notch. Hapus di notch hasil menutup notch.
- Simpan atau Salin yang gagal menampilkan "Gagal menyimpan" atau "Gagal menyalin" selama 2 detik. Jendela tetap terbuka.
- Nama file di Desktop memakai jam pengambilan. Simpan setelah diedit menambah " (2)".
- Notifikasi tombol hanya menyebut tombol yang memang dipakai Mac. Tombol yang dipakai app lain punya kalimat sendiri.
- Kalau pengaturan pintasan Mac tidak terbaca, tombol dianggap masih dipakai Mac.
- Penutupan editor menunggu 5 detik sampai halaman menjawab, lalu sampai 60 detik untuk menyimpan.
- Satu gambar background disimpan di dalam suntingan, paling besar 2× ukuran hasil.
