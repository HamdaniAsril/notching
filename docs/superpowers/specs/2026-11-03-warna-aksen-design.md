# Desain: warna aksen yang bisa diganti

Tanggal: 3 November 2026
Cabang: `feat/warna-aksen` (dibuat dari `main`).
Acuan: gaya Volt (`2026-11-02-gaya-volt-design.md`, `2026-11-03-volt-seluruh-app-design.md`).
Contoh yang sudah dilihat pemilik: `.superpowers/brainstorm/21048-1793677063/content/tanpa-nama.html` (tidak ikut di-commit).

Tanda **(keputusan penulis)** artinya pemilik belum memutuskan hal itu. Semua tanda ini dibawa ke review akhir.

## 1. Tujuan

Pemilik: "sekarang aksen warna nya hijau, aku mau ada settingan untuk merubah warna aksennya."

Lime sudah cocok untuk pemilik. Alasannya pengguna lain mungkin tidak suka hijau. Pengguna bisa memilih satu dari beberapa warna jadi yang cakep, atau memilih warna sendiri.

Kapan disebut berhasil:
- Warna diganti di Pengaturan → Tampilan.
- Semua tempat yang sekarang memakai lime langsung berganti tanpa restart: notch, telinga dan status di samping notch, gelombang musik, widget, modul di dalam iframe, editor screenshot, jendela kecil, dan Pengaturan.

**Bukan tujuan:**
- Tidak ada warna berbeda per modul atau per halaman.
- Tidak ada tema terang atau gelap baru.
- Merah bahaya (`--v-danger`) tidak ikut berganti.

- Abu-abu Volt yang sedikit kehijauan (`--v-ink`, `--v-muted`, `--v-track`, `--fg`, `--g1..g3`, dan sejenisnya) tetap seperti sekarang. Yang berganti hanya token aksen. **(keputusan penulis)**

**Gagal walaupun jalan:**
- Ada sisa lime yang tertinggal di satu tempat setelah warna diganti. Yang dihitung hanya warna aksen, bukan abu-abu.
- Teks beraksen jadi sulit terbaca di atas hitam.

## 2. Keputusan pemilik

**Pilihan warna**
- Ada 8 warna jadi ditambah satu "Warna sendiri" (pemilik: "pilihan beberapa warna yang cakep, lalu ada pilihan custom warna sendiri").
- Lime tetap bawaan. Pengguna yang tidak membuka setelan ini tidak melihat perubahan apa pun.

**Letak**
- Pengaturan → **Tampilan** (pemilik: "di tampilan saja").

**Tampilan pemilih**
- Hanya bulatan warna, tanpa tulisan nama (pemilik: "tidak perlu ditampilkan nama nya sama sekali").
- Nama tetap disimpan untuk tooltip dan pembaca layar.
- Nama warna (pemilik: "nama warna nya diganti yang estetik, lime sudah oke"):

| Nama | Hex | Kontras di atas hitam |
|---|---|---|
| Lime (bawaan) | `#c8f04a` | 16.0 : 1 |
| Citrus | `#ffd23f` | 14.5 : 1 |
| Mango | `#ff8a3d` | 9.0 : 1 |
| Peach | `#ffa07a` | 10.6 : 1 |
| Blossom | `#ff6fa8` | 8.1 : 1 |
| Lavender | `#b18cff` | 8.1 : 1 |
| Sky | `#5ac8fa` | 11.1 : 1 |
| Mint | `#3ee6c4` | 13.3 : 1 |

- Namanya sama di bahasa Indonesia dan Inggris. **(keputusan penulis)**
- Bulatan kesembilan bergambar pelangi dan membuka pemilih warna bawaan macOS (`<input type="color">`). Tooltip-nya "Warna sendiri" atau "Custom colour".

**Warna gelap di "Warna sendiri"**
- Kalau warna terlalu gelap, app diam-diam menerangkannya sedikit (pemilik: "diam diam menerangkan sedikit"). Tidak ada peringatan.

**Warna pucat di "Warna sendiri"**
- Pemilik juga mengikuti rekomendasi untuk warna yang terlalu pucat, misalnya putih atau abu-abu muda: app diam-diam menambahkan sedikit warna (pemilik, 3 Nov: "aku ikuti rekomendasimu").

**Coral diganti Peach**
- Coral `#ff5a4f` hampir sama dengan merah bahaya `--v-danger #e5484d`, jadi diganti Peach `#ffa07a` (pemilik, 3 Nov: "aku ikuti rekomendasimu").
- Peach dipilih dari dua usulan, Berry dan Peach, karena Berry terlalu dekat dengan Blossom. **(keputusan penulis)**

**Kapan berlaku**
- Langsung saat diklik, tanpa restart. Pemilik setuju dengan gambaran ini waktu ditunjukkan.

## 3. Satu warna, beberapa turunan

