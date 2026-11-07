# Verifikasi: kaca buatan Notching

Desain: `docs/superpowers/specs/2026-11-07-kaca-sendiri-design.md`. Rencana: `docs/superpowers/plans/2026-11-07-kaca-sendiri.md`.

## Cek 1: tanda rekaman layar dan lama memotret (7 November 2026)

Build uji dari commit `d4a8bb2` (potret saja, kaca belum digambar), dijalankan lewat `open -n`, log di folder sementara sesi. Pemilik memberi izin Kontrol Perangkat dan Akses Data serta Rekaman Layar & Audio Sistem ke build uji. Bahan Liquid glass, macOS 27.0.1, layar 1470 × 956 pt @2x.

| Yang dicoba | Hasil | Lulus? |
|---|---|---|
| Menyorot ikon Dock dengan Liquid glass (8 kartu yang memotret) | log: `glass picture 2940x1912 px in` 74, 59, 48, 54, 53, 48, 50, 49 ms. Median 51,5 ms, terlama 74 ms, semua jauh di bawah jeda kartu 350 ms. | Lulus |
| Kartu app tanpa jendela dengan Pekat | log: `peek card shown for pid 18618 (0 windows)` tanpa baris `glass picture`: Pekat tidak memotret. | Lulus |
| Tanda rekaman layar dengan Liquid glass | Pemilik: ikon rekam layar ungu muncul di bar menu. | — |
| Tanda rekaman layar dengan Pekat, kartu yang menampilkan gambar jendela | Pemilik: "Ya, muncul juga". Log: dua kali `peek card shown for pid 704 (1 windows)` tanpa baris `glass picture`, jadi ikon itu datang dari gambar jendela yang sudah ada, bukan dari potret layar. | Lulus |
| Kembali ke Liquid glass | log: `glass picture … in 49 ms`, lalu `Liquid Glass under peek at strength 0.3` (kaca lama, kaca baru belum digambar). | Lulus |

Kesimpulan: memotret satu layar penuh tidak menambah tanda rekaman layar yang baru atau berbeda dibanding gambar jendela sekarang (syarat desain bagian 7, langkah 0). Pekerjaan lanjut ke Tugas 4.

## Cek 2: kaca kartu di Mac (7 November 2026)

Build uji dari commit `6e54dda` (kaca kartu tergambar; pengalih belum), dijalankan lewat `open -n`, log di folder sementara sesi. Pemilik memberi ulang izin ke build uji. Pengaturan: kartu Terang, bahan Liquid glass, pengalih per app di tengah. Angka kaca: angka pemilik dari prototipe, tanpa `NOTCHING_GLASS_LOOK`.

| Yang dicoba | Hasil | Lulus? |
|---|---|---|
| Kaca kartu Dock | log: 72 kali `glass drawn in`, median 4 ms, terlama 57 ms; potret 32–45 ms; kernel siap sekitar 1 detik setelah app dibuka. | Lulus |
| Kaca pengalih | log: `Liquid Glass under switcher at strength 0.3`: masih kaca macOS, karena Tugas 7 belum dibangun. | Belum |

Revisi pemilik sesudah cek ini:
1. Huruf judul Intip diganti. Pemilik memilih "Judul Intip saja": judul kartu dan jumlah di pengalih memakai Inter; angka di notch tetap.
2. Pengalih belum memakai kaca buatan Notching: dikerjakan di Tugas 7.
3. Kartu gelap seharusnya membuat pengalih gelap juga. Keduanya sudah memakai pilihan warna yang sama. Dugaan: pengalih tampak terang karena kaca macOS yang tipis dengan warna 12%. Dicek lagi setelah pengalih memakai kaca sendiri.
4. Keterangan di bawah gambar dalam mode gelap dibuat lebih terang.
5. Tombol minimize, tutup, dan keluar memakai warna Mac. Keluar berwarna ungu.

## Cek 3: seluruh kaca di Mac (7 November 2026)

Build uji dari commit `a0579a3`: Tugas 7, judul pengalih yang terang, dan perbaikan dari tinjauan akhir. Perbaikan itu: kaca dihitung pada nilai layar sendiri, bukan cahaya linear; kaca dipanaskan saat app dibuka; Dock dipotret ulang setelah tenang; semua panel Notching tidak ikut terpotret. Build dijalankan lewat `open -n`, log di folder sementara sesi. Pemilik memberi ulang izin. Angka kaca: angka pemilik, tanpa `NOTCHING_GLASS_LOOK`. Pemilik mencoba semua butir kecuali monitor kedua (tidak ada) dan menjawab "semuanya aman". Jawabannya dicocokkan dengan log dan pengaturan.

