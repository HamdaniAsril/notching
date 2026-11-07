# Verifikasi Intip jendela, rencana 2: pengalih jendela (⌘Tab)

Tanggal: 6–7 November 2026
Cabang: `main`.
- Desain: `docs/superpowers/specs/2026-11-05-intip-jendela-design.md`. Pengambilalihan ⌘Tab diputuskan pemilik pada 6 November.
- Rencana: `docs/superpowers/plans/2026-11-06-intip-jendela-2-pengalih.md`.
- Commit rencana ini: `7b2536f` sampai `21ea849`, ditambah catatan ini. Di antaranya ada commit dari sesi lain, yaitu kaca buatan Notching, nama izin macOS 27, dan perbaikan display link WebKit. Cek dengan `git log 80563a5..HEAD`.
- Dibangun langsung di sesi ini. Satu reviewer memeriksa seluruh perubahan di akhir, lalu ada sebelas putaran uji di Mac pemilik (macOS 27.0.1).

## Yang dibangun

- **Pengalih jendela** di alat latar Intip jendela. Baris-barisnya ada di Pengaturan → Pintasan:
  - Pengalih jendela, nyala atau mati.
  - Tombolnya. Bawaannya ⌘Tab, tapi bisa direkam ulang, termasuk Tab dengan ⌘, ⌃, atau ⌥. Tombol yang bentrok dengan pintasan lain ditolak.
  - Tampilkan, per jendela atau per app.
  - Muncul di, tengah layar atau dari notch.
- **Cara pakai:**
  - Tahan ⌘ lalu tekan Tab dan ⇧Tab. Melepas ⌘ membuka pilihan.
  - ⌘Tab yang cepat tidak memunculkan panel, karena panel menunggu 140 ms.
  - Di mode per app, ↓ memilih jendela.
  - M, W, dan Q untuk minimize, tutup, dan keluar. Enter membuka, Esc membatalkan.
  - Klik di luar panel menutupnya.
- **Jendela Notching sendiri**, yaitu Pengaturan dan editor screenshot, ikut terdaftar. Q pada jendela itu hanya menutup jendelanya, tidak mematikan Notching.
- **⌘Tab bawaan macOS** dimatikan lewat symbolic hot key SkyLight, hanya selama pengalih memegang tombolnya. ⌘Tab bawaan dinyalakan lagi:
  - setiap Notching dibuka, sebelum hal lain,
  - saat Notching keluar atau di-uninstall,
  - saat pengalih atau alatnya dimatikan,
  - saat izin Kontrol Perangkat dan Akses Data dicabut,
  - selama ada kolom kata sandi yang mengunci keyboard (secure input).
- **Pengaman tap** untuk keempat tap Notching. Setiap detik Notching membuat tap uji dan langsung menutupnya. Kalau macOS menolak, berarti izinnya sudah dicabut, dan semua tap dilepas dalam satu detik.

## Test otomatis (akhir)

| Pemeriksaan | Hasil |
|---|---|
| `npx tsc --noEmit` | lulus |
| `npm test` | 1275 lulus |
| `cargo test --lib` | 601 lulus, 1 diabaikan (test jaringan) |
| `cargo clippy --lib` | tidak ada peringatan di file pengalih dan pengaman tap |
| `npx tauri build --bundles app` | lulus, `Notching.app` 10,09 MB |

## Review seluruh perubahan

Satu reviewer (model paling mampu) membaca semua perubahan dan memberi vonis "With fixes". Semua temuan Critical dan Important diperbaiki, masing-masing dengan tes yang gagal dulu bila bisa diuji tanpa AppKit:

- **C1:** uninstall keluar lewat `process::exit`, sehingga ⌘Tab bawaan tertinggal mati. Sekarang ⌘Tab bawaan dinyalakan dulu sebelum keluar.
- **C2:** kursor yang diam di tengah layar langsung memilih kartu. Sekarang pilihan baru mengikuti kursor setelah kursor bergerak.
- **I1:** ⌘Tab cepat sempat memunculkan panel sekejap. Sekarang panel menunggu 140 ms.
- **I2:** setiap perpindahan pilihan memotret ulang semua jendela. Sekarang gambar disimpan selama panel terbuka.
- **I3:** menutup jendela terakhir dengan W meninggalkan panel berisi kartu app.
- **I4:** dengan ⌘⇧Tab sebagai tombol, ⌘Tab biasa tidak berbuat apa-apa. Sekarang yang dimatikan hanya tombol bawaan yang benar-benar dipakai.
- **I5:** dua sinkronisasi bersamaan bisa membuat ⌘Tab mati total. Sekarang sinkronisasi berjalan satu per satu.
- **I6:** kolom kata sandi membuat ⌘Tab mati. Temuan ini dicek dulu di Mac (putaran 10) dan ternyata benar, lalu diperbaiki di `21ea849`.
- **I7:** M, W, atau Q yang langsung diikuti melepas ⌘ bisa hilang.
- **I8:** tombol pengalih buatan sendiri tidak berpindah pilihan.

## Di Mac pemilik

Build uji dijalankan lewat `open -n` dengan log di folder kerja sesi. Setiap build baru perlu dua izin diberikan ulang, karena build ini hanya ditandatangani ad-hoc.

| Langkah | Bukti | Hasil |
|---|---|---|
| Tahan ⌘Tab, Tab, ⇧Tab, lepas; ⌘Tab cepat; ↓ per app; M/W/Q; Enter/Esc | log: 76 kali `switcher shown` di semua build uji; pemilik: "berjalan semua", lalu "semuanya normal" | Lulus menurut pemilik (M/W/Q dan Enter/Esc tidak tercatat di log) |
| Muncul dari notch | pemilik (tidak tercatat di log) | Lulus menurut pemilik |
| Ganti tombol ke ⌥Tab, ⌘Tab bawaan kembali | log: `macOS's ⌘Tab back on`, lalu `off while the switcher takes it` saat dikembalikan; pemilik memakai ⌥Tab sepanjang sisa uji | Lulus |
| Matikan lalu nyalakan pengalih | log: ⌘Tab bawaan menyala, lalu mati lagi | Lulus |
| Tutup paksa lewat Activity Monitor, lalu buka lagi | log 08:08:19: Notching terbuka lagi dengan izin, semua tap terpasang; pemilik: ⌘Tab jalan | Lulus |
| Jendela Pengaturan Notching di ⌘Tab | log: 11 item, lalu 12 setelah Pengaturan dibuka | Lulus (setelah perbaikan putaran 8) |
| Izin dicabut dengan "−" saat Notching jalan | log: tccd `Delete` pukul 19:07:29,086; Notching mencatat `Accessibility taken away; the taps follow (AXIsProcessTrusted true, test tap false)` dan melepas tiga tap. Pengaman cadangan (`guard.sh`) melihatnya pukul 19:07:30, jadi tidak perlu menutup Notching secara paksa. Pemilik: Mac normal. | Lulus (setelah perbaikan putaran 1, 5, dan 6) |
| Izin dipasang lagi saat Notching jalan | log: `Accessibility given; the taps follow`, tiga tap terpasang, `switcher shown (9 items)` tanpa membuka ulang | Lulus |
| Kolom kata sandi, dengan ⌘Tab sebagai tombol | putaran 10: secure input dari Arc (ioreg), pemilik: "tidak ada yang terjadi". Putaran 11 dengan `21ea849`: `secure input on`, ⌘Tab bawaan menyala; `secure input off`, ⌘Tab diambil lagi dan `switcher shown`; kolom kata sandi lagi, ⌘Tab bawaan menyala. Pemilik: "sesuai". | Lulus (setelah perbaikan) |
| Kursor diam saat panel muncul | pemilik: "semuanya normal" | Lulus menurut pemilik |
| ⌘⇧Tab sebagai tombol | tidak dicoba di Mac; tes unit `only_the_mac_keys_the_trigger_needs_are_turned_off` | Belum dicoba di Mac |
| Liquid glass | pemilik memilih kekuatan 0,3. Distorsi kaca macOS tidak terlihat oleh pemilik di kekuatan mana pun (probe CekKaca), sehingga dipindah ke rencana kaca buatan Notching (`2026-11-07-kaca-sendiri.md`). | Diteruskan |
| Tab Finder | "pisah" yang hilang ternyata tab dari jendela "macos" (probe CekJendela). Pemilik: "ah iya, tab". | Bukan bug |

