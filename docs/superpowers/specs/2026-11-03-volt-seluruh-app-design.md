# Desain "Volt di seluruh Notching"

Tanggal: 3 November 2026
Lanjutan dari `2026-11-02-gaya-volt-design.md`, yang hanya mencakup widget halaman.
Permintaan pemilik (3 Nov): "di halaman modul juga ikut style ini dengan card hitam pekat. overall style dari notching ini mengikuti gaya desain yang baru."

Desain Volt di `desain widget/widget-volt.pego` hanya menggambar widget. Bagian lain app diturunkan dari bahasa visual yang sama. Turunan yang tidak ada di gambar ditandai **(keputusan penulis)** dan dibawa ke review akhir.

## 1. Tujuan dan batas

**Tujuan.** Semua yang dilihat pemilik di Notching memakai bahasa Volt:
- **Notch:** halaman modul, halaman Modul, Titipan, Screenshot, Cleaner, pil navigasi, notifikasi di telinga, dan bar "‹ Modul".
- **Jendela lain:** Pengaturan, editor screenshot, pemilih area screenshot, dan layar bersihkan keyboard.

**Bukan tujuan**
- Data, inti Rust, dan perilaku tidak berubah: klik, geser, pintasan, ukuran panel, dan alur izin. Ukuran halaman modul boleh berubah hanya kalau kartu butuh ruang, dan harus tetap lewat konstanta yang sama.
- Bentuk notch, lensa, cahaya Cermin (panel putih saat lampu nyala), dan animasi pil tetap.

**Yang harus dihindari**
- Teks terpotong atau keluar dari kartu.
- Teks di bawah 9 px di notch atau di bawah 11 px di jendela.
- Sisa gaya lama: huruf titik (`dotText`, `dotBar`, `.vdots`, `.hdots`), label Space Mono huruf besar, garis titik pemisah, dan merah sebagai aksen.

## 2. Bahasa Volt untuk app

| Hal | Nilai |
|---|---|
| Huruf | Inter (500/600) untuk teks dan label. Barlow Condensed (600/700) untuk angka besar dan judul. Space Grotesk dan Space Mono tidak dipakai lagi. |
| Label | Huruf biasa, tanpa huruf besar semua dan tanpa jarak huruf lebar. |
| Aksen | Limau `#C8F04A` di atas hitam. Dipakai untuk yang sedang terjadi atau terpilih: modul nyala, timer berjalan, tab aktif, centang, progres, dan tombol utama. |
| Bahaya | `#E5484D`, hanya untuk aksi yang menghapus atau tidak bisa dibatalkan (Hapus, Uninstall, Kosongkan) dan pesan gagal. **(keputusan penulis)** |
| Kartu di notch | `#000`, ring 1 px `#FFFFFF14`, sudut 17 px, dan jarak 16 px antar kartu, sama seperti widget. Ubin kecil (ubin Modul, ubin Titipan, ubin Screenshot) bersudut 12–14 px dengan ring yang sama. |
| Pemisah | Tidak ada garis titik. Bagian dipisah dengan kartu terpisah atau garis 1 px `#FFFFFF14`. |
| Angka besar | Barlow Condensed, dengan ukuran yang sama seperti widget pada luas yang sama. |

Warna dari token `$lu-…`, sama dengan widget:

| Nama | Nilai |
|---|---|
| ink | `#F3F5F0` |
| ink-2 | `#C4C8BF` |
| muted | `#8C9187` |
| faint | `#454941` |
| track | `#23251F` |
| accent-soft | `#1D260B` |
| on-accent | `#0F1404` |

## 3. Notch

- **Pil navigasi.** Latar hitam dengan ring. Ikon ink redup, ikon halaman aktif ink. Titik penanda halaman aktif dan titik "terlewat" (missed) memakai aksen.
- **Notifikasi di telinga.** Judul Inter 600, detail muted, dan angka Barlow. Titik merah lama diganti aksen.
- **Bar "‹ Modul"** dan nama modul memakai Inter 600 11 px, ink-2. Tidak huruf besar.
- **Halaman Modul (kisi ubin).** Ubin kartu hitam dengan ring, sudut 14, dan nama Inter 9–10 px.
  - Modul yang nyala: ikon dan nama ink, ring aksen tipis. **(keputusan penulis)**
  - Modul yang berjalan (Timer): titik aksen.
