# Verifikasi tombol Atur jendela bisa diganti

Tanggal: 4 November 2026
Cabang: `main`. Desain: `docs/superpowers/specs/2026-11-04-tombol-atur-jendela-design.md`. Rencana: `docs/superpowers/plans/2026-11-04-tombol-atur-jendela.md`.
Commit: `de7e950` (desain dan rencana), `d8e17ca` (fitur).

## Test otomatis

| Pemeriksaan | Hasil |
|---|---|
| `npx tsc --noEmit` | lulus |
| `npm test` | 1182 lulus |
| `cargo test --lib` | 479 lulus, 1 diabaikan (test jaringan) |
| `npx tauri build --bundles app` | lulus, `Notching.app` 9,52 MB, tanda tangan ad hoc |

Yang diuji tanpa Mac: sembilan tombol bawaan ⌃⌥ Q–C, satu tombol per sel di settings.json (sel yang hilang memakai bawaannya, isi yang rusak kembali ke bawaan), tombol sel lain ditolak dengan nama selnya, tombol Screenshot ditolak hanya selagi Screenshot menyala, mencopot Atur jendela mengembalikan tombolnya, bentuk galat untuk halaman (`{"kind":"duplicate","cell":…}`), dan di halaman: rekam, tolak (tiga alasan), Esc, keluar halaman, label penuh bila modifier berbeda, reset, kedua bahasa. Halaman Screenshot memakai alur rekam yang sama dan semua testnya tetap lulus.

## Review terpisah

Satu reviewer membaca `d8e17ca` dan tidak menemukan bug serius: urutan thread, lepas/pasang tombol saat merekam, menyimpan, reset, dan menutup Pengaturan sudah benar. Tiga catatan kecil belum diubah:
1. Reset yang diklik selagi tombol baru masih disimpan bisa membuat layar berbeda dengan settings.json sampai halaman dibuka lagi (jedanya beberapa milidetik).
2. Penolakan silang hanya berlaku selagi alat yang lain menyala (keputusan penulis no. 2). Kalau Screenshot memakai tombol Atur jendela selagi alat itu mati, tombol itu tampil "dipakai app lain" setelah alat dinyalakan.
3. settings.json yang diedit tangan dengan dua sel bertombol sama tetap diterima; sel kedua tampil "dipakai app lain".

## Pratinjau browser (port 1420)

| Cek | Hasil |
|---|---|
| Klik Q: kotak berisi "…" bercincin aksen, di bawah grid "Tekan tombol baru untuk Kiri atas. Esc untuk batal." | Lulus |
| ⌃⌥W ditolak: "Sudah dipakai untuk Atas" | Lulus |
| ⌃⇧T tersimpan: ⌃⌥ di depan hilang, tiap kotak berlabel penuh, tombol "Kembalikan ke ⌃⌥ Q–C" muncul | Lulus |
| Reset: kembali ke Q W E / A S D / Z X C dengan ⌃⌥ di depan | Lulus |

## Di app (build uji `d8e17ca`)

Notching v0.1.2 di `/Applications` ditutup selama pengujian, build uji dijalankan dengan `open -n`, dan entri Aksesibilitas diganti ke build uji oleh pemilik.

Pemilik melaporkan "Sudah dicoba" untuk langkah 1–6. Yang tercatat di log app dan settings.json:

| Langkah | Bukti | Hasil |
|---|---|---|
| Izin Aksesibilitas untuk build uji | log: `cut-files tap installed: true` | Lulus |
| Kiri atas diganti ke ⌃⌥T | log: `arrange-windows keys set to ⌃⌥T ⌃⌥W …` | Lulus |
| Reset ke ⌃⌥ Q–C | log: `arrange-windows keys set to ⌃⌥Q ⌃⌥W …`; settings.json `topLeft` = Q (12), ⌃⌥ (6144) | Lulus |
| Pendaftaran tombol | tidak ada baris `not registered` dan tidak ada `window not moved` | Lulus |
| ⌃⌥W ditolak, Esc membatalkan, ⌃⌥T memindah jendela, ⌃⌥Q tidak bekerja selagi diganti | hanya terlihat di layar, tidak tercatat di log; berdasarkan laporan pemilik | Lulus menurut pemilik |

Langkah opsional ⌘⇧4 ("Dipakai Screenshot") tidak tercatat dan tidak dilaporkan terpisah.

Setelah pengujian, build uji ditutup dan Notching v0.1.2 di `/Applications` dibuka lagi. Entri Aksesibilitas kini menunjuk ke build uji, jadi pemilik perlu mengganti entrinya kembali ke `/Applications/Notching.app` agar Potong file dan Atur jendela bekerja di v0.1.2.
