# Desain alat latar: Potong file dan Atur jendela

Tanggal: 4 November 2026
Status: bentuk dan kedua alat disetujui pemilik ide (lihat bagian 2 dan 4–5, ditandai **pemilik**). Pemilik meminta dikerjakan dulu, jadi semua hal yang belum diputuskan ditulis sebagai **keputusan penulis** dan dikumpulkan di bagian 10 untuk ditinjau di akhir.

## 1. Kenapa

Sampai sekarang setiap modul Notching punya kotak di notch: halaman sendiri atau satu tombol. Ada pekerjaan kecil yang tidak butuh kotak sama sekali, cukup shortcut yang selalu siap. Contohnya memotong file di Finder, yang tidak bisa dilakukan Mac, dan menata jendela dengan keyboard. Alat latar adalah jenis modul untuk itu: bekerja di belakang layar, tanpa panel.

## 2. Bentuk yang disetujui (pemilik)

- Di Pengaturan → Katalog ada kelompok baru **Alat**. Alat dipasang dan dicopot di sana seperti modul lain.
- Setiap alat punya halaman sendiri di Pengaturan: saklar nyala/mati, shortcut, dan status izin.
- Alat **tidak** punya kotak di halaman Modul di notch.
- Umpan balik ke pengguna hanya lewat telinga notifikasi notch yang sudah ada.
- Pola terdekat adalah modul Screenshot: shortcut, kemampuan di `manifest.json`, setelan shortcut di Pengaturan.

## 3. Tujuan, bukan tujuan, dan yang harus dihindari

**Tujuan**
- Dua alat pertama: **Potong file** dan **Atur jendela**.
- Jenis modul "alat" yang bisa dipakai alat lain nanti tanpa mengubah katalog lagi.

**Bukan tujuan**
- Mengganti shortcut. Di versi ini shortcut kedua alat tetap. **(keputusan penulis, bagian 10)**
- Sepertiga layar, layar penuh, atau memindah jendela ke layar lain.
- Memotong di app selain Finder.

**Yang harus dihindari**
- **CPU tidak lagi 0,0% saat diam.** Tidak ada polling. Atur jendela memakai hot key Carbon, yang tidak memanggil Notching sampai tombolnya ditekan. Potong file memakai event tap keyboard yang hanya memeriksa kode tombol, jadi ketikan biasa langsung diteruskan.
- **Mengganggu ⌘X dan ⌘V di tempat lain.** Di luar Finder, dan di Finder saat sedang mengetik (mengganti nama file, kolom cari), kedua tombol itu sampai ke app tanpa diubah.
- **Notifikasi yang ramai.** Atur jendela diam kalau berhasil. Notch hanya bicara kalau ada yang perlu diketahui.

## 4. Potong file (⌘X)

**Perilaku (pemilik)**
- Di Finder, ⌘X menandai file yang dipilih untuk dipindah. ⌘V di folder lain memindahkannya, sama dengan ⌘C lalu ⌘⌥V.
- Notch memberi tahu: "3 file dipotong", lalu "3 file dipindah ke Dokumen".
- Di luar Finder ⌘X tidak terganggu, termasuk saat Finder sedang mengedit nama file.
- Butuh izin Aksesibilitas.

**Cara kerja (keputusan penulis)**
1. Event tap keyboard (sesi, bisa menahan event) berjalan di thread sendiri, jadi ketikan tidak pernah menunggu thread utama app. Tap hanya melihat tombol yang ditekan. Untuk tombol selain ⌘X dan ⌘V, atau kalau app terdepan bukan Finder (`com.apple.finder`, dicatat dari pemberitahuan macOS saat app berganti), event langsung diteruskan. ⌘X dan ⌘V dikenali dari huruf yang diketik, jadi layout seperti Dvorak tetap benar. Tombol C yang dikirim juga dicari dari layout yang aktif.
2. ⌘X di Finder ditahan. Di thread lain Notching bertanya ke Finder lewat Aksesibilitas, apakah yang sedang fokus adalah kolom teks (`AXTextField`, `AXTextArea`, `AXComboBox`, `AXSearchField`).
   - Kolom teks: ⌘X dikirim ulang apa adanya, jadi teks terpotong seperti biasa. Kalau Finder tidak menjawab dalam 0,5 detik, dianggap kolom teks juga, supaya tombolnya tidak berubah arti.
   - Bukan kolom teks: Notching mengirim ⌘C ke Finder, lalu menunggu clipboard berubah (dicek setiap 50 ms, paling lama 1 detik). Kalau clipboard berubah dan berisi file, potongan dicatat (daftar path dan nomor perubahan clipboard), lalu notch memberi tahu "N file dipotong". Kalau clipboard tidak berubah (tidak ada file terpilih), tidak ada yang terjadi, walaupun clipboard masih berisi file dari salinan sebelumnya.
