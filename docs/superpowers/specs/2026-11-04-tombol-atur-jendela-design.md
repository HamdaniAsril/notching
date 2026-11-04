# Desain: tombol Atur jendela bisa diganti

Tanggal: 4 November 2026
Status: permintaan pemilik saat menyetujui alat latar ("tombol Q–C nanti harus bisa diganti sendiri", spec alat latar §10 no. 1). Pemilik biasa minta dikerjakan dulu, jadi yang belum diputuskan ditandai **keputusan penulis** dan dikumpulkan di bagian 6 untuk ditinjau.

## 1. Maksud

Sembilan tombol Atur jendela (⌃⌥ Q W E / A S D / Z X C) sekarang tetap. Orang yang sudah memakai ⌃⌥ huruf itu untuk app lain, atau lebih suka tombol lain, harus bisa menggantinya di Pengaturan, dengan cara yang sama seperti tombol Screenshot: klik tombolnya, tekan yang baru.

## 2. Yang bisa diganti

- Setiap sel diganti sendiri-sendiri, lengkap dengan modifiernya, bukan hanya ⌃⌥ untuk kesembilannya sekaligus. **(keputusan penulis)** Alasan: pemilik menyebut "tombol Q–C", dan satu pola perekaman dipakai untuk semua sel, sama dengan Screenshot.
- Aturan tombol sama dengan Screenshot: satu tombol (huruf, angka, tanda baca, F1–F12) dengan ⌘, ⌃ atau ⌥; ⇧ boleh ditambah.
- Ditolak, dengan alasan di bawah grid:
  - tombol sel lain → "Sudah dipakai untuk Kiri atas" (nama sel itu);
  - salah satu dari dua tombol Screenshot selagi Screenshot menyala → "Dipakai Screenshot";
  - tanpa ⌘, ⌃ atau ⌥ → "Pakai ⌘, ⌃, atau ⌥ dengan satu tombol".
- Kebalikannya, Screenshot menolak tombol Atur jendela yang sedang terpasang (bukan lagi ⌃⌥ Q–C yang tetap) selagi Atur jendela menyala. Syarat "selagi menyala" sama dengan aturan yang sudah ada. **(keputusan penulis)**
- "Kembalikan ke ⌃⌥ Q–C" muncul di bawah grid bila ada yang diganti. Menghapus Atur jendela juga mengembalikan tombolnya, seperti Screenshot.

## 3. Cara merekam (halaman Atur jendela)

- Setiap kotak di grid 3×3 menjadi tombol. Klik → kotak itu bercincin aksen dan berisi "…", lalu tekan tombol baru. Di bawah grid: "Tekan tombol baru untuk Kiri atas. Esc untuk batal." **(keputusan penulis: kotak 44 px terlalu kecil untuk "Tekan tombol…")**
- Selama merekam, semua tombol Notching (Screenshot dan Atur jendela) dilepas, jadi menekan ⌃⌥Q tidak memindah jendela Pengaturan dan tombol yang sudah dipakai sel lain sampai ke halaman lalu ditolak dengan alasannya.
- Esc membatalkan, klik di luar atau jendela kehilangan fokus juga membatalkan. Setelah tersimpan, perekaman selesai dan tombol dipasang lagi. Menutup Pengaturan saat merekam juga memasang tombol lagi.
- Tampilan: bila kesembilan tombol memakai modifier yang sama, modifier itu tampil di depan grid (seperti sekarang, ⌃ ⌥ +) dan kotak berisi tombolnya saja. Bila berbeda-beda, bagian depan hilang dan tiap kotak berisi label lengkap ("⌃⇧Q"). **(keputusan penulis)**
- Status per tombol tetap: dipakai app lain, dipakai pintasan Mac — kotaknya merah dan disebut di bawah grid.

## 4. Inti

- Disimpan di settings.json sebagai `windowKeys`, satu combo per sel (`{"topLeft":{"code":12,"mods":6144},…}`). Sel yang hilang atau rusak memakai bawaannya; berkas yang tidak terbaca utuh kembali ke bawaan, seperti `shotKeys`.
- Pendaftaran tetap per tombol, dengan status ok / other / shortcut, dan tetap hanya selagi alat menyala.
- Perintah baru: `window_set_key(cell, code, cmd, ctrl, alt, shift)` dan `window_reset_keys`. `shot_keys_hold` melepas dan memasang kembali tombol kedua alat.

## 5. Bukan bagian ini

- Mengganti apa yang dikerjakan tiap sel (tetap sudut/sisi/tengah).
- Mematikan satu sel saja.

## 6. Keputusan penulis untuk ditinjau

1. Setiap sel diganti sendiri, lengkap dengan modifier (bukan hanya modifier bersama).
2. Penolakan silang Screenshot ↔ Atur jendela hanya selagi alat lainnya menyala.
3. Kotak yang merekam berisi "…", ajakan menekan tombol ditulis di bawah grid.
4. Modifier di depan grid hanya bila kesembilannya sama; selain itu label lengkap di tiap kotak.
5. Deskripsi modul di Katalog ("⌃⌥ dan Q–C untuk menata jendela") tetap, karena itu tombol bawaannya.
