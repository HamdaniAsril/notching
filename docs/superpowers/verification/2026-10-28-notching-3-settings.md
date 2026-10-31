# Verifikasi: jendela pengaturan S1 (rencana 3)

Tanggal: 28 Oktober 2026
Perangkat: MacBook Air M4 (layar bawaan ber-notch) dan monitor eksternal "L24i-40" sebagai layar utama.
Build rilis: `npm run tauri build -- --bundles app`. Disalin ke `/Applications/Notching.app` atas izin pemilik, untuk mencoba buka saat login.

## Test otomatis

- `npx tsc --noEmit`: lulus.
- `npm test`: 152 lulus, di 25 file (100 di awal rencana).
- `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml`: 69 lulus (50 di awal rencana).

## Ukuran

- `Notching.app`: 4,4 MB (rencana 2: 4,4 MB). Jendela pengaturan hampir tidak menambah ukuran.
- `dist/assets` (halaman notch dan halaman pengaturan, termasuk font): 184 KB.

## CPU (build rilis, sampel tiap 1 detik)

Kolom WebContent adalah jumlah CPU semua proses WebKit WebContent. Jumlah prosesnya naik dari 1 ke 2 saat jendela pengaturan terbuka, dan turun lagi saat ditutup.

| Keadaan | `notching` | WebContent |
|---|---|---|
| Diam, jendela pengaturan tertutup (19 sampel) | 0,0 di semua sampel | 0,0, satu sampel 0,3 |
| Jendela pengaturan terbuka dan diam (18 sampel) | 0,0 di semua sampel | paling tinggi 0,3 |
| Menggeser slider (sekitar 45 detik) | 2–8, rata-rata sekitar 4,5 | 1–11 |
| Setelah jendela ditutup (34 sampel) | 0,0 di semua sampel | 0,0 |

Jendela pengaturan tidak memakai CPU saat diam. Saat ditutup, prosesnya ikut hilang.

## Checklist

| # | Cek | Hasil | Catatan |
|---|---|---|---|
| 1 | ⋯ membuka satu jendela di tengah layar yang diklik. Ikon ada di Dock dan Cmd+Tab, lalu hilang saat jendela ditutup. | Lulus | Dilaporkan pemilik. Dicoba dari layar MacBook dan monitor. |
| 2 | Buka-tutup berulang (tombol merah, Cmd+W, ⋯ dua kali) tidak pernah membuat jendela kedua atau menghentikan app. Cmd+Q dari jendela menutup app. | Lulus | Dilaporkan pemilik, tiga kali buka-tutup. Cmd+Q dicek di build rilis: dilaporkan pemilik dan dipastikan dengan `pgrep`. |
| 3 | Mode terang dan gelap mengikuti macOS. | Lulus | Dilaporkan pemilik. Appearance diganti saat jendela terbuka. |
| 4 | Ganti bahasa mengubah jendela, pil, dan kartu sekaligus. | Lulus | Dilaporkan pemilik. |
| 5 | Empat slider: pratinjau langsung berubah, notch sungguhan berubah saat slider dilepas, dan nilainya tersimpan. | Lulus | Dilaporkan pemilik. `settings.json` berisi `notch` dengan nilai bawaan setelah "Kembalikan bawaan". |
| 6 | Layar: hanya monitor, hanya MacBook, dan semua layar. Monitor dicabut saat terpilih → notch pindah ke semua layar, lalu kembali saat dipasang lagi. | Lulus | Dilaporkan pemilik. Catatan file mencatat `"screen"` berganti antara `"Built-in Retina Display"`, `"L24i-40"`, dan `null`. |
| 7 | Modul: nyala/mati, copot dengan konfirmasi, dan pasang lagi lewat Tambah modul. Ikon pil dan folder modul aktif ikut berubah. | Lulus | Dilaporkan pemilik. Catatan folder: `system-stat` masuk `disabledModules`, lalu keluar; masuk `uninstalledModules` dan foldernya hilang; lalu kembali. |
| 8 | Pencarian menemukan pengaturan dan nama modul, dan baris yang dituju disorot. Cmd+V di kotak cari bekerja. | Lulus | Dilaporkan pemilik. |
| 9 | Buka saat login. | Sebagian | Dilaporkan pemilik: setelah dinyalakan dari `/Applications/Notching.app`, Notching muncul di Login Items. 31 Oktober 22.35: build baru dari `2b93784` dipasang ke `/Applications` (lihat "Langkah 1" di bawah), dan System Events masih mencantumkan `/Applications/Notching.app` di item login. Logout dan login belum dilakukan: `last` menunjukkan sesi console terakhir dimulai 20 Oktober 06.21 dan masih berjalan, jadi Notching belum pernah dibuka oleh login. |
| 10 | Perilaku rencana 1 dan 2: klik di luar dan Esc menutup panel, menu bar dekat tengah bisa diklik, dan Esc dari dalam kartu mengembalikan ketikan ke app sebelumnya. | Lulus | Dilaporkan pemilik. Kartu terakhir, System stat yang berhenti membaca, dan layar penuh tidak dicek ulang di rencana ini. Kode untuk ketiganya tidak diubah; yang berubah di sekitarnya hanya penyaringan layar saat overlay dibangun ulang. |