- **Halaman modul di iframe.**
  - **Sistem.** CPU, Memori, dan Jaringan masing-masing jadi kartu. Angka besar Barlow. Bar `segs` atau `bar` beraksen menggantikan baris titik.
  - **Tetap Nyala.** Satu kartu. Status besar, dan aksen saat nyala.
  - **Cermin.** Kontrol dalam kartu. Lampu putih tetap seperti sekarang.
  - **Timer penuh.** Kartu untuk penggaris dan kartu untuk tombol, dengan angka Barlow dan penanda aksen. Perilaku penggaris tidak berubah.
- **Titipan.** Ubin file berupa kartu hitam dengan ring. Kepala Inter. Zona jatuh bergaris tepi aksen saat file ditarik ke atasnya.
- **Screenshot.**
  - Halaman hasil: gambar dalam kartu, tombol berupa pil, tombol utama beraksen.
  - Daftar: ubin kartu, jam di bawahnya Inter, dan baris pemberitahuan Inter.
- **Cleaner.**
  - Halaman awal: kartu ruang disk dengan angka Barlow dan bar per jenis. Warna jenis diturunkan dari aksen dan abu. **(keputusan penulis)**
  - Daftar, tanya, progres, hasil, dan uninstall memakai kartu.
  - Centang aksen menggantikan merah. Tombol hapus memakai warna bahaya.

## 4. Jendela

- **Pengaturan.**
  - Tetap mengikuti mode terang atau gelap macOS dan efek kaca (vibrancy) yang ada. **(keputusan penulis)**
  - Huruf Inter, judul halaman Barlow 600.
  - Grup pengaturan jadi kartu bersudut 12 dengan garis 1 px di antara baris. Garis titik dihapus.
  - **Mode gelap:** kartu `#0F100E`, ring `#FFFFFF14`, aksen `#C8F04A` (on-accent `#0F1404`).
  - **Mode terang:** kartu `#FFFFFF`, ring `#0000001A`, aksen `#4C6B12` (on-accent `#FFFFFF`), karena limau tidak terbaca di atas putih.
  - **Saklar, pilihan segmen, item samping yang aktif, dan tombol utama** memakai aksen.
  - Pratinjau notch dan contoh widget di editor halaman tetap hitam seperti di notch.
- **Editor screenshot** (`editor.html`). Toolbar dan popover hitam bergaya Volt. Warna pena bawaan tetap menjadi pilihan pengguna, tapi tombol dan pilihan aktif beraksen.
- **Pemilih area** (`pick.html`). Garis dan ukuran area memakai Inter, dengan pegangan aksen.
- **Bersihkan keyboard** (`clean.html`). Hitam pekat dengan teks Inter dan hitungan mundur Barlow.

## 5. Teknis

- Satu file token bersama, `src/kit/volt-tokens.css`. Isinya `@font-face` lewat `@fontsource` dan variabel `--v-*`, tanpa aturan `html`/`body`. File ini dipakai `volt.css` (widget), `styles.css` (notch), `settings.css`, `editor.css`, `pick.css`, dan `clean.css`. Variabel yang sekarang disalin di `settings.css` diganti dengan import ini.
- Huruf titik (`src/kit/dots.ts`) dihapus kalau tidak ada lagi yang memakainya. Space Grotesk dan Space Mono dicabut dari `package.json` kalau tidak dipakai lagi.
- Konstanta ukuran di `src/pages/route.ts` hanya diubah kalau perlu. Test ukuran ikut diperbarui.

## 6. Urutan kerja

1. **Token dan dasar notch:** token bersama, pil, telinga, bar "‹ Modul", dan kisi Modul.
2. **Halaman modul di iframe:** Sistem, Tetap Nyala, Cermin, dan Timer penuh.
3. Titipan dan Screenshot.
4. Cleaner.
5. Jendela kecil: editor screenshot, pemilih area, dan bersihkan keyboard.
6. Pengaturan.
7. Cek di pratinjau browser, papan review, dan build uji.
