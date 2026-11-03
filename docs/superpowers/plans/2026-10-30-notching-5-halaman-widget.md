# Notching 5: Halaman, widget, dan halaman Modul (Langkah 1) — Rencana Kerja

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pil notch berisi halaman, bukan modul. Kamu menyusun halaman sendiri dari widget, Beranda menjadi halaman pertama, dan semua modul pindah ke satu halaman Modul.

Rencana ini cukup besar, jadi dibagi dua bagian. Setiap bagian dicek di perangkat dan boleh di-merge sendiri, supaya Notching tetap bisa dipakai setiap hari.
- **Bagian A, halaman di notch:**
  - Isi Beranda lama dipecah menjadi lima widget: Tanggal, Cuaca, Waktu sholat, Reminder, dan Jam.
  - Pil berisi Beranda, halaman custom, Modul, lalu ⋯.
  - Beranda baru berisi Tanggal, Cuaca, dan Reminder. Baris bawah dan pengaturan jam hilang.
  - Klik Reminder membuka daftar lengkap sebagai tampilan penuh dengan tombol kembali.
  - Halaman Modul berupa kotak ikon, 6 per baris. System stat menjadi kotak pertama dan tetap memakai kartunya.
  - Pengaturan dan data lama dipindahkan tanpa ada yang hilang.
  - Di Pengaturan ada bagian baru "Halaman" berisi kota, metode sholat, dan notifikasi sholat. Beranda hilang dari daftar Modul.
- **Bagian B, editor halaman dan status samping notch:**
  - Bagian "Halaman" menjadi editor: tambah, ganti nama, ganti ikon, hapus, dan urutkan halaman.
  - Pratinjau baris 4 kolom, dan daftar widget dengan filter jenis.
  - Status modul di samping notch. Di layar ber-notch, status ada di kanan dan titik terlewat di kiri. Di layar tanpa notch, keduanya ada dalam satu pil kecil. Diuji dengan status contoh, karena Timer belum ada.

**Architecture:**
- **Paket tetap satu sistem (spec baru 5).**
  - `manifest.json` boleh punya halaman modul (`entry` + `card`), daftar `widgets`, atau keduanya.
  - Paket tanpa halaman modul bukan modul: tidak tampil di halaman Modul atau daftar Modul, dan tidak bisa dimatikan atau dicopot.
  - Paket `home` tetap memakai id `home`, tapi sekarang hanya berisi lima widget. Namanya di Pengaturan menjadi "Widget bawaan". Karena id-nya tetap, kemampuan `home.data` dan `reminders`, saluran notifikasi `home.reminder` dan `home.prayer`, pilihan saluran yang tersimpan, dan penjadwal notifikasi tidak perlu dipindah.
- **Setiap widget yang dipasang adalah satu iframe sandbox.**
  - Iframe membuka `entry` widget, dan pesan `notching:init` membawa id widgetnya. Lima widget `home` memakai satu `index.html` yang sama.
  - Tampilan penuh memakai iframe yang sama: widget meminta `notching:expand`, lalu host membesarkan iframe itu ke seluruh baris dan mengirim `notching:view`. Ketikan dan data tetap ada.
- **Halaman disimpan di `settings.json` versi 2:**
  - `pages`: Beranda dulu, lalu halaman custom. Setiap halaman punya id, nama, ikon, dan penempatan widget (`widget` "paket/widget", `col` 0–3, `width` 1–2).
  - `lastPage` menggantikan `lastCard`. Isinya id halaman, `modules`, atau `module:<id>`.
  - File versi 1 dipindahkan sekali saat dibuka. Salinannya disimpan sebagai `settings.json.v1`.
- **Notch:**
  - `src/pages/` berisi aturan yang dipakai notch dan editor: tata letak 4 kolom, pemilihan halaman, dan ikon halaman.
  - `src/notch/page-view.ts` menggambar isi panel: baris widget, halaman Modul, atau halaman modul dengan bilah kembali.
  - `app.ts` mengatur pil, halaman terakhir, dan tujuan klik notifikasi.
- **Status samping notch (Bagian B):**
  - `src-tauri/src/status.rs` menyimpan status yang menyala, berurutan menurut waktu menyala, hanya di memori.
  - Status yang tampil dikirim lewat `notching://status` ke layar yang ada kursornya, dipilih setiap kali status berubah.
  - Overlay menggambarnya sebagai "telinga" kanan, atau sebagai pil kecil di layar tanpa notch.

**Tech Stack:** sama dengan rencana 4: Tauri 2, `tauri-nspanel` 2.1, objc2 0.6, Vite 8, TypeScript, Vitest + jsdom, `chrono`, `ureq`. Tidak ada dependensi baru.

**Spec:**
- `docs/superpowers/specs/2026-10-30-halaman-widget-design.md` (disetujui 30 Oktober 2026), bagian 3–9 dan 11 Langkah 1. Bagian 10 menyebut apa yang diganti dari desain awal.
- `docs/superpowers/specs/2026-10-27-notch-design.md` tetap berlaku untuk sisanya: gerak (4.2–4.3), notifikasi (4.4), banyak monitor (4.5), gaya (5), privasi dan hemat daya (3).
- Mockup di `docs/superpowers/specs/2026-10-30-halaman-widget-mockups/`: `page-layout.html` pilihan **C**, `modules-page.html` pilihan **A**, `live-status.html` pilihan **A** untuk layar ber-notch dan **B** untuk layar tanpa notch.

Rencana sebelumnya: `docs/superpowers/plans/2026-10-29-notching-4-beranda-notifications.md`. Kartu Beranda, `home/`, notifikasi, dan titik terlewat berasal dari sana.

**Keputusan pembuat (spec 12 menyerahkannya ke pembuat).** Pemilik bisa mengubahnya saat menyetujui rencana:
- **Ukuran halaman custom:**
  - Area isi 520 × 104 px untuk semua halaman custom.
  - 4 kolom dengan jarak 16 px, sehingga satu kolom sekitar 109 px.
  - Angka besar memakai huruf titik-titik dengan jarak titik 6 px, sehingga tingginya 42 px.
  - Angka yang tidak muat di kolomnya, misalnya suhu "-12°", turun ke jarak titik 5 px.
- **Widget Jam** menampilkan jam dan menit bertumpuk, "10" di atas "25". Alasannya, "10.25" dengan huruf 42 px selebar 150 px dan tidak muat di satu kolom.
- **Beranda** tidak bisa diganti nama atau ikon. Namanya mengikuti bahasa ("Beranda" atau "Home"), dan ikonnya rumah.
- **Pindahan data:**
  - Kalau modul `home` lama dimatikan atau dicopot, Beranda baru dimulai kosong.
  - Kartu terakhir `home` menjadi Beranda. Kartu modul lain menjadi halaman modul itu.
- **Halaman yang hilang saat panel terbuka:**
  - Halaman custom yang dihapus kembali ke Beranda.
  - Halaman modul yang modulnya dimatikan kembali ke halaman Modul.
- **Halaman modul** punya bilah kembali 24 px di atas kartunya: "‹ Modul".
- **Tampilan penuh Reminder** menggambar sendiri tombol "Kembali" di barisnya, supaya tingginya tetap 104 px.
- **Status samping notch:**
  - Layar status dipilih ulang setiap kali teksnya berubah. Jadi status Timer yang berubah tiap detik ikut pindah ke layar yang ada kursornya, tanpa memantau mouse terus-menerus.
  - Status tidak bisa diklik.
  - Status contoh dinyalakan dan dimatikan lewat satu saklar di Pengaturan → Notifikasi. Teksnya "18:42", dan saklar ini tidak disimpan.
- **Ikon halaman:** 24 ikon garis yang digambar di `src/pages/icons.ts`.

### Rangkaian rencana

Desain 30 Oktober menggantikan rencana 5 lama (lima modul). Urutannya sekarang:
1. Kerangka notch. Selesai.
2. Sistem modul dan System stat. Selesai.
3. Jendela pengaturan S1. Selesai.
4. Beranda N2 dan notifikasi. Selesai, di `main` 2bc773d.
5. **Halaman dan widget, Langkah 1** (rencana ini).
6. Langkah 2: widget Jam + tanggal, Jam kerja, Catatan cepat.
7. Langkah 3: modul Timer (dengan widget dan status samping notch), Keep awake, Freeze keyboard, Kamera cermin. Halaman Izin dan lokasi perangkat ikut di sini.

## Global Constraints

- **Repo dan git:**
  - Repo ada di root folder ini dan tidak punya remote. Folder ini dipakai bersama sesi lain.
  - Kerjakan di cabang `feat/halaman` dari `main` (9a9ff67). Commit pertamanya adalah rencana ini.
  - Commit hanya dengan path eksplisit. Jangan pernah `git add -A`, dan jangan pernah meng-commit `.claude/` atau `.superpowers/`.
  - Merge ke `main` hanya kalau pemilik memintanya.
  - Jangan memasang app ke `/Applications`. Setelah merge, sesi induk yang memasang ulang.
- **Identitas app:** nama produk `Notching`, bundle id `id.web.notching`, paket Cargo `notching`, nama proses `notching`.
- **Shell:** di shell non-interaktif, jalankan `export PATH="$HOME/.cargo/bin:$PATH"` dulu sebelum perintah `cargo`.
- **Perintah:**
  - `npm test` (228 lulus di awal), `npx tsc --noEmit`, dan `cargo test --manifest-path src-tauri/Cargo.toml` (122 lulus di awal).
  - Jalankan `npm run build:modules` sebelum perintah `cargo` apa pun.
- **Build rilis:** `npm run tauri build -- --bundles app`, hasilnya `src-tauri/target/release/bundle/macos/Notching.app`.
- **Panel tidak pernah ditutup.** Panel notch (`tauri-nspanel`) hanya disembunyikan, dipindah, atau dimuat ulang. Menutupnya membuat app abort karena `NSRangeException`. Jangan pakai `panel_event!`.
- **Gerak lama tidak berubah:**
  - Konstanta pegas, bentuk panel, jeda pil, keempat slider, telinga notifikasi, dan cahaya G2 tetap.
  - Pergantian halaman memakai pegas `pw`/`ph` yang sudah ada (spec baru 12).
- **Satu lock pada satu waktu.** `CoreState`, `HomeState`, dan `StatsState` tidak pernah dipegang bersamaan.
- **Ukuran (keputusan pembuat di atas):**

  | Nama | Nilai |
  |---|---|
  | `CUSTOM_PAGE` | `{ width: 520, height: 104 }` |
  | `COLUMNS` | 4, jarak 16 px |
  | Jarak titik angka besar | 6 px (42 px tinggi), turun ke 5 px kalau tidak muat |
  | `BACK_BAR` | 24 px |
  | Kotak halaman Modul | 6 per baris, jarak 6 px, tinggi 64 px, sudut 14 px |
  | `STATUS_TAB` (Bagian B) | 56 px ke kanan dari notch fisik |
  | `STATUS_MAX` (Bagian B) | 6 karakter |
  | `PAGE_NAME_MAX` | 24 karakter |

- **Penyimpanan:**
  - `settings.json` naik ke `version: 2`, dengan field baru `pages` dan `lastPage`, plus `statusOff` di Bagian B.
  - `lastCard` dan `home.showClock` dibuang.
  - `home.place` dan `home.prayerMethod` tetap di tempatnya, dan `reminders.json` tidak berubah.
  - Aturan baca toleran tetap berlaku: nilai salah tipe hanya mengembalikan field itu ke bawaan, dan `pages` yang rusak diperbaiki, tidak dibuang semuanya.
  - Pindahan versi 1 → 2 menulis `settings.json.v1` sekali, berisi teks asli file lama.
  - **Jangan jalankan Notching lama dan baru bergantian.** App lama menulis ulang file versi 1 tanpa `pages`. Saat cek perangkat, keluarkan dulu `/Applications/Notching.app`.
- **Jaringan, privasi, dan hemat daya:** semua aturan rencana 4 berlaku.
  - Hanya widget Cuaca yang meminta `refreshWeather`. Jadi cuaca hanya diambil saat ada halaman terbuka yang memasang widget Cuaca.
  - Widget yang hanya butuh waktu (Tanggal, Jam) tidak memanggil apa pun dan hanya bangun di batas menit.
  - Saat panel tertutup, tidak ada iframe, dan overlay tanpa `requestAnimationFrame`.
  - Status samping notch hanya dikirim saat berubah.
- **Gaya visual:**
  - Mengikuti mockup terpilih dan `kit.css`: Space Grotesk, Space Mono, abu `--g1`/`--g2`/`--g3`, dan garis titik-titik `.vdots` di antara widget.
  - Merah #E8262E hanya untuk satu titik per layar dan widget: titik di depan nama hari di Tanggal, titik "berjalan" di kotak Modul, dan titik terlewat.
  - Kelas CSS baru memakai awalan `pg-`, `mods-`, `ed-`, `wd-`, atau `st-`, dan tidak memakai `.main`, `.status`, `.card`, atau `.label` sebagai nama kelas baru.
- **Teks:**
  - Teks notch dan Pengaturan ada di `src/i18n/id.json` dan `src/i18n/en.json`. Teks widget ada di `modules/home/locales/{id,en}.json`.
  - Gaya DynamicNotch: kalimat pendek, menyapa "kamu", tanpa "kami".
  - Teks dari pengguna (nama halaman, judul reminder, nama kota) dan dari paket (nama widget dan modul) selalu masuk lewat `textContent` atau atribut. `innerHTML` hanya untuk SVG tetap: huruf titik-titik, ikon halaman dari daftar tetap, dan `icons.ts`.