3. ⌘V di Finder hanya ditahan kalau ada potongan dan clipboard masih sama (nomor perubahannya belum berganti). Kalau tidak, ⌘V lewat seperti biasa.
   - Fokus di kolom teks: ⌘V dikirim ulang apa adanya. Potongan tetap.
   - Selain itu Notching mengirim ⌘⌥V (Finder: "Pindahkan item ke sini"), mencatat nama jendela Finder yang fokus sebagai folder tujuan, lalu potongan selesai.
4. Setelah ⌘⌥V, Notching memeriksa berapa file asal yang sudah tidak ada di tempatnya: setiap 0,5 detik, paling lama 15 detik, berhenti begitu semuanya pindah. Pemeriksaan ini hanya berjalan setelah satu kali tempel. Kalau ada yang pindah, notch memberi tahu "N file dipindah ke Dokumen". Kalau tidak ada (misalnya dibatalkan di dialog Finder), notch diam.
5. Potongan batal sendiri kalau clipboard berganti (misalnya kamu menyalin hal lain). Potongan tidak disimpan saat app ditutup.
6. Event yang dikirim Notching ditandai, sehingga event tap tidak menahannya lagi.

**Kata "file"** dipakai untuk file maupun folder, mengikuti contoh pemilik. **(keputusan penulis)**

**Nama folder tujuan** diambil dari judul jendela Finder yang fokus. Kalau tidak ada jendela (menempel di desktop), dipakai "Desktop". **(keputusan penulis)**

**Izin**
- Tanpa izin Aksesibilitas, macOS menolak event tap, jadi ⌘X di Finder tetap seperti biasa (berbunyi "tidak bisa").
- Kalau izin dicabut, event tap dilepas (saat macOS memberi tahu perubahan daftar izin), supaya keyboard tidak tersangkut.
- Event tap dicoba dipasang saat app menyala, saat alat dinyalakan atau dipasang, saat Pengaturan dibuka, dan saat macOS memberi tahu daftar izin Aksesibilitas berubah (`com.apple.accessibility.api`). Tidak ada polling.
- Saat alat dinyalakan tanpa izin, macOS diminta menampilkan permintaan izinnya sendiri.

## 5. Atur jendela

**Shortcut (pemilik)**, kotak 3×3 di keyboard:

| | | |
|---|---|---|
| ⌃⌥Q kiri atas | ⌃⌥W atas | ⌃⌥E kanan atas |
| ⌃⌥A kiri | ⌃⌥S tengah | ⌃⌥D kanan |
| ⌃⌥Z kiri bawah | ⌃⌥X bawah | ⌃⌥C kanan bawah |

**Aturan (pemilik)**
- Tengah: jendela dipindah ke tengah layar, ukurannya tidak berubah.
- Empat sudut: jendela mengisi seperempat layar.
- Atas, bawah, kiri, kanan: jendela mengisi setengah layar.
- Selalu di layar tempat jendela itu berada, di area yang terlihat (tanpa menu bar dan Dock).
- Butuh izin Aksesibilitas.