| Yang dicoba | Bukti | Lulus? |
|---|---|---|
| Kaca dipanaskan saat app dibuka | log: `glass kernels ready in 48 ms`, gambar pertama 57 ms terjadi saat pemanasan, lalu `glass warmed in 101 ms`. | Lulus |
| Lama menggambar sesudahnya | 164 gambar: median 4 ms, p90 9 ms, terlama 29 ms (cek 2: terlama 57 ms, pada pemakaian pertama). | Lulus |
| Lama memotret | kartu 26–79 ms, pengalih 32–58 ms, jauh di bawah jeda kartu 350 ms dan jeda pengalih 140 ms. | Lulus |
| Tampilan kaca, Terang dan Gelap, dibanding prototipe | Pemilik: aman. | Lulus |
| Judul pengalih terbaca di kartu Gelap | Pemilik: aman. | Lulus |
| Mengintip jendela: kaca ikut gelap, jendela di tempatnya | Pemilik: aman. | Lulus |
| Tombol tutup dan minimize di kartu: kaca menyusul | log: `peek button Close`, `peek button Minimize`, masing-masing diikuti `glass picture … (Card)` setelah kartu tampil lagi. | Lulus |
| Pindah antar-ikon dan Dock yang tenang | log: potret ulang di kartu yang sama setelah kartu pindah ikon. Pemilik: aman. | Lulus |
| Pengalih di tengah dan di notch | log: `switcher shown` dengan potret Switcher sebelumnya, tanpa `Liquid Glass under switcher`. Pengaturan sekarang: posisi `notch`, susunan `apps`. Pemilik: aman. | Lulus |
| ⌘Tab cepat | log: beberapa potret Switcher tanpa `switcher shown`: dilepas sebelum tampil, tidak ada yang berkedip (pemilik). | Lulus |
| M/W/Q di pengalih | Pemilik: aman. Log tidak mencatat tombol pengalih tersendiri. | Lulus (laporan pemilik) |
| Kurangi transparansi | log: `Liquid Glass under switcher at strength 0.3` dan `Liquid Glass under peek at strength 0.3`, lalu kartu tampil berkali-kali tanpa potret; potret kembali setelah dimatikan. `reduceTransparency` sekarang 0. | Lulus |
| Ikon rekam layar ungu di bar menu | Pemilik: sama seperti cek 1, tidak ada tanda baru. | Lulus |
| Monitor kedua | Tidak dicoba: tidak ada monitor kedua. | Belum dicek |
| Tanpa Rekaman Layar | Tidak dicoba di build ini. `begin` dan `retake` memeriksa izin lebih dulu, jadi tidak ada yang meminta izin (tinjauan akhir). | Belum dicek di Mac |

### CPU saat diam

Diukur dengan waktu CPU `notching` (`ps -o time`) selama satu menit tanpa sentuhan mouse dan keyboard (`HIDIdleTime`). Panel-panel dicek dengan `sample` untuk melihat apakah display link WebKit menyala.

| Pengukuran | Hasil |
|---|---|
| Sesi uji pertama, sekitar 1 jam pemakaian, Jaga terjaga menyala | 0,36 detik dalam semenit (0,6%). `sample`: display link WebKit di proses UI menyala terus, sementara proses WebContent diam. |
| Sesi yang sama, Jaga terjaga dimatikan | 0,30 detik dalam semenit (0,5%), display link masih menyala. Jadi bukan Jaga terjaga. |
| Build yang sama dibuka ulang, belum dipakai | waktu CPU tidak bertambah, display link mati. |
| Sesudah kartu Dock, ⌘Tab, dan mengintip | 0,02 detik dalam 30 detik (0,07%, sebatas ketelitian `ps`), display link mati. |
| Sesudah Pengaturan (ganti warna kartu), Kurangi transparansi nyala-mati, dan kartu dengan kaca macOS | Display link menyala hanya selama dipakai, lalu mati. 0,02 detik dalam 30 detik (0,07%). |