**Aturan warna pucat (§2).** Aturan ini dijalankan dalam HSL, sebelum aturan kontras. **(keputusan penulis: angkanya)**
- Saturasi di bawah 0.45 dinaikkan ke 0.45.
- Lightness di atas 0.80 diturunkan ke 0.80.
- Abu-abu murni tidak punya rona, jadi memakai rona Lime.
- Kedelapan warna jadi tidak berubah. Saturasi terendahnya 0.77 dan lightness tertingginya 0.77.

Nilai yang disimpan: `accent`, berupa `"#rrggbb"` dengan huruf kecil. Ada juga `accentCustom`, yaitu warna sendiri terakhir. Dengan begitu, bulatan pelangi tetap mengingat warna itu walaupun pengguna sempat kembali ke warna jadi. **(keputusan penulis)**

`#d6f56e` (hover) juga ditulis langsung di `pages.css` dan `editor.css`. Nilai itu menjadi token baru `--v-acc-hi`.

Semua turunan dihitung oleh satu fungsi murni di TypeScript, misalnya `accentPalette(hex)` di `src/kit/accent.ts`, lalu dipakai oleh semua permukaan. Untuk Lime, hasilnya harus persis sama dengan nilai yang ada sekarang.

| Token | Sekarang (Lime) | Cara menghitung warna lain |
|---|---|---|
| `--v-acc` / `--acc` | `#c8f04a` | Warna pilihan. Kalau kontrasnya di atas `#000` kurang dari **6 : 1**, warna dicampur sedikit demi sedikit ke putih sampai mencapai 6 : 1. Aturan warna pucat di atas dijalankan lebih dulu. **(keputusan penulis: batas 6 : 1, jadi kedelapan warna jadi tidak berubah)** |
| `--v-acc-deep` / `--acc` (mode terang) | `#4c6b12` | Versi gelap untuk latar putih: lampu Cermin, Pengaturan mode terang, dan ujung gradasi gelombang musik. Dicampur ke hitam sampai kontrasnya di atas `#fff` minimal **5.5 : 1**. |
| `--v-acc-soft` / `--acc-soft` | `#1d260b` | Latar lembut di atas hitam, kira-kira 15 % warna pilihan di atas hitam. |
| `--acc-hi` | `#d6f56e` | Versi sedikit lebih terang untuk hover di Pengaturan. |
| `--v-on-acc` / `--on-acc` | `#0f1404` | Teks di atas tombol beraksen. Hitam yang diberi sedikit rona warna pilihan. Kontrasnya di atas `--v-acc` minimal 4.5 : 1. |
| Mode terang `--acc-soft`, `--on-acc` | `rgba(76,107,18,.13)`, `#fff` | Dari `deep` dengan alfa 0.13, dan putih. |

Warna yang tembus pandang sekarang ditulis langsung, misalnya `rgba(200, 240, 74, 0.1)` dan `#c8f04a66`. Semuanya diganti dengan `color-mix()` dari token, atau dengan token baru, supaya ikut berganti.

Untuk Lime, angka tabel di atas boleh dikunci sebagai pengecualian. Rumus umumnya tidak harus menghasilkan `#4c6b12` dengan tepat. **(keputusan penulis)**

## 4. Tempat yang harus ikut berganti

Hasil pencarian 3 Nov. Pembangun tetap mencari ulang `c8f04a`, `4c6b12`, `1d260b`, `0f1404`, `d6f56e`, dan `200, 240, 74` sebelum menutup pekerjaan.

**Token CSS**
- `src/kit/volt-tokens.css`. Dipakai notch, iframe modul dan widget, editor, `clean`, dan `pick`.
- `src/settings/settings.css` punya token sendiri, yaitu `--acc*`, termasuk blok mode terang.
- `src/notch/pages.css:267`, yaitu `--v-acc` di lampu Cermin.

**Hex yang ditulis langsung di TypeScript**
- `src/notch/view.ts`: `ACC`, titik status, batang dan gradasi gelombang musik.
- `modules/waktu/widgets/analog.ts`: `ACCENT`.
- Cari juga warna di SVG atau canvas lain yang tidak lewat CSS.

**Hex atau rgba yang ditulis langsung di CSS**
- `src/notch/pages.css`
- `src/settings/settings.css`
- `modules/fokus/style.css`
- File `style.css` modul lain yang ditemukan pencarian.

**Pratinjau di Pengaturan**
- Pratinjau notch di halaman Tampilan.
- Contoh widget di Pengaturan (`widget-preview.ts`, `widget-samples.ts`).

## 5. Bagaimana warna sampai ke semua tempat

**Disimpan di inti**
- `Settings` di Rust mendapat field `accent: String`. Bawaannya `"#c8f04a"`.
- File lama yang belum punya field ini dibaca sebagai Lime.
- Nilai yang bukan `#rrggbb` ditolak, lalu kembali ke Lime.
- Pengaturan memanggil perintah baru, misalnya `set_accent`. Perintah ini menyimpan nilai lalu menyebarkan state seperti setelan lain.

**Notch**
- `accent` ikut di `ModuleState` (`src/modules/types.ts`).
- `app.ts` menulis token turunannya ke `documentElement` setiap state baru datang.
- Konstanta di `view.ts` diganti dengan nilai dari state.