- **Paket tetap terkunci:** widget dan modul hanya memakai kemampuan yang ada di manifest-nya. Pesan dari iframe dikenali dari iframe pengirimnya, tidak pernah dari isi pesannya.
- **Jangan membangun:** widget Langkah 2 (Jam + tanggal, Jam kerja, Catatan cepat), modul Langkah 3, Now playing, katalog widget dari luar, lebih dari satu baris widget, dan tampilan baru System stat.
- **Cek manual:** hasil cek perangkat hanya diisi dari laporan pemilik yang sudah dicocokkan dengan file atau log app. Jangan menandai lulus hanya karena pemilik bilang "aman".

## Review Focus

1. **`settings.json` pemilik dari rencana 4 dipindahkan.**
   - Kota, metode sholat, pilihan saluran notifikasi, layar, bahasa, slider, dan `reminders.json` tetap sama.
   - `lastCard: "system-stat"` membuka halaman System stat.
   - `home` yang dimatikan membuat Beranda kosong.
   - File tanpa `version` dianggap versi 1.
   - Pindahan hanya terjadi sekali, dan `settings.json.v1` tidak ditimpa.
   - Diuji di Task 2 (`a_plan_4_file_moves_to_pages_and_keeps_everything`, `a_switched_off_beranda_starts_empty`, `migration_runs_once_and_keeps_the_old_file`, `a_file_without_a_version_is_version_1`), lalu dicek di file asli pemilik di Task 8.
2. **`pages` hasil suntingan tangan.**
   - Contohnya: dua widget bertumpuk di kolom yang sama, widget lebar 2 di kolom 3, widget yang sama dua kali, Beranda hilang atau tidak di depan, id ganda, atau ikon yang tidak dikenal.
   - Semuanya diperbaiki tanpa crash dan tanpa membuang halaman yang sehat.
   - Diuji di Task 2 (`broken_pages_are_repaired`) dan Task 5 (`an unknown icon falls back to the dot`).
3. **Sumber widget hilang.**
   - Penempatan widget tetap tersimpan, tempatnya kosong di notch, redup dengan "Modul dimatikan" di editor, dan kembali sendiri saat sumbernya kembali.
   - Diuji di Task 5 (`a widget whose source is gone leaves its columns empty`), Task 9 (`set_page_keeps_widgets_whose_source_is_gone`), dan Task 10 (`a missing widget shows as switched off`).
4. **Teks panjang atau aneh.**
   - Nama halaman 24 karakter, emoji, atau `<img onerror>` tampil sebagai teks di editor, daftar halaman, dan label pil.
   - Status 9 karakter dipotong menjadi 6.
   - Suhu "-12°" tetap muat di kolomnya.
   - Diuji di Task 4 (`a number too wide for its column drops a dot size`), Task 9 (`page_names_are_trimmed_and_limited`), Task 10 (`a page name is text, never markup`), dan Task 11 (`status_text_is_cut_to_six`).
5. **Pergantian halaman yang bertabrakan.**
   - Notifikasi diklik saat halaman modul terbuka. Halaman terakhir dihapus dari jendela lain.
   - Tampilan penuh terbuka, lalu panel ditutup atau halaman diganti lewat pil: saat dibuka lagi, halaman tampil biasa.
   - Status tersembunyi selama notifikasi atau panel terbuka, lalu kembali.
   - Diuji di Task 6 (`a notice opens the first page with its widget`, `a deleted page gives way to Beranda`, `a full view does not survive closing the panel`) dan Task 12 (`the status hides while a notice or the panel shows`).

---

## Bagian A — Halaman di notch

### Task 1: Manifest paket: halaman modul opsional, widget, dan saluran yang menunjuk widget (Rust)

**Files:**
- Modify:
  - `src-tauri/src/modules/manifest.rs`, `src-tauri/src/modules/store.rs`.
  - `src-tauri/src/modules/gate.rs`: hanya `entry()` di test.
  - `modules/home/manifest.json`, `modules/home/locales/{id,en}.json`.
  - `modules/system-stat/locales/{id,en}.json`: `"shortName"`.
  - `scripts/build-modules.mjs`: memeriksa `entry` halaman dan setiap `entry` widget.
- Test: di dalam `manifest.rs` dan `store.rs`

**Interfaces:**
- Consumes: `Manifest`, `parse_manifest`, `ModuleStore`, `ModuleEntry` (rencana 2 dan 4).
- Produces:
```rust
// manifest.rs
pub enum Capability { /* lama */ #[serde(rename = "status")] Status }   // status samping notch (spec baru 8), dipakai Bagian B
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WidgetKind { Time, Weather, Worship, Work, Media }
#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WidgetSpec { pub id: String, pub entry: String, pub width: u8, pub kind: WidgetKind }
pub struct ChannelSpec { pub id: String, pub on: bool, pub sound: bool, #[serde(default)] pub widget: Option<String> }
pub struct Manifest {
    pub id: String, pub version: String, pub icon: String,
    #[serde(default)] pub entry: Option<String>,
    #[serde(default)] pub card: Option<CardSize>,
    pub permissions: Vec<Permission>, pub capabilities: Vec<Capability>,
    #[serde(default)] pub notifications: Vec<ChannelSpec>,
    #[serde(default)] pub widgets: Vec<WidgetSpec>,
}
impl Manifest { pub fn has_page(&self) -> bool; }       // entry dan card ada
pub enum ManifestError { /* lama */ HalfPage, Empty, BadWidget }
pub const WIDGETS_MAX: usize = 8;
// store.rs
#[derive(Clone, Debug, PartialEq)]
pub struct WidgetEntry { pub id: String, pub name: String, pub entry: String, pub width: u8, pub kind: WidgetKind }
pub struct ModuleEntry { /* lama */ pub short_name: String, pub widgets: Vec<WidgetEntry> }
pub enum StoreError { /* lama */ NotAModule(String) }    // Display: "{id} is not a module"
```

**Aturan:**
- **`parse_manifest`:**
  - `entry` dan `card` harus ada berdua atau tidak ada sama sekali. Kalau hanya salah satu, hasilnya `HalfPage`.
  - Paket tanpa halaman dan tanpa widget ditolak dengan `Empty`.
  - `card` yang ada tetap diperiksa `CARD_WIDTH`/`CARD_HEIGHT`.
  - Widget ditolak dengan `BadWidget` kalau: id tidak lolos `is_module_id`, id ganda, `width` di luar 1–2, `entry` tidak lolos `is_package_path`, atau jumlahnya lebih dari `WIDGETS_MAX`.
  - `ChannelSpec.widget` harus id widget paket itu sendiri. Kalau tidak, hasilnya `BadChannel`.
- **`list`:**
  - `short_name` diambil dari `text["shortName"]`, kalau tidak ada dari `name`.
  - `WidgetEntry.name` diambil dari `text["widgets"][id]`, kalau tidak ada dari id.
  - Paket tanpa halaman selalu `installed = true` dan `enabled = true`, apa pun isi `disabled_modules` dan `uninstalled_modules`.
- **Paket tanpa halaman:**
  - `sync` selalu menyalinnya ke folder aktif.
  - `set_enabled`, `uninstall`, dan `reinstall` menolaknya dengan `NotAModule`.
- **`modules/home/manifest.json` menjadi:**
  - `"version": "2.0.0"`, tanpa `entry` dan `card`.
  - `capabilities` tetap `["home.data", "reminders"]`.
  - `notifications`: `reminder` dengan `"widget": "reminders"`, dan `prayer` dengan `"widget": "prayer"`. Nilai `on` dan `sound` tetap.
  - `widgets`, berurutan:

    | id | entry | width | kind |
    |---|---|---|---|
    | `date` | `index.html` | 1 | `time` |
    | `clock` | `index.html` | 1 | `time` |
    | `weather` | `index.html` | 1 | `weather` |
    | `prayer` | `index.html` | 1 | `worship` |
    | `reminders` | `index.html` | 2 | `work` |
- **Locale `home`:**
  - `name`: "Widget bawaan" / "Built-in widgets".
  - `description`: "Tanggal, cuaca, sholat, reminder, jam" / "Date, weather, prayer, reminders, clock".
  - `widgets`: Tanggal/Date, Jam/Clock, Cuaca/Weather, Waktu sholat/Prayer times, Reminder/Reminders.
- **Locale `system-stat`:** `shortName` "Sistem" / "System".

- [ ] **Step 1: Buat cabang kerja dan commit rencana ini**

Run:
```bash
git switch -c feat/halaman main
git add docs/superpowers/plans/2026-10-30-notching-5-halaman-widget.md
git commit -m "docs: plan 5, pages and widgets (step 1)"
```
Expected: `git branch --show-current` menjawab `feat/halaman`.

- [ ] **Step 2: Tulis test yang gagal**

```rust
// manifest.rs
const WIDGETS: &str = r#"{"id":"home","version":"2.0.0","icon":"icon.svg","permissions":[],"capabilities":[],
  "widgets":[{"id":"date","entry":"index.html","width":1,"kind":"time"},
             {"id":"reminders","entry":"index.html","width":2,"kind":"work"}],
  "notifications":[{"id":"reminder","on":true,"sound":true,"widget":"reminders"}]}"#;
#[test] fn a_widget_package_needs_no_page()          // parse ok; !m.has_page(); m.widgets[1].width == 2; kind Work; channel widget Some("reminders")
#[test] fn a_page_needs_both_entry_and_card()        // GOOD tanpa "card" → HalfPage; GOOD tanpa "entry" → HalfPage
#[test] fn a_package_with_nothing_is_refused()       // tanpa entry/card/widgets → Empty
#[test] fn bad_widgets_are_refused()                 // width 3, width 0, id "Date!", id ganda, entry "../x", 9 widget → BadWidget
#[test] fn a_channel_can_only_point_at_its_own_widget()  // "widget":"clock" (tidak ada) → BadChannel
#[test] fn the_status_capability_parses()            // "capabilities":["status"] → [Capability::Status]
// store.rs, dengan fake_bundle yang ditambah paket "w" tanpa halaman (widget "one", width 1, kind "time", locales widgets.one "Satu"/"One")
#[test] fn widget_packages_are_always_on()           // settings disabled ["w"], uninstalled ["w"] → list: w installed && enabled; sync menyalin active/w
#[test] fn widget_packages_cannot_be_switched_off()  // set_enabled("w", false) / uninstall("w") / reinstall("w") → Err(NotAModule("w"))
#[test] fn widgets_and_short_names_come_from_the_locale()  // w.widgets == [WidgetEntry{id:"one",name:"Satu",entry:"index.html",width:1,kind:Time}]; a.short_name == "Modul A"
```
Ubah juga `fake_bundle` supaya ada paket `w` di `index.json` (`["a","b","w"]`). Perbaiki test lama yang menghitung modul dari `fake_bundle`: `app_core` sekarang melihat tiga paket.

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml modules::`
Expected: FAIL. `widgets`, `has_page`, dan `NotAModule` belum ada.

- [ ] **Step 4: Ubah `manifest.rs` dan `store.rs` sesuai Interfaces dan Aturan**

Pemakai `manifest.entry` dan `manifest.card` di `app_core.rs` sementara memakai `Option`. Task 3 yang merapikan DTO-nya. `repo_modules_are_valid` juga memeriksa bahwa setiap widget punya nama di `locales/{id,en}.json` (`v["widgets"][id]` berupa teks).

- [ ] **Step 5: Ubah manifest, locale, dan `build-modules.mjs`**

`build-modules.mjs` memeriksa setiap file di `[manifest.entry, ...manifest.widgets.map(w => w.entry)]` yang tidak `undefined`. Pesan gagalnya tetap `module ${id}: entry ${file} is missing after the build`.

- [ ] **Step 6: Jalankan test, pastikan lulus**

Run: `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS, termasuk `repo_modules_are_valid`. Kartu Beranda belum diubah, jadi build modul masih memakai `card.ts` lama. Itu sengaja, karena Task 4 yang menggantinya.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/modules/manifest.rs src-tauri/src/modules/store.rs src-tauri/src/modules/gate.rs src-tauri/src/app_core.rs modules/home/manifest.json modules/home/locales/id.json modules/home/locales/en.json modules/system-stat/locales/id.json modules/system-stat/locales/en.json scripts/build-modules.mjs
git commit -m "feat(native): packages may hold widgets, a module page, or both"
```

---

### Task 2: Settings versi 2: halaman, halaman terakhir, dan pindahan dari rencana 4 (Rust)

**Files:**
- Create: `src-tauri/src/pages.rs`
- Modify: `src-tauri/src/settings.rs`, `src-tauri/src/lib.rs` (`mod pages;`)
- Test: di dalam `pages.rs` dan `settings.rs`

**Interfaces:**
- Consumes: `Settings`, `lenient`, `load_settings`, `save_settings`, `is_module_id`.
- Produces:
```rust
// pages.rs
pub const HOME_PAGE: &str = "home";
pub const MODULES_PAGE: &str = "modules";
pub const MODULE_PAGE_PREFIX: &str = "module:";
pub const COLUMNS: u8 = 4;
pub const PAGE_NAME_MAX: usize = 24;
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Placement { pub widget: String, pub col: u8, pub width: u8 }   // widget: "paket/widget"
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Page { pub id: String, pub name: Option<String>, pub icon: String, pub widgets: Vec<Placement> }
pub fn beranda() -> Page;                               // id "home", name None, icon "home", Tanggal@0, Cuaca@1, Reminder@2 (lebar 2)
pub fn fits(widgets: &[Placement]) -> bool;             // lebar 1–2, col + width ≤ 4, tidak bertumpuk, widget yang sama sekali saja
pub fn repair(pages: Vec<Page>) -> Vec<Page>;
pub fn is_route(pages: &[Page], route: &str) -> bool;   // id halaman, "modules", atau "module:<id modul>"
// settings.rs
pub struct Settings {
    /* version, language, disabled_modules, uninstalled_modules, notch, screen, home, notifications */
    #[serde(deserialize_with = "lenient")] pub pages: Vec<Page>,          // Default: vec![beranda()]
    #[serde(deserialize_with = "lenient")] pub last_page: Option<String>,
}
pub struct HomeSettings { pub place: Option<Place>, pub prayer_method: PrayerMethod }   // show_clock dibuang
pub const SETTINGS_VERSION: u32 = 2;
pub fn migrate_v1(raw: &serde_json::Value, settings: &mut Settings);
```

**Aturan:**
- **`repair`:** urutannya:
  1. Buang halaman yang id-nya tidak lolos `is_module_id` atau sama dengan `modules`, dan halaman dengan id yang sudah dipakai halaman sebelumnya.
  2. Untuk halaman `home`: `name = None` dan `icon = "home"`.
  3. Untuk halaman lain: nama di-trim dan dipotong ke 24 karakter. Nama kosong menjadi `"?"`. Ikon yang tidak lolos `is_module_id` menjadi `"dot"`.
  4. Penempatan yang tidak sah dibuang satu per satu dari depan: lebar di luar 1–2, `col + width > 4`, bertumpuk dengan yang sebelumnya, atau widget yang sama dua kali.
  5. Kalau tidak ada halaman `home`, sisipkan `beranda()`. Kalau ada tapi bukan yang pertama, pindahkan ke depan.

  Penempatan dengan widget yang tidak dikenal tetap disimpan, karena sumbernya bisa kembali.
- **`load_settings`:**
  - Baca teks file, lalu parse sebagai `serde_json::Value` dan `Settings`. Aturan file rusak tetap sama.
  - Kalau `raw["version"]` (tidak ada berarti 1) kurang dari 2:
    1. Panggil `migrate_v1`.
    2. Salin teks lama ke `settings.json.v1` kalau file itu belum ada.
    3. Simpan versi 2 dengan `save_settings`.

    Gagal menulis hanya dicatat dengan `eprintln!`, dan app tetap jalan dengan hasil pindahan di memori.
  - Selalu: `settings.pages = repair(settings.pages)`.
  - `last_page` yang tidak lolos `is_route` menjadi `None`.
- **`migrate_v1`:**
  - Ambil `disabledModules` dan `uninstalledModules` dari `raw`. Kalau salah satunya berisi `"home"`, Beranda tanpa widget. Kalau tidak, `beranda()`.
  - `pages = [Beranda itu]`.
  - `raw["lastCard"]`:
    - `"home"` → `Some("home")`,
    - id lain yang lolos `is_module_id` → `Some("module:<id>")`,
    - selain itu `None`.
  - Buang `"home"` dari `disabled_modules` dan `uninstalled_modules`.
  - `version = 2`.

- [ ] **Step 1: Tulis test yang gagal**

```rust
// pages.rs
fn p(w: &str, col: u8, width: u8) -> Placement
#[test] fn beranda_holds_date_weather_and_reminders()   // widgets == [p("home/date",0,1), p("home/weather",1,1), p("home/reminders",2,2)]
#[test] fn fits_follows_the_four_columns()               // [p(a,3,2)] false; [p(a,0,1),p(b,0,1)] false; [p(a,0,1),p(a,2,1)] false; [p(a,1,2),p(b,3,1)] true; width 0 dan 3 false
#[test] fn broken_pages_are_repaired()
    // masukan: custom "p1" dulu (nama "  Kerja  ", ikon "Bad Icon!", widgets [p(a,0,2), p(b,1,1), p(c,3,2), p(a,2,1)]),
    //          Beranda dengan name Some("X") dan icon "star", "p1" kedua, dan {id:"modules"}
    // hasil:   [Beranda(name None, icon "home"), p1(nama "Kerja", ikon "dot", widgets [p(a,0,2)])]
