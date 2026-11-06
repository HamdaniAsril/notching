# Verifikasi Intip jendela, rencana 1: intip dan klik Dock

Tanggal: 5–6 November 2026
Cabang: `main`.
- Desain: `docs/superpowers/specs/2026-11-05-intip-jendela-design.md`.
- Rencana: `docs/superpowers/plans/2026-11-05-intip-jendela-1-dock.md`.
- Commit: `e387831` sampai `a0085bb`, ditambah catatan ini (lihat `git log 733993a..HEAD`).
- Dibangun langsung di sesi ini, satu reviewer memeriksa seluruh perubahan di akhir, lalu empat putaran uji di Mac pemilik.

## Yang dibangun

- **Paket "Intip jendela"** (`window-peek`), alat latar di kategori Jendela & Dock.
  - Tidak langsung terpasang: ada di Katalog sampai dipasang (manifest `optIn`), juga bagi pengguna yang memperbarui app.
- **Pengaturan → Pintasan:** baris Intip jendela yang terbuka di tempat, berisi:
  - izin Aksesibilitas dan Rekam Layar,
  - Intip dari Dock,
  - Klik ikon Dock, dengan petunjuk dan tombol ke Desktop & Dock bila macOS tidak me-minimize ke ikon app,
  - Warna kartu, Bahan, dan Jendela yang diminimize.
  - Lipatannya tetap terbuka saat pengaturan diubah. Hasil pencarian di dalam lipatan membukanya.
- **Intip dari Dock:**
  - Kartu muncul 350 ms setelah kursor diam di ikon app yang jalan.
  - Isinya gambar semua jendela, termasuk yang di-minimize, dengan tanda Di depan dan Diminimize.
  - Tombol –/pulihkan, ×, dan ⏻. Kartu tetap terbuka setelah tombol dipakai.
  - Kursor di atas gambar: layar meredup dan jendela itu tampil di tempatnya.
  - Klik gambar membuka jendela itu.
- **Klik ikon Dock:**
  - App di depan: semua jendelanya di-minimize. Klik lagi: semuanya muncul.
  - Seret ikon, tahan klik, dan ⌃⌘⌥⇧-klik tetap milik Dock.
- **Gambar jendela:** ScreenCaptureKit di macOS 14+, dan SkyLight (cara tidak resmi, pilihan pemilik) untuk jendela yang di-minimize. Hanya di memori, maksimal 64 gambar.

## Test otomatis (akhir)

| Pemeriksaan | Hasil |
|---|---|
| `npx tsc --noEmit` | lulus |
| `npm test` | 1239 lulus |
| `cargo test --lib` | 543 lulus, 1 diabaikan (test jaringan) |
| `npx tauri build --bundles app` | lulus, `Notching.app` 9,87 MB |

## Review seluruh perubahan

Satu reviewer (model paling mampu) membaca semua perubahan. Vonisnya "belum siap". Semua temuan Critical dan Important diperbaiki dalam satu putaran, masing-masing dengan tes yang gagal dulu bila bisa diuji tanpa AppKit:

- **Kartu tidak menerima hover di MacBook dengan trackpad saja**, karena panelnya tidak pernah menjadi jendela key. Sekarang posisi kursor dikirim native ke halaman.
- **Dock yang dimulai ulang tidak diikuti.** Sekarang kqueue menunggu proses Dock berakhir, lalu mencoba lagi dengan jeda.
- **Klik dengan ⌃⌘⌥⇧ diambil alih.** Sekarang klik seperti itu tetap milik Dock.
- **Tap klik bertanya ke app.** Sekarang hanya membaca daftar jendela window server.
- **Lapisan intip bisa tertinggal** setelah jendelanya hilang.
- **Lipatan Pengaturan menutup** setiap kali pengaturan diubah.
- **App tidak cocok dengan ikonnya** kalau path bundle-nya symlink (Safari).
- **App tidak selalu maju ke depan.** Sekarang AXFrontmost ikut disetel.
- **Minimize semua berlangsung satu per satu.** Sekarang gambar diambil bersamaan, lalu semua jendela di-minimize.
- **Kartu tidak menutup** setelah app keluar.
- **Penempatan panel bisa panic** di layar berukuran pecahan.
- **Tanpa Rekam Layar** gambar jendela harus diganti ikon app; sekarang begitu.

