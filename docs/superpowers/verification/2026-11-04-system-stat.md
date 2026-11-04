# Verifikasi desain ulang System stat

Tanggal: 4 November 2026
Cabang: `main`. Desain: `docs/superpowers/specs/2026-11-04-system-stat-design.md`. Rencana: `docs/superpowers/plans/2026-11-04-system-stat.md`.
Commit: `dcd872b` (kartu baru), `43b4975` (perbaikan dari review).

## Test otomatis

| Pemeriksaan | Hasil |
|---|---|
| `npx tsc --noEmit` | lulus |
| `npm test` | 1166 lulus (termasuk `card.test.ts` 18 dan `chart.test.ts` 7) |
| `cargo test --lib` | 452 lulus, 1 diabaikan (test jaringan) |
| `npx tauri build --bundles app` | lulus, `Notching.app` 9,43 MB, tanda tangan ad hoc |

## Review terpisah

Satu reviewer membaca seluruh perubahan. Temuannya diperbaiki di `43b4975`:
- Segmen disk dibulatkan ke GB utuh, jadi bar bisa meleset dari angkanya. Sekarang lebarnya memakai porsi persis `bytes / total`, dan bagian berukuran nol dilewati.
- Disk dengan kapasitas 0 (tidak terbaca) kini menampilkan baris kosong, tidak membagi dengan nol.
- Batas celah grafik 4 detik tidak sama dengan batas basi 5 detik di Rust. Sekarang keduanya 5 detik.
- Mutex yang "poisoned" akan membuat setiap pembacaan berikutnya gagal. Sekarang kuncinya dipulihkan (`unwrap_or_else(|e| e.into_inner())`).
- Kolom "terpakai" terlalu sempit untuk satuan campuran ("GB dari 1,9 TB"). Lebarnya dinaikkan menjadi 132 px.

## Pratinjau browser (`?notch=1&page=modules`, port 1420)

| Cek | Hasil |
|---|---|
| Susunan tiga baris sama dengan bingkai Pego "Notching - System Stats" | Lulus |
| Frame modul berukuran 724 × 394 (kartu 760 dikurangi sisi panel 18 px) | Lulus |
| Penyimpanan dengan rincian Cleaner (App, Dokumen, Foto, Lainnya, Kosong) | Lulus |
| Penyimpanan tanpa rincian (`&disk=0`): Terpakai/Kosong dan "Buka Cleaner untuk rinciannya" | Lulus |
| Bahasa Inggris (`&lang=en`) | Lulus |
| Nama aplikasi panjang ("Google Chrome") tidak terpotong | Lulus, setelah kolom grafik dipersempit ke 210 px |
| Konsol tanpa error | Lulus |

## Di app (build uji `43b4975`)

Pengaturan pemilik dicadangkan dulu di `~/Library/Application Support/id.web.notching/before-system-stat/settings.json`. Notching di `/Applications` ditutup selama pengujian. Setelah build uji jalan, folder modul aktif berisi `system-stat` versi 2.0.0.

### CPU saat diam

| Cek | Hasil | Bukti |
|---|---|---|
| CPU 0,0% saat kartu tertutup | Lulus | `ps` dan `top` 6 sampel: 0,0. Log CPU 07.27–07.37 semuanya 0,0. Log 08.05–08.20 total hanya 0,06 detik CPU. |

Dua kali pemilik melaporkan sudah mencoba, tetapi log tidak menunjukkan kenaikan CPU sama sekali. Kartu belum pernah benar-benar dibuka, jadi kedua laporan itu tidak dicatat sebagai lulus.

### Dicoba pemilik (percobaan ketiga)

Sebelum percobaan, Notching di `/Applications` ternyata sudah dibuka lagi (pukul 10.03) dan memasang kembali System stat 1.0.0. App itu ditutup dan build uji dijalankan lagi. Pencatat `ps -o %cpu,time` setiap 2 detik dipasang sebelum pemilik membuka kartu. Pemilik membuka Modul › Sistem lalu menutupnya, dan melaporkan "Sudah dicoba".

| Cek | Hasil | Bukti di log |
|---|---|---|
| Kartu benar-benar dibuka | Lulus | CPU naik dari 0,0 ke 12,5% pukul 10.08.19. Waktu CPU kumulatif naik dari 0:00,25. |
| Pembacaan berjalan selama kartu terbuka | Lulus | 10.08.19–10.10.41 (sekitar 2,4 menit): naik turun setiap ~2 detik, sesuai polling 1,5 detik setelah setiap jawaban, dengan puncak sekitar setiap 6 detik yang cocok dengan pembacaan sensor dan disk tiap 5 detik. Total 3,57 detik CPU, rata-rata sekitar 2,5%. |
| Pembacaan berhenti setelah kartu ditutup | Lulus | Sejak 10.10.43, 12 sampel berturut-turut 0,0. Waktu kumulatif tetap 0:03,82–0:03,83 sampai app ditutup. |
| Log tanpa error | Lulus | stderr hanya berisi baris pendaftaran tombol screenshot. |
| Pengaturan sama dengan sebelum pengujian | Lulus | `settings.json` sama persis dengan cadangan `before-system-stat/settings.json`. |
| Tidak ada sisa proses | Lulus | Build uji ditutup lewat `osascript` tanpa sisa perl. Notching di `/Applications` dibuka lagi dengan satu proses perl. |

Isi kartu (angka asli, grafik terisi dari kanan, aplikasi teratas, suhu, jaringan, penyimpanan) tidak meninggalkan jejak di file. Bagian ini hanya berdasarkan laporan pemilik. Bentuknya sudah diperiksa di pratinjau browser, dan pembacaan Rust diuji oleh `cargo test` dengan pembacaan langsung (tekanan, aplikasi, riwayat, jeda disk).

## Catatan

- Notching di `/Applications` masih versi lama. Saat dibuka, app itu memasang kembali System stat 1.0.0 ke folder modul aktif. Kartu baru baru terlihat di sana setelah rilis berikutnya.
- Belum di-push dan belum dirilis.
