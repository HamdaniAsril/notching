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

### Menunggu uji pemilik

Build uji perlu izin Aksesibilitas sendiri (lihat catatan build uji). Setelah izin diberikan:

| Cek | Hasil |
|---|---|
| Finder: pilih 3 file, ⌘X → notch "3 file dipotong" | belum |
| ⌘V di folder lain → file pindah, notch "3 file dipindah ke <folder>" | belum |
| ⌘X lalu ⌘V di desktop → notch menyebut "Desktop" | belum |
| Saat mengganti nama file di Finder, ⌘X dan ⌘V memotong dan menempel teks | belum |
| ⌘X di app lain (misalnya Notes) tetap memotong teks | belum |
| ⌘X tanpa file terpilih, lalu ⌘V → tidak ada yang dipindah | belum |
| Sembilan tombol ⌃⌥ Q–C di layar MacBook | belum |
| Tombol yang sama di layar kedua (kalau ada) | belum |
| CPU kembali 0,0% setelah dipakai | belum |