Tampilan dan teks semua halaman dinilai pemilik lewat pratinjau browser sebelum jendela disambungkan ke app, dan disetujui tanpa perubahan.

## Temuan dan catatan

- **Tidak ada perbaikan selama cek di perangkat.** Semua poin lulus pada percobaan pertama.
- **Pemeriksaan akhir kode** menemukan dua hal yang tidak tertangkap cek di perangkat, dan keduanya sudah diperbaiki dengan test:
  - Dua klik ⋯ yang sangat cepat bisa menghilangkan ikon Dock padahal jendela tetap terbuka.
  - Menahan tombol panah di slider membuat nilainya mundur sesaat dan bisa melewatkan satu langkah.
  - Sesudah perbaikan: `npm test` 153 lulus, `cargo test` 70 lulus.
  - `/Applications/Notching.app` yang dicoba pemilik dibangun sebelum perbaikan ini.
- **Ikon Dock** masih ikon bawaan dari kerangka Tauri, sampai logo Notching dibuat.
- **Buka saat login dan build baru.** App ini ditandatangani lokal, jadi macOS bisa menganggap setiap build baru sebagai app berbeda. Setelah Notching diperbarui, tombol ini mungkin perlu dinyalakan ulang. Ini terkait keputusan tanda tangan digital di spec bagian 9.
- **Pratinjau notch di jendela pengaturan** berhenti beranimasi kalau jendelanya tersembunyi di balik app lain. Ini perilaku normal WebKit dan sejalan dengan aturan hemat daya.

## Langkah 1: build baru di /Applications (31 Oktober 2026)

| # | Langkah | Hasil | Bukti |
|---|---|---|---|
| 1 | Build dari HEAD. | Selesai | `npm run tauri build` dari `2b93784`. Build 22.06 tidak dipakai karena `0854a8c` dibuat sesudahnya, dan aset frontend di binary tidak bisa dibandingkan. |
| 2 | Notching lama ditutup dengan cara biasa. | Selesai | `osascript -e 'quit app "Notching"'`. PID 35711 berhenti 22.33, tanpa kill. |
| 3 | Salinan data. | Selesai | `before-step-1/settings.json` dan `reminders.json`. `shasum` sama dengan aslinya. |
| 4 | Ganti app di `/Applications`. | Selesai | Bundle 29 Oktober dipindah ke Tong Sampah (`Notching-2026-10-29.app`). Build baru disalin dengan `ditto`; `cmp` binary sama dengan hasil build. |
| 5 | Berjalan dari `/Applications`. | Selesai | `ps -o lstart`: PID 63762, mulai 22.35.06, `/Applications/Notching.app/Contents/MacOS/notching`. |
| 6 | Data utuh. | Selesai | `diff` `settings.json` dan `reminders.json` dengan salinannya: sama. |
| 7 | Izin tetap berlaku. | Selesai | `log show` tccd 22.35.06 untuk PID 63762: Aksesibilitas, Kamera, dan ListenEvent `authValue=2` (diizinkan). Tidak ada permintaan izin baru. |

Tanda tangan tetap adhoc dengan identifier `notching-f40547a86c4775b9`, sama dengan build lama.