#[test] fn a_missing_beranda_is_put_back()               // repair(vec![]) == vec![beranda()]
#[test] fn unknown_widgets_keep_their_place()            // p("timer/timer",3,1) bertahan setelah repair
#[test] fn routes_are_pages_the_modules_page_or_a_module()  // "home", "modules", "module:system-stat" true; "p9", "module:", "module:Bad!" false
// settings.rs
const PLAN_4: &str = r#"{"version":1,"language":"en","lastCard":"system-stat","disabledModules":[],
  "uninstalledModules":[],"screen":"DELL","notch":{"bounce":80,"speed":150,"dropDepth":9,"thickness":4},
  "home":{"place":{"name":"Bandung","region":"Jawa Barat","country":"Indonesia","latitude":-6.9,"longitude":107.6},
          "prayerMethod":"karachi","showClock":false},
  "notifications":{"glow":false,"seconds":5,"channels":{"home.prayer":{"on":true,"sound":false}}}}"#;
#[test] fn a_plan_4_file_moves_to_pages_and_keeps_everything()
    // version 2, pages [beranda()], last_page Some("module:system-stat"), language En, screen Some("DELL"),
    // notch.bounce 80, home.place Bandung, prayer_method Karachi, notifications.channels["home.prayer"].on, glow false
#[test] fn a_switched_off_beranda_starts_empty()        // disabledModules ["home","system-stat"] → pages[0].widgets kosong; disabled_modules == ["system-stat"]
#[test] fn an_uninstalled_beranda_starts_empty_too()    // uninstalledModules ["home"] → pages[0].widgets kosong; uninstalled_modules kosong
#[test] fn last_card_home_becomes_beranda()             // lastCard "home" → Some("home"); lastCard 5 → None
#[test] fn migration_runs_once_and_keeps_the_old_file()
    // load PLAN_4 → settings.json.v1 == PLAN_4 dan settings.json berisi "version": 2;
    // ubah pages lalu save; load lagi → pages yang diubah tetap ada; settings.json.v1 masih PLAN_4
#[test] fn a_file_without_a_version_is_version_1()      // {"lastCard":"home"} → last_page Some("home"), settings.json.v1 ada
#[test] fn a_bad_last_page_is_dropped()                 // version 2, lastPage "p7" tanpa halaman p7 → None
```
Perbarui test lama yang memakai `last_card` dan `show_clock`: `settings_survive_a_save_and_load` memakai `last_page`, dan `home_defaults` tanpa `show_clock`. Test lama yang menulis file tanpa `version` sekarang ikut dipindahkan, jadi ubah teks JSON-nya agar memuat `"version":2` kalau yang diuji bukan pindahan.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml pages:: settings::`
Expected: FAIL. `pages.rs` belum ada.

- [ ] **Step 3: Tulis `pages.rs` dan ubah `settings.rs` sesuai Interfaces dan Aturan**

`app_core.rs` dan `home/` yang memakai `last_card` dan `show_clock` sementara cukup dibuat terkompilasi:
- `set_last_card` memakai `last_page` dengan `"module:<id>"` atau `"home"`,
- `set_show_clock` dihapus beserta perintahnya.

Task 3 yang merapikannya.

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/pages.rs src-tauri/src/settings.rs src-tauri/src/lib.rs src-tauri/src/app_core.rs src-tauri/src/home/mod.rs src-tauri/src/home/commands.rs
git commit -m "feat(native): settings v2 keeps pages; plan 4 settings move over once"
```

---

### Task 3: Keadaan halaman dan widget untuk semua jendela (Rust)

**Files:**
- Create: `src-tauri/src/status.rs`. Untuk sekarang isinya hanya `Activity`. Bagian B mengisinya.
- Modify:
  - `src-tauri/src/app_core.rs`, `src-tauri/src/module_commands.rs`, `src-tauri/src/notify.rs`.
  - `src-tauri/src/home/mod.rs`, `src-tauri/src/home/commands.rs`, `src-tauri/src/home/schedule.rs`.
  - `src-tauri/src/settings_window.rs`, `src-tauri/src/lib.rs`.
- Test: di dalam `app_core.rs`, `home/mod.rs`, dan `notify.rs`

**Interfaces:**
- Consumes: Task 1 (`ModuleEntry.widgets`, `short_name`, `has_page`) dan Task 2 (`Page`, `is_route`, `last_page`).
- Produces:
```rust
// status.rs
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)] #[serde(rename_all = "camelCase")]
pub enum Activity { On, Running }
// app_core.rs, sama bentuknya dengan src/modules/types.ts
#[derive(Clone, Debug, PartialEq, serde::Serialize)] #[serde(rename_all = "camelCase")]
pub struct WidgetDto { pub id: String, pub name: String, pub entry: String, pub width: u8, pub kind: WidgetKind }
pub struct ModuleInfoDto {
    /* id, name, description, version, icon, installed, enabled, size, icon_svg, channels */
    pub short_name: String,
    pub entry: Option<String>, pub card: Option<CardSize>,   // keduanya None: paket widget
    pub widgets: Vec<WidgetDto>,
    pub activity: Option<Activity>,                          // selalu None sampai Bagian B
}
pub struct ChannelDto { /* id, name, on, sound */ pub widget: Option<String> }
pub struct ModuleStateDto {
    /* lang, modules, notch, notifications */
    pub pages: Vec<Page>, pub last_page: Option<String>,
    pub missed: Vec<String>,                                 // "modul.saluran", urut datang
}
impl AppCore {
    pub fn set_last_page(&mut self, route: &str) -> Result<(), CoreError>;   // is_route dan, untuk "module:<id>", modul itu punya halaman
    pub fn mark_missed(&mut self, module: &str, channel: &str);
}
// module_commands.rs
#[tauri::command] pub fn set_last_page(app: AppHandle, core: State<CoreState>, page: String) -> Result<(), String>;
// notify.rs
pub struct NoticeDto { /* lama */ pub channel: Option<String> }   // None untuk contoh
// home/mod.rs
pub struct HomeSnapshot { pub place, pub weather, pub prayer, pub reminders }   // show_clock dan statuses dibuang
```

**Aturan:**
- **Perintah:** `set_last_card` dan `set_show_clock` dihapus dari `invoke_handler`, dan `set_last_page` ditambahkan.
- **`set_last_page`** menolak rute yang tidak dikenal dengan `CoreError::Invalid("page")` tanpa menyimpan. Ini juga berlaku untuk `"module:system-stat"` kalau System stat dicopot.
- **`notify::post`:**
  - `NoticeDto.channel = Some(channel)`.
  - `deliver` memanggil `core.mark_missed(module, channel)`, sehingga isi `missed` sekarang `"home.reminder"`.
- **`SettingsDto.home`** sekarang hanya kota dan metode sholat.
- **`MiniStatus`** dibuang.

- [ ] **Step 1: Tulis test yang gagal**

```rust
// app_core.rs (fake_bundle: a, b dengan halaman; w paket widget)
#[test] fn state_carries_pages_widgets_and_short_names()
    // s.pages == vec![beranda()]; s.last_page None; s.modules[2].entry None && card None;
    // s.modules[2].widgets[0].name "One" (en); s.modules[0].short_name "Module A"; activity None di semua
#[test] fn the_last_page_survives_a_restart()          // set_last_page("module:b") lalu buka lagi → Some("module:b")
#[test] fn unknown_last_pages_are_refused()            // "p9", "module:w" (tanpa halaman), "module:zzz" → Err, tanpa file settings
#[test] fn an_uninstalled_module_page_is_refused()     // uninstall("a") lalu set_last_page("module:a") → Err
#[test] fn missed_marks_name_the_channel()             // mark_missed("a","ping") dua kali → missed == ["a.ping"]
#[test] fn channels_name_their_widget()                // paket w di fake_bundle mendapat saluran {"id":"due","widget":"one"} → ChannelDto.widget == Some("one"); saluran ping di a → None
// home/mod.rs: perbarui a_snapshot_without_a_city_has_no_weather_or_prayer (tanpa show_clock/statuses)
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml app_core::`
Expected: FAIL.

- [ ] **Step 3: Ubah kode sesuai Interfaces dan Aturan**

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS. Hitung ulang jumlah test Rust dan catat.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/status.rs src-tauri/src/app_core.rs src-tauri/src/module_commands.rs src-tauri/src/notify.rs src-tauri/src/home/mod.rs src-tauri/src/home/commands.rs src-tauri/src/home/schedule.rs src-tauri/src/settings_window.rs src-tauri/src/lib.rs
git commit -m "feat(native): module state carries pages, widgets and the last page"
```

---

### Task 4: Lima widget dari isi Beranda

**Files:**
- Modify:
  - `src/kit/protocol.ts`, `src/kit/client.ts`, `src/kit/dots.ts`.
  - `modules/home/main.ts`, `modules/home/types.ts`, `modules/home/ticks.ts`, `modules/home/style.css`.
  - `modules/home/locales/{id,en}.json`.
- Create: `modules/home/widgets/{date,clock,weather,prayer,reminders}.ts`, `modules/home/widgets/shared.ts` (`el`, `svgBox`)
- Delete: `modules/home/card.ts`, `modules/home/card.test.ts`. Isi test-nya pindah ke test widget.
- Test: `src/kit/protocol.test.ts`, `src/kit/client.test.ts`, `src/kit/dots.test.ts`, `modules/home/ticks.test.ts`, `modules/home/widgets/*.test.ts`

**Interfaces:**
- Consumes: `HomeSnapshot` tanpa `showClock` dan `statuses` (Task 3), `format.ts` (rencana 4).
- Produces:
```ts
// protocol.ts
HostMessage += { type: 'notching:init'; moduleId: string; lang: Lang; widget?: string }   // widget: id widget di iframe ini
             | { type: 'notching:view'; full: boolean }
FrameMessage += { type: 'notching:expand' } | { type: 'notching:collapse' }
// client.ts
interface Kit { /* lama */ readonly widget: string | null; expand(): void; collapse(): void; onView(cb: (full: boolean) => void): void }
// dots.ts
export const BIG_PITCH = 6;
export function dotWidth(text: string, pitch: number): number;                      // lebar SVG dotText
export function fitPitch(text: string, maxWidth: number): number;                   // 6, atau 5 kalau 6 tidak muat
// ticks.ts
export function everyMinute(setTimer, now: () => Date, cb: () => void): void;      // di setiap batas menit
export function startTicks(kit, onSnapshot, setTimer, now, opts: { weather: boolean }): { refresh(): Promise<void> };
// widgets/*.ts: masing-masing mengembalikan fungsi update
export function renderDate(root: HTMLElement, lang: Lang): { update(now: Date): void };
export function renderClock(root: HTMLElement): { update(now: Date): void };
export function renderWeather(root: HTMLElement, s: HomeStrings, lang: Lang): { update(snap: HomeSnapshot): void };
export function renderPrayer(root: HTMLElement, s: HomeStrings, lang: Lang): { update(snap: HomeSnapshot, now: Date): void };
export function renderReminders(root: HTMLElement, s: HomeStrings, lang: Lang, actions: ReminderActions):
  { readonly full: boolean; setFull(full: boolean): void; update(snap: HomeSnapshot, now: Date): void };
export interface ReminderActions { add(title: string, day: string, at: number | null): Promise<void>;
  setDone(id: number, done: boolean): Promise<void>; expand(): void; collapse(): void }
```

