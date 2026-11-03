# Desain peringatan pertama dan tombol sendiri untuk Screenshot

Status: pemilik meminta dikerjakan sampai selesai lalu direview di akhir (3 November 2026).

Dokumen ini menambah desain Screenshot (`2026-11-01-screenshot-design.md`), terutama bagian 4 tentang tombol keyboard. Gaya tampilan mengikuti Volt (`2026-11-02-gaya-volt-design.md`, `2026-11-03-volt-seluruh-app-design.md`). Hal yang tidak disebut di sini tetap seperti di dokumen-dokumen itu.

## 1. Kenapa

Permintaan pemilik: "aku mau saat pertama kali menggunakan fitur screenshot muncul peringatan untuk mematikan settingan bawaan mac, atau user custom shortcut sendiri. kalau user memilih untuk mematikan settingan bawaan, notching langsung membuka menu settingan terkait."

Pemilik membenarkan sebabnya. Orang yang baru memasang Notching menekan ⌘⇧3, lalu yang muncul screenshot bawaan Mac, dan mereka bingung kenapa Notching diam saja. Notifikasi kecil yang ada sekarang ("⌘⇧3 masih dipakai Mac") hanya memberi tahu. Peringatan baru langsung memberi dua jalan keluar.

## 2. Tujuan, bukan tujuan, dan yang harus dihindari

**Tujuan**
- Peringatan muncul **sekali**, saat pertama kali Notching bertemu modul Screenshot yang tombolnya masih direbut.
- Peringatan punya dua pilihan:
  - **Matikan bawaan Mac**, yang langsung membuka Pengaturan Sistem di pengaturan pintasan Screenshot;
  - **Pakai tombol sendiri**, yang membuka Pengaturan Notching → Modul → Screenshot, tempat kedua tombol bisa diganti.
- Tombol Screenshot bisa diganti kapan saja di Pengaturan, lalu dikembalikan ke ⌘⇧3 dan ⌘⇧4.

**Bukan tujuan**
- Notching mematikan pintasan Mac sendiri. Pemilik meminta Notching membuka pengaturannya, dan orangnya sendiri yang mematikan.
- Mengganti tombol dari panel notch. Tempatnya di Pengaturan **(keputusan penulis)**.
- Tombol terpisah untuk Window dan Area. ⌘⇧4, atau penggantinya, tetap satu tombol untuk klik window atau tarik area.

**Yang harus dihindari**
- **Peringatan yang terus muncul.** Setelah tampil sekali, peringatan tidak muncul lagi, termasuk setelah Notching dibuka ulang.
- **Tombol baru yang diam saja.** Kalau tombol pilihan sendiri ternyata dipakai Mac atau app lain, Pengaturan langsung mengatakannya.
- **Merekam tombol malah memotret.** Saat tombol baru sedang direkam, menekan ⌘⇧4 tidak boleh membuka pemilih area.

## 3. Kapan peringatan muncul

- Peringatan muncul saat Notching pertama kali melihat bahwa modul Screenshot menyala dan ⌘⇧3 atau ⌘⇧4, atau tombol penggantinya, tidak sampai ke Notching. Pemeriksaan ini terjadi saat Notching dibuka, setelah notch siap, dan saat modul dinyalakan. Saat yang sama dipakai untuk notifikasi kecil yang sudah ada.
  - "Pertama kali menggunakan fitur" diartikan begini karena Notching tidak tahu saat ⌘⇧3 ditekan lalu direbut Mac (desain 1 Nov §4) **(keputusan penulis)**.
