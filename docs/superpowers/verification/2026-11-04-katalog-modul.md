# Verifikasi katalog modul

Tanggal: 4 November 2026
Cabang: `main`. Desain: `docs/superpowers/specs/2026-11-04-katalog-modul-design.md`. Rencana: `docs/superpowers/plans/2026-11-04-katalog-modul.md`.

## Test otomatis

| Pemeriksaan | Hasil |
|---|---|
| `npx tsc --noEmit` | lulus |
| `npm test` | 1148 lulus |
| `cargo test --lib` | 445 lulus, 1 diabaikan (test jaringan) |
| `npx tauri build --bundles app` | lulus, `Notching.app` 9,41 MB, tanda tangan ad hoc |

## Review terpisah

Satu reviewer membaca seluruh perubahan. Ia tidak menemukan masalah serius. Dua temuan kecil diperbaiki di `a8c059b`:
- Paket `home` yang tertulis di `uninstalledModules` (misalnya karena file diedit tangan) kini tetap terpasang. Sebelumnya `sync` akan menghapusnya, dan Beranda tidak bisa dipulihkan dari app.
- Hasil pencarian yang menuju sebuah kartu kini selalu menampilkan kartu itu, walau saringan Katalog sedang di "Modul" atau "Widget".

Temuan ketiga tidak diubah. Konfirmasi "Yakin? Klik lagi" hilang kalau ada siaran status modul di antara dua klik. Ini perilaku yang sama dengan tombol Copot di halaman modul.

## Pratinjau browser (`npm run dev`, port 1450)

| Cek | Hasil |
|---|---|
| Modul › Katalog membuka 8 modul lalu 5 paket widget, tanpa paket Beranda | Lulus |
| Kartu modul menampilkan izin ("Butuh izin: Kamera", "Tanpa izin sistem") | Lulus |
| Kartu paket menampilkan pratinjau widget. Strip tidak ikut digambar kalau paketnya punya widget lain (Musik). | Lulus |
| Copot Musik dua klik, lalu kartunya berubah menjadi Pasang | Lulus |
| Mode gelap dan jendela sempit (satu kolom) | Lulus |
| Konsol tanpa error | Lulus |

## Di app (build uji)

Pengaturan pemilik dicadangkan dulu di `~/Library/Application Support/id.web.notching/before-katalog/settings.json`. Notching di `/Applications` ditutup selama pengujian.

| Cek | Hasil | Bukti di file |
|---|---|---|
| Paket yang tercopot hilang dari folder aktif saat app mulai | Lulus | `uninstalledModules` diisi `["sekitar","musik"]`, lalu build uji dijalankan. Folder `modules/` berisi 12 paket, tanpa `sekitar` dan `musik`. |
| Pembantu Now playing tidak jalan saat Musik tercopot | Lulus | `pgrep -fl np.pl` tidak menemukan apa-apa. |
| Posisi widget di Beranda tetap disimpan | Lulus | `settings.json` setelah app mulai masih berisi `sekitar/sun` dan strip `sekitar/hourly` di halaman `home`. |
| Log tanpa error | Lulus | `katalog-uji.log` dan `katalog-uji-2.log` (build `a8c059b`) hanya berisi baris pendaftaran tombol screenshot. |

### Dicoba pemilik (build `a8c059b`)

Pemilik membuka Katalog, memasang Sekitar dan Musik, lalu mencopot dan memasang lagi Cermin. Pemilik melaporkan "sudah". Laporan itu dicocokkan dengan file:

| Cek | Hasil | Bukti di file |
|---|---|---|
| Pasang Sekitar dan Musik | Lulus | Folder `modules/sekitar` dan `modules/musik` dibuat pukul 00.38. `uninstalledModules` kosong. |
| Pembantu Now playing jalan lagi setelah Musik dipasang | Lulus | Satu proses `np.pl` dari build uji. |
| Copot lalu Pasang Cermin | Lulus | Folder `modules/mirror` disalin ulang pukul 00.39. Modul lain tetap pukul 00.29. |
| Widget Beranda kembali | Lulus | Halaman `home` tetap berisi `sekitar/sun` dan strip `sekitar/hourly`; paketnya kini terpasang. |
| Pengaturan sama dengan sebelum pengujian | Lulus | `settings.json` sama persis dengan cadangan `before-katalog/settings.json`. |
| Tidak ada sisa proses | Lulus | Build uji ditutup dengan SIGTERM tanpa sisa perl. Notching di `/Applications` dibuka lagi dengan satu proses perl. |

Log build uji hanya berisi pendaftaran tombol screenshot dan satu peringatan AppKit "Window move completed without beginning". Peringatan ini tidak berkaitan dengan katalog.
