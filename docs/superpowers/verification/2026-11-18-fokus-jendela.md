# Verifikasi Fokus jendela

Tanggal: 18 November 2026. Cabang `fokus-jendela`.

## Uji pertama (rencana Task 1, desain bagian 8)

Skrip AppKit buang-pakai (`spike.swift`, tidak di-commit): panel transparan berisi `NSVisualEffectView` (`behindWindow`, `fullScreenUI`, `active`, gelap), level normal, diurutkan dengan `order(.below, relativeTo:)` di bawah jendela teratas app lain. Mac pemilik, macOS 27.2, Apple Silicon.

1. **Panel tepat di bawah jendela app lain: lulus.** Daftar jendela window server selama uji: `Claude > [LAPISAN] > Arc > warust > System Settings`, tetap sama sampai uji selesai.
2. **Jendela app lain ter-blur, bukan hanya desktop: lulus.** Dilihat pemilik ("semua aman").
3. **Lubang intipan bergradasi halus: lulus.** Dilihat pemilik. Pemilik meminta yang jelas hanya **sepertiga atas** jendela, bukan setengah. Desain dan aturan (`PEEK_CLEAR`) diubah.
4. **Dua jendela dari dua app (AXRaise): belum diuji.** Proses skrip tidak punya izin Aksesibilitas. Diuji di dalam Notching, yang punya izin itu, pada uji di Mac (rencana Task 9).

Skrip tidak bisa memotret layar (tanpa izin Screen Recording), jadi nomor 2 dan 3 dinilai dari mata pemilik.

## Uji di app (rencana Task 9), putaran 1

Notching Dev (`id.web.notching.dev`, bundle debug dibuka lewat `open`). Versi dev yang dijalankan dari terminal Claude Code tidak bisa diberi izin Aksesibilitas: macOS memeriksa izin app yang menjalankannya. Bundle dengan identitas sendiri memisahkan izin dan setelannya dari Notching yang terpasang.

⌃⌥F berjalan. Catatan pemilik, diterapkan:
1. Bagian jelas intipan lebih ke atas dan transisinya lebih tegas: jelas 20% teratas, gradasi sampai 28%.
2. Blur hanya di monitor tempat jendela fokus berada.
3. Saat mengintip jendela paling belakang, bagian jendela lain yang menutupinya ikut jelas. Diperbaiki: bagian itu tetap blur.
4. Sudut atas lubang intipan kotak, tidak mengikuti jendela. Diperbaiki: sudutnya membulat (radius 26 pt).
5. Gradasi 8% terlalu keras. Diubah: gradasi 20%, jadi blur penuh di 40% tinggi jendela.

Putaran 2, catatan pemilik, diterapkan:
6. Transisi 20% masih kurang halus. Diubah: gradasi 30% dengan kurva *ease* (9 titik), blur penuh di 50%.
7. Jendela yang diintip tertutup jendela blur lain, hasilnya jelek. Diubah: jendela itu dinaikkan (AXRaise) ke atas jendela blur lain, lalu jendela fokus dinaikkan lagi dan lapisan diurutkan ulang di bawahnya.
8. Klik jendela di monitor tanpa blur memindahkan fokus ke sana. Diubah: fokus hanya pindah ke jendela di monitor yang di-blur; di monitor lain hanya lewat ⌃⌥F.

Putaran 3, catatan pemilik, diterapkan:
9. Aturan setengah fokus dihapus: intipan menampilkan seluruh jendela, dengan sudut membulat. Jendela yang tertutup tetap maju saat diintip.