## Di Mac pemilik (build uji, dijalankan lewat `open -n`, log di folder sementara sesi)

| Langkah | Bukti | Hasil |
|---|---|---|
| Pasang dari Katalog | `installedOptIn: ["window-peek"]` di settings.json | Lulus |
| Pengamat Dock dan tap klik terpasang | log: `dock watch attached to pid 664`, `dock click tap installed: true` | Lulus |
| Kartu muncul untuk banyak app (Claude, Pego, Finder, Arc, WhatsApp, Excel, TextEdit, Preview) | log: `peek card shown for pid …` | Lulus |
| Kartu hilang saat kursor dijauhkan | log: `peek card hidden` setelah setiap `shown`; pemilik | Lulus (setelah perbaikan putaran 1) |
| Tombol –, ×, ⏻ | pemilik | Lulus menurut pemilik |
| Mengintip: layar meredup | pemilik | Lulus menurut pemilik |
| Seret ikon, tahan klik, ⌃-klik tetap milik Dock | pemilik | Lulus menurut pemilik |
| `killall Dock` | log: `the dock (pid 664) went away; watching the next one`, lalu `dock watch attached to pid 80621`, dan klik Dock tetap bekerja | Lulus |
| Excel 4 jendela: minimize semua, munculkan semua | log: `show all of pid 77641: 4 windows, 4 of 4 restored`; `1 window(s) skipped in round 1; asking again` lalu `minimize all … 4 of 4`; pemilik: "berhasil" | Lulus (setelah putaran 3–5) |
| Liquid glass terang dan gelap | pemilik: putaran 1 "tidak terasa", putaran 2 "kurang transparan"; sesudahnya bahan Popover dengan lapisan 10%/6% | Belum dikonfirmasi pemilik |

Yang ditemukan di Mac dan diperbaiki:
1. **Dock tidak memberi tahu saat kursor keluar.** Kartu sekarang mengawasi kursornya sendiri: ikon, celah, dan kartu.
2. **Ikon Dock bergeser** saat jendela yang di-minimize masuk ke Dock. Posisi ikon sekarang dibaca ulang saat diklik.
3. **Klik yang diteruskan ke Dock diabaikan** (Preview). Sekarang membawa hitungan klik.
4. **Excel menghapus jenis, status minimize, dan nomor** jendela yang di-minimize. Jendela seperti itu sekarang dikenali dari posisinya di window server.
5. **Excel melewatkan satu perintah minimize** saat sedang beranimasi. Sekarang ada jeda, pemeriksaan ulang, dan maksimal tiga putaran.

Catatan uji: build uji yang dijalankan langsung dari shell membuat izin dibaca milik shell, sehingga baris `cut-files tap installed` tidak muncul. Selalu jalankan lewat `open -n`. Setiap build baru juga perlu izin diberikan ulang.

## CPU

| Pengukuran | Hasil |
|---|---|
| v0.1.3, diam (5 Nov) | rata-rata 0,02% |
| Build uji, alat terpasang dan menyala, pengamat Dock dan tap aktif, diam 60 detik | rata-rata 0,00%, tertinggi 0,1% |
| Build uji selama pemakaian aktif (kartu, gambar, animasi), 63 detik | 1,15 detik CPU |

## Untuk nanti

- **Liquid glass** perlu dicoba lagi oleh pemilik. Kalau masih kurang bening, `NSGlassEffectView` di macOS 26.
- **Izin v0.1.3.** Entri Aksesibilitas dan Rekam Layar untuk `/Applications/Notching.app` dihapus selama pengujian. Pemilik perlu menambahkannya lagi.
- **Minor dari review yang ditunda** (lihat ledger): urutan replay seret, gambar diambil ulang setiap render, kartu yang tinggi terpotong, dan lainnya.
- **Rencana 2:** pengalih jendela (⌘Tab).
