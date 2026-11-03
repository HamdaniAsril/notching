# Desain bagian C: widget musik (Now playing)

Tanggal: 3 November 2026
Cabang: `feat/paket-widget`.
Acuan gambar: `docs/superpowers/specs/volt/musik.png` (Musik, 2 kolom), `musik-strip.png` (Musik strip), dan `musik-kecil.png` (Musik kecil, 1 kolom).
Acuan ukuran: `docs/superpowers/specs/volt/tree.txt`, bagian `Widget/Musik LU`, `Widget/Musik Strip LU`, dan `Widget/Musik Kecil LU`.
Bahasa visual: Volt, sama seperti widget lain (`2026-11-02-gaya-volt-design.md` §3–§4).

Tanda **(keputusan penulis)** artinya pemilik belum memutuskan hal itu. Semua tanda ini dibawa ke review akhir.

## 1. Keputusan pemilik

- **Cara membaca lagu: cara 3** (pemilik, 3 Nov: "kerjakan cara 3 saja").
  - Sejak macOS 15.4, app biasa mendapat "Now Playing" kosong dari MediaRemote. Ini sudah dicek di Mac pemilik (macOS 27.0.1): saat Arc memutar YouTube, hasilnya `keys=0`.
  - `/usr/bin/perl` masih boleh membacanya. Perl bawaan memuat library kecil milik Notching, dan library itu yang memanggil MediaRemote.
  - Uji di Mac pemilik berhasil membaca judul, kanal, dan durasi video YouTube di Arc.
- **Risiko yang sudah diketahui pemilik:**
  - Kalau Apple mencabut perl, mengunci perl, atau menutup MediaRemote untuk perl, widget musik berhenti membaca.
  - Di keadaan itu widget menampilkan keadaan kosong, tidak error. Tidak ada cadangan lewat AppleScript di putaran ini. **(keputusan penulis, karena pemilik memilih "cara 3 saja")**

## 2. Inti app (Rust)

**Pembantu media**
- Satu proses `perl` yang berjalan lama, dijalankan app: `/usr/bin/perl <np.pl> <libnotching-media.dylib>`.
- Library ditulis dalam Objective-C, dibangun universal (arm64 dan x86_64), dan ikut di dalam bundle sebagai resource. Skrip perl-nya juga.
- Library mendaftar notifikasi perubahan Now Playing, lalu menulis satu baris JSON setiap ada perubahan dan saat mulai.
  - Isinya: judul, artis, album, durasi, posisi, kecepatan putar (0 berarti jeda), waktu posisi itu dibaca, ID app sumber, dan gambar album kalau ada.
  - Gambar album dikirim sebagai base64. Ukurannya dikecilkan dulu sampai 128 px di sisi terpanjang, supaya baris JSON tetap kecil. **(keputusan penulis)**
- Perintah dibaca dari stdin, satu per baris: `toggle`, `play`, `pause`, `next`, dan `prev`. Perintah dikirim lewat `MRMediaRemoteSendCommand`.

**Layanan `media_service`**
- Mengikuti pola `timer_service`.
- Hanya jalan selama paket `musik` nyala. Ikut mati lewat `module_gone`, dan nyala lagi saat paket dinyalakan.
- Kalau proses perl mati, layanan menjalankannya lagi dengan jeda yang makin panjang (1 s, 2 s, 4 s, sampai 30 s). Proses tidak boleh ditinggal jalan setelah app keluar.
- Menyimpan keadaan terakhir.

**Kapabilitas baru `media`**
- Didaftarkan di `src-tauri/src/modules/gate.rs` dan manifest. Metodenya:
  - `now`: keadaan sekarang, atau "kosong" (tidak ada yang diputar atau pembantu tidak jalan).
  - `command`: argumennya salah satu perintah di atas.
- Data tidak dikirim ke mana pun dan tidak disimpan ke disk.

## 3. Paket `modules/musik`

Nama paket: "Musik", dengan ikon not balok bergaris lucide gaya Volt. Ada tiga widget, semuanya `kind: "work"`, karena di desain musik masuk kelompok Fokus. **(keputusan penulis)**