Yang ditemukan di Mac dan diperbaiki:
1. **Mac macet setelah izin dicabut** (putaran 1 dan 5, dua kali restart paksa). Tap menyalakan dirinya lagi setiap kali dimatikan macOS. Setelah izin dihapus dengan "−", `AXIsProcessTrusted` tetap menjawab ya dan macOS tidak memberi tahu apa-apa. `TCCAccessPreflight` menyimpan jawaban pertamanya selama proses hidup (putaran 6), jadi tidak bisa dipakai. Probe CekIzin menunjukkan satu-satunya tanda yang segar adalah tap baru yang ditolak. Perbaikannya ada di `37b6433`, `7d82898`, dan `b099df9`.
2. **Notching crash** saat Intip jendela mengatur jendela Pengaturan Notching sendiri lewat Aksesibilitas dari thread latar (putaran 2). Diperbaiki di `50b2852`.
3. **Warna kartu mengubah seluruh app ke mode terang** (putaran 3), karena tao menyetel tampilan untuk seluruh app. Diperbaiki di `c4e48e5`.
4. **Liquid glass masih buram.** Bahannya sempat Popover, lalu diganti `NSGlassEffectView` Clear. Lapisan warnanya dibuat 10–15%, dan kekuatannya 0,3 sesuai pilihan pemilik (`78c3062`, `7d562ac`, `4ff83ad`). Setelah itu kaca macOS diganti kaca buatan Notching di rencana terpisah.
5. **Jendela Notching sendiri tidak ada di ⌘Tab** (putaran 8). Diperbaiki di `b4d0659`.
6. **⌘Tab mati di kolom kata sandi** (putaran 10, temuan I6). Diperbaiki di `21ea849`.

## CPU

| Pengukuran | Hasil |
|---|---|
| Build uji `7d562ac`, diam, 30 × 1 detik | rata-rata sekitar 0,1%. Sebagian besar dari display link WebKit, yang diperbaiki di `391530d`. |
| Build uji `7d562ac`, 60 detik dengan sedikit pemakaian | rata-rata 0,26%, tertinggi 5,7% |
| Build uji dari `cdea060`: pengalih menyala, tap uji tiap detik, diam 30 × 1 detik | 27 × 0,0% dan 3 × 0,1%, rata-rata sekitar 0,01% |

Rencana meminta 0,00% selama 60 detik. Yang terukur 0,01% selama 30 detik. Sisanya berasal dari tap uji setiap detik, harga dari Mac yang tidak macet.

## Untuk nanti

- **Izin v0.1.3.** Entri Kontrol Perangkat dan Akses Data serta Rekaman Layar & Audio Sistem untuk `/Applications/Notching.app` diganti dengan build uji selama pengujian. Pemilik perlu memasangnya lagi saat kembali ke v0.1.3.
- **⌘⇧Tab sebagai tombol** belum dicoba di Mac.
- **Sampai satu detik** setelah kolom kata sandi mengunci keyboard, ⌘Tab bisa masih diam, karena secure input dibaca sekali per detik.
- **Arc bisa menahan secure input** dari belakang. Selama itu, ⌘Tab dipegang macOS, karena Notching memang tidak bisa mendengar tombol apa pun.
- **Tab Finder:** satu entri per jendela, juga saat diminimize, butuh satu probe lagi.
- **Minor dari review yang ditunda**, antara lain:
  - setengah tekanan tombol sampai ke app di belakang,
  - modifier yang lebih banyak ikut cocok,
  - judul panel menghitung kartu app sebagai jendela,
  - cache ikon tidak mengecil,
  - pengamat Dock dipasang ulang setiap sinkronisasi,
  - Dock ditanya posisi ikonnya di dalam tap klik.
