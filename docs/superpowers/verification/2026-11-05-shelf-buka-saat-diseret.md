# Verifikasi Shelf terbuka saat file mulai diseret

Tanggal: 5 November 2026
Cabang: `main`. Permintaan pemilik di percakapan ("panel shelf langsung terexpand saat user drag file"), bentuknya disetujui di percakapan ("Ya, bangun"). Commit: `ccb1f7b`.

## Yang dibangun

- Begitu file mulai diseret dari mana saja, Shelf terbuka di notch layar tempat seretan dimulai.
- Selama tombol mouse masih ditekan, Shelf tetap terbuka walaupun kursor jauh dari notch. Kalau seretan sampai di notch layar lain, Shelf pindah ke sana.
- Kalau file dilepas di tempat lain atau seretan dibatalkan, Shelf menutup sendiri. Kalau dilepas di notch, file tersimpan seperti biasa.
- Yang dihitung sebagai file sama dengan yang diterima Shelf: URL file dan file promise (Mail, Photos). Seretan keluar dari Shelf sendiri tidak membukanya lagi.
- Tombol "Buka saat menyeret file" di Pengaturan → Modul → Shelf, menyala sebagai bawaan. Kalau mati, Shelf baru terbuka saat file sampai di notch, seperti sebelumnya.

## Cara kerjanya (`src-tauri/src/shelf_watch.rs`)

Monitor global hanya mendengar tombol kiri ditekan (`LeftMouseDown`) dan mouse digeser sambil ditekan (`LeftMouseDragged`). Gerakan mouse biasa tidak terdengar. Saat tombol ditekan, change count drag pasteboard dicatat. Selama seretan, angka itu dibaca lagi paling sering 50 ms sekali dan paling lama 1,5 detik sejak mouse mulai bergerak. Kalau angkanya berubah dan isinya file, drop mode dimulai (`shelf_drop.rs`, `DropEvent::Started`). Monitor hanya terpasang selama Shelf menyala dan tombolnya hidup. Fitur ini tidak butuh izin baru.

## Keputusan penulis

1. Tombolnya menyala sebagai bawaan.
2. Batas 50 ms dan 1,5 detik: sesi drag macOS dimulai beberapa titik setelah mouse bergerak, jadi seretan yang lebih lama tanpa sesi adalah menggeser jendela atau memblok teks.
3. Change count dicatat ulang setiap kali tombol ditekan, supaya seretan keluar dari Shelf sebelumnya tidak terbaca sebagai seretan file baru.

## Test otomatis

| Pemeriksaan | Hasil |
|---|---|
| `npx tsc --noEmit` | lulus |
| `npm test` | 1215 lulus |
| `cargo test --lib` | 512 lulus, 1 diabaikan (test jaringan) |
| `npx tauri build --bundles app` | lulus, `Notching.app` 9,67 MB |

Tes baru mencakup aturan drop mode (terbuka dari mana saja, tetap terbuka selama tombol ditekan, menutup saat dilepas di tempat lain, pindah ke notch lain, diabaikan bila Shelf mati atau seretan dari Shelf sendiri), aturan pengamat seretan (sekali per seretan, jarak baca, batas waktu, perubahan sebelum tombol ditekan tidak dihitung), pengaturan yang tersimpan, tombol di halaman Shelf, dan pencarian di kedua bahasa.

## Di app (build uji, 5 November)

Notching v0.1.3 di `/Applications` ditutup selama pengujian lalu dibuka lagi. Pengaturan dicadangkan sebelumnya di folder sementara sesi.

| Langkah | Bukti | Hasil |
|---|---|---|
| Pengamat terpasang | log: `shelf drag watch on` | Lulus |
| Mulai menyeret file → Shelf terbuka | log: 4× `a file drag started; shelf opens on notch-0` | Lulus |
| Lepas di notch → tersimpan | log: `shelf kept 1 new item(s)` | Lulus |
| Lepas di tempat lain → Shelf menutup | tiga seretan tanpa simpanan; menutupnya hanya terlihat di layar | Lulus menurut pemilik |
| Seretan keluar dari Shelf tidak membukanya lagi | log: `shelf drag of 1 item(s) ended`, tanpa `file drag started` sesudahnya | Lulus |
| Pindah ke notch layar lain | semua seretan di notch-0 | Belum diuji di Mac |
| Tombol dimatikan | tidak ada `shelf drag watch off` di log | Belum diuji di Mac |

## CPU

| Pengukuran | Hasil |
|---|---|
| v0.1.3, diam, 30 detik | rata-rata 0,02%, tertinggi 0,6% |
| Build uji dengan pengamat menyala, diam, 60 detik | rata-rata 0,00%, tertinggi 0,1% |
| Build uji selama 35 menit pengujian (seretan, panel buka-tutup, seretan keluar) | 4,2 detik CPU, rata-rata 0,2% |

Angka di atas hanya proses utama Notching. Hampir semuanya dipakai untuk menggambar panel saat terbuka.

Ada satu baris `sandbox_extension_consume failed` di log. Baris itu muncul saat file diseret keluar dari Shelf, bagian yang sudah ada sebelumnya, dan Shelf tetap berjalan normal.
