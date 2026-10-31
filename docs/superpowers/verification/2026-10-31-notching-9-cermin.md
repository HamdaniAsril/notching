# Verifikasi Cermin

Tanggal: 31 Oktober 2026
Perangkat: MacBook Air M4, dengan layar bawaan ber-notch.
Cara cek: build rilis dari `main` (cabang `cermin`) dibuka dengan `open`. Build tes dari worktree `adoring-booth-2ff93a` ditutup dulu dengan cara biasa, atas izin pemilik.

Desain: `docs/superpowers/specs/2026-10-31-cermin-design.md`. Atas permintaan pemilik ("coba build dulu"), rencana terpisah tidak dibuat.

## Test otomatis

- `npx tsc --noEmit`: lulus.
- `npm test`: 410 lulus (401 di awal).
- `cargo test`: 220 lulus, 1 diabaikan (216 di awal).

## Data

- Salinan data sebelum cek ada di `~/Library/Application Support/id.web.notching/before-cermin/`.
- Modul `mirror` terpasang sendiri di folder modul dalam keadaan menyala.
- Ukuran `Notching.app` (rilis): 5,33 MiB.

## Checklist di Mac

| # | Cek | Hasil | Catatan |
|---|---|---|---|
| 1 | Membuka Cermin memunculkan permintaan izin kamera, lalu kamera tampil dibalik. | Lulus setelah perbaikan | Pada build pertama, WebKit menolak kamera di dalam frame (`UserMediaRequest::deny - permission denied`), dan tccd tidak menerima permintaan kamera. Setelah `allow="camera *"`, log menunjukkan `UserMediaRequest::allow` pada 21.56.23 dan 21.56.44. |
| 2 | Penggaris zoom. | Dilaporkan pemilik | Pemilik melapor "sudah berhasil semua". |
| 3 | Flip. | Dilaporkan pemilik | |
| 4 | Lampu: panel melebar, sisi berwarna Kelvin, glow, layar paling terang, penggaris warna. | Dilaporkan pemilik | Kecerahan tidak dicatat dari luar app, jadi hanya berdasarkan laporan pemilik. |
| 5 | Lampu mati atau panel ditutup mengembalikan kecerahan. | Dilaporkan pemilik | |
| 6 | Notching keluar saat Lampu menyala, beberapa kamera, monitor eksternal. | Tidak dicek | |

## Temuan

- **Kamera ditolak di frame modul.** Frame modul diisolasi tanpa `allow-same-origin`, jadi asalnya opaque. Daftar izin bawaan `allow="camera"` hanya berlaku untuk asal `src`, sehingga tidak pernah cocok. Ini diperbaiki dengan `allow="camera *"`. Atribut ini hanya diberikan ke frame modul yang mencantumkan izin `camera`.

## Keputusan pembuat

- Area notch menjadi 960 × 560, dan batas tinggi kartu menjadi 420. Ini berlaku untuk semua modul. Kalau keputusan ini salah, dampaknya hanya dua konstanta.
- Saat Lampu menyala, tinggi panel tetap, dan tampilan kamera memendek untuk memberi tempat penggaris warna. Kalau salah, dampaknya tinggi panel yang berubah.
- Pilihan kamera berupa tombol yang berganti ke kamera berikutnya, bukan daftar. Kalau salah, dampaknya perlu satu menu.
- Kecerahan diatur lewat DisplayServices (privat) yang dibuka saat app berjalan. Layar yang tidak bisa dibaca dibiarkan. Kalau salah, Lampu tetap menyala tanpa menaikkan kecerahan.
- `media-src mediastream: blob:` ditambahkan ke CSP modul. Kalau salah, dampaknya satu baris CSP.