**Cara kerja (keputusan penulis)**
- Sembilan hot key Carbon, aktif selama alat terpasang dan menyala. Hot key Carbon tidak butuh izin, jadi tombolnya tetap diambil Notching walaupun izin belum ada.
- Saat tombol ditekan: jendela yang fokus milik app terdepan (lewat Aksesibilitas, `AXFocusedWindow`, atau `AXMainWindow` kalau tidak ada).
- "Layar tempat jendela berada" adalah layar dengan bagian jendela paling luas. Kalau jendela tidak menyentuh layar mana pun, dipakai layar utama.
- Area yang terlihat adalah `visibleFrame` layar itu. Ukuran dibulatkan ke piksel. Untuk setengah dan seperempat, bagian kanan dan bawah mendapat sisa pembulatan, jadi dua setengah selalu pas menutup layar.
- Tengah: kalau jendela lebih besar dari area terlihat, ia diletakkan di pojok kiri atas area itu supaya bilah judulnya tetap terlihat.
- Posisi diatur, lalu ukuran, lalu posisi sekali lagi. Ini cara yang biasa dipakai supaya jendela yang dibatasi ukurannya oleh app tetap mendarat di tempat yang benar.
- Jendela yang ukurannya tidak bisa diubah tetap dipindah posisinya saja.
- Tidak ada animasi. Berhasil: notch diam.

**Notifikasi (keputusan penulis)**
- Tanpa izin: "Atur jendela butuh izin Aksesibilitas", dengan keterangan "Buka Pengaturan → Izin". Paling sering sekali per menit, supaya menekan tombol berulang tidak memenuhi notch.
- Tidak ada jendela yang bisa diatur (misalnya desktop yang fokus): diam.

**Konflik shortcut (keputusan penulis)**
- Tombol didaftarkan secara eksklusif. Kalau macOS menolak mendaftarkan sebuah tombol karena dipegang app lain, atau tombol itu dipakai shortcut Mac sendiri yang menyala, halaman alat di Pengaturan menandai tombol itu ("Dipakai app lain" atau "Dipakai Mac"). Tidak ada notifikasi saat app menyala.
- Shortcut tidak bisa diganti di versi ini (bagian 10).
- Selama Atur jendela menyala, tombol Screenshot tidak bisa direkam dengan salah satu dari sembilan tombol ini. Pesannya "Dipakai Atur jendela".

## 6. Jenis modul "alat"

- Manifest mendapat field `"tool"` berisi nama kemampuan alat itu, misalnya `"tool": "cut"`. Kemampuan itu wajib ada di `capabilities`. Alat tidak punya `entry`, `card`, atau `action`. Ia boleh punya `notifications`.
- Kemampuan baru: `cut` (Potong file) dan `windows` (Atur jendela). Keduanya dijalankan inti app, bukan halaman modul, jadi gate hanya membolehkannya untuk paket yang menyebutnya.
- Alat dihitung sebagai modul untuk nyala/mati, copot, dan pasang (`disabled_modules`, `uninstalled_modules`, sama seperti modul).
- Alat tidak punya kotak di notch dan tidak bisa dibuka sebagai halaman modul di notch.
- Paket baru: `cut-files` dan `window-keys`, di akhir daftar modul pada `modules/index.json` (sebelum paket widget). Seperti modul lain, keduanya terpasang dan menyala sejak awal, termasuk untuk pengguna yang memperbarui app. **(keputusan penulis)**

## 7. Pengaturan

**Katalog**
- Saringan menjadi **Semua · Modul · Alat · Widget**.
- Kartu alat berlabel "ALAT", menampilkan izin yang dibutuhkan seperti kartu modul.
- Urutan: modul, lalu alat, lalu paket widget.

**Bagian Modul**
- Daftar modul terpasang tetap. Di bawahnya kelompok berlabel **Alat** berisi alat yang terpasang, dengan saklar dan panah ke halamannya, sama seperti baris modul. **(keputusan penulis)**
- Jumlah di sidebar menghitung modul dan alat.