- Peringatan **menggantikan notifikasi kecil** pada kesempatan itu. Pada pembukaan berikutnya, notifikasi kecil tetap muncul seperti sekarang selama tombolnya masih direbut, paling banyak sekali setiap Notching dibuka.
- Peringatan dihitung sudah tampil begitu panelnya terbuka, walaupun ditutup tanpa memilih **(keputusan penulis)**.
- Kalau saat pemeriksaan pertama tidak ada tombol yang direbut, misalnya pintasan bawaan Mac sudah dimatikan, peringatan tidak muncul dan dianggap selesai. Peringatan juga tidak muncul nanti **(keputusan penulis)**.
- Pengguna lama, termasuk pemilik sendiri, melihat peringatan ini sekali setelah memperbarui Notching kalau tombolnya masih direbut **(keputusan penulis)**.
- **Hanya app lain yang memegang tombol** (bukan Mac): peringatan tetap muncul, berbunyi "⌘⇧4 dipakai app lain", dan hanya punya pilihan **Pakai tombol sendiri**, karena Pengaturan Sistem tidak bisa membebaskannya **(keputusan penulis)**.
- Kalau Mac dan app lain sama-sama memegang tombol, peringatan menyebut tombol yang dipakai Mac, seperti notifikasi kecil yang sudah ada.

## 4. Peringatan di notch

- Notch **membuka panel sendiri** di layar yang ada kursornya, seperti saat hasil screenshot tampil. Panel menjadi jendela aktif, jadi Esc langsung bekerja.
- **Isi panel (keputusan penulis):**
  - label kecil "Screenshot" di atas;
  - judul, misalnya "⌘⇧3 dan ⌘⇧4 masih dipakai Mac";
  - satu kalimat: "Matikan screenshot bawaan Mac, atau pakai tombol sendiri untuk Notching.";
  - tombol **Matikan bawaan Mac** sebagai tombol utama dengan warna aksen, dan **Pakai tombol sendiri** di sebelahnya.
- **Panel menutup** saat salah satu tombol ditekan, saat Esc ditekan, atau saat ada klik di luar panel. Panel tidak menutup sendiri setelah beberapa detik.
- Kalau screenshot diambil lewat tombol di halaman Screenshot saat peringatan masih terbuka, hasil screenshot menggantikan isi panel.

## 5. Pilihan "Matikan bawaan Mac"

- Panel menutup, lalu **Pengaturan Sistem terbuka di pengaturan pintasan Screenshot**, yaitu Keyboard → Pintasan Keyboard → Screenshot.
  - macOS tidak mengizinkan app lain membuka langsung sampai bagian Screenshot. Di file pengaturan Keyboard milik macOS, bagian itu bernama `screenshots`, tapi tidak ada alamat untuk membukanya. Jadi Notching membuka jendela Pintasan Keyboard (diperiksa di Mac pemilik, 3 November 2026).
  - Begitu jendela itu terbuka, notch menampilkan petunjuk "Pilih Screenshot di kiri, lalu matikan ⌘⇧3 dan ⌘⇧4". Petunjuk ini hanya menyebut tombol yang masih direbut Mac (permintaan pemilik, 3 November 2026).
- **Setelah itu Notching memperhatikan pintasan Mac selama 10 menit (keputusan penulis).** Begitu semua tombol yang tadinya direbut Mac sudah bebas, notch menampilkan notifikasi biasa: "⌘⇧3 dan ⌘⇧4 sekarang untuk Notching".
- Keterangan "masih dipakai screenshot bawaan Mac" di halaman Screenshot dan di Pengaturan hilang sendiri, seperti sekarang.
- Kalau orang itu tidak jadi mematikannya, tidak ada pesan tambahan. Notifikasi kecil pada pembukaan berikutnya tetap mengingatkan.

## 6. Pilihan "Pakai tombol sendiri"

