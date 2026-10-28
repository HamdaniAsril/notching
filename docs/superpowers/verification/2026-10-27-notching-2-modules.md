# Verifikasi: sistem modul dan kartu (rencana 2)

Tanggal: 27–28 Oktober 2026
Perangkat: MacBook Air M4 (layar bawaan ber-notch) dan monitor 1920×1080 sebagai layar utama.
Build rilis: `npm run tauri build -- --bundles app`.

## Test otomatis

- `npx tsc --noEmit`: lulus.
- `npm test`: 100 lulus (40 di awal rencana).
- `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml`: 49 lulus (8 di awal rencana).

## Ukuran

- `Notching.app`: 4,4 MB (rencana 1: 3,87 MB).
- Paket modul: Beranda 136 KB, System stat 140 KB. Sebagian besar isinya font Space Grotesk dan Space Mono.

## CPU (proses `notching`, build rilis, sampel tiap 1 detik)

| Keadaan | Hasil |
|---|---|
| Diam | 0,0. Hanya ada satu-dua sampel kecil (≤ 0,5) saat kursor sempat bergerak. |
| System stat terbuka, mouse diam | sekitar 0,2 rata-rata: lonjakan kecil 0,1–0,7 setiap 1,5 detik, saat angka dibaca. |
| Panel dibuka atau ditutup | lonjakan singkat 5–15 selama animasi, lalu turun lagi. |
| Setelah System stat ditutup | 0,0 selama 44 detik berturut-turut. Pembacaan berhenti. |
| Mouse bergerak jauh dari notch | rata-rata sekitar 0,3. Versi rencana 1 sekitar 2,8, diukur dengan cara yang sama. |

Cara mengukur gerakan mouse: pemilik mengklik "Mulai", lalu langsung menggerakkan mouse memutar di tengah layar selama 20 detik. Selama itu, 15 sampel dicatat. Cara yang sama dipakai untuk versi lama dan versi baru.

## Checklist

| # | Cek | Hasil | Catatan |
|---|---|---|---|
| 1 | Pil berisi Beranda, System stat, dan ⋯. Ada titik putih di bawah kartu yang terbuka. | Lulus | Dilaporkan pemilik. |
| 2 | Berganti kartu: panel pindah ukuran dengan pegas, dan pil ikut bergerak. Pil diam saat panel baru terbuka. | Lulus | Dilaporkan pemilik, setelah dua perbaikan (lihat bawah). |
| 3 | Angka System stat berubah sekitar tiap 1,5 detik dan masuk akal dibanding Activity Monitor. | Lulus | Dilaporkan pemilik. |
| 4 | Kartu terakhir diingat: setelah panel ditutup dan dibuka, setelah app dimulai ulang, dan di layar lain. | Lulus | Dilaporkan pemilik. `settings.json` berisi `"lastCard": "system-stat"`. |
| 5 | Esc setelah klik di dalam kartu menutup panel, dan ketikan kembali ke TextEdit. Cmd+Q dari dalam kartu menutup app. | Lulus | Dilaporkan pemilik. |
| 6 | `"language": "en"` menampilkan teks Inggris (Memory, Network, kartu Home). `"auto"` mengikuti bahasa perangkat (Indonesia). | Lulus | Dilaporkan pemilik. |
| 7 | `disabledModules: ["home"]` menghilangkan ikon Beranda. `uninstalledModules: ["system-stat"]` menghapus folder modul aktif dan ikonnya, lalu panel pindah ke Beranda. Mengosongkan keduanya mengembalikan semuanya. | Lulus | Dilaporkan pemilik. Folder dicek dengan `ls`. |
| 8 | Perilaku rencana 1 tetap ada: menu bar dekat tengah bisa diklik, klik di luar dan Esc menutup panel, keluar-masuk samping panel, cabut-pasang monitor, pindah Space. | Lulus | Dilaporkan pemilik. |
| 9 | Build rilis memuat kedua kartu (protokol `notchmod` dan CSP). | Lulus | Dilaporkan pemilik. Bundle berisi `Resources/modules/<id>/`. |
| 10 | App layar penuh. | Sebagian | Lihat "Masih terbuka". |

## Temuan dan perbaikan

- **Isi kartu System stat tidak seimbang.** Ruang kosong menumpuk di kanan. Dari mockup tiga pilihan, pemilik memilih panel yang dipersempit: kartu sekarang 400 px, dengan lebar kolom tetap supaya kolom tidak bergeser saat angka berubah.
- **Tepi atas panel turun sekejap setiap kali panel ditutup.** Masalah ini sudah ada sejak rencana 1. Penyebabnya animasi bawaan macOS saat jendela ditampilkan lagi ketika fokus keyboard dikembalikan ke app sebelumnya. Animasi itu sekarang dimatikan.
- **Pil naik-turun sesaat setelah panel terbuka.** Pil mengikuti tinggi panel yang masih memantul. Sekarang pil diam di tinggi akhir panel, dan bergeser halus saat berganti kartu.
- **System stat terus membaca CPU setelah semua panel tertutup.** Ini terjadi setelah monitor dicabut. Panel milik layar yang hilang disembunyikan, dan jendela tersembunyi tidak mendapat frame animasi, jadi penutupannya tidak pernah selesai. Sekarang kartu dilepas begitu jendelanya tersembunyi. Diuji ulang dengan catatan: tidak ada pembacaan setelah panel tersembunyi.
- **Layar penuh.** Spec lama menyebut notch disembunyikan saat ada app layar penuh. Pemilik memutuskan notch tetap tampil dan bisa dipakai, dan spec bagian 4.5 sudah diperbarui. Sensor sekarang ikut ke Space layar penuh.

## Masih terbuka

- **Klik tetesan di layar penuh pada monitor tanpa notch kadang tidak sampai.**
  - Di layar MacBook klik berjalan normal.
  - Catatan uji menunjukkan status tembus klik berganti-ganti selagi kursor diam di atas tetesan.
  - Daftar jendela menunjukkan tidak ada jendela lain di atas notch: menu bar layar penuh ada di level 24, di bawah notch yang ada di level 25.
  - Versi rencana 1 juga tidak konsisten di layar penuh.
  - Dicatat sebagai pekerjaan lanjutan.