Kesimpulan: kaca buatan Notching tidak meninggalkan beban saat diam. Pada sesi pertama, ada satu langkah yang membuat display link WebKit terus menyala sampai app ditutup, dengan beban 0,5–0,6%. Langkah itu belum ditemukan. Dua putaran percobaan, yaitu kartu, ⌘Tab, mengintip, Pengaturan, Kurangi transparansi, dan Jaga terjaga, tidak bisa memunculkannya lagi. Tidak diketahui apakah ini sudah ada sebelum pekerjaan kaca. Pemicunya ditemukan di cek 4.

## Cek 4: display link yang menyala terus (7 November 2026)

Dicari di sesi terpisah. Alat ukurnya ada empat:
- `sample` setiap beberapa detik.
- Waktu CPU `notching` (`ps -o time`) selama satu menit tanpa sentuhan (`HIDIdleTime`).
- Log app.
- Log WebKit milik proses `notching` (`log show` dan `log stream`, kategori ProcessSuspension, ViewState, RemoteLayerTree).

### Penyebab

Pemicunya dua hal yang terjadi berurutan:
1. **WebKit menidurkan halaman yang tidak terlihat.** Halaman sebuah jendela yang tidak terlihat selama 240 detik ditidurkan: proses WebContent-nya dihentikan sementara. Log mencatat `View was recently visible (timeout: 240 sec)`, lalu `prepareToSuspend`, lalu `freezeLayerTree reason=4`. Di Notching, ini mengenai kartu Dock, stage, dan pengalih yang tersembunyi, serta Pengaturan yang di-minimize.
2. **Halaman yang tertidur itu dibangunkan sebentar.** Pembangunnya event dari core, misalnya `module-state` dan `settings` saat ⌃⌥K ditekan atau saat layar bangun. Halaman itu lalu langsung ditidurkan lagi. Dalam beberapa milidetik, prosesnya dibangunkan, menjalankan JS, lalu tidur lagi.

Kalau giliran tidur jatuh di tengah satu gambar, sisi app menunggu gambar yang tidak pernah dikirim. Akibatnya `RemoteLayerTreeDrawingAreaProxy` tidak pernah menghentikan display link-nya, dan display link berdetak 60 kali per detik sampai halaman itu menggambar lagi. Proses WebContent tetap diam karena sedang tidur. Kejadian ini tidak selalu muncul: tergantung waktu, seperti adu cepat.

Masalah ini tidak berasal dari kaca buatan Notching. App uji kecil tanpa kode Notching menunjukkan siklus tidur-bangun yang sama. Halaman pelakunya, Pengaturan atau salah satu panel, tidak bisa dipisahkan dari log, jadi perbaikannya menutup semua halaman.

### Bukti

| Yang dicoba | Bukti |
|---|---|
| Sesi uji pertama, build `a0579a3`, dicek ulang dari log WebKit | Layar tidur 15.55.19 dan bangun 15.55.54. Pengaturan dibuka 15.49 lalu tidak terlihat. Halamannya dibangunkan untuk event pada 15.55.56, 15.56.07 (⌃⌥K), dan 15.56.12, dan setiap kali ditidurkan lagi dalam beberapa milidetik. Pengalih ditidurkan 15.55.40 dan kartu 15.56.37. `sample` 15.55.24 menunjukkan satu CVDisplayLink yang diam; `sample` 15.58.24 menunjukkan dua yang keduanya menyala. Tidak ada panel yang terlihat lagi sampai app ditutup. |
| Notching 0.1.3 terpasang, belum punya kartu, pengalih, dan kaca: ⌃⌥K dua kali | Tidak ada display link sama sekali. |
| `a0579a3`: ⌃⌥K, kartu, dan ⌘Tab, sebelum ada halaman yang ditidurkan | Display link mati setelah dipakai. Satu menit diam 0,03 detik. |
| `a0579a3`: Pengaturan di-minimize dan ditidurkan, lalu ⌃⌥K dua kali | Setiap ⌃⌥K membangunkan Pengaturan sebentar, lalu Pengaturan tidur lagi. Kali ini tidak macet. |
| `a0579a3`: Pengaturan, kartu, dan stage sedang tertidur; layar tidur 18.04.39 dan bangun 18.05.13; lalu ⌃⌥K | **Macet.** Pada diam 97 detik, sampel 6 detik menunjukkan `RemoteLayerTreeDisplayLinkClient::displayLinkFired`. Dua menit diam berturut-turut masing-masing 0,11 detik (0,18%); normalnya 0,02–0,03 detik. Pulih sekitar 18.14, saat kartu dibuka dan Pengaturan dibangunkan. |
| App uji kecil: WKWebView di jendela yang di-`orderOut`, dibangunkan 60 kali dengan JS yang mengubah halaman | Dengan bawaan WebKit: 61 kali `prepareToSuspend`, display link menyala setiap kali dibangunkan, CPU 1,22 detik. Dengan `inactiveSchedulingPolicy = none` sebelum halaman dimuat: tidak pernah ditidurkan, display link nyaris tidak menyala, CPU 0,31 detik. |
| App uji kecil: kapan pengaturan itu harus dipasang | Dipasang 1,5 detik setelah halaman mulai dimuat: halaman tetap ditidurkan. Jendela yang di-minimize dengan pengaturan sejak awal: tidak ditidurkan. |