| Widget | Lebar | Gambar | Isi |
|---|---|---|---|
| `player` (Musik) | 2 kolom | `musik.png` | Gambar album di kiri, berupa kotak sudut 8. Di kanan, dari atas ke bawah: "Sedang diputar" beraksen, judul (Barlow), artis, garis progres dengan posisi dan durasi, lalu tombol sebelumnya, putar/jeda (lingkaran putih), dan berikutnya. |
| `strip` (Musik strip) | strip 52 px | `musik-strip.png` | Gambar kecil, judul dan artis, posisi, garis progres, durasi, lalu sebelumnya, putar/jeda (lingkaran aksen), dan berikutnya. |
| `mini` (Musik kecil) | 1 kolom | `musik-kecil.png` | Lingkaran bertingkat seperti piringan, dengan sebelumnya, putar/jeda, dan berikutnya di tengahnya. Di bawahnya judul, artis, dan garis progres. |

- **Membaca data.** Widget meminta `media.now` tiap 1 detik. Posisi dihitung di widget dari posisi terakhir, waktu bacanya, dan kecepatan putar, supaya progres berjalan halus tanpa menunggu pembantu.
- **Tanpa gambar album**, misalnya YouTube di browser: kotak bergradasi aksen dengan kata pertama judul dalam Barlow, seperti "Braga" di gambar. **(keputusan penulis)**
- **Keadaan kosong:** tidak ada yang diputar, atau pembantu tidak jalan.
  - Ikon not yang redup dan teks "Tidak ada yang diputar" / "Nothing playing".
  - Tombol tetap terlihat tapi redup dan tidak bisa diklik.
- **Teks panjang** diberi elipsis. Judul paling banyak 2 baris di Musik, dan 1 baris di strip dan Musik kecil.
- **Tombol** memanggil `media.command`. Tampilan putar/jeda langsung berganti saat diklik, lalu dikoreksi oleh pembacaan berikutnya.
- **Locale** dalam bahasa Indonesia dan Inggris.
- **Contoh di editor** Pengaturan → Halaman memakai lagu contoh "Jalan Braga", "Kolektif Senja", 2:14 dari 3:48, seperti di desain.
- Paket ini tidak punya halaman modul sendiri, hanya widget. **(keputusan penulis)**

## 4. Yang harus dihindari

- Proses perl yang tertinggal setelah Notching keluar atau setelah paket dimatikan.
- Lebih dari satu proses perl berjalan sekaligus.
- App macet atau lambat saat pembantu mati, menulis baris rusak, atau tidak menjawab.
- Teks keluar dari kartu, atau ukuran di bawah 9 px.

## 5. Musik di samping notch (pemilik, 3 Nov)

Permintaan pemilik: "buat semacam notifikasi di notch, sebelah kiri cover album, sebelah kanan animasi soundwave".

**Kapan tampil**
- Saat paket Musik nyala dan ada yang **diputar** (kecepatan lebih dari 0).
- Panel harus sedang tertutup. Di samping notch fisik, juga saat kursor di atasnya, sama seperti status.
- Saat lagu dijeda, tampilannya hilang 3 detik kemudian, supaya jeda singkat tidak membuatnya berkedip. **(keputusan penulis)**
- Saat notifikasi tampil di telinga notch, notifikasi yang tampil dan musik mengalah. Musik muncul lagi setelah notifikasi selesai.
- Tidak ada saklar tersendiri. Mematikan paket Musik ikut menyembunyikannya. **(keputusan penulis)**

**Bentuknya, di Mac dengan notch**
- Notch melebar ke **kiri** untuk sampul album: kotak bersudut 5 px, setinggi notch dikurangi 8 px.
- Notch melebar ke **kanan** untuk gelombang suara: 5 batang beraksen limau (`#C8F04A`), lebar 2 px dengan jarak 2 px. Tingginya naik-turun bergantian, dari 30% sampai 100% tinggi area, dengan iringan sekitar 0,9–1,3 detik per batang.
- Tanpa sampul album (misalnya YouTube di browser), kotaknya berupa gradasi limau.
- Kalau ada status lain, misalnya timer, status itu muncul di kanan setelah gelombang, dengan garis pemisah yang sama seperti antarstatus.
- Titik notifikasi terlewat (missed) berada di kiri sampul.

**Di layar tanpa notch** (monitor luar): satu pil kecil di bawah lensa, berisi sampul di kiri dan gelombang di kanan, mengikuti pil status. **(keputusan penulis)**

**Data ke halaman notch**
- `media_service` mengirim event `notching://media` setiap kali ada perubahan, dengan isi `{ playing, title, art }`.
- Halaman notch menerimanya lewat `bridge.media()` dan `bridge.onMedia()`.
- Gerak gelombang memakai CSS atau SVG, tanpa menggambar ulang dari JS setiap frame, dan berhenti saat disembunyikan.
- Area klik di jendela notch ikut melebar, supaya klik pada sampul atau gelombang membuka panel seperti biasa.
