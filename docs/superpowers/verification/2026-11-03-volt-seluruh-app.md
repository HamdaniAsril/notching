# Verifikasi Volt di seluruh Notching

Tanggal: 3 November 2026
Cabang: `feat/paket-widget`.

Desain: `docs/superpowers/specs/2026-11-03-volt-seluruh-app-design.md`.
Rencana: `docs/superpowers/plans/2026-11-03-volt-seluruh-app.md`.

## Test otomatis

| Pemeriksaan | Hasil |
|---|---|
| `npx tsc --noEmit` | lulus |
| `npm test` | 993 lulus |
| `npm run build:modules` | lulus |

Space Grotesk, Space Mono, dan huruf titik (`dots.ts`) sudah dihapus dari app. Pemeriksaan akhir mencari garis titik, merah lama, label huruf besar, dan huruf Space di seluruh repo, dan tidak menemukan sisanya. Merah yang tersisa hanya pilihan warna pena dan latar di editor screenshot.

## Cek di pratinjau browser

Setiap bagian dicek di pratinjau browser oleh pembuatnya, dalam bahasa Indonesia dan Inggris:
- Kisi Modul dan pil
- Sistem, Tetap Nyala, Cermin (lampu mati dan nyala), dan Timer penuh
- Titipan, termasuk zona jatuh
- Screenshot: daftar, pemberitahuan, hasil, dan gagal simpan
- Cleaner: semua keadaan, termasuk nama dan path panjang
- Editor screenshot, pemilih area, dan bersihkan keyboard
- Semua halaman Pengaturan, dalam mode terang dan gelap

Pengontrol juga mengecek Pengaturan → Halaman dalam mode terang dan gelap. Contoh Cuaca per jam di kartu pilihan sempat terpotong di kanan, dan sudah diperbaiki (`0919a63`).

Belum dicek di Mac asli:
- notifikasi di telinga notch
- kamera di Cermin
- jendela Tauri sungguhan (bayangan, title bar)
- alat teks dan sensor di editor

## Checklist di Mac

| # | Cek | Hasil |
|---|---|---|
| 1 | Pil, halaman Modul, dan bar "‹ Modul" bergaya Volt. Modul yang nyala bercincin limau. | Belum |
| 2 | Sistem, Tetap Nyala, Cermin (juga dengan lampu), dan Timer penuh tampil dalam kartu hitam dan tidak terpotong. | Belum |
| 3 | Titipan: ubin, zona jatuh saat file ditarik, dan Kosongkan. | Belum |
| 4 | Screenshot: daftar, hasil setelah ambil gambar, Salin, dan Hapus. | Belum |
| 5 | Cleaner: halaman awal, daftar, centang limau, dan konfirmasi merah. | Belum |
| 6 | Notifikasi di telinga notch memakai huruf baru dan titik limau. | Belum |
| 7 | Editor screenshot, pemilih area, dan bersihkan keyboard. | Belum |
| 8 | Pengaturan di mode terang dan gelap: kartu, saklar, dan menu samping yang aktif. | Belum |

## Keputusan penulis yang perlu dilihat pemilik

1. **Pengaturan tetap mengikuti mode terang dan gelap macOS.** Di mode terang, aksennya hijau tua (`#4C6B12`), karena limau tidak terbaca di atas putih. Merahnya juga lebih tua (`#C62A2F`).
2. **Merah hanya untuk bahaya.** Merah dipakai untuk konfirmasi hapus atau uninstall, Kosongkan, Hapus screenshot, dan pesan gagal. Tombol "Bersihkan" dan "Hapus app" di bawah daftar Cleaner tetap limau, karena keduanya hanya membuka pertanyaan konfirmasi.
3. **Tombol utama Screenshot adalah Salin**, berwarna limau.
4. **Modul yang nyala** di kisi Modul diberi cincin limau tipis.
5. **Halaman Timer penuh lebih tinggi**, dari 96 menjadi 128 px, supaya muat dua kartu. Kepala Titipan dari 22 menjadi 28 px.
6. **Kamera Cermin lebih pendek** sekitar 34 px, karena kontrolnya pindah ke kartu sendiri.
7. **Teks yang ditulis di editor screenshot sekarang memakai Inter.** Dulu memakai Space Grotesk. Teks di gambar yang disimpan ikut berubah.
8. **Layar bersihkan keyboard** tidak punya hitungan mundur, jadi aksen limaunya dipakai di tombol yang sudah ditekan.
9. **Status di pil** (misalnya jam timer) memakai Inter, dan garis titik pemisahnya diganti garis tipis.
10. **Warna jenis file di Cleaner**: bisa dibersihkan limau, app limau redup, dokumen abu terang, foto abu, lainnya abu gelap.

## Masih terbuka

- Musik dan Musik strip menunggu bagian C.
- Catatan kecil dari pemeriksaan ada di `.superpowers/sdd/2026-11-03-volt-seluruh-app/`.