- Panel menutup, lalu **jendela Pengaturan Notching terbuka di Modul → Screenshot**. Kalau jendela Pengaturan sudah terbuka, jendela itu pindah ke halaman tersebut.
- **Bagian "Tombol" di Pengaturan → Modul → Screenshot (keputusan penulis):**
  - dua baris, **Seluruh layar** dengan ⌘⇧3 dan **Window atau area** dengan ⌘⇧4, masing-masing dengan kotak tombol di kanan;
  - klik kotak untuk merekam tombol baru, dan kotak berbunyi "Tekan tombol…". Tekan kombinasi baru, lalu kombinasi itu langsung tersimpan dan berlaku tanpa membuka ulang Notching;
  - **Esc** atau klik di tempat lain membatalkan perekaman, dan tombol lama tetap dipakai;
  - kombinasi harus memakai **⌘, ⌃, atau ⌥** ditambah satu tombol biasa (huruf, angka, tanda baca, atau F1–F12). Shift boleh ditambahkan, tapi Shift saja tidak cukup. Kalau kombinasinya tidak bisa dipakai, kotak menampilkan "Pakai ⌘, ⌃, atau ⌥ dengan satu tombol" dan tetap merekam;
  - kombinasi yang sama dengan tombol satunya ditolak dengan keterangan "Sudah dipakai untuk Seluruh layar" atau "Sudah dipakai untuk Window atau area", dan perekaman tetap berjalan;
  - **selama perekaman, tombol Screenshot Notching dilepas sebentar,** supaya menekan ⌘⇧4 tidak membuka pemilih area. Setelah perekaman selesai atau batal, tombolnya dipasang lagi;
  - tombol **Kembalikan ke ⌘⇧3 dan ⌘⇧4** muncul di bawah kedua baris selama salah satu tombol sudah diganti.
- **Keterangan di bawah setiap baris:**
  - "Dipakai screenshot bawaan Mac" beserta tombol ke Pengaturan Sistem, kalau tombol itu masih direbut screenshot bawaan Mac. Ini menggantikan keterangan yang sekarang ada di halaman itu;
  - "Dipakai pintasan Mac" kalau tombol pilihan sendiri sama dengan pintasan Mac lain yang menyala, misalnya ⌘⇧5 untuk alat screenshot Mac. Pintasan yang diperiksa adalah pintasan bawaan Mac yang tercatat di setelan pintasan Mac, bukan pintasan di dalam app lain **(keputusan penulis)**;
  - "Dipakai app lain" kalau Notching gagal memasang tombol itu.
- **Tombol baru dipakai di mana-mana,** termasuk keterangan tombol di halaman Screenshot (misalnya "⌃⇧S" dan "⌃⇧A + klik"), kalimat daftar kosong, notifikasi kecil, dan peringatan.
- Tombol yang dipilih tetap tersimpan walaupun Notching ditutup atau Mac dinyalakan ulang. Kalau modul Screenshot **dicopot**, tombol kembali ke ⌘⇧3 dan ⌘⇧4. Kalau modul hanya **dimatikan**, pilihan tetap disimpan **(keputusan penulis)**.

## 7. Kata-kata

Kata-kata pastinya ditentukan pembuat, kira-kira:

| Tempat | Bahasa Indonesia | English |
|---|---|---|
| Judul peringatan (Mac) | {keys} masih dipakai Mac | {keys} are still taken by the Mac |
| Judul peringatan (app lain) | {keys} dipakai app lain | {keys} is taken by another app |
| Kalimat peringatan | Matikan screenshot bawaan Mac, atau pakai tombol sendiri untuk Notching. | Turn off the Mac's own screenshots, or give Notching keys of its own. |
| Kalimat peringatan (app lain) | Pilih tombol lain untuk Notching. | Pick other keys for Notching. |
| Tombol peringatan | Matikan bawaan Mac · Pakai tombol sendiri | Turn off the Mac's · Use my own keys |
| Setelah dimatikan | {keys} sekarang untuk Notching | {keys} now go to Notching |
| Judul bagian | Tombol | Keys |
| Baris | Seluruh layar · Window atau area | Whole screen · Window or area |
| Merekam | Tekan tombol… | Press keys… |
| Ditolak | Pakai ⌘, ⌃, atau ⌥ dengan satu tombol | Use ⌘, ⌃ or ⌥ with one key |
| Kembar | Sudah dipakai untuk {row} | Already used for {row} |
| Kembalikan | Kembalikan ke ⌘⇧3 dan ⌘⇧4 | Back to ⌘⇧3 and ⌘⇧4 |
| Bentrok | Dipakai screenshot bawaan Mac · Dipakai pintasan Mac · Dipakai app lain | Taken by the Mac's screenshots · Taken by a Mac shortcut · Taken by another app |

