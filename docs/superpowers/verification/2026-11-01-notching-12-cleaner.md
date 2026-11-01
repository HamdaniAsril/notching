# Verifikasi Cleaner

Tanggal: 1 November 2026
Perangkat: MacBook Air M4, dengan layar bawaan ber-notch.
Cara cek: build rilis dari cabang `feat/cleaner` (commit `a26c294`) dijalankan langsung dari folder build dalam **mode coba** (`NOTCHING_CLEANER_ROOT=~/cleaner-cek`). Log app dicatat ke file. Notching di `/Applications` ditutup dulu dengan cara biasa, atas izin pemilik.

Desain: `docs/superpowers/specs/2026-11-01-cleaner-design.md`. Rencana: `docs/superpowers/plans/2026-11-01-notching-12-cleaner.md`.

## Test otomatis

- `npx tsc --noEmit`: lulus.
- `npm test`: 718 lulus (664 di awal).
- `cargo test`: 378 lulus, 1 diabaikan (248 di awal). Termasuk `sample_baits_survive_ticking_everything`, yang membuat folder contoh dengan skrip, mencentang **semua** item Deep clean dan semua sisa "Coba Cleaner" (termasuk data pribadi), lalu memastikan semua umpan tidak berubah.

## Data

- Salinan data sebelum cek ada di `~/Library/Application Support/id.web.notching/before-cleaner/`.
- Folder contoh dibuat dengan `scripts/cleaner-cek.sh` di `~/cleaner-cek`. Checksum semua filenya dicatat di `~/cleaner-cek/checksums-before.txt` sebelum dicoba.
- Log Cleaner: `~/Library/Logs/id.web.notching/cleaner.log`. Semua baris bertanda `coba`, dan tidak ada baris `asli`.
- Ukuran `Notching.app` (rilis): 6,00 MiB.

## Checklist di Mac (mode coba)

| # | Cek | Hasil | Catatan |
|---|---|---|---|
| 1 | Cleaner terbuka dengan label MODE COBA, bar, dan dua kotak. | Lulus | Log app: `Cleaner in test mode, inside ~/cleaner-cek/home`. Diikuti tiga pembersihan dari panel (cek 2). |
| 2 | Deep clean dengan centang bawaan. | Lulus | Log 20.19.59: 7 item, yaitu cache Google, Homebrew, `com.contoh.editor`, `com.contoh.baru`, DerivedData, npm, dan log. Semuanya `permanent ok`. Folder cache tetap ada dan isinya kosong. |
| 3 | Baris tambahan: sisa app yang sudah dihapus, dan file installer lama. | Lulus | Log 20.20.32: `com.contoh.yatim` (cache dan saved state) `orphan trash ok`. Log 20.21.49: `Installer Contoh.dmg` `installer trash ok`. Ketiganya hilang dari tempat asalnya. `com.contoh.baru`, yang baru berumur 0 hari, tidak pernah dianggap sisa app. |
| 4 | "Jangan pernah bersihkan". | Lulus | `cleaner-exclude.json` berisi `~/cleaner-cek/home/dev/proyek/node_modules`. Folder itu tetap utuh. |
| 5 | Clean uninstall "Coba Cleaner". | Lulus | Log 20.24.16: app `trash ok` paling dulu, lalu `Application Support/Coba Cleaner` (yang "mungkin", dicentang pemilik), `Preferences/com.contoh.cobacleaner.plist`, dan `Containers/com.contoh.cobacleaner`. `Applications/` sekarang kosong. |
| 6 | Tombol hapus mati selama Coba Cleaner terbuka ("Tutup Coba Cleaner dulu"). | Dilaporkan pemilik | Pemilik: "ketiganya jalan". Tidak meninggalkan jejak di file. Ada test otomatisnya (`a running app cannot be removed until it has quit`). |
| 7 | Rincian isi disk dan "Tampilkan di Finder". | Dilaporkan pemilik | Putaran pertama: semua isi folder contoh tergabung dalam satu baris "… item lain", sehingga tombol Finder tidak muncul. Setelah perbaikan (commit `54017f8`, build ulang), pemilik melapor "Sudah oke". Tidak meninggalkan jejak di file. |
| 8 | Panel ditutup di tengah jalan, lalu dibuka lagi di tempat yang sama. | Dilaporkan pemilik | Pemilik: "ketiganya jalan". Tidak meninggalkan jejak di file. Ada test otomatisnya. |
| 9 | Umpan tidak tersentuh. | Lulus | `shasum` cocok untuk `.claude/memory.md`, `Documents/penting.txt`, `Documents/proyek/node_modules/x.js`, `Cookies.binarycookies`, dan `Application Support/Coba/x.txt`. Symlink `tautan` di dalam cache ikut terhapus sebagai symlink, dan file tujuannya tetap utuh. File yang tidak cocok dengan checksum hanyalah file yang memang dipilih untuk dibersihkan. |
| 10 | File yang "dipindah ke Tempat Sampah" benar-benar ada di Tempat Sampah. | Belum terbukti | `~/.Trash` tidak bisa dibaca dari Terminal tanpa Full Disk Access. File-file itu hilang dari tempat asalnya dan log mencatat `trash ok`. |

