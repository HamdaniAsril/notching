# Verifikasi alat latar (Potong file, Atur jendela)

Tanggal: 4 November 2026
Cabang: `main`. Desain: `docs/superpowers/specs/2026-11-04-alat-latar-design.md`. Rencana: `docs/superpowers/plans/2026-11-04-alat-latar.md`.
Commit: `f64ae47` (jenis alat), `19f1491` (Atur jendela), `cf51101` (Potong file), `39a8be5` (Pengaturan), `2955e8c` (perbaikan dari review).

## Test otomatis

| Pemeriksaan | Hasil |
|---|---|
| `npx tsc --noEmit` | lulus |
| `npm test` | 1177 lulus |
| `cargo test --lib` | 474 lulus, 1 diabaikan (test jaringan) |
| `npx tauri build --bundles app` | lulus, `Notching.app` 9,48 MB, tanda tangan ad hoc |

Yang diuji tanpa Mac: manifest alat, nyala/mati dan copot alat di store, pengenalan ⌘X dan ⌘V dari huruf (termasuk Dvorak), clipboard yang harus berubah sebelum ada potongan, fokus yang tidak terbaca dianggap kolom teks, sembilan posisi jendela (setengah dan seperempat pas menutup layar, tengah tetap ukurannya, jendela besar ke pojok kiri atas), pemilihan layar di layar kedua dengan koordinat negatif, konversi koordinat AppKit, tombol grid untuk Screenshot ditolak, katalog (saringan Alat, label ALAT), kelompok Alat di Modul, halaman kedua alat, dan kedua bahasa.

## Review terpisah

Satu reviewer membaca seluruh perubahan. Temuannya diperbaiki di `2955e8c`:
- Potongan tercatat walaupun ⌘C tidak menyalin apa pun, jadi ⌘V bisa memindah file dari salinan lama. Sekarang clipboard harus berubah dulu (dicek setiap 50 ms, paling lama 1 detik).
- Event tap tetap terpasang setelah izin Aksesibilitas dicabut. Sekarang dilepas.
- Fokus yang tidak terbaca (Finder lambat) dianggap bukan kolom teks, jadi ⌘X bisa menjadi ⌘C saat mengganti nama. Sekarang dianggap kolom teks, dan semua panggilan Aksesibilitas dibatasi 0,5 detik.
- Event tap berjalan di thread utama app, jadi app yang sibuk bisa memperlambat ketikan di mana-mana. Sekarang tap punya thread sendiri dan tidak bertanya apa pun ke AppKit.
- Kode tombol berasumsi QWERTY. Sekarang ⌘X dan ⌘V dikenali dari hurufnya, dan tombol C dicari dari layout.
- Hot key tidak eksklusif, jadi "dipakai app lain" tidak pernah terdeteksi. Sekarang eksklusif. Screenshot juga tidak bisa lagi mengambil salah satu dari sembilan tombol.
- Menempel di desktop bisa menyebut nama jendela Finder di belakangnya. Sekarang hanya jendela yang fokus yang dipakai, lainnya "Desktop".

## Pratinjau browser (port 1420)

| Cek | Hasil |
|---|---|
| Modul: kelompok "Alat" berisi Potong file dan Atur jendela di bawah modul | Lulus |
| Halaman Potong file: baris izin, ⌘X Potong, ⌘V Pindahkan ke sini, catatan Finder | Lulus |
| Halaman Atur jendela: ⌃⌥ + kotak Q W E / A S D / Z X C bergeser seperti keyboard; tombol yang dipakai app lain bergaris merah dan disebut di bawah (`&winkeys=taken`) | Lulus |
| Katalog: kartu alat berlabel ALAT setelah modul | Lulus |

## Di app (build uji `2955e8c`)

Pengaturan pemilik dicadangkan di `~/Library/Application Support/id.web.notching/before-alat-latar/settings.json`. Notching di `/Applications` ditutup selama pengujian.

| Cek | Hasil | Bukti |
|---|---|---|
| Kedua paket terpasang saat app menyala (juga untuk pengguna yang memperbarui) | Lulus | Folder modul aktif berisi `cut-files` dan `window-keys`. |
| Sembilan tombol ⌃⌥ terdaftar tanpa konflik | Lulus | Tidak ada baris "not registered" di log. |
| CPU 0,0% saat diam, kedua alat menyala | Lulus | `ps` 5 sampel 0,0; waktu CPU 0:00,27 setelah menyala. |
| Tanpa izin Aksesibilitas, event tap tidak dipasang (⌘X di Finder tetap seperti biasa) | Lulus | Tidak ada baris "cut-files tap installed" di log. Build uji belum diberi izin. |

### Dicoba pemilik

Build uji tidak ditandatangani, jadi izin Aksesibilitasnya harus ditambahkan sendiri. Dua laporan pertama ("udah jalan kok cut nya", lalu "Diizinkan") belum cocok dengan log: tidak ada baris "cut-files tap installed" dan tidak ada thread tap di proses. Setelah entri izin diganti ke build uji, log mencatat `cut-files tap installed: true`. macOS lalu menutup build uji dan membuka Notching di /Applications ("Keluar & Buka Lagi"), jadi build uji dijalankan lagi. Saat menyala, tap langsung terpasang.

| Cek | Hasil | Bukti |
|---|---|---|
| ⌘X di Finder menandai file, notch memberi tahu | Lulus | Log: `2 files cut`, `1 files cut`, `1 files cut`. |
| ⌘V di folder lain memindah file | Lulus | Log: `2 of 2`, `1 of 1`, `1 of 1 cut files moved` (file asal benar-benar hilang dari tempatnya). |
| Mengganti nama file, ⌘X di app lain, tempel di desktop | Dilaporkan pemilik | "udah aku coba semua, berhasil semua". Tidak meninggalkan jejak di log. |
| Sembilan tombol ⌃⌥ Q–C | Dilaporkan pemilik, belum terbukti di file | Atur jendela diam kalau berhasil, dan tidak ada baris "window not moved" di log. Dua jendela Finder yang dibaca setelahnya masih berukuran penuh (0, 33, 1470, 956), jadi bukan jendela yang dicoba. Tombol tidak bisa ditekan dari sesi ini (osascript tidak diizinkan). |
| Layar kedua | Tidak diuji | Hanya satu layar tersambung (1470 × 956). |
| CPU kembali 0,0% setelah dipakai | Lulus | Pencatat setiap 2 detik: saat diam 0,0. Waktu CPU 0:04,68 setelah sekitar 9 menit, termasuk pemakaian. |
| Pengaturan sama dengan sebelum pengujian | Lulus | `settings.json` sama persis dengan cadangan `before-alat-latar/settings.json`. |
| v0.1.2 resmi kembali di /Applications | Lulus | Build uji ditutup lewat `osascript`. Notching 0.1.2 dibuka lagi dengan satu proses perl. |

Catatan: folder `cut-files` dan `window-keys` tetap ada di folder modul aktif. v0.1.2 tidak mengenalnya, jadi keduanya diabaikan sampai versi berikutnya.
