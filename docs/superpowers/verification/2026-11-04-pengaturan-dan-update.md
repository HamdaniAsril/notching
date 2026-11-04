# Verifikasi Pengaturan, Pintasan, update, dan rilis v0.1.3

Tanggal: 4 November 2026
Cabang: `main`. Permintaan langsung dari pemilik di percakapan, tanpa dokumen desain terpisah. Pemilik memilih "kerjakan saja", jadi hal yang tidak ia sebut ditulis di bawah sebagai **keputusan penulis**.
Commit: `168b20c`, `847cae2`, `b159167` (logo, panel hitam, preview widget, Umum), `e3cbd59` (kategori modul), `22a7d5d` (Pintasan, tombol baru Atur jendela), `b59f55b` (Tentang, Yang baru, Copot Notching, Mode tampilan, alat yang dibuka di tempat), `d747b9f` (preview hanya tertutup dari dalam bingkainya), `44d497c` (versi 0.1.3, tag `v0.1.3`), `e15d61b` dan `a559ad3` (README).

## Yang dibangun

| Bagian | Permintaan pemilik | Hasil |
|---|---|---|
| Bilah judul | logo Notching, lalu rata kanan sidebar | Logo terang/gelap di ujung kanan area seret sidebar |
| Umum | buka saat login, bahasa, matikan panel transparan "jadi full black" | Baris Bahasa, Mode tampilan, Tempat, Layar, Buka saat login, Panel transparan. Kota pindah ke kelompok atas. Kelompok Waktu sholat: notifikasi dulu, lalu metode hitung |
| Mode tampilan | terang, gelap, sistem | Pilihan tiga, mengatur tampilan jendela Pengaturan (NSAppearance). Bawaan: sistem |
| Tampilan notch | preview dengan widget | Preview memakai widget Beranda dan mengecil agar muat di bingkainya. Tertutup hanya jika klik di dalam bingkai di luar notch; memilih warna atau menggeser slider tidak menutupnya |
| Modul | enam kategori yang bisa dibuka-tutup | Utilitas, Energi dan daya, Jendela dan Dock, Manajemen app, File, App. Kategori dibaca dari `manifest.json` tiap modul; kategori kosong tetap tampil |
| Pintasan | menu baru di bawah Modul | Keep awake ⌃⌥K, Shelf ⌃⌥V, tombol Screenshot (juga tetap di halaman Screenshot), lalu Potong file dan Atur jendela yang terbuka di tempat. Kedua alat tidak lagi ada di Modul |
| Atur jendela | ⌃⌥ panah untuk setengah layar, ⌃⌥ `;` `'` `.` `/` untuk pojok, ⌃⌥`\` tengah, ⌃⌥Return isi layar | Sepuluh posisi, masing-masing dengan nama dan ikon posisinya. Pengguna yang masih memakai sembilan tombol lama ⌃⌥ Q–C dipindah otomatis ke tombol baru |
| Notifikasi | di atas Izin | Urutan sidebar: Umum, Tampilan notch, Halaman, Modul, Pintasan, Notifikasi, Izin, Copot Notching; di bawah: Tentang, Yang baru |
| Copot Notching | lepas semua izin, copot sepenuhnya | Dua tombol yang harus diklik dua kali. Semua file Notching di `~/Library` dan app-nya dipindah ke Trash, bukan dihapus |
| Tentang | desain ulang dengan bagian update | Logo, slogan, versi; cek otomatis, Cek versi, Update & install; tautan repo, lisensi, privasi |
| Yang baru | menu di bawah Tentang | Daftar perubahan tiap versi, disimpan di dalam app (`src/settings/changelog.ts`). Menu Support dibatalkan pemilik |

## Keputusan penulis

1. Panel transparan menyala sebagai bawaan, supaya tampilan pengguna lama tidak berubah.
2. Mode tampilan hanya mengatur jendela Pengaturan. Panel notch tetap hitam karena memang desainnya.
3. Tombol bawaan Keep awake ⌃⌥K dan Shelf ⌃⌥V. Tombol hanya terpasang selagi modulnya menyala. Shelf terbuka di layar tempat pointer berada, dan tertutup lagi kalau tombolnya ditekan saat Shelf sedang terbuka.
4. Dua shortcut Notching tidak boleh memakai tombol yang sama. Screenshot, Atur jendela, dan Pintasan saling menolak tombol yang sudah dipakai, dengan alasan tertulis.
5. Update hanya mengambil `Notching_X.Y.Z_aarch64.dmg` dari rilis GitHub repo ini (bukan draft atau pre-release). Sebelum dipasang, app baru harus lolos `codesign --verify --deep --strict` dan Gatekeeper (`spctl`), punya Team ID yang sama dengan app yang sedang jalan, dan bundle id serta versi yang cocok. App lama dipindah ke Trash.
6. Cek otomatis sekali sehari, pertama kali 60 detik setelah app dibuka. Versi baru diumumkan sekali lewat notifikasi notch. Build pengembangan bisa mengecek tapi tidak bisa memasang.
7. Copot Notching hanya menyentuh `id.web.notching` dan `id.web.notching.*` di `~/Library`, dan menolak bekerja dari build pengembangan. Izin dilepas dengan `tccutil reset All id.web.notching`.
8. Di Yang baru, versi yang sedang dipakai diberi tanda "Versi ini", dan versi tanpa tanggal atau yang lebih baru diberi tanda "Akan datang".

## Test otomatis (setelah `a559ad3`)

| Pemeriksaan | Hasil |
|---|---|
| `npx tsc --noEmit` | lulus |
| `npm test` | 1212 lulus (120 file) |
| `cargo test --lib` | 499 lulus, 1 diabaikan (test jaringan) |

Yang diuji tanpa Mac: sepuluh posisi Atur jendela termasuk isi layar, pemindahan otomatis dari tombol Q–C, penolakan tombol bentrok di tiga arah, tombol Pintasan dan nilai bawaannya, pembacaan rilis GitHub (draft, pre-release, URL asing, nama DMG), perbandingan versi, jadwal 24 jam (termasuk jam yang dimundurkan), daftar file Copot Notching, urutan sidebar dan baris, kategori modul, Yang baru, pencarian, dan kedua bahasa.

## Pratinjau browser (port 1420)

| Cek | Hasil |
|---|---|
| Logo di ujung kanan sidebar, terang dan gelap | Lulus |
| Umum: urutan baris, Panel transparan mematikan gradasi panel di preview | Lulus |
| Tampilan notch: preview dengan widget Beranda muat di bingkai pada lebar sempit; klik notch membuka, klik di luar bingkai tidak menutup | Lulus |
| Modul: enam kategori, terbuka/tertutup diingat | Lulus |
| Pintasan: ⌃⌥K, ⌃⌥V, Screenshot, Potong file dan Atur jendela terbuka di tempat dengan nama dan ikon posisi | Lulus |
| Tentang: alur palsu menemukan 0.1.3, Update & install ditolak sebagai build pengembangan | Lulus |
| Yang baru dan Copot Notching tampil di kedua bahasa | Lulus |

## Rilis v0.1.3

| Langkah | Bukti | Hasil |
|---|---|---|
| CI rilis | run `41843960335` hijau | Lulus |
| DMG | Developer ID Ari Padrian (K4TMF53N3L), dinotarisasi, versi 0.1.3 | Lulus |
| Terbit | API GitHub `releases/latest` = v0.1.3 | Lulus |
| Terpasang di `/Applications` | Info.plist 0.1.3, `spctl` menerima, CPU 0,0% saat diam. Versi 0.1.2 dicadangkan di folder sementara sesi | Lulus |
| Cek otomatis di app pengembangan | `updateCheckedAt` tersimpan tanpa error | Lulus |
| Pengaturan tersimpan | `settings.json`: `theme` dark, `panelGlass` true, `autoUpdate` true, `appKeys` ⌃⌥K (40) dan ⌃⌥V (9) | Lulus |

## Belum diuji di Mac

Bagian ini belum dicoba langsung. Tunggu laporan pemilik, lalu cocokkan dengan log atau file sebelum ditulis lulus.

- Mode tampilan terang, gelap, dan sistem di jendela Pengaturan yang terpasang.
- ⌃⌥K menyalakan dan mematikan Keep awake; ⌃⌥V membuka dan menutup Shelf di layar pointer.
- Sepuluh tombol baru Atur jendela, terutama ⌃⌥Return (isi layar) dan ⌃⌥`\` (tengah).
- Lepas izin, setelah itu izin diberikan lagi.
- Update dari dalam app. Fitur ini baru ada di 0.1.3, jadi uji pertamanya adalah 0.1.3 ke 0.1.4.
- Copot Notching sepenuhnya. Uji di akun atau Mac cadangan, karena app dan pengaturannya ikut pindah ke Trash.

Entri izin build pengembangan (Aksesibilitas, Rekam Layar, Akses Disk Penuh, Kamera) dibuka di System Settings untuk dihapus sendiri oleh pemilik.

## Untuk nanti

- `hdiutil attach` sudah usang di macOS terbaru. Updater masih memakainya; ganti sebelum Apple menghapusnya.
- Setiap rilis: beri tanggal pada versinya di `src/settings/changelog.ts`, lalu tambah versi berikutnya di atas.