**Aturan:**
- **Semua widget:**
  - Satu kolom flex dengan jarak 6 px.
  - Label atas memakai `.lab`, dan label bawah juga `.lab`.
  - Angka besar memakai `dotText(text, fitPitch(text, root.clientWidth || 109))`.
- **Widget satu per satu:**

  | Widget | Isi |
  |---|---|
  | Tanggal | Titik merah dan nama hari, tanggal besar, "Oktober 2026". |
  | Jam | Dua baris angka besar: jam `HH` di atas, menit `MM` di bawah, jarak 6 px, tanpa label. |
  | Cuaca | Nama kota (tanpa kota: "Cuaca"), suhu besar dengan warna `--g1`, lalu "Berawan · 25°/33°". Tanpa kota: label bawah "Atur kota di Pengaturan". |
  | Waktu sholat | Label "Sholat", "Ashar 14.53" (15 px, 500), `dotBar(16, …)`, lalu sisa waktu "1 j 22 m". Tanpa kota: "Atur kota di Pengaturan". |
  | Reminder | Label "Reminder · 3", lalu dua reminder terdekat (`nearest(…, 2)`) tanpa tombol. Seluruh widget bisa diklik dan ditekan Enter (`role="button"`), dan keduanya memanggil `actions.expand()`. |
- **Tampilan penuh Reminder (`setFull(true)`):**
  - Isinya sama dengan daftar lama di `card.ts`: isian judul dan jam, daftar terbuka dan selesai, dan lingkaran selesai.
  - Kepalanya "Reminder · 3" dengan tombol "Kembali" di kanan. Tombol itu memanggil `actions.collapse()`.
  - Isian judul diberi fokus.
  - `setFull(false)` kembali ke widget biasa.
- **`main.ts`:**
  - Tunggu `connectKit()`, lalu pilih render menurut `kit.widget`. Widget yang tidak dikenal menampilkan teks kosong.
  - Tanggal dan Jam memakai `everyMinute`.
  - Cuaca memakai `startTicks(..., { weather: true })`. Waktu sholat dan Reminder memakai `{ weather: false }`.
  - Untuk Reminder: `kit.onView(full => widget.setFull(full))`, `expand: () => kit.expand()`, dan `collapse: () => kit.collapse()`.
- **`client.ts`:**
  - `expand()` mengirim `notching:expand`, dan `collapse()` mengirim `notching:collapse`.
  - `onView` dipanggil untuk setiap `notching:view` dari parent.
  - `isHostMessage` menerima `notching:view` hanya dengan `full` bertipe boolean, dan menerima `widget` di init hanya kalau tidak ada atau bertipe string.
- **Locale `home`:** tambah `"prayer": "Sholat"` / `"Prayer"`. Buang `"next"` kalau tidak dipakai lagi.

- [ ] **Step 1: Tulis test yang gagal**

```ts
// protocol.test.ts
test('a view message needs a boolean')                  // {type:'notching:view', full:true} true; full:'ya' false
test('init may name its widget')                       // init dengan widget 'date' true; widget 5 false
// client.test.ts
test('the kit knows its widget and passes expand and view')
  // hostSays init {widget:'reminders'} → kit.widget === 'reminders'; kit.expand() → parent menerima {type:'notching:expand'};
  // hostSays {type:'notching:view', full:true} → cb(true)
// dots.test.ts
test('a number too wide for its column drops a dot size')   // fitPitch('31°', 109) === 6; fitPitch('-12°', 109) === 5; dotWidth('-12°', 6) === 114
// ticks.test.ts
test('only the weather widget asks for fresh weather')     // opts {weather:false} → tidak ada call 'refreshWeather'
test('everyMinute wakes on the minute boundary')           // now 10:18:20 → timer 40_000 ms
// widgets/date.test.ts
test('the date shows the day, the big date and the month')  // 30 Okt 2026 → .lab "Jumat" diawali .rd, svg ada, "Oktober 2026"
// widgets/clock.test.ts
test('the clock stacks hours over minutes')                 // 09:05 → dua svg .dm, dotWidth pitch 6 dari "09" dan "05"
// widgets/weather.test.ts
test('weather without a city asks for one')                 // "Atur kota di Pengaturan"
test('weather shows the city, temperature and range')       // "Bandung", "Berawan · 25°/33°"
// widgets/prayer.test.ts
test('the next prayer shows its time, dots and what is left') // "Ashar 14.53", "1 j 22 m", 16 lingkaran di .dbar
// widgets/reminders.test.ts (pindahan dari card.test.ts, plus yang baru)
test('the widget shows the two nearest reminders')
test('clicking the widget asks to expand')                  // klik → actions.expand dipanggil; Enter juga
test('the full view adds reminders and marks them done')    // dari card.test.ts lama
test('reminder titles are text, never markup')              // '<img src=x onerror=alert(1)>' → textContent, tidak ada img
test('Kembali asks to collapse and the widget comes back')  // klik .back → actions.collapse; setFull(false) → .lab "Reminder · …"
test('typing survives an update in the full view')          // dari card.test.ts lama
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/kit modules/home`
Expected: FAIL.

- [ ] **Step 3: Tulis kode sesuai Interfaces dan Aturan**

CSS widget ada di `modules/home/style.css`. Ambil ukuran, warna, dan jarak dari N2 lama, tapi angka besarnya sekarang 42 px. Pakai `.wd-*` untuk kelas baru, dan pertahankan `.rm`, `.ck`, dan `.list` milik daftar reminder.

- [ ] **Step 4: Jalankan test dan pemeriksaan tipe**

Run: `npx tsc --noEmit && npm test && npm run build:modules`
Expected: PASS. Build modul menulis `module home built`.

- [ ] **Step 5: Commit**

```bash
git add src/kit modules/home
git commit -m "feat(widgets): Beranda splits into date, clock, weather, prayer and reminder widgets"
```
(`git add` di sini hanya berisi folder yang diubah task ini. Periksa `git status` dulu supaya tidak ada file lain yang ikut.)

---

### Task 5: Isi panel per halaman: baris widget, tampilan penuh, halaman Modul, dan halaman modul

**Files:**
- Create:
  - `src/pages/layout.ts`, `src/pages/route.ts`, `src/pages/icons.ts`, `src/pages/frames.ts`.
  - `src/notch/page-view.ts`, `src/notch/pages.css` (di-import dari `src/styles.css`).
- Delete: `src/modules/frame.ts`, `src/modules/frame.test.ts`, `src/modules/cards.ts`, `src/modules/cards.test.ts`. Test-nya pindah ke `src/pages/frames.test.ts` dan `src/pages/route.test.ts`.
- Modify: `src/modules/types.ts`, `src/notch/test-helpers.ts`, `src/i18n/{id,en}.json`, `src/i18n/index.ts`
- Test: `src/pages/layout.test.ts`, `src/pages/route.test.ts`, `src/pages/icons.test.ts`, `src/pages/frames.test.ts`, `src/notch/page-view.test.ts`

**Interfaces:**
- Consumes: DTO Task 3 dan protokol Task 4.
- Produces:
```ts
// modules/types.ts
export type WidgetKind = 'time' | 'weather' | 'worship' | 'work' | 'media';
export interface WidgetInfo { id: string; name: string; entry: string; width: number; kind: WidgetKind }
export interface Placement { widget: string; col: number; width: number }
export interface Page { id: string; name: string | null; icon: string; widgets: Placement[] }
export type Activity = 'on' | 'running';
ModuleInfo: entry: string | null; card: CardSize | null; shortName: string; widgets: WidgetInfo[]; activity: Activity | null;
Channel += widget: string | null;
ModuleState: pages: Page[]; lastPage: string | null; missed: string[];   // lastCard dibuang
export const hasPage = (m: ModuleInfo): boolean => m.entry !== null && m.card !== null;
// pages/layout.ts
export const COLUMNS = 4;
export interface CatalogWidget extends WidgetInfo { ref: string; moduleId: string }   // ref "paket/widget"
export interface Slot { placement: Placement; widget: CatalogWidget | null }        // null: sumbernya hilang
export function widgetCatalog(s: ModuleState): Map<string, CatalogWidget>;           // paket terpasang dan menyala saja
export function slots(page: Page, catalog: Map<string, CatalogWidget>): Slot[];       // urut kolom
export function canPlace(widgets: Placement[], col: number, width: number, ignore?: string): boolean;
export function firstFree(widgets: Placement[], width: number): number | null;
export function place(widgets: Placement[], ref: string, width: number, col?: number): Placement[] | null;  // null: tidak muat atau sudah ada
export function moveTo(widgets: Placement[], ref: string, col: number): Placement[] | null;
export function removeWidget(widgets: Placement[], ref: string): Placement[];
// pages/icons.ts
export const PAGE_ICONS: Record<string, string>;      // 24 nama → isi <svg> 24×24 garis
export const PAGE_ICON_NAMES: string[];               // urutan untuk pemilih ikon
export function pageIconSvg(name: string): string;    // nama tak dikenal → ikon "dot"
export const MODULES_ICON: string;                    // ikon grid untuk Modul
// pages/route.ts
export const CUSTOM_PAGE: CardSize = { width: 520, height: 104 };
export const BACK_BAR = 24;
export const MODULES_GRID = { columns: 6, gap: 6, tile: 64, width: 520 } as const;
export type PageView =
  | { kind: 'custom'; key: string; page: Page }
  | { kind: 'modules'; key: 'modules' }
  | { kind: 'module'; key: string; module: ModuleInfo };      // key "module:<id>"
export function pageModules(s: ModuleState): ModuleInfo[];     // terpasang, menyala, punya halaman; urutan katalog
export function resolvePage(s: ModuleState, key: string | null): PageView | null;
export function pickPage(s: ModuleState, current: string | null, panelOpen: boolean): PageView;
export function viewSize(v: PageView): CardSize;
export function pageName(p: Page, strings: HostStrings): string;   // name ?? strings.home
export function noticeTarget(s: ModuleState, moduleId: string | null, channel: string | null): string | null;
export function missedTargets(s: ModuleState): Set<string>;          // key pil yang diberi titik putih
// pages/frames.ts
export interface FrameSpec { key: string; moduleId: string; entry: string; widget: string | null; title: string; height: number }
export interface FrameHostDeps {
  bridge: Pick<Bridge, 'moduleCall' | 'moduleUrl' | 'moduleSandbox'>;
  setTimer: (fn: () => void, ms: number) => () => void;
  onKey: (key: 'Escape' | 'Quit') => void;
  onExpand: (key: string) => void; onCollapse: (key: string) => void;
}
export interface FrameHost {
  frame(spec: FrameSpec, lang: Lang, strings: HostStrings): HTMLElement;   // dipakai lagi kalau key dan lang sama
  keep(keys: string[]): void;          // membuang frame lain
  setFull(key: string, full: boolean): void;
  clear(): void; destroy(): void;
}
export function mountFrameHost(deps: FrameHostDeps, doc: Document): FrameHost;
// notch/page-view.ts
export interface PageViewDeps { frames: FrameHost; moduleUrl: (id: string, file: string) => string;
  onOpenModule: (id: string) => void; onBack: () => void }
export interface PageViewHost {
  show(v: PageView, s: ModuleState, strings: HostStrings): void;
  readonly full: string | null;        // key frame yang sedang tampilan penuh
  expand(key: string): void; collapse(): void;
  clear(): void;
}
export function mountPageView(content: HTMLElement, deps: PageViewDeps): PageViewHost;
```

**Aturan:**
- **`resolvePage(s, key)`:**
  - id halaman → `custom`.
  - `"modules"` → `modules`.
  - `"module:<id>"` dengan modul di `pageModules` → `module`.
  - Selain itu `null`.
- **`pickPage`:** urutannya:
  1. Kalau panel terbuka: `resolvePage(current)`.
  2. `resolvePage(s.lastPage)`.
  3. Kalau `current` atau `lastPage` adalah `module:` yang modulnya sudah tidak ada: halaman Modul.
  4. Beranda. Beranda selalu ada, karena Rust memperbaikinya.
- **`viewSize`:**
  - Halaman custom: `CUSTOM_PAGE`.
  - Halaman Modul: lebar 520. Tingginya `baris × 64 + (baris − 1) × 6`, dengan baris = `ceil(n / 6)`. Tanpa modul, tingginya 56.
  - Halaman modul: lebarnya `module.card.width`, tingginya `BACK_BAR + module.card.height`.
- **`noticeTarget`:**
  - `moduleId === null` → `null`.
  - Saluran dengan `widget` → id halaman pertama (urutan `s.pages`) yang memuat ref `"<module>/<widget>"`. Kalau tidak ada, `"home"`.
  - Modul yang punya halaman → `"module:<id>"`.
  - Selain itu `"home"`.
- **`missedTargets`:** setiap entri `"modul.saluran"` di `s.missed` diubah lewat `noticeTarget`. Hasil `"module:x"` menjadi `"modules"`.
- **`widgetCatalog`:** hanya paket yang `installed && enabled`. `ref = `${m.id}/${w.id}``.
- **`slots`:**
  - Ikut urutan `col`.
  - Penempatan dengan ref yang tidak ada di katalog → `widget: null`.
  - Lebar diambil dari katalog kalau ada.