**Iframe modul dan widget** (`notchmod:`)
- `notching:init` membawa `accent`.
- Ada pesan host baru `notching:accent` untuk perubahan langsung.
- `src/kit/client.ts` menulis token ke `documentElement` iframe begitu `init` atau `accent` diterima.
- Modul tidak perlu kode tambahan selama memakai `var(--v-acc…)`.
- Iframe **tidak** perlu di-reload untuk mengganti warna. **(keputusan penulis)**
- Kalau ada widget yang menggambar warna lewat JS, misalnya jam analog, widget itu membaca `getComputedStyle` atau mendapat callback dari kit saat warna berubah.

**Pengaturan**
- Mendengar `notching://settings` dan menulis `--acc*` ke `documentElement`.
- Pratinjau ikut berganti.

**Jendela kecil** (editor screenshot, `clean`, `pick`)
- Membaca `accent` saat dibuka.
- Ikut berganti juga kalau jendelanya sedang terbuka. **(keputusan penulis: kalau mendengar event tidak mudah di salah satu jendela, cukup berganti saat dibuka, dan dicatat)**

**Kilasan lime saat dibuka**
- Lime boleh terlihat sekejap sebelum `init` atau state pertama datang. Ini berlaku untuk iframe dan jendela kecil yang baru dibuka.
- Kalau kilasan itu terlihat jelas di Mac pemilik, perbaikannya dicatat sebagai pekerjaan lanjutan. Contohnya, inti menyisipkan aksen ke halaman sebelum halaman digambar. **(keputusan penulis)**

**Panel nspanel tetap tidak boleh di-close.** Penggantian warna hanya mengubah CSS, tidak membuat, menutup, atau me-reload panel.

## 6. Tampilan setelan

**Letak**
- Pengaturan → Tampilan, grup baru "Warna aksen" / "Accent colour".
- Grup ini ada di bawah pratinjau notch dan di atas penggeser. **(keputusan penulis: urutan dalam halaman)**

**Bulatan warna**
- Satu baris berisi 9 bulatan.
- Ukurannya sekitar 28–32 px, mengikuti ukuran kontrol Pengaturan. **(keputusan penulis)**
- Bulatan terpilih ditandai cincin di luar bulatan.
- "Warna sendiri" yang sedang aktif menampilkan warnanya di dalam cincin pelangi.

**Keyboard dan pembaca layar**
- Bulatan berperan sebagai grup radio, jadi panah kiri dan kanan bisa berpindah pilihan.
- Tiap bulatan punya nama untuk pembaca layar, yaitu nama warnanya.

**Kapan warna disimpan**
- Klik bulatan langsung menyimpan, dan seluruh app berganti.
- Di pemilih warna bebas, warna di pratinjau berganti selama digeser dan disimpan saat dilepas. Ini sama dengan pola penggeser di halaman Tampilan.

**Reset**
- Tombol "Kembalikan" di halaman Tampilan juga mengembalikan warna ke Lime. **(keputusan penulis)**

**Pencarian dan teks**
- Pencarian Pengaturan menemukan "warna", "aksen", "accent", dan "colour".
- Teks baru dibuat dalam dua bahasa di `src/i18n`.

## 7. Test

Test ditulis lebih dulu, sebelum kode.

**`accentPalette`**
- Lime menghasilkan token yang sekarang persis.
- Kedelapan warna jadi tidak diterangkan.
- Warna gelap, misalnya `#1a237e` atau `#000000`, diterangkan sampai minimal 6 : 1.
- Warna pucat, misalnya `#ffffff` atau `#cccccc`, diberi sedikit warna.
- `deep` minimal 5.5 : 1 di atas putih.
- `on-acc` minimal 4.5 : 1 di atas aksen.
- Masukan yang salah kembali ke Lime.

**Bagian lain**
- Rust: default, membaca file lama, dan validasi `accent`.
- `client.ts`: `init` dan `notching:accent` menulis token.
- Notch: state baru mengganti token, gelombang musik, dan titik status.
- Pengaturan: memilih bulatan memanggil bridge, pilihan yang tersimpan tampil terpilih, dan keyboard berjalan.
- Test lama yang mengunci `#C8F04A` diperbarui supaya mengikuti aksen dari state.

## 8. Uji di Mac pemilik

- Build uji yang belum ditandatangani meminta izin macOS diberikan ulang. Beri tahu pemilik sebelum mencoba.
- Pemilik mencoba beberapa warna jadi dan satu warna sendiri yang gelap.
- Bagian yang dilihat:
  - notch dan titik status di sampingnya,
  - gelombang musik,
  - satu halaman widget,
  - satu modul, misalnya Timer atau Fokus,
  - lampu Cermin,
  - Pengaturan mode gelap dan terang.
- Laporan "sudah dicek" dicocokkan dengan `accent` di file settings app, dan dengan log kalau ada, sebelum dicatat lulus.