### Perbaikan

- **`src-tauri/src/webview_awake.rs`**:
  - Setiap webview Notching dibuat dengan konfigurasi yang `inactiveSchedulingPolicy`-nya `none`, sehingga halamannya tidak pernah ditidurkan saat tidak terlihat.
  - Berlaku di macOS 14 ke atas. macOS 13 tetap memakai bawaan WebKit.
  - Dipasang di enam tempat pembuatan jendela: notch, kartu/stage/pengalih, Pengaturan, editor screenshot, pemilih area screenshot, dan layar gelap Mode Bersihkan Keyboard.
  - Halaman yang tidak terlihat memang tidak menjalankan apa-apa, jadi tetap bangun tidak menambah CPU.
- **`src/settings/pages/info.ts`**: halaman Izin berhenti bertanya ke macOS setiap 2 detik selama jendela Pengaturan tidak terlihat, lalu bertanya lagi saat terlihat. Tanpa ini, Pengaturan yang di-minimize di halaman Izin akan terus bertanya, karena halamannya tidak lagi ditidurkan.

### Cek di Mac dengan perbaikan

| Build | Yang dicoba | Bukti | Lulus? |
|---|---|---|---|
| Perbaikan 1: pengaturan dipasang lewat `on_webview_ready`, setelah halaman mulai dimuat | Langkah yang memicu: Pengaturan di-minimize, kartu, ⌘Tab, 5 menit, layar tidur dan bangun, ⌃⌥K dua kali | Kartu, stage, dan pengalih tidak ditidurkan: tidak ada `prepareToSuspend` saat batas 240 detik (18.35.14–18.35.19). Pengaturan tetap ditidurkan pada 18.35.10, lalu dibangunkan bolak-balik oleh layar bangun dan ⌃⌥K. Satu menit diam 0,02 detik, tetapi celahnya masih ada. | Belum, lanjut ke perbaikan 2 |
| Perbaikan 2: pengaturan dipasang saat jendela dibuat | Pengaturan di-minimize, kartu, ⌘Tab, lalu pemakaian biasa | Log app mencatat `page … stays awake out of sight` untuk notch-0, settings, peek, peek-stage, dan switcher. Keempat halaman tersembunyi mencapai batas 240 detik (18.53.03–18.53.11) tanpa satu pun `prepareToSuspend` atau `freezeLayerTree reason=4`. Satu menit diam sesudahnya 0,03 detik (0,05%), tanpa display link. Angka ini sama dengan build yang sama sebelum dipakai (0,02–0,03 detik); `ps` hanya teliti sampai 0,01 detik. | Lulus |

Langkah layar tidur dan ⌃⌥K tidak diulang di perbaikan 2, karena keduanya hanya bisa membuat macet halaman yang sedang tertidur, dan di perbaikan 2 tidak ada halaman yang ditidurkan.

## Untuk nanti

- **Belum dicek di Mac:** monitor kedua dengan skala lain, dan keadaan tanpa izin Rekaman Layar.
- **macOS 13** tetap memakai bawaan WebKit: halaman bisa ditidurkan, jadi celah display link yang menyala terus masih ada. Belum dicek, karena tidak ada Mac dengan macOS 13.
- **Minor dari tinjauan akhir yang ditunda**: daftarnya ada di laporan akhir sesi (ledger).