- **`place`:**
  - Ref yang sudah ada di halaman → `null`.
  - Dengan `col` → `canPlace` di kolom itu. Tanpa `col` → `firstFree`.
  - Hasilnya diurutkan menurut `col`.
- **`moveTo`:** memeriksa `canPlace` dengan mengabaikan widget itu sendiri.
- **Ikon halaman:**
  - 24 nama: `home star heart bolt briefcase book code chart calendar clock bell flag pin globe cloud sun moon leaf coffee music camera gift compass dot`.
  - Garis 24×24, `stroke-width` 1.9, tanpa isian, digambar sendiri. Gaya ikutannya `ICON` di `view.ts`.
- **Frame:**
  - Setiap frame punya batas `READY_TIMEOUT_MS` sendiri. Kalau gagal, isinya diganti teks `.pg-error` "Gagal dimuat." (`strings.loadFailed`).
  - `notching:init` membawa `widget` kalau `spec.widget` ada.
  - `notching:expand` dan `notching:collapse` hanya dihitung dari iframe yang terdaftar, lalu diteruskan ke `onExpand(key)` atau `onCollapse(key)`.
  - `setFull` mengirim `notching:view`.
  - Pemanggilan kemampuan memakai `spec.moduleId` dari frame pengirim, sama seperti `frame.ts` lama.
- **Halaman custom:**
  - `.pg-row`: grid 4 kolom, `column-gap: 16px`, tinggi 104.
  - Setiap slot `.pg-slot` mengisi `grid-column: col+1 / span width`. Slot yang `widget === null` tidak digambar.
  - Slot kedua dan seterusnya diberi garis titik-titik di jarak sebelah kirinya (`::before`, gaya `.vdots`).
  - Halaman tanpa widget menampilkan `.pg-empty` dengan `strings.pageEmpty`.
  - Key frame: `${page.id}/${col}/${ref}`.
- **Tampilan penuh:**
  - `expand(key)`: `.pg-row` diberi kelas `full`. Slot itu menutupi keempat kolom dan slot lain disembunyikan dengan `display:none`, tanpa dibuang. Lalu `frames.setFull(key, true)`.
  - `collapse()` membalik semuanya.
  - `show()` untuk halaman lain, dan `clear()`, mengakhiri tampilan penuh.
- **Halaman Modul:**
  - `.mods-grid` 6 kolom. Setiap kotak adalah `<button class="mods-tile">`.
  - Isi kotak: ikon modul (`.glyph` dengan mask `moduleUrl(id, icon)`, 20 px) dan `.mods-name` (`shortName`, Space Mono 9 px, satu baris, `text-overflow: ellipsis`).
  - Kotak diberi `.on` (latar putih, isi hitam) kalau `activity === 'on'`. Kalau `'running'`, kotak berisi `<i class="mods-run">` (titik merah 5 px di kanan atas).
  - Klik kotak → `onOpenModule(id)`.
  - Tanpa modul → `.pg-empty` `strings.noModules`.
- **Halaman modul:**
  - `.pg-back` setinggi 24 px: tombol `‹ Modul` (`strings.modules`) di kiri yang memanggil `onBack()`, dan nama modul abu di kanan.
  - Di bawahnya frame modul dengan tinggi `card.height`.
- **Teks host baru:**

  | Kunci | Indonesia | Inggris |
  |---|---|---|
  | `home` | Beranda | Home |
  | `modules` | Modul | Modules |
  | `pageEmpty` | Halaman ini masih kosong. Tambah widget di Pengaturan. | This page is empty. Add widgets in Settings. |
  | `noModules` | Belum ada modul yang menyala. | No module is on. |

  `emptyTitle` dan `emptyHint` dibuang.

- [ ] **Step 1: Ubah `types.ts` dan `test-helpers.ts`**

`moduleInfo()` mendapat `shortName: id`, `widgets: []`, dan `activity: null`. `TEST_STATE`:
- `modules: [homeWidgets(), moduleInfo('system-stat')]`,
- `pages: [BERANDA]`, `lastPage: null`.

Tambahkan juga dua helper:
- `homeWidgets()`: paket `home` tanpa halaman, dengan kelima widget seperti manifest.
- `BERANDA`: id `home`, `name: null`, ikon `home`, dan widget `home/date@0`, `home/weather@1`, `home/reminders@2` lebar 2.

- [ ] **Step 2: Tulis test yang gagal**

```ts
// layout.test.ts
test('firstFree finds the first gap wide enough')          // [d@0,w@1] lebar 2 → 2; [d@0,r@2(2)] lebar 2 → null; lebar 1 → 1
test('place refuses a widget already on the page')         // place(BERANDA.widgets,'home/date',1) → null
test('place at a column checks the room there')            // [] place r lebar 2 di col 3 → null; di col 2 → [r@2]
test('moveTo ignores the widget being moved')              // [r@0(2)] moveTo r 1 → [r@1]; [d@0,r@2(2)] moveTo d 3 → null
test('a widget whose source is gone stays in its slot without a widget') // slots dengan 'timer/timer'@3 → widget null
// icons.test.ts
test('every page icon is a plain line drawing')            // 24 nama; tiap isi tidak memuat '<script', 'on', 'href'; pageIconSvg dibungkus <svg viewBox="0 0 24 24"
test('an unknown icon falls back to the dot')              // pageIconSvg('zzz') === pageIconSvg('dot')
// route.test.ts
test('the last page opens; a module page that went away gives the Modul page')
test('a deleted page gives way to Beranda')                // lastPage 'p3' tanpa p3 → Beranda
test('sizes follow the kind of page')                      // custom 520×104; modules 1 modul 520×64, 7 modul 520×134, 0 modul 520×56; system-stat 400×(24+80)
test('a notice opens the first page with its widget')
  // pages [BERANDA tanpa reminders, p1 dengan home/reminders]; noticeTarget(s,'home','reminder') === 'p1';
  // 'prayer' tanpa widget di mana pun → 'home'; modul timer dengan halaman → 'module:timer'; null → null
test('missed dots land on page icons')                     // missed ['home.reminder','timer.done'] → Set{'p1','modules'}
// frames.test.ts (pindahan dari frame.test.ts, plus yang baru)
test('a widget frame is told its widget')                  // init berisi widget:'date'
test('expand and collapse come only from a known frame')   // pesan dari window lain diabaikan; dari frame → onExpand(key)
test('setFull sends the view message')                     // frame menerima {type:'notching:view', full:true}
test('a frame that never says ready shows the load error in its slot only')
test('a kept frame is not reloaded')                       // frame(spec) dua kali dengan key dan lang sama → elemen yang sama
// page-view.test.ts
test('a custom page lays its widgets in four columns with dotted gaps')   // 3 slot, grid-column "1 / span 1", "2 / span 1", "3 / span 2"
test('a widget whose source is gone leaves its columns empty')
test('an empty page says so')
test('expanding covers the row and collapsing brings the others back')
test('the Modul page shows a tile per module, white when on and a red dot when running')
test('a module page has a back bar to the Modul page')
test('a module name is text, never markup')                // shortName '<b>x</b>' → textContent
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `npx vitest run src/pages src/notch/page-view.test.ts`
Expected: FAIL.

- [ ] **Step 4: Tulis kode sesuai Interfaces dan Aturan**

`app.ts` dan `bridge-browser.ts` masih memakai `cards.ts` dan `frame.ts`. Biarkan error tipenya sampai Task 6, dan jangan commit task ini sendirian kalau `tsc` gagal. Commit task 5 dan 6 dilakukan bersama di akhir Task 6.

- [ ] **Step 5: Jalankan test task ini**

Run: `npx vitest run src/pages src/notch/page-view.test.ts`
Expected: PASS.

---

### Task 6: Pil berisi halaman, dan notifikasi membuka halamannya

**Files:**
- Modify:
  - `src/app.ts`, `src/bridge.ts`, `src/bridge-browser.ts`, `src/bridge-browser-home.ts`.
  - `src/notch/view.ts`: `PillItem` berisi `svg`, bukan URL.
  - `src/settings/preview.ts`, `src/notch/notch.css`.
- Test: `src/app.test.ts`, `src/notch/view.test.ts`

**Interfaces:**
- Consumes: semua dari Task 5.
- Produces:
```ts
// bridge.ts
Bridge: setLastPage(page: string): Promise<void>;    // menggantikan setLastCard
Notice += channel: string | null;
// view.ts
export interface PillItem { id: string; label: string; svg: string; missed?: boolean }   // svg dari daftar tetap
setPill(items: PillItem[], active: string | null, moreLabel: string): void;              // tetap
```

**Aturan:**
- **Pil:**
  - Urutannya: setiap halaman di `state.pages` (id = id halaman, label `pageName`, svg `pageIconSvg(icon)`), lalu `{ id: 'modules', label: strings.modules, svg: MODULES_ICON }`, lalu ⋯.
  - Ikon aktif adalah key halaman yang terbuka. Halaman modul membuat `modules` aktif.
  - `missed` diambil dari `missedTargets`.
- **Pilih di pil** (`onSelect(id)`):
  - `resolvePage(id)`, lalu tampilkan dan `setLastPage(id)`.
  - Memilih halaman yang sudah terbuka saat tampilan penuh aktif → `collapse()`.
- **Halaman Modul:**
  - `onOpenModule(id)` → buka `module:<id>` dan `setLastPage`.
  - `onBack()` → buka `modules` dan `setLastPage('modules')`.
- **Panel:**
  - Saat panel terbuka (`phase === 'open'`), `pageView.show(view, ...)`. Saat menutup sampai `idle`/`hover`, `pageView.clear()`.
  - `controller.setCard(viewSize(view))` setiap halaman atau ukurannya berubah.
- **Notifikasi yang diklik:** panel terbuka di `noticeTarget(...)` kalau ada, lalu `setLastPage`. Untuk contoh (`moduleId: null`), halaman tidak berubah.
- **Ikon telinga:** URL ikon paket pengirim, seperti sekarang.
- **Pesan dari frame:**
  - `onExpand(key)` → `pageView.expand(key)`, hanya kalau key itu milik halaman yang sedang tampil.
  - `onCollapse` → `pageView.collapse()`.
- **`onModuleState`:** `pickPage(next, currentKey, open)`. Kalau key berubah, atau ukuran atau isinya berubah, tampilkan ulang. Frame yang key-nya sama tidak dimuat ulang.
- **`bridge-browser.ts`:**
  - `catalog()` mengikuti `ModuleInfo` baru: `entry` dan `card` `null` untuk paket tanpa halaman, `widgets` dari manifest dengan nama dari locale `widgets`, `shortName`, dan `activity: null`.
  - `pages: [BERANDA]` dan `lastPage: params.get('page')`. `?demo=1` menambah halaman uji `p1` "Uji" (ikon `star`) berisi Jam@0, Waktu sholat@1, dan Reminder@2, supaya kelima widget bisa dilihat.
  - `setLastPage` mengubah state.
  - Notice contoh membawa `channel: 'reminder'`.
  - `?missed=home.reminder` memasang titik.
- **`preview.ts`:** `setPill([], null, label)` tidak berubah.

- [ ] **Step 1: Tulis test yang gagal**

Perbarui test di `app.test.ts` yang memakai kartu. Test baru:
```ts
test('the pill shows the pages, then Modul')                // pillIds() === ['home','modules']
test('Beranda opens with its three widgets')                // open → 3 iframe, src berisi 'home/index.html'; panelSize().w === 520
test('picking Modul shows the tiles and remembers it')      // klik .ic[data-id="modules"] → .mods-tile 1 buah; setLastPage('modules')
test('a tile opens the module page; back returns to Modul') // klik tile → iframe system-stat, setLastPage('module:system-stat'), w 400; klik .pg-back button → .mods-grid
test('the last page opens')                                 // lastPage 'module:system-stat' → iframe system-stat
test('a deleted page gives way to Beranda')                 // pages [BERANDA, p1], lastPage 'p1', terbuka di p1; emit state tanpa p1 → Beranda
test('a module switched off while open gives way to the Modul page')
test('a notice opens the first page with its widget')       // pages [BERANDA, p1 berisi home/prayer]; notice {moduleId:'home', channel:'prayer'} diklik → p1
test('the sample notice keeps the page')                    // moduleId null → halaman tetap
test('a full view does not survive closing the panel')      // expand dari frame reminders → .pg-row.full; Esc; buka lagi → tanpa .full
test('a missed reminder puts the white dot on its page')    // missed ['home.reminder'] → .ic[data-id="home"].missed
test('a page name is text in the pill label')               // p1 bernama '<img src=x onerror=1>' → aria-label sama persis, tanpa img
```
`view.test.ts`: test pil memakai `svg`, dan isi `.ic` adalah `<svg>`.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/app.test.ts src/notch/view.test.ts`
Expected: FAIL.

- [ ] **Step 3: Tulis kode sesuai Interfaces dan Aturan**

- [ ] **Step 4: Jalankan semua test dan tipe**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 5: Lihat di browser**

Run: `npm run dev`, lalu buka `http://localhost:1420/?notch=1&notice=1&missed=home.reminder`.
Expected:
- Pil berisi Beranda dan Modul, dan ikon Beranda diberi titik putih.
- Beranda menampilkan Tanggal, Cuaca, dan Reminder dengan garis titik-titik.
- Klik Reminder membuka daftar penuh, dan "Kembali" menutupnya.
- Modul berisi satu kotak System stat, dan kartunya punya bilah "‹ Modul".
- Telinga notifikasi tetap seperti rencana 4.

Ambil tangkapan layar untuk pemilik.

- [ ] **Step 6: Commit Task 5 dan 6**