## Temuan saat cek di Mac

- **Cache yang sudah kosong ditawarkan lagi dengan ukuran 0 B.** Pembersihan kedua dan ketiga mengulang tujuh folder yang sudah kosong (`ok 0` di log). Sekarang folder kosong tidak ditawarkan lagi (`an_emptied_folder_is_not_offered_again`, commit `13a500c`).

- **Rincian isi disk hanya berisi satu baris gabungan** di folder yang isinya kecil-kecil, sehingga "Tampilkan di Finder" tidak bisa dicoba (pemilik). Sekarang 10 isi terbesar selalu tampil sendiri-sendiri, dan tombol Finder selalu terlihat (`the_biggest_ten_always_show_even_when_small`).
- **Centang abu terang sulit dibedakan** (pemilik). Sekarang centang yang aktif berwarna merah. Desain bagian 4 sudah diperbarui.

## Temuan pemeriksa kode

Pemeriksa yang belum pernah melihat kodenya meninjau seluruh cabang. Ia menemukan 1 masalah kritis dan 9 masalah penting. Empat masalah kecil juga dinaikkan menjadi penting karena dampaknya. Semuanya sudah diperbaiki (commit `a26c294`), masing-masing dengan test yang gagal dulu lalu lulus:
- profil browser (Chrome, Firefox, Edge, Brave, Arc, dan lain-lain) sekarang hanya ditawarkan sebagai "Data pribadi" yang tidak dicentang;
- Tempat Sampah dikosongkan paling dulu, jadi sisa app yang dipindah ke sana tidak ikut terhapus permanen, dan Tempat Sampah yang berubah sejak dipindai dilewati;
- folder yang dikecualikan juga melindungi folder yang berisi dia;
- folder di tengah jalur yang berupa symlink ditolak, saat dipindai maupun saat menghapus;
- alat developer yang sedang berjalan (brew, npm, cargo, xcodebuild) tetap dihitung "sedang dipakai";
- pindaian yang terpotong karena panel ditutup tidak disimpan, dan dipindai ulang;
- Container bersama milik tim yang sama (misalnya Office) tidak ditawarkan;
- sisa app hanya bisa dihapus dalam uninstall app itu;
- id item tidak bisa bertabrakan antar-pindaian;
- `NOTCHING_CLEANER_ROOT` yang salah mematikan Cleaner, bukan kembali ke Mac asli;
- status "sibuk" selalu kembali normal;
- app di Tempat Sampah tetap dianggap terpasang;
- uninstall yang pindaiannya kedaluwarsa membuka app itu lagi;
- folder iCloud dan CloudStorage tidak pernah dibuka.

Masalah kecil yang ditunda:
- saat Notching keluar, pembersihan ditunggu paling lama 2 detik;
- daftar pengecualian yang rusak baru diberitahukan saat menekan Bersihkan;
- pembersihan masih bisa mulai kalau modul dimatikan tepat saat konfirmasi;
- perubahan file jauh di dalam folder yang akan dipindah ke Tempat Sampah tidak terdeteksi.

## Tahap kedua: Mac asli, hanya melihat

Dilewati atas keputusan pemilik (1 November 2026: "Lewati, langsung merge"). Cleaner belum pernah dibuka dengan data asli. Log Cleaner hanya berisi baris `coba`, tanpa satu pun baris `asli`.