**Halaman alat** (memakai halaman modul yang sudah ada)
- Kepala: ikon, nama, keterangan, saklar.
- **Izin:** satu baris "Aksesibilitas", dengan "Diizinkan" atau "Belum diizinkan" dan tombol "Buka Pengaturan Sistem".
- **Shortcut:**
  - Potong file: dua baris tetap, "Potong" ⌘X dan "Pindahkan ke sini" ⌘V, dengan catatan "Hanya di Finder. Saat mengetik, ⌘X dan ⌘V tetap seperti biasa."
  - Atur jendela: kotak 3×3 berisi sembilan tombol. Tombol yang dipegang pihak lain ditandai, dan di bawahnya satu baris menyebut siapa yang memegangnya.
- Kaki: versi, ukuran, Copot (dua klik), seperti modul.

**Halaman Izin** di Pengaturan: keterangan Aksesibilitas menjadi "Untuk mengunci keyboard, memotong file, dan mengatur jendela."

**Notifikasi:** setiap alat punya saluran sendiri di halaman Notifikasi, seperti modul lain. Potong file: saluran "Potong dan pindah". Atur jendela: saluran "Izin".

## 8. Teks (keputusan penulis)

| | Indonesia | English |
|---|---|---|
| Nama | Potong file | Cut files |
| Keterangan | ⌘X dan ⌘V untuk memindah file di Finder | ⌘X and ⌘V move files in Finder |
| Dipotong | {n} file dipotong · Tekan ⌘V di folder tujuan | {n} file(s) cut · Press ⌘V in the destination folder |
| Dipindah | {n} file dipindah ke {folder} | {n} file(s) moved to {folder} |
| Nama | Atur jendela | Arrange windows |
| Keterangan | ⌃⌥ dan Q–C untuk menata jendela di layarnya | ⌃⌥ with Q–C places windows on their screen |
| Tanpa izin | Atur jendela butuh izin Aksesibilitas · Buka Pengaturan → Izin | Arrange windows needs Accessibility access · Open Settings → Permissions |

Dalam bahasa Inggris "file" dan "files" dipilih sesuai jumlah.

## 9. Pengujian

- Rust (tanpa AppKit): manifest alat (sah dan tidak sah), gate kemampuan baru, daftar dan nyala/mati alat di store, pengenalan ⌘X dan ⌘V dari kode tombol dan modifier, aturan kapan ⌘V ditahan, hitungan file yang pindah, perhitungan sembilan posisi jendela, pemilihan layar, konversi koordinat AppKit ke koordinat layar, dan teks notifikasi.
- Tampilan: saringan dan label Alat di katalog, kelompok Alat di bagian Modul, alat tidak muncul sebagai kotak di notch, halaman kedua alat (izin, shortcut, tanda konflik), dan kedua bahasa.
- Di Mac oleh pemilik: memotong dan memindah file di Finder (termasuk desktop dan saat mengganti nama), ⌘X di app lain, sembilan tombol jendela di satu dan dua layar, dan CPU 0,0% saat diam. Hasilnya ditulis di dokumen verifikasi.

## 10. Keputusan penulis untuk diperiksa pemilik ide

1. Shortcut kedua alat tetap di versi ini. ⌘X dan ⌘V memang tombol Finder, dan kotak 3×3 adalah pilihan pemilik. Mengganti shortcut bisa ditambah nanti.
2. Nama: **Potong file** (Cut files) dan **Atur jendela** (Arrange windows). Id paket `cut-files` dan `window-keys`.
3. Teks notifikasi di bagian 8. Atur jendela diam kalau berhasil.
4. "File" dipakai untuk file maupun folder.
5. Folder tujuan diambil dari judul jendela Finder, atau "Desktop".
6. Potongan batal kalau clipboard berganti, dan tidak disimpan saat app ditutup.
7. Konflik shortcut hanya ditandai di halaman alat, tanpa notifikasi saat app menyala.
8. Kedua alat langsung terpasang dan menyala, juga setelah update app.
9. Di bagian Modul Pengaturan, alat tampil di kelompok sendiri di bawah modul.
10. Jendela yang lebih besar dari layar saat ditengahkan diletakkan di pojok kiri atas area terlihat.
11. Saat alat dinyalakan tanpa izin, permintaan izin macOS muncul.