```bash
git add src/pages src/notch/page-view.ts src/notch/page-view.test.ts src/notch/pages.css src/styles.css src/modules/types.ts src/modules/frame.ts src/modules/frame.test.ts src/modules/cards.ts src/modules/cards.test.ts src/notch/test-helpers.ts src/i18n/id.json src/i18n/en.json src/i18n/index.ts src/app.ts src/app.test.ts src/bridge.ts src/bridge-browser.ts src/bridge-browser-home.ts src/notch/view.ts src/notch/view.test.ts src/notch/notch.css src/settings/preview.ts
git commit -m "feat(notch): the pill holds pages; Beranda is a row of widgets; Modul is a tile grid"
```

---

### Task 7: Pengaturan: bagian Halaman berisi data bersama, dan Modul tanpa Beranda

**Files:**
- Create: `src/settings/pages/pages.ts`
- Modify:
  - `src/settings/shell.ts`, `src/settings/types.ts`, `src/settings/icons.ts` (ikon `layers`), `src/settings/search.ts`.
  - `src/settings/pages/home.ts`: hanya kota, metode, dan notifikasi sholat, dengan rute `{ page: 'pages' }`.
  - `src/settings/pages/modules.ts`, `src/settings/pages/notifications.ts`.
  - `src/settings/bridge-tauri.ts`, `src/settings/bridge-browser.ts`, `src/settings/test-helpers.ts`, `src/settings/settings.css`.
  - `src/i18n/{id,en}.json`.
- Test: `src/settings/pages/pages.test.ts` (pindahan dari `home.test.ts`), `src/settings/pages/modules.test.ts`, `src/settings/search.test.ts`, `src/settings/shell.test.ts`

**Interfaces:**
- Consumes: `ModuleState` baru (Task 5) dan `pageIconSvg` (Task 5).
- Produces:
```ts
SectionId = 'general' | 'look' | 'notifications' | 'pages' | 'modules' | 'permissions' | 'about';
HomeSettingsInfo = { place: Place | null; prayerMethod: PrayerMethod };    // showClock dibuang
SettingsBridge: setShowClock dibuang
export const pagesPage: PageRender;
export function sharedData(ctx: PageContext): HTMLElement;   // dari homeSettings lama, tanpa jam
export function pageRow(ctx: PageContext, page: Page | 'modules'): HTMLElement;   // ikon, nama, jumlah widget; Bagian B membuatnya bisa diklik
```

**Aturan:**
- **Sidebar:** urutannya Umum, Tampilan notch, Notifikasi, Halaman (ikon `layers`), Modul, Izin. Tentang tetap di bawah.
- **Halaman "Halaman":**
  - Judul "Halaman" dengan sub "Susun isi notch-mu dari widget."
  - Grup pertama, "Data widget": Kota, Metode hitung sholat, dan Notifikasi waktu sholat, dengan `data-row` lama (`home.place`, dan seterusnya).
  - Grup kedua, "Urutan di pil": baris untuk setiap halaman di `state.pages`, lalu baris Modul. Isi baris: ikon (`pageIconSvg`), nama (`textContent`), dan jumlah widget "3 widget". Baris Modul menampilkan "6 per baris".
- **Daftar Modul:**
  - Hanya `installed && hasPage`. Hitungan di sidebar juga.
  - Halaman Tambah modul hanya untuk modul berhalaman yang dicopot.
  - `MODULE_SETTINGS` menjadi `{}`. Mekanismenya tetap ada untuk Bagian B.
- **Notifikasi:** baris saluran tetap memakai nama paket sebagai keterangan ("Widget bawaan").
- **Pencarian:**
  - `home.*` pindah ke bagian `pages` dengan rute `{ page: 'pages' }`, dan `home.showClock` dibuang.
  - Nama setiap halaman custom masuk indeks dengan key `page.<id>` dan rute `{ page: 'pages' }`.
- **Teks baru:**

  | Kunci | Indonesia | Inggris |
  |---|---|---|
  | `sections.pages` | Halaman | Pages |
  | `pages.sub` | Susun isi notch-mu dari widget. | Build your notch from widgets. |
  | `pages.data` | Data widget | Widget data |
  | `pages.order` | Urutan di pil | Order in the pill |
  | `pages.widgets` | {n} widget | {n} widgets |
  | `pages.modulesRow` | 6 per baris | 6 per row |
  | `keywords.pages` | halaman widget pil urutan beranda | pages widgets pill order home |

  `home.showClock`, `home.showClockHint`, dan `keywords.showClock` dibuang.

- [ ] **Step 1: Tulis test yang gagal**

```ts
// shell.test.ts
test('the sidebar has seven sections with Halaman before Modul')
// pages.test.ts (pindahan test kota, metode, dan notifikasi sholat dari home.test.ts, rute { page: 'pages' })
test('the city search works from the Halaman page')        // pindahan; ctx.go dengan { page: 'pages' }
test('the page list shows Beranda, then Modul')            // .row[data-row="page.home"] berisi "Beranda" dan "3 widget"; lalu "page.modules"
test('there is no clock switch any more')                  // tidak ada [data-key="home.showClock"]
// modules.test.ts
test('the widget package is not listed as a module')       // state homeWidgets + system-stat → hanya system-stat; hitungan "1"
// search.test.ts
test('the city is found under Halaman')                    // search 'kota' → route { page: 'pages' }, where "Halaman"
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/settings`
Expected: FAIL.

- [ ] **Step 3: Tulis kode sesuai Interfaces dan Aturan**

- [ ] **Step 4: Jalankan semua test, tipe, dan Rust**

Run: `npx tsc --noEmit && npm test && npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 5: Cek di browser bersama pemilik**

Run: `npm run dev`, lalu buka notch dan `settings.html`. Kirim tangkapan layar Beranda baru, halaman Modul, halaman System stat, dan Pengaturan → Halaman ke pemilik. Tanyakan:
- apakah ukuran angka dan jaraknya enak dilihat,
- apakah jam bertumpuk di widget Jam cocok. Widget ini tidak ada di Beranda, jadi tunjukkan lewat `?demo=1&page=p1`.

Perbaiki yang diminta pemilik sebelum lanjut.

- [ ] **Step 6: Commit**

```bash
git add src/settings src/i18n/id.json src/i18n/en.json
git commit -m "feat(settings): a Halaman section holds the shared widget data; Modul lists modules only"
```

---

### Task 8: Cek Bagian A di perangkat

**Files:**
- Create: `docs/superpowers/verification/2026-10-30-notching-5-halaman-widget.md`, bagian "A. Halaman di notch", dengan format seperti verifikasi rencana 4.

- [ ] **Step 1: Jalankan semua test dan catat jumlahnya**

Run: `npx tsc --noEmit && npm test && npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: semua PASS. Catat jumlahnya (awal: 228 web, 122 Rust).

- [ ] **Step 2: Simpan salinan data asli pemilik sebelum app baru jalan**

```bash
mkdir -p "$HOME/Library/Application Support/id.web.notching/before-plan-5"
cp "$HOME/Library/Application Support/id.web.notching/settings.json" "$HOME/Library/Application Support/id.web.notching/reminders.json" "$HOME/Library/Application Support/id.web.notching/before-plan-5/"
```
Catat isi `settings.json` lama: bahasa, layar, kota, metode, saluran, `lastCard`, dan modul yang mati. Lalu minta pemilik keluar dari `/Applications/Notching.app`.

- [ ] **Step 3: Jalankan `npm run tauri dev`, lalu periksa pindahan di file**

- `settings.json`: `"version": 2`, `pages` berisi Beranda, `lastPage` sesuai `lastCard` lama, dan kota, metode, saluran, layar, serta slider sama dengan catatan.
- `settings.json.v1` sama persis dengan salinan di `before-plan-5/`.
- `reminders.json` sama persis dengan salinannya.

- [ ] **Step 4: Cek bersama pemilik**

Minta pemilik mencoba dan melaporkan:
1. **Beranda:**
   - Beranda berisi Tanggal, Cuaca, dan Reminder.
   - Tidak ada baris bawah atau jam kecil.
   - Kota dan cuaca sama seperti kemarin.
   - Reminder lama masih ada.
2. **Reminder:**
   - Klik Reminder membuka daftar lengkap.
   - Tambah satu reminder lewat daftar itu, sambil TextEdit terbuka. Huruf masuk ke isian.
   - "Kembali" kembali ke Beranda, dan Esc menutup panel.
3. **Halaman Modul:**
   - Pil berisi Beranda, Modul, dan ⋯.
   - Modul menampilkan kotak System stat. Kotak itu membuka kartunya dengan "‹ Modul", dan "‹ Modul" kembali.
   - Panel berubah ukuran dengan pegas yang sama.
4. **Halaman terakhir:**
   - Tutup panel di halaman System stat, Cmd+Q, lalu jalankan lagi → panel terbuka di System stat.
   - Kembalikan ke Beranda.
5. **Notifikasi:**
   - Buat reminder 2 menit lagi. Notifikasi muncul, dan klik telinganya membuka Beranda.
   - Biarkan Mac diam 2 menit sebelum jamnya. Titik merah ada di notch, dan titik putih ada di ikon Beranda.
6. **Pengaturan:**
   - Sidebar berisi tujuh bagian, dan Halaman berisi kota dan metode sholat.
   - Beranda tidak ada di daftar Modul.
   - Bahasa English mengubah nama widget dan "Home".
7. **Monitor eksternal:** semua di atas juga jalan di lensa monitor tambahan.
8. **Perilaku lama:** klik di luar menutup panel, dan menu bar dekat tengah bisa diklik.

Untuk setiap laporan "lulus", cocokkan dengan file atau log kalau bisa:
- reminder baru ada di `reminders.json`,
- `lastPage` berubah di `settings.json`,
- notifikasi tercatat di log `tauri dev`.

- [ ] **Step 5: Cek oleh pelaksana**

- **CPU:** 10 sampel per keadaan dengan cara rencana 4.
  - Beranda terbuka dan diam → `notching` dan WebContent di bawah 1,0, kecuali satu lonjakan kecil di batas menit.
  - Panel tertutup → di bawah 1,0.
- **Jaringan:** Beranda dibuka dengan cuaca kedaluwarsa. Koneksi keluar hanya ke Open-Meteo (`lsof`, `dig`, seperti rencana 4).
- **Build rilis:** `npm run tauri build -- --bundles app`, lalu catat ukuran `Notching.app` (rencana 4: 4,9 MB). Pemilik membuka `.app` dari folder `bundle/macos` dan memastikan Beranda tampil.

- [ ] **Step 6: Tulis bagian A di file verifikasi, lalu commit**

Isi: jumlah test, isi file sebelum dan sesudah pindahan, CPU, jaringan, ukuran, checklist 1–8 dengan bukti dari file atau log, dan temuan. Perbaiki temuan dengan `superpowers:systematic-debugging`, lalu ulangi langkah yang gagal.

```bash
git add docs/superpowers/verification/2026-10-30-notching-5-halaman-widget.md
git commit -m "docs: verification notes for pages in the notch"
```

Tanyakan ke pemilik apakah Bagian A boleh di-merge ke `main`. Merge hanya kalau pemilik memintanya, lalu minta pemilik meminta sesi induk memasang ulang `/Applications/Notching.app`. Bagian B dilanjutkan di cabang yang sama.

---

## Bagian B — Editor halaman dan status samping notch

### Task 9: Menambah, mengubah, menghapus, dan mengurutkan halaman (Rust)

**Files:**
- Create: `src-tauri/src/page_commands.rs`
- Modify: `src-tauri/src/pages.rs`, `src-tauri/src/app_core.rs`, `src-tauri/src/lib.rs`
- Test: di dalam `pages.rs` dan `app_core.rs`

**Interfaces:**
- Consumes: `Page`, `Placement`, `fits`, `repair`, dan `is_route` (Task 2), `ModuleEntry.widgets` (Task 1).
- Produces:
```rust
// pages.rs
#[derive(Debug, PartialEq)]
pub enum PageError { NotFound(String), Fixed, BadName, BadIcon, BadLayout, UnknownWidget(String) }
// Display: "unknown page {id}", "Beranda cannot be changed that way", "a page name has 1 to 24 characters",
//          "unknown icon", "widgets do not fit the row", "unknown widget {ref}"
pub fn add_page(pages: &mut Vec<Page>, name: &str, icon: &str) -> Result<String, PageError>;   // id "p<n>" dengan n = terbesar + 1
pub fn set_page(pages: &mut [Page], id: &str, name: Option<&str>, icon: &str, widgets: Vec<Placement>,
                width_of: &dyn Fn(&str) -> Option<u8>) -> Result<(), PageError>;
pub fn delete_page(pages: &mut Vec<Page>, id: &str) -> Result<(), PageError>;
pub fn move_page(pages: &mut Vec<Page>, id: &str, to: usize) -> Result<(), PageError>;          // `to` dihitung di antara halaman custom
// app_core.rs
impl AppCore {
    pub fn widget_width(&self, r: &str) -> Option<u8>;          // paket terpasang dan menyala yang punya widget itu
    pub fn add_page(&mut self, name: &str, icon: &str) -> Result<String, CoreError>;
    pub fn set_page(&mut self, id: &str, name: Option<&str>, icon: &str, widgets: Vec<Placement>) -> Result<(), CoreError>;
    pub fn delete_page(&mut self, id: &str) -> Result<(), CoreError>;   // last_page yang menunjuk halaman itu menjadi None
    pub fn move_page(&mut self, id: &str, to: usize) -> Result<(), CoreError>;
}
// page_commands.rs, semua lewat module_commands::change
#[tauri::command] pub fn add_page(app, core, name: String, icon: String) -> Result<String, String>;
#[tauri::command] pub fn set_page(app, core, id: String, name: Option<String>, icon: String, widgets: Vec<Placement>) -> Result<(), String>;
#[tauri::command] pub fn delete_page(app, core, id: String) -> Result<(), String>;
#[tauri::command] pub fn move_page(app, core, id: String, to: usize) -> Result<(), String>;
```
`CoreError` mendapat `Page(PageError)`, dengan teks error yang sama.

