# Verifikasi: kerangka notch di Mac (rencana 1)

Tanggal: 27 Oktober 2026
Perangkat: MacBook Air M4 (layar bawaan ber-notch, Retina) + monitor 1920×1080 sebagai layar utama.
macOS 27.0.1. Build rilis: `npm run tauri build -- --bundles app`.

## CPU saat diam

Perintah: `for i in $(seq 10); do ps -o %cpu= -p $(pgrep -x notching); sleep 1; done`
(Nama proses di dalam bundle adalah `notching`, huruf kecil, jadi `pgrep -x Notching` di rencana tidak menemukan apa-apa.)

Hasil, setelah app diam 10 detik:
- Proses `notching`: 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0. Semua di bawah 1,0.
- Proses WebKit milik app (2 WebContent untuk dua layar, GPU, Networking): total 0.0 di 5 sampel.
- Memori proses utama: sekitar 90 MB. Ukuran `Notching.app`: 3,87 MB.

## Checklist

| # | Cek | Hasil | Catatan |
|---|---|---|---|
| 1 | Di layar MacBook notch tidak terlihat saat diam. Di monitor eksternal lensa tipis (4 px) tepat di tengah. | Lulus | Dilaporkan pemilik. |
| 2 | Hover di layar MacBook → tetesan turun dari bawah notch fisik. Klik → isi kartu mulai di bawah kamera. | Lulus | Dilaporkan pemilik. |
| 3 | Saat diam, menu app yang panjang di menu bar monitor utama bisa diklik di dekat tengah layar. | Lulus | Dilaporkan pemilik. |
| 4 | Esc dan klik di luar sama-sama menutup panel, dan ketikan langsung kembali ke app sebelumnya. | Lulus | Dilaporkan pemilik. |
| 5 | Pindah Space (Ctrl+→) → notch tetap ada. App layar penuh → notch tidak tampil di Space itu. | Lulus | Dilaporkan pemilik. |
| 6 | Cabut monitor, lalu pasang lagi → overlay muncul kembali di kedua layar tanpa jendela ganda; `pgrep -x Notching` satu proses. | Lulus | Dilaporkan pemilik. Sesudahnya `pgrep -x notching` → 1 proses (PID 36871, sama sejak app dibuka, jadi tidak ada crash), dan 2 proses WebContent untuk 2 layar. |
| 7 | Ganti resolusi layar MacBook → notch tetap di tengah, tetesan tetap menyatu dengan notch fisik. | Lulus | Dilaporkan pemilik. |
| 8 | Gerakan terasa sama dengan mockup: tetesan kenyal, panel memantul kecil, pil muncul sesaat setelah panel terbuka. | Lulus | Dilaporkan pemilik. |

Semua delapan poin lulus, dicek pemilik ide pada 27 Oktober 2026 dengan build rilis.

## Temuan dan perbaikan

- Selama Task 7, app crash saat layar berubah (NSRangeException dari Touch Bar finder ketika panel ditutup). Diperbaiki: panel tidak pernah ditutup, hanya dipindah, dimuat ulang, atau disembunyikan.