## 8. Cara kerja (keputusan penulis, untuk pembuat)

- **Penyimpanan:** tombol pilihan dan tanda "peringatan sudah tampil" disimpan app inti di `settings.json`, seperti setelan lain. Satu tombol disimpan sebagai kode tombol macOS ditambah tombol pengubahnya.
- **Memasang tombol:** `shot_hotkey.rs` memasang tombol dari setelan, bukan lagi angka tetap 20/21 dengan ⌘⇧. Setiap perubahan setelan memasang ulang kedua tombol.
- **Pemeriksaan bentrok dengan Mac:** `parse_key_conflicts` diperluas. Tombol yang diperiksa dibandingkan dengan pintasan screenshot Mac (28–31 dan 184, termasuk bawaannya kalau tidak tercatat) dan dengan setiap pintasan menyala lain di `com.apple.symbolichotkeys`. Bentrok dengan pintasan screenshot Mac diberi status `mac`, sedangkan bentrok dengan pintasan Mac lain diberi status baru.
- **Peringatan:** app inti mengirim pesan ke notch yang ada kursornya, sama seperti hasil screenshot dikirim, lalu notch membuka halaman Screenshot dalam bentuk baru (`setup`) di samping `result` dan `list`.
- **Membuka Pengaturan di halaman tertentu:** perintah buka Pengaturan diberi tujuan (`module:screenshot`). Jendela yang sudah terbuka menerima pesan untuk pindah halaman.
- **Pengaturan Sistem:** alamat yang paling dalam ke bagian Screenshot dicoba di Mac pemilik. Kalau tidak ada, dipakai alamat pintasan keyboard yang sudah ada.
- **Merekam tombol:** jendela Pengaturan membaca tombol fisik (`KeyboardEvent.code`) supaya hasilnya tidak berubah karena tata letak keyboard, lalu memetakannya ke kode tombol macOS. Merekam meminta app inti melepas tombol, lalu memasangnya lagi saat selesai.
- **Memperhatikan setelah pilihan "Matikan bawaan Mac":** satu thread membaca pintasan Mac setiap 2 detik selama paling lama 10 menit.

## 9. Uji di Mac pemilik (3 November 2026)

Dicoba dengan build dari `main` setelah digabung. Hasilnya dicocokkan dengan log app dan `settings.json`.

- **Peringatan muncul sekali:** lulus. Peringatan muncul setelah pintasan bawaan Mac dinyalakan lagi dan `shotNotice` dihapus. Log: `first-use notice on notch-0` lalu `first-use notice shown`. Saat pintasan Mac mati, cek pertama mencatat `free at the first check`, dan peringatan tidak muncul.
- **Pakai tombol sendiri:** lulus. Pengaturan terbuka di Modul → Screenshot. ⌘⇧F terekam dan tersimpan (`shotKeys.screen` kode 3). ⌘⇧4 saat merekam baris lain ditolak dengan "Already used". "Kembalikan" mengembalikan ⌘⇧3/⌘⇧4 di `settings.json`, walaupun log tidak mencatat langkah itu.
- **Matikan bawaan Mac:** lulus. Pengaturan Sistem terbuka di jendela Pintasan Keyboard, belum di bagian Screenshot (lihat §5). Setelah ⇧⌘3 dan ⇧⌘4 dimatikan, log mencatat `the Mac let go of screenshot keys ⌘⇧3 and ⌘⇧4`, dan notch memberi tahu.
- **Belum dicoba:** memotret dengan tombol sendiri, karena build tes butuh izin Perekaman Layar diberikan ulang.

## 10. Diserahkan ke pembuat

- Ukuran pasti panel peringatan dan kotak tombol.
- Bentuk pesan dan nama perintah baru.
- Daftar tombol biasa yang bisa direkam.
- Cara memeriksa di Mac: isi `settings.json`, log ("notching: …"), dan apakah Pengaturan Sistem benar-benar terbuka.