**Aturan:**
- **Nama:**
  - Di-trim, lalu harus 1–24 karakter (`chars().count()`).
  - Halaman custom wajib punya nama.
  - Beranda: `name` harus `None` dan `icon` harus `"home"`. Kalau tidak, hasilnya `Fixed`.
- **Ikon:** harus ada di daftar tetap. Rust menyalin 24 nama dari Task 5 sebagai `PAGE_ICONS: [&str; 24]`. Test di Rust membaca `src/pages/icons.ts` dan memastikan setiap nama ada di sana.
- **`set_page`:**
  - Setiap penempatan harus punya widget yang dikenal (`width_of` `Some`), atau sudah ada di halaman itu sebelumnya. Penempatan lama yang sumbernya hilang boleh tetap ada.
  - `width` diganti dengan lebar dari katalog kalau widgetnya dikenal.
  - Hasilnya harus lolos `fits`. Kalau tidak, `BadLayout`.
  - Penempatan diurutkan menurut `col`.
- **Hapus dan pindah:**
  - `delete_page("home")` dan `move_page("home", _)` → `Fixed`.
  - `move_page` memotong `to` ke jumlah halaman custom − 1.

- [ ] **Step 1: Tulis test yang gagal**

```rust
// pages.rs
#[test] fn new_pages_get_the_next_free_id()             // [beranda, p1, p4] → add → "p5"; [beranda] → "p1"
#[test] fn page_names_are_trimmed_and_limited()         // "  Kerja " → "Kerja"; 25 karakter, "", "   " → BadName; 24 emoji → ok
#[test] fn beranda_keeps_its_name_icon_and_place()      // set_page home dengan Some("X") → Fixed; delete/move home → Fixed
#[test] fn widgets_must_fit_and_be_known()              // a@3 lebar 2 → BadLayout; "x/y" baru → UnknownWidget; lebar 1 untuk reminders → disimpan lebar 2
#[test] fn set_page_keeps_widgets_whose_source_is_gone()  // halaman punya timer/timer@3; set_page dengan placement itu, width_of → None, tetap ok
#[test] fn pages_move_among_the_custom_ones()            // [home,p1,p2,p3] move p3 ke 0 → [home,p3,p1,p2]; to 99 → paling akhir
#[test] fn icons_match_the_notch()                      // setiap PAGE_ICONS ada sebagai kunci di src/pages/icons.ts
// app_core.rs
#[test] fn pages_are_added_changed_and_saved()          // add "Kerja" "briefcase"; set_page dengan w/one@0; buka lagi → sama
#[test] fn deleting_the_last_page_forgets_it()          // last_page Some("p1"), delete p1 → None, dan tersimpan
#[test] fn a_switched_off_module_widget_cannot_be_added() // widget dari modul mati → UnknownWidget
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml pages:: app_core::`
Expected: FAIL.

- [ ] **Step 3: Tulis kode sesuai Interfaces dan Aturan, lalu daftarkan keempat perintah di `lib.rs`**

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/pages.rs src-tauri/src/page_commands.rs src-tauri/src/app_core.rs src-tauri/src/lib.rs
git commit -m "feat(native): pages can be added, changed, deleted and reordered"
```

---

### Task 10: Editor halaman di Pengaturan

**Files:**
- Create: `src/settings/pages/page-editor.ts`, `src/settings/drag.ts`
- Modify:
  - `src/settings/pages/pages.ts`, `src/settings/shell.ts`, `src/settings/types.ts`.
  - `src/settings/bridge-tauri.ts`, `src/settings/bridge-browser.ts`, `src/settings/test-helpers.ts`, `src/settings/settings.css`.
  - `src/i18n/{id,en}.json`.
- Test: `src/settings/pages/page-editor.test.ts`, `src/settings/pages/pages.test.ts`, `src/settings/drag.test.ts`

**Interfaces:**
- Consumes:
  - `layout.ts`: `widgetCatalog`, `slots`, `place`, `moveTo`, `removeWidget`, `firstFree`, `canPlace`.
  - `icons.ts`: `PAGE_ICON_NAMES`, `pageIconSvg`.
  - Perintah dari Task 9.
- Produces:
```ts
Route += { page: 'pageEdit'; id: string };
SettingsBridge += addPage(name: string, icon: string): Promise<string>;
  setPage(id: string, name: string | null, icon: string, widgets: Placement[]): Promise<void>;
  deletePage(id: string): Promise<void>; movePage(id: string, to: number): Promise<void>;
export const pageEditor: PageRender;
// drag.ts
export function dropIndex(mids: number[], pos: number): number;              // posisi sisip di antara titik tengah
export function columnAt(left: number, width: number, x: number): number;    // 0–3, dibatasi
export function dragWith(e: PointerEvent, opts: { onMove(x: number, y: number): void; onDrop(x: number, y: number): void; onCancel(): void }): void;
```

**Aturan:**
- **Daftar halaman (`pages.ts`):**
  - Baris Beranda dan baris custom bisa diklik (`role="button"`, Enter) → `{ page: 'pageEdit', id }`. Baris Modul → `{ page: 'modules' }`.
  - Baris custom punya pegangan `.ed-grip` untuk diseret. Diseret dengan pointer, dan saat dilepas → `movePage(id, dropIndex(...))`.
  - Alt+↑ dan Alt+↓ pada baris yang fokus memindahkannya satu langkah.
  - Tombol "+ Tambah halaman" di kepala halaman → `addPage(strings.pages.newName, 'star')`, lalu `go({ page: 'pageEdit', id })`.
- **Editor (`pageEditor`):**
  - Tombol kembali "‹ Halaman".
  - Kepala halaman: ikon dan nama. Untuk halaman custom:
    - isian nama (`maxLength` 24). Simpan dengan Enter atau saat isian ditinggalkan, dan nama yang tidak berubah tidak dikirim.
    - pemilih ikon: 24 tombol `aria-pressed`.
    - tombol "Hapus halaman" dengan klik kedua dalam `UNINSTALL_CONFIRM_MS` ("Yakin? Klik lagi"). Setelah terhapus → `go({ page: 'pages' })`.
  - **Pratinjau `.ed-row`:**
    - Empat kolom. Setiap slot berisi nama widget dan tombol × "Lepas" (`aria-label` "Lepas {name}").
    - Slot yang sumbernya hilang tampil redup dengan "Modul dimatikan".
    - Kolom kosong tampil sebagai kotak garis putus-putus `.ed-empty`.
    - Slot bisa diseret ke kolom lain → `moveTo`.
  - **Daftar widget:**
    - Chip filter: "Semua", lalu setiap jenis yang punya widget, dengan urutan Waktu, Cuaca, Ibadah, Kerja, Media.
    - Setiap widget berupa tombol `.ed-widget` berisi nama, jenis, dan "1 kolom"/"2 kolom".
    - Klik → `place(...)` di `firstFree`. Diseret ke pratinjau → `place(..., columnAt(...))`.
    - Widget yang sudah dipasang di halaman ini atau tidak muat tampil redup (`aria-disabled="true"`) dengan keterangan "Sudah dipasang" atau "Tidak muat", dan tidak bisa diklik.
  - Setiap perubahan → `setPage(id, name, icon, widgets)` untuk seluruh halaman, lewat `ctx.save('page.<id>', …)`.
  - Filter yang dipilih bertahan saat halaman dibangun ulang, disimpan di variabel modul seperti `draft` di `home.ts`.
  - Halaman yang hilang (dihapus di jendela lain) → kembali ke `{ page: 'pages' }`.
- **Rute:** `section()` memetakan `pageEdit` ke `pages`.
- **Teks baru:**

  | Kunci | Indonesia | Inggris |
  |---|---|---|
  | `pages.add` | + Tambah halaman | + Add page |
  | `pages.newName` | Halaman baru | New page |
  | `pages.name` | Nama | Name |
  | `pages.icon` | Ikon | Icon |
  | `pages.delete` | Hapus halaman | Delete page |
  | `pages.deleteConfirm` | Yakin? Klik lagi | Sure? Click again |
  | `pages.preview` | Pratinjau | Preview |
  | `pages.empty` | Kosong | Empty |
  | `pages.remove` | Lepas {name} | Remove {name} |
  | `pages.all` | Semua | All |
  | `pages.kinds` | Waktu, Cuaca, Ibadah, Kerja, Media | Time, Weather, Worship, Work, Media |
  | `pages.cols` | {n} kolom | {n} columns |
  | `pages.placed` | Sudah dipasang | Already here |
  | `pages.noRoom` | Tidak muat | No room |
  | `pages.sourceOff` | Modul dimatikan | Module is off |
  | `pages.fixedHint` | Beranda selalu pertama, Modul selalu terakhir. | Beranda comes first, Modul last. |

  `pages.kinds` disimpan sebagai objek per jenis.

- [ ] **Step 1: Tulis test yang gagal**

```ts
// drag.test.ts
test('dropIndex inserts before the first midpoint past the pointer')   // mids [10,30,50]: 5→0, 20→1, 60→3
test('columnAt splits the row into four')                              // left 0 width 400: x 99→0, 100→1, 399→3, -5→0, 450→3
// pages.test.ts
test('a page row opens its editor')
test('Tambah halaman makes a page and opens it')        // addPage('Halaman baru','star') → id 'p1' → h1/isian nama "Halaman baru"
test('Alt+Down moves a custom page')                    // movePage('p1', 1)
test('Beranda has no grip and cannot move')
// page-editor.test.ts
test('clicking a widget puts it in the first free spot')   // Beranda [d@0,w@1,r@2]; hapus w → klik "Cuaca" → setPage dengan w@1
test('a widget already here or without room is dimmed')    // Beranda penuh: semua aria-disabled, "Sudah dipasang" untuk Tanggal, "Tidak muat" untuk Jam
test('removing a widget frees its columns')                // klik Lepas Reminder → setPage tanpa r; dua .ed-empty
test('the kind filter keeps only that kind and survives a rebuild')
test('a missing widget shows as switched off')             // halaman dengan 'timer/timer'@3 → slot redup berisi "Modul dimatikan"
test('renaming saves on Enter, not when unchanged')
test('a page name is text, never markup')                  // nama '<img src=x onerror=1>' di judul dan isian sebagai teks
test('picking an icon saves it')                           // klik ikon 'book' → setPage(..., 'book', ...)
test('deleting takes a second click')
test('Beranda has no name field, icon picker or delete button')
test('a page deleted elsewhere sends the editor back to the list')
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/settings`
Expected: FAIL.

- [ ] **Step 3: Tulis kode sesuai Interfaces dan Aturan**

Untuk menyeret, pakai pointer event (`pointerdown`, `pointermove`, `pointerup`, dan `setPointerCapture`), bukan HTML5 drag and drop. Alasannya, Tauri bisa menangkap drag and drop untuk file. Selama diseret, elemen asal diberi kelas `.ed-dragging`, dan tempat tujuan diberi `.ed-target`.

- [ ] **Step 4: Jalankan semua test dan tipe**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 5: Cek di browser bersama pemilik**

Run: `npm run dev`, lalu buka `settings.html` dan notch di tab lain. Pemilik mencoba:
- tambah halaman "Kerja" dengan ikon tas, isi Jam dan Reminder, lalu seret Jam ke kolom 4,
- ganti nama, urutkan dua halaman, dan hapus satu.

Browser bridge harus menyiarkan perubahan ke notch, supaya pil berubah. Kirim tangkapan layar editor. Perbaiki yang diminta pemilik.

- [ ] **Step 6: Commit**

```bash
git add src/settings src/i18n/id.json src/i18n/en.json
git commit -m "feat(settings): the page editor: add, rename, icon, delete, reorder, place widgets"
```

---

### Task 11: Status samping notch (Rust)

**Files:**
- Modify:
  - `src-tauri/src/status.rs`, `src-tauri/src/app_core.rs`, `src-tauri/src/settings.rs` (`status_off`).
  - `src-tauri/src/notify.rs`: memakai lagi `screen_under` untuk layar kursor.
  - `src-tauri/src/module_commands.rs`, `src-tauri/src/lib.rs`.
  - `src/modules/types.ts`, `src/notch/test-helpers.ts` (`status: false`, `statusShown: true`, `sampleStatus: false`), `src/bridge-browser.ts`.
  - `src/settings/types.ts`, `src/settings/bridge-tauri.ts`, `src/settings/bridge-browser.ts`, `src/settings/test-helpers.ts`.
  - `src/settings/pages/modules.ts`: saklar status di halaman modul.
  - `src/settings/pages/notifications.ts`: saklar contoh status.
  - `src/i18n/{id,en}.json`.
- Test: di dalam `status.rs` dan `app_core.rs`, `src/settings/pages/modules.test.ts`, `src/settings/pages/notifications.test.ts`

**Interfaces:**
- Consumes: `Activity` (Task 3), `Capability::Status` (Task 1), `screen_under` (rencana 4).
- Produces:
```rust
// status.rs
pub const STATUS_MAX: usize = 6;
pub const STATUS_EVENT: &str = "notching://status";
#[derive(Clone, Debug, PartialEq)]
pub struct LiveEntry { pub module: Option<String>, pub activity: Activity, pub text: Option<String> }   // module None: contoh
#[derive(Default)]
pub struct LiveStatus { entries: Vec<LiveEntry> }        // urut waktu menyala
impl LiveStatus {
    pub fn set(&mut self, module: Option<&str>, activity: Activity, text: Option<&str>) -> bool;  // true kalau aktivitas berubah
    pub fn clear(&mut self, module: Option<&str>) -> bool;
    pub fn activity(&self, module: &str) -> Option<Activity>;
    pub fn shown(&self, off: &[String]) -> Option<(Option<String>, String)>;   // terakhir menyala yang punya teks dan tidak dimatikan
}
#[derive(Clone, Debug, PartialEq, serde::Serialize)] #[serde(rename_all = "camelCase")]
pub struct StatusDto { pub module_id: Option<String>, pub text: String, pub screen: String }
pub fn set(app: &AppHandle, module: &str, activity: Activity, text: Option<&str>) -> Result<(), String>;   // modul harus mendeklarasikan "status"; Langkah 3 memakainya
pub fn clear(app: &AppHandle, module: &str);
#[tauri::command] pub fn get_status(app: AppHandle) -> Option<StatusDto>;
#[tauri::command] pub fn set_sample_status(app: AppHandle, on: bool);
#[tauri::command] pub fn set_status_shown(app: AppHandle, core: State<CoreState>, module: String, on: bool) -> Result<(), String>;
// settings.rs
pub struct Settings { /* … */ #[serde(deserialize_with = "lenient")] pub status_off: Vec<String> }
// app_core.rs
ModuleInfoDto += pub status: bool /* mendeklarasikan "status" */, pub status_shown: bool;
ModuleStateDto += pub sample_status: bool;
```
```ts
// types.ts
ModuleInfo += status: boolean; statusShown: boolean;
ModuleState += sampleStatus: boolean;
SettingsBridge += setSampleStatus(on: boolean): Promise<void>; setStatusShown(module: string, on: boolean): Promise<void>;
```

**Aturan:**
- **`LiveStatus`:**
  - `set` untuk modul yang sudah ada hanya mengganti aktivitas dan teks, tanpa mengubah urutannya ("paling akhir dinyalakan", spec baru 8).
  - Teks dipotong dengan `notify::clip(text, STATUS_MAX)`. Teks kosong menjadi `None`.
- **Status yang tampil:** `AppCore` menyimpan `live` dan `status_screen: Option<String>`.
  - Setiap `set`, `clear`, `set_sample_status`, dan `set_status_shown`:
    1. Hitung `shown`.
    2. Di main thread, ambil layar di bawah kursor seperti `notify::deliver`.
    3. Simpan layarnya.
    4. Kirim `STATUS_EVENT` ke semua jendela, berisi `StatusDto` atau `null`.

    Kalau `shown` dan layarnya tidak berubah, tidak ada yang dikirim.
  - Aktivitas yang berubah (`set` atau `clear` mengembalikan `true`) juga menyiarkan module-state, supaya kotak Modul ikut berubah.
- **`set_sample_status(true)`:** `live.set(None, Activity::Running, Some("18:42"))`. `false` → `clear(None)`.
- **Pengaturan:**
  - Halaman modul di Pengaturan menampilkan saklar "Status di samping notch" untuk modul dengan `status: true`.
  - Halaman Notifikasi mendapat baris "Contoh status di samping notch" dengan saklar yang mengikuti `sampleStatus`.
- **Teks baru:**

  | Kunci | Indonesia | Inggris |
  |---|---|---|
  | `modules.status` | Status di samping notch | Status beside the notch |
  | `modules.statusHint` | Tampil saat panel tertutup. | Shows while the panel is closed. |
  | `notifications.sampleStatus` | Contoh status di samping notch | Sample status beside the notch |
  | `notifications.sampleStatusHint` | Untuk mencoba tampilannya. Tidak disimpan. | To try how it looks. Not saved. |

- [ ] **Step 1: Tulis test yang gagal**

```rust
// status.rs
#[test] fn the_last_started_status_shows()             // set a "18:42", set b "On" → shown b; update a "18:41" → masih b; clear b → a "18:41"
#[test] fn a_status_without_text_never_shows_but_keeps_activity()  // set a On None → shown None; activity("a") Some(On)
#[test] fn status_text_is_cut_to_six()                 // "123456789" → "12345…"
#[test] fn switched_off_statuses_are_skipped()         // shown(&["b".into()]) melewati b
#[test] fn activity_changes_are_reported()             // set a Running → true; set a Running teks lain → false; clear a → true; clear a lagi → false
// app_core.rs
#[test] fn status_switches_are_saved()                 // set_status_shown("a", false) → status_off ["a"]; buka lagi → status_shown false
#[test] fn only_declared_modules_may_show_a_status()   // fake bundle: a mendeklarasikan "status", b tidak → state.modules[0].status true, [1] false
```
```ts
// modules.test.ts
test('a module with a status gets a status switch')     // moduleInfo('timer', {status:true, statusShown:true}) → toggle 'module.timer.status'; klik → setStatusShown('timer', false)
// notifications.test.ts
test('the sample status switch follows the state')     // sampleStatus false → klik → setSampleStatus(true)
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml status:: app_core:: && npx vitest run src/settings`
Expected: FAIL.

- [ ] **Step 3: Tulis kode sesuai Interfaces dan Aturan, lalu daftarkan perintahnya di `lib.rs`**

Tambahkan `"status"` ke capabilities paket `a` di `fake_bundle`.

- [ ] **Step 4: Jalankan semua test**

Run: `npx tsc --noEmit && npm test && npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/status.rs src-tauri/src/app_core.rs src-tauri/src/settings.rs src-tauri/src/notify.rs src-tauri/src/module_commands.rs src-tauri/src/lib.rs src-tauri/src/modules/store.rs src/modules/types.ts src/notch/test-helpers.ts src/bridge-browser.ts src/settings src/i18n/id.json src/i18n/en.json
git commit -m "feat(native): one status beside the notch, the last one started, on the cursor's screen"
```

---

### Task 12: Status di notch: telinga kanan dan pil kecil

**Files:**
- Modify:
  - `src/notch/view.ts`, `src/notch/shape.ts`, `src/notch/notch.css`.
  - `src/app.ts`, `src/bridge.ts`, `src/bridge-browser.ts`, `src/notch/test-helpers.ts`.
- Test: `src/notch/shape.test.ts`, `src/notch/view.test.ts`, `src/app.test.ts`

**Interfaces:**
- Consumes: `StatusDto` (Task 11).
- Produces:
```ts
// bridge.ts
export interface LiveStatus { moduleId: string | null; text: string; screen: string }
Bridge += status(): Promise<LiveStatus | null>; onStatus(cb: (s: LiveStatus | null) => void): () => void;
// shape.ts
export function notchTabPath(notch: NotchSize, ext: number, side: 'left' | 'right' = 'left'): string;  // 'right' adalah cermin 'left'
export function topPillPath(halfWidth: number, height: number): string;   // bentuk notchShape(x0, x1, h) di live-status.html, berpusat di 0
// view.ts
export const STATUS_TAB = 56;
NotchView += setStatus(text: string | null): void;
```

**Aturan:**
- **Kapan status tampil:** hanya saat `phase` adalah `idle` atau `hover`, sama seperti titik terlewat. Saat `notify`, `open`, atau `closing`, status disembunyikan. Telinga notifikasi menggantikannya, lalu status kembali sendiri.
- **Layar ber-notch (mockup A):**
  - Path `notchTabPath(notch, STATUS_TAB, 'right')`.
  - `<text>` Space Mono 11 px, `letter-spacing` 0.6, putih, `text-anchor="end"`, di `x = notch.width/2 + STATUS_TAB − 8` dan `y = notch.height/2 + 4`.
  - Titik terlewat tetap di tab kiri.
- **Layar tanpa notch (mockup B):**
  - Hanya titik: tetap seperti sekarang, di bawah lensa.
  - Ada status: satu pil `topPillPath(w/2, 22)` di tengah, dengan `w = 24 + 7 × panjang teks + (ada titik ? 14 : 0)`.
  - Isi pil: titik merah r 3 di kiri (kalau ada titik terlewat), lalu teks di tengah sisa ruang.
  - Titik di bawah lensa disembunyikan selama pil tampil.
- **Pembaruan:** `setStatus` hanya mengubah atribut SVG dan memanggil `kick()` sekali. Tidak ada loop frame selama status diam.
- **`app.ts`:** status yang `screen`-nya bukan `info.label` dianggap `null`. Ini berlaku untuk `bridge.status()` saat mulai dan untuk `onStatus`.
- **`bridge-browser.ts`:** `?status=18:42` memberi status contoh di layar ini.

- [ ] **Step 1: Tulis test yang gagal**

```ts
// shape.test.ts
test('the right tab mirrors the left one')               // titik-titik path 'right' = x dicerminkan dari 'left'
test('the top pill is a closed shape around the centre') // topPillPath(46,22) diawali 'M -52', berakhir 'Z'
// view.test.ts
test('a status sits right of the notch, the missed dot left')    // notch: setStatus('18:42'), setMissed(true) → .st-tab dan .missed-tab tampil, .st-text '18:42'
test('without a notch a status opens one small pill with the dot inside')  // .st-pill tampil, .missed-dot di dalam pill (cx < 0), titik bawah lensa hilang
test('a status alone on a lens screen leaves no dot')
test('status text is drawn as text')                     // setStatus('<b>') → textContent '<b>', tanpa elemen b
// app.test.ts
test('the status shows only on its screen')              // screen 'other' → tidak tampil; 'test' → tampil
test('the status hides while a notice or the panel shows')  // emit status; notice → tersembunyi selama notify; selesai → tampil; buka panel → tersembunyi
```

Kelas SVG baru: `st-tab`, `st-text`, dan `st-pill`.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/notch src/app.test.ts`
Expected: FAIL.

- [ ] **Step 3: Tulis kode sesuai Interfaces dan Aturan**

- [ ] **Step 4: Jalankan semua test dan tipe**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 5: Lihat di browser**

Buka `http://localhost:1420/?notch=1&status=18:42&missed=home.reminder` dan `?status=18:42&missed=home.reminder` (tanpa notch). Bandingkan dengan `live-status.html`: pilihan A untuk notch, pilihan B untuk lensa. Ambil tangkapan layar keduanya untuk pemilik.

- [ ] **Step 6: Commit**

```bash
git add src/notch/view.ts src/notch/view.test.ts src/notch/shape.ts src/notch/shape.test.ts src/notch/notch.css src/app.ts src/app.test.ts src/bridge.ts src/bridge-browser.ts src/notch/test-helpers.ts
git commit -m "feat(notch): the status beside the notch, or in one small pill on a lens"
```

---

### Task 13: Cek Bagian B di perangkat, lalu verifikasi akhir

**Files:**
- Modify: `docs/superpowers/verification/2026-10-30-notching-5-halaman-widget.md`, bagian "B. Editor halaman dan status samping notch".

- [ ] **Step 1: Jalankan semua test dan catat jumlahnya**

Run: `npx tsc --noEmit && npm test && npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: semua PASS.

- [ ] **Step 2: Cek bersama pemilik di `npm run tauri dev`**

Pastikan `/Applications/Notching.app` sudah keluar. Minta pemilik mencoba dan melaporkan:
1. **Halaman custom:**
   - Tambah halaman "Kerja" dengan ikon tas, isi Jam, Waktu sholat, dan Reminder.
   - Pil menjadi Beranda, Kerja, Modul, ⋯.
   - Halaman Kerja tampil dengan garis titik-titik dan ukuran panel yang sama dengan Beranda.
2. **Widget dipakai bersama:** reminder yang ditambah di halaman Kerja juga muncul di Beranda.
3. **Editor:**
   - Seret Jam ke kolom 4, dan kolom kosong tetap kosong di notch.
   - Lepas Waktu sholat.
   - Ganti nama dan ikon, lalu urutkan halaman. Pil mengikuti.
   - Hapus halaman uji.
   - Beranda tidak bisa dihapus.
4. **Ketahanan:** Cmd+Q, lalu jalankan lagi → halaman, urutan, dan isinya tetap ada.
5. **Status, layar ber-notch:**
   - Nyalakan "Contoh status" di Notifikasi.
   - "18:42" muncul di kanan notch di layar yang ada kursornya.
   - Kalau ada notifikasi terlewat, titik merah tetap di kiri.
   - Saat notifikasi tampil, status hilang lalu kembali.
6. **Status, monitor eksternal:**
   - Pindahkan kursor ke monitor tambahan, lalu matikan dan nyalakan lagi contohnya. Status pindah ke lensa monitor itu sebagai pil kecil.
   - Dengan notifikasi terlewat, titik merah ada di dalam pil yang sama.
7. **Notifikasi:** reminder yang jatuh tempo membuka halaman pertama yang memasang Reminder.
8. **Perilaku lama:** klik di luar menutup panel, menu bar bisa diklik, dan System stat jalan.

Untuk setiap laporan, cocokkan dengan file atau log:
- `pages` dan `lastPage` di `settings.json`,
- urutan halaman,
- reminder di `reminders.json`.

Status contoh tidak disimpan, jadi cek dari tangkapan layar pemilik.

- [ ] **Step 3: Cek oleh pelaksana**

- **CPU:**
  - Panel tertutup dengan contoh status menyala → `notching` dan WebContent di bawah 1,0. Tidak ada loop frame.
  - Halaman Kerja terbuka dan diam → di bawah 1,0.
- **Build rilis:** catat ukuran `Notching.app`.
- **Spec 2:** periksa sekali lagi tidak ada yang dibangun di luar Langkah 1. Lihat "Jangan membangun".

- [ ] **Step 4: Tulis bagian B dan ringkasan akhir di file verifikasi**

Isi:
- jumlah test akhir,
- ukuran dan CPU,
- checklist 1–8 dengan bukti,
- temuan dan perbaikannya,
- daftar keputusan pembuat yang diubah pemilik selama cek, kalau ada.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/verification/2026-10-30-notching-5-halaman-widget.md
git commit -m "docs: verification notes for the page editor and the status beside the notch"
```

Lalu gunakan `superpowers:finishing-a-development-branch`. Merge ke `main` hanya kalau pemilik memintanya, dan jangan memasang app ke `/Applications`. Setelah merge, pemilik meminta sesi induk memasang ulang `/Applications/Notching.app`.
