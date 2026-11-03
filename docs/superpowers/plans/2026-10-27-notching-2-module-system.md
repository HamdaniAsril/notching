# Notching 2: Sistem Modul dan Kartu — Rencana Kerja

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isi panel notch berasal dari modul, dan modul pertama sudah bisa dipakai sungguhan:
- Pil berisi ikon modul yang menyala, sesuai urutan katalog. Klik ikon untuk berganti kartu, dan panel pindah ke ukuran kartu itu dengan pegas yang sama.
- Panel membuka kartu terakhir, juga setelah app dimulai ulang.
- Modul bisa dinyalakan, dimatikan, dicopot, dan dipasang lagi.
- Pengaturan tersimpan di disk.
- Teks tersedia dalam bahasa Indonesia dan Inggris.
- Kartu **System stat** menampilkan CPU, memori, dan jaringan dari Rust lewat kemampuan yang dibatasi manifest.
- CPU saat mouse bergerak jauh dari notch turun mendekati nol (keputusan pemilik, 27 Oktober 2026).

**Architecture:**
- **Paket modul.** Setiap modul adalah paket web (HTML, CSS, JS) dengan `manifest.json` dan `locales/{id,en}.json`.
  - Sumbernya ada di `modules/<id>/`. Vite membangun setiap modul terpisah ke `dist-modules/<id>/`.
  - Hasil build ikut di dalam app sebagai resource. Ini salinan asli.
  - Saat app mulai, Rust menyalin modul yang terpasang ke folder modul aktif di Application Support.
- **Kartu dalam iframe.** Setiap kartu tampil di `<iframe sandbox="allow-scripts">` dari protokol `notchmod://`.
  - Asal halamannya buram (opaque), jadi modul tidak bisa menyentuh Tauri, halaman notch, atau penyimpanan modul lain.
  - Modul hanya bicara lewat `postMessage` ke notch.
  - Notch mengenali modul dari `event.source` bingkainya, lalu meneruskan panggilan ke Rust.
  - Rust memeriksa manifest modul yang terpasang sebelum menjalankan kemampuan apa pun.
  - Respons protokol membawa CSP tanpa akses jaringan.
- **Rust.** Rust memegang pengaturan, gudang modul, gerbang kemampuan, dan statistik sistem (`sysinfo`).
  - Statistik dibaca hanya saat diminta, dan modul hanya meminta selama kartunya terbuka.
- **Frontend (TypeScript tanpa framework).** Frontend memilih kartu, memasang dan melepas bingkai modul, mengisi pil, dan memindahkan panel ke ukuran kartu.
  - Bingkai modul hanya ada selama panel terbuka. Setelah panel selesai menutup, bingkainya dibuang. Akibatnya, modul yang butuh kerja di latar (misalnya Timer di rencana 5) harus menaruh kerja itu di kemampuan Rust, bukan di JS modul.

**Tech Stack:**
- Sama dengan rencana 1: Tauri 2.12, `tauri-nspanel` 2.1, objc2 0.6 / objc2-app-kit 0.3, Vite, TypeScript, Vitest + jsdom.
- Tambahan Rust: `sysinfo` 0.39 (fitur `system` dan `network` saja), `sys-locale` 0.3, dan `tempfile` 3 (khusus test).
- Tambahan npm: `@fontsource/space-grotesk` 5 dan `@fontsource/space-mono` 5 (OFL).

**Spec:** `docs/superpowers/specs/2026-10-27-notch-design.md`.
- Bagian 6 mengikat untuk sistem modul.
- Bagian 4.2 mengatur pil, ukuran kartu, dan kartu terakhir.
- Bagian 5 mengatur gaya visual, bahasa, dan suara teks.
- Bagian 2 dan 3 mengatur hemat daya dan privasi.

Acuan visual:
- `docs/superpowers/specs/2026-10-27-notch-mockups/beranda-nothing.html`: label, garis titik-titik, huruf titik-titik, dan pil.
- `settings.html`: ikon modul, serta nama dan keterangan modul.

Rencana sebelumnya: `docs/superpowers/plans/2026-10-27-notching-1-notch-shell-mac.md`. Konstanta gerak dan perilaku jendela dari rencana itu tetap berlaku.

### Rangkaian rencana

Ini rencana 2 dari 5 untuk tahap "versi Mac untuk dipakai sendiri":

1. **Kerangka notch di Mac.** Selesai, di `main` 185a497.
2. **Sistem modul dan kartu** (rencana ini):
   - manifest, daftar modul, dan pil yang terisi dari modul,
   - kartu terakhir diingat,
   - nyala, mati, copot, dan pasang lagi,
   - penyimpanan pengaturan,
   - teks Indonesia dan Inggris,
   - modul **System stat** yang sudah jadi,
   - CPU saat mouse bergerak.
3. **Jendela pengaturan S1.** Halaman Modul memakai perintah nyala, mati, copot, dan pasang dari rencana ini. Pilihan bahasa juga ada di sini.
4. **Beranda dan notifikasi.** Beranda mengganti kartu sementara `home` dari rencana ini.
5. **Lima modul tahap 1 lainnya:** Timer, Keep awake, Freeze keyboard, Kamera cermin, Catatan.

## Global Constraints

- **Repo dan git:**
  - Repo ada di root folder ini dan tidak punya remote.
  - Kerjakan di cabang `feat/modules` dari `main` (185a497).
  - Commit hanya dengan path eksplisit. Jangan pernah `git add -A`, dan jangan pernah meng-commit `.claude/` atau `.superpowers/`.
- **Identitas app:**
  - Nama produk `Notching`, bundle id `id.web.notching`, paket Cargo `notching`.
  - Nama proses di dalam bundle huruf kecil: `pgrep -x notching`.
- **Shell:** di shell non-interaktif, jalankan `export PATH="$HOME/.cargo/bin:$PATH"` dulu sebelum perintah `cargo`.
- **Perintah:**
  - `npm test` (40 lulus di awal), `npx tsc --noEmit`, dan `cargo test --manifest-path src-tauri/Cargo.toml` (8 lulus di awal).
  - Mulai Task 8, jalankan `npm run build:modules` sebelum perintah `cargo` apa pun, karena resource `dist-modules/` harus sudah ada.
- **Build rilis:** `npm run tauri build -- --bundles app`, hasilnya `src-tauri/target/release/bundle/macos/Notching.app`.
- **Panel tidak pernah ditutup.**
  - Menutup panel `tauri-nspanel` membuat app abort, karena `NSRangeException` dari KVO Touch Bar finder.
  - Panel hanya disembunyikan, dipindah, atau dimuat ulang.
  - Aturan yang sama berlaku untuk jendela baru apa pun di rencana ini.
- **Jangan pakai `panel_event!`.** Makro itu mengganti window delegate Tauri. Pakai observer `NSNotificationCenter`.
- **Gerak dan rasa dari rencana 1 tidak berubah:**
  - konstanta pegas,
  - pil muncul 320 ms (pada kecepatan 100) setelah panel dekat ukuran akhirnya,
  - bentuk panel,
  - perilaku jendela.
- **Ukuran kartu:**
  - `card.width` adalah lebar panel, 280–600 px.
  - `card.height` adalah tinggi area modul, 40–240 px. Batas ini menjaga panel dan pil tetap muat di overlay 640×360.
  - Bingkai modul berukuran (`card.width` − 36) × `card.height`.
  - Tinggi panel = atas + `card.height` + 16, dengan atas 18 (tanpa notch) atau tinggi notch + 10.
- **Letak modul:**
  - Sumber: `modules/<id>/`.
  - Hasil build: `dist-modules/<id>/`, dengan daftar urutan di `dist-modules/index.json`.
  - Salinan asli: `Notching.app/Contents/Resources/modules/<id>/`.
  - Folder aktif: `~/Library/Application Support/id.web.notching/modules/<id>/`.
- **Pengaturan:** `~/Library/Application Support/id.web.notching/settings.json`.
- **Modul dan katalog:**
  - Modul rencana ini: `home` (kartu sementara Beranda) dan `system-stat`.
  - Urutan katalog `["home", "system-stat"]` sekaligus urutan ikon di pil (spec 6).
- **Isolasi modul:**
  - Bingkai: `<iframe sandbox="allow-scripts">` dari `notchmod://localhost/<id>/<file>`.
  - Modul hanya boleh memakai kemampuan yang ada di `capabilities` manifest-nya. Pemeriksaannya di Rust.
  - Respons protokol memakai `MODULE_CSP` (Task 8), tanpa jaringan.
- **Gaya visual (spec 5):**
  - Warna: hitam #000, putih #fff, dan abu `rgba(255,255,255,.68)`, `.42`, `.16`.
  - Merah #E8262E hanya untuk satu titik kecil, dan tidak dipakai di rencana ini kecuali pemilik memintanya.
  - Label: Space Mono 10 px, huruf kapital, jarak huruf .12em, warna abu.
  - Teks: Space Grotesk.
  - Pemisah: garis titik-titik.
  - Angka besar: huruf titik-titik 5×7 buatan sendiri.
- **Bahasa:**
  - Indonesia dan Inggris, satu file per bahasa.
  - `auto` mengikuti bahasa perangkat (`sys-locale`): `id` kalau kode bahasanya `id` atau `in`, selain itu `en`.
  - Gaya teks DynamicNotch: kalimat pendek dan tegas, menyapa "kamu", tanpa "kami".
- **Hemat daya:**
  - Saat diam tidak ada `requestAnimationFrame` dan tidak ada event kursor ke frontend (rencana 1).
  - System stat membaca setiap 1500 ms hanya selama kartunya terbuka.
  - Tidak ada sampling di latar.
- **Jaringan:** tidak ada akses jaringan. Font ikut di dalam app.
- **Cek manual:** hasil cek manual (melihat layar, mencoba klik) hanya diisi dari laporan pemilik. Jangan pernah menandainya lulus berdasarkan dugaan.

## Review Focus

1. **Esc setelah klik di dalam kartu.**
   - Begitu pengguna mengklik isi kartu, fokus keyboard pindah ke dalam iframe, jadi Esc tidak sampai ke halaman notch.
   - Esc harus tetap menutup panel, dan ketikan harus kembali ke app sebelumnya.
   - Diuji di Task 4 (`Escape and Cmd+Q are passed to the host`) dan Task 7 (`Escape from inside the module closes the panel`), dan dicek manual di Task 8 dan 10.
2. **Modul yang sedang terbuka atau tercatat sebagai kartu terakhir dimatikan atau dicopot.**
   - Panel yang terbuka langsung pindah ke modul berikutnya.
   - Saat panel dibuka lagi, kartu yang dipakai adalah kartu yang masih menyala.
   - Kalau semua modul mati, panel menampilkan kartu kosong yang tenang.
   - Tidak boleh ada bingkai yang menunjuk ke file yang sudah dihapus.
   - Diuji di Task 7 (`pickCard` dan test app) dan Task 8 (`uninstall_and_reinstall_round_trip`).
3. **File rusak tidak boleh membuat app mati atau panel kosong melompong:**
   - `settings.json` rusak → app jalan dengan bawaan, dan file lamanya disimpan sebagai `.broken`.
   - Manifest tidak valid → modul itu dilewati.
   - Modul yang tidak pernah mengirim "siap" → kartu menampilkan "gagal dimuat".
   - Diuji di Task 1, Task 2, dan Task 7.
4. **Batas kemampuan modul:**
   - Modul hanya boleh memakai kemampuan yang ia nyatakan.
   - Pesan dari bingkai lain diabaikan.
   - Path protokol tidak boleh keluar dari folder modulnya.
   - Modul dimatikan → kemampuannya ditolak dan file-nya tidak dilayani.
   - Diuji di Task 3 (`an_undeclared_capability_is_refused`), Task 7 (`forwards calls from its own frame only`), dan Task 8 (`refuses_paths_that_leave_the_module`, `serves_only_modules_that_are_on`).
5. **System stat berhenti saat kartu ditutup.**
   - Setelah panel menutup, tidak ada polling, dan CPU kembali 0,0.
   - Diuji di Task 7 (`the frame goes away once the panel has closed`) dan diukur di Task 8 dan 10.

---

### Task 1: Penyimpanan pengaturan dan bahasa (Rust)

**Files:**
- Create: `src-tauri/src/settings.rs`, `src-tauri/src/locale.rs`
- Modify: `src-tauri/src/lib.rs` (`mod settings; mod locale;`, tanpa `cfg`), `src-tauri/Cargo.toml` (`sys-locale = "0.3"` di `[dependencies]`, `tempfile = "3"` di `[dev-dependencies]`)
- Test: di dalam kedua file (`#[cfg(test)] mod tests`)

**Interfaces:**
- Produces:
```rust
// settings.rs
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LanguageSetting { #[default] Auto, Id, En }

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub version: u32,                     // 1
    pub language: LanguageSetting,
    pub last_card: Option<String>,
    pub disabled_modules: Vec<String>,
    pub uninstalled_modules: Vec<String>,
}
impl Default for Settings {}              // version 1, Auto, None, [], []
pub const SETTINGS_FILE: &str = "settings.json";
pub fn load_settings(path: &std::path::Path) -> Settings;
pub fn save_settings(path: &std::path::Path, settings: &Settings) -> std::io::Result<()>;
// locale.rs
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Lang { Id, En }
pub fn resolve_lang(setting: LanguageSetting, device: Option<&str>) -> Lang;
pub fn device_locale() -> Option<String>;   // sys_locale::get_locale()
```

**Aturan `load_settings`:**
- File tidak ada → bawaan.
- File tidak bisa dibaca atau JSON-nya rusak:
  - ganti nama file itu menjadi `settings.json.broken` (menimpa yang lama),
  - tulis satu baris `eprintln!`,
  - kembalikan bawaan.
- Field yang tidak dikenal diabaikan, dan field yang hilang memakai nilai bawaan.

**Aturan `save_settings`:**
- Buat folder induk kalau belum ada.
- Tulis JSON rapi ke `settings.json.tmp`, lalu `rename` menimpa `settings.json`.

**Aturan `resolve_lang`:**
- `Id` → `Id`. `En` → `En`.
- `Auto` → `Id` kalau kode bahasa perangkat (bagian sebelum `-` atau `_`, tanpa memperhatikan huruf besar/kecil) adalah `id` atau `in`. Selain itu `En`, termasuk kalau `None`.

- [ ] **Step 1: Buat cabang kerja**

Run: `git switch -c feat/modules`

- [ ] **Step 2: Tulis test yang gagal**

```rust
// settings.rs
#[test] fn a_missing_file_gives_the_defaults() {
    let d = tempfile::tempdir().unwrap();
    assert_eq!(load_settings(&d.path().join(SETTINGS_FILE)), Settings::default());
    assert_eq!(Settings::default().version, 1); }
#[test] fn settings_survive_a_save_and_load() {
    let d = tempfile::tempdir().unwrap(); let p = d.path().join(SETTINGS_FILE);
    let s = Settings { language: LanguageSetting::En, last_card: Some("system-stat".into()),
                       disabled_modules: vec!["home".into()], ..Default::default() };
    save_settings(&p, &s).unwrap();
    assert_eq!(load_settings(&p), s); assert!(!d.path().join("settings.json.tmp").exists()); }
#[test] fn save_creates_the_folder() {
    let d = tempfile::tempdir().unwrap(); let p = d.path().join("a/b").join(SETTINGS_FILE);
    save_settings(&p, &Settings::default()).unwrap(); assert!(p.exists()); }
#[test] fn a_corrupt_file_is_kept_aside_and_defaults_are_used() {
    let d = tempfile::tempdir().unwrap(); let p = d.path().join(SETTINGS_FILE);
    std::fs::write(&p, "{not json").unwrap();
    assert_eq!(load_settings(&p), Settings::default());
    assert_eq!(std::fs::read_to_string(d.path().join("settings.json.broken")).unwrap(), "{not json"); }
#[test] fn unknown_and_missing_fields_are_tolerated() {
    let d = tempfile::tempdir().unwrap(); let p = d.path().join(SETTINGS_FILE);
    std::fs::write(&p, r#"{"language":"en","future":1}"#).unwrap();
    assert_eq!(load_settings(&p), Settings { language: LanguageSetting::En, ..Default::default() }); }
// locale.rs
#[test] fn auto_follows_the_device() {
    use LanguageSetting::Auto;
    assert_eq!(resolve_lang(Auto, Some("id-ID")), Lang::Id); assert_eq!(resolve_lang(Auto, Some("id")), Lang::Id);
    assert_eq!(resolve_lang(Auto, Some("in_ID")), Lang::Id); assert_eq!(resolve_lang(Auto, Some("en-ID")), Lang::En);
    assert_eq!(resolve_lang(Auto, Some("ida")), Lang::En); assert_eq!(resolve_lang(Auto, None), Lang::En); }
#[test] fn an_explicit_choice_wins() {
    assert_eq!(resolve_lang(LanguageSetting::Id, Some("en-US")), Lang::Id);
    assert_eq!(resolve_lang(LanguageSetting::En, Some("id-ID")), Lang::En); }
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -- settings:: locale::` → FAIL (gagal kompilasi)

- [ ] **Step 4: Implementasikan `settings.rs` dan `locale.rs` sesuai Interfaces dan aturan di atas**

Peringatan `dead_code` sampai Task 8 memang diharapkan.

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `cargo test --manifest-path src-tauri/Cargo.toml` → PASS (8 test lama + 7 test baru)

- [ ] **Step 6: Commit**

`git add src-tauri/src/settings.rs src-tauri/src/locale.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock && git commit -m "feat(native): settings storage and language resolution"`

---

### Task 2: Manifest, gudang modul, dan paket modul awal

**Files:**
- Create: `src-tauri/src/modules/mod.rs`, `src-tauri/src/modules/manifest.rs`, `src-tauri/src/modules/store.rs`
- Create:
  - `modules/index.json`
  - `modules/home/manifest.json`, `modules/home/icon.svg`, `modules/home/locales/id.json`, `modules/home/locales/en.json`
  - `modules/system-stat/manifest.json`, `modules/system-stat/icon.svg`, `modules/system-stat/locales/id.json`, `modules/system-stat/locales/en.json`
- Modify: `src-tauri/src/lib.rs` (`mod modules;`)
- Test: di dalam `manifest.rs` dan `store.rs`

**Isi paket:**
- `modules/index.json`: `["home", "system-stat"]`.
- `modules/system-stat/manifest.json`:
  ```json
  { "id": "system-stat", "version": "1.0.0", "entry": "index.html", "icon": "icon.svg",
    "card": { "width": 480, "height": 80 }, "permissions": [], "capabilities": ["system.stats"] }
  ```
- `modules/home/manifest.json`: sama, dengan:
  - `"id": "home"`,
  - `"card": { "width": 540, "height": 72 }`,
  - `"capabilities": []`.
- `icon.svg`:
  - Atribut: `viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"`.
  - Path disalin dari `settings.html`: `home` untuk Beranda, `chart` untuk System stat.
  - Ikon ini dipakai sebagai mask, jadi hanya alfanya yang penting.
- Teks `locales`:

  | Modul | Kunci | `id.json` | `en.json` |
  |---|---|---|---|
  | home | `name` | Beranda | Home |
  | home | `description` | Tanggal, cuaca, sholat, reminder | Date, weather, prayer times, reminders |
  | home | `soon` | Tanggal, cuaca, dan sholat menyusul. | Date, weather and prayer times are on the way. |
  | system-stat | `name` | System stat | System stat |
  | system-stat | `description` | CPU, memori, jaringan | CPU, memory, network |
  | system-stat | `cpu` | CPU | CPU |
  | system-stat | `memory` | Memori | Memory |
  | system-stat | `network` | Jaringan | Network |

**Interfaces:**
- Consumes: `Settings`, `Lang` (Task 1).
- Produces:
```rust
// modules/manifest.rs
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum Capability { #[serde(rename = "system.stats")] SystemStats }
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Permission { Accessibility, Camera, Location }
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct CardSize { pub width: u32, pub height: u32 }
#[derive(Clone, Debug, PartialEq, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    pub id: String, pub version: String, pub entry: String, pub icon: String, pub card: CardSize,
    pub permissions: Vec<Permission>, pub capabilities: Vec<Capability>,
}
#[derive(Debug, PartialEq)]
pub enum ManifestError { Json(String), BadId, IdMismatch, BadVersion, BadPath(String), CardSize }
pub const CARD_WIDTH: std::ops::RangeInclusive<u32> = 280..=600;
pub const CARD_HEIGHT: std::ops::RangeInclusive<u32> = 40..=240;
pub fn is_module_id(s: &str) -> bool;       // 2–32 karakter, [a-z][a-z0-9-]*
pub fn is_package_path(p: &str) -> bool;    // relatif; segmen [A-Za-z0-9._-]+; tanpa segmen kosong, "." atau ".."
pub fn parse_manifest(json: &str, folder: &str) -> Result<Manifest, ManifestError>;
// modules/store.rs
#[derive(Clone, Debug, PartialEq)]
pub struct ModuleEntry { pub manifest: Manifest, pub name: String, pub description: String, pub installed: bool, pub enabled: bool }
#[derive(Debug, PartialEq)]
pub enum StoreError { UnknownModule(String), Io(String) }
pub struct ModuleStore { /* bundle_dir, active_dir */ }
impl ModuleStore {
    pub fn new(bundle_dir: std::path::PathBuf, active_dir: std::path::PathBuf) -> Self;
    pub fn active_dir(&self) -> &std::path::Path;
    pub fn catalog(&self) -> Vec<String>;                        // index.json di bundle; hilang atau rusak → kosong
    pub fn sync(&self, settings: &Settings) -> Vec<StoreError>;  // tidak berhenti di kesalahan pertama
    pub fn list(&self, settings: &Settings, lang: Lang) -> Vec<ModuleEntry>;
    pub fn set_enabled(&self, id: &str, enabled: bool, settings: &mut Settings) -> Result<(), StoreError>;
    pub fn uninstall(&self, id: &str, settings: &mut Settings) -> Result<(), StoreError>;
    pub fn reinstall(&self, id: &str, settings: &mut Settings) -> Result<(), StoreError>;
}
#[cfg(test)] pub(crate) fn fake_bundle(dir: &std::path::Path);   // dipakai lagi di Task 8
```

**Aturan:**
- **Validasi manifest:**
  - `parse_manifest` memeriksa `is_module_id(id)` dan `id == folder`.
  - `version` harus tiga bilangan dipisah titik.
  - `entry` dan `icon` harus lolos `is_package_path`.
  - `card` harus dalam `CARD_WIDTH` dan `CARD_HEIGHT`.
  - Kemampuan atau field yang tidak dikenal → `Json(_)`.
- **Status modul:**
  - `installed` = id tidak ada di `uninstalled_modules`.
  - `enabled` = `installed` dan id tidak ada di `disabled_modules`.
- **`sync`:** untuk setiap id di katalog:
  - kalau dicopot → hapus `active/<id>` kalau ada;
  - kalau terpasang → salin `bundle/<id>` ke `active/.<id>.tmp`, hapus `active/<id>`, lalu rename. Salinannya selalu diganti, jadi modul ikut diperbarui bersama app (spec 6).
- **`list`:**
  - Urutan mengikuti katalog.
  - Manifest dibaca dari bundle, sehingga modul yang dicopot tetap terdaftar untuk "+ Tambah modul".
  - Modul dengan manifest tidak valid dilewati, dan satu `eprintln!` ditulis.
  - `name` dan `description` dibaca dari `bundle/<id>/locales/<lang>.json`. Kalau tidak ada, pakai `name = id` dan `description = ""`.
- **Perubahan status:**
  - `uninstall` menghapus `active/<id>` lalu menambahkan id ke `uninstalled_modules`.
  - `reinstall` menyalin dari bundle, lalu membuang id dari `uninstalled_modules` **dan** `disabled_modules`. Modul yang dipasang lagi langsung menyala.
  - Id yang tidak ada di katalog → `UnknownModule`.
- **`fake_bundle`:**
  - Katalog `["a","b"]`.
  - Setiap modul punya `manifest.json` yang valid, `index.html` berisi `v1`, `icon.svg`, dan locales:
    - `id.json`: `{"name":"Modul A","description":"Isi A"}`,
    - `en.json`: `{"name":"Module A","description":"About A"}`,
    - sama untuk B.

- [ ] **Step 1: Tulis paket modul awal sesuai bagian "Isi paket"**

- [ ] **Step 2: Tulis test yang gagal**

```rust
// manifest.rs
const GOOD: &str = r#"{"id":"system-stat","version":"1.0.0","entry":"index.html","icon":"icon.svg",
  "card":{"width":480,"height":80},"permissions":[],"capabilities":["system.stats"]}"#;
#[test] fn a_good_manifest_parses() {
    let m = parse_manifest(GOOD, "system-stat").unwrap();
    assert_eq!(m.capabilities, vec![Capability::SystemStats]); assert_eq!(m.card, CardSize { width: 480, height: 80 }); }
#[test] fn the_id_must_match_its_folder() { assert_eq!(parse_manifest(GOOD, "home"), Err(ManifestError::IdMismatch)); }
#[test] fn unknown_capabilities_and_fields_are_refused() {
    assert!(matches!(parse_manifest(&GOOD.replace("system.stats", "keyboard.lock"), "system-stat"), Err(ManifestError::Json(_))));
    assert!(matches!(parse_manifest(&GOOD.replace("\"entry\"", "\"extra\":1,\"entry\""), "system-stat"), Err(ManifestError::Json(_)))); }
#[test] fn card_size_must_fit_the_notch_overlay() {
    assert_eq!(parse_manifest(&GOOD.replace("480", "700"), "system-stat"), Err(ManifestError::CardSize));
    assert_eq!(parse_manifest(&GOOD.replace("\"height\":80", "\"height\":300"), "system-stat"), Err(ManifestError::CardSize)); }
#[test] fn package_paths_stay_inside_the_package() {
    for ok in ["index.html", "assets/index-1a.js"] { assert!(is_package_path(ok), "{ok}"); }
    for bad in ["", "/x", "../x", "a/../b", "a/./b", "a//b", "a\\b", "%2e%2e/x"] { assert!(!is_package_path(bad), "{bad}"); } }
#[test] fn repo_modules_are_valid() {
    // ../modules/index.json → setiap manifest lolos parse_manifest(json, id), dan
    // locales/id.json serta locales/en.json sama-sama punya string "name" dan "description".
}
// store.rs — setiap test membuat tempdir dengan bundle/ (fake_bundle) dan active/
#[test] fn sync_copies_installed_modules_and_skips_uninstalled()  // uninstalled [b] → active/a/index.html ada, active/b tidak
#[test] fn sync_replaces_old_copies()   // active/a/index.html "old" + active/a/stale.js → sesudah sync: "v1", stale.js hilang
#[test] fn uninstall_removes_the_active_copy_but_not_the_original()
#[test] fn reinstall_brings_it_back_switched_on()  // a dimatikan lalu dicopot → reinstall → tidak ada di kedua daftar; active/a ada
#[test] fn switching_off_keeps_the_files()          // set_enabled(a, false) → active/a tetap ada; list: installed true, enabled false
#[test] fn unknown_ids_are_refused()                // set_enabled("zzz", ..) == Err(StoreError::UnknownModule("zzz".into()))
#[test] fn list_follows_the_catalog_in_the_chosen_language() // Id → ["Modul A","Modul B"]; En → ["Module A","Module B"]
#[test] fn a_module_with_a_broken_manifest_is_left_out()     // b/manifest.json = "{" → list hanya berisi a
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -- modules::` → FAIL

- [ ] **Step 4: Implementasikan `modules/mod.rs`, `manifest.rs`, `store.rs` sesuai Interfaces dan aturan di atas**

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `cargo test --manifest-path src-tauri/Cargo.toml` → PASS

- [ ] **Step 6: Commit**

`git add modules src-tauri/src/modules src-tauri/src/lib.rs && git commit -m "feat(modules): manifest, module store and the first two packages"`

---

### Task 3: Gerbang kemampuan dan statistik sistem (Rust)

**Files:**
- Create: `src-tauri/src/modules/gate.rs`, `src-tauri/src/system_stats.rs`
- Modify: `src-tauri/src/modules/mod.rs`, `src-tauri/src/lib.rs` (`mod system_stats;`), `src-tauri/Cargo.toml` (`sysinfo = { version = "0.39", default-features = false, features = ["system", "network"] }`)
- Test: di dalam kedua file

**Interfaces:**
- Consumes: `ModuleEntry`, `Capability` (Task 2).
- Produces:
```rust
// modules/gate.rs
#[derive(Debug, PartialEq, Eq)]
pub enum Call { SystemStatsRead }
#[derive(Debug, PartialEq, Eq)]
pub enum CallError {
    UnknownModule(String), ModuleOff(String), UnknownCapability(String),
    NotDeclared { module: String, capability: String }, UnknownMethod(String), Failed(String),
}
impl std::fmt::Display for CallError {}   // contoh: "module home did not declare system.stats"
pub fn authorize(module: Option<&ModuleEntry>, module_id: &str, capability: &str, method: &str) -> Result<Call, CallError>;
// system_stats.rs
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats { pub cpu: f32, pub mem_used: u64, pub mem_total: u64, pub rx: f64, pub tx: f64 }  // cpu 0–100; rx/tx byte per detik
#[derive(Clone, Copy, Debug)]
pub struct NetSample { pub at: std::time::Instant, pub rx_total: u64, pub tx_total: u64 }
pub const STALE_AFTER: std::time::Duration = std::time::Duration::from_secs(5);
pub fn rates(prev: &NetSample, now: &NetSample) -> (f64, f64);
pub fn is_loopback(name: &str) -> bool;
pub struct SystemStats { /* sysinfo::System, sysinfo::Networks, last: Option<NetSample> */ }
impl SystemStats { pub fn new() -> Self; pub fn read(&mut self) -> Stats; }
```

**Urutan pemeriksaan `authorize`:**
1. Modul `None` → `UnknownModule`.
2. `!enabled` → `ModuleOff`.
3. String kemampuan tidak dikenal → `UnknownCapability`. Konversinya lewat serde, jadi namanya sama persis dengan manifest.
4. Kemampuan tidak ada di `manifest.capabilities` → `NotDeclared`.
5. Method tidak dikenal untuk kemampuan itu → `UnknownMethod`. Satu-satunya method: `system.stats` / `read` → `Call::SystemStatsRead`.

**Aturan `SystemStats`:**
- `new()` hanya membuat `System::new()` dan `Networks::new()` yang kosong, jadi murah.
- `read()`:
  - Kalau `last` kosong atau lebih tua dari `STALE_AFTER`, refresh CPU dan jaringan, tidur `sysinfo::MINIMUM_CPU_UPDATE_INTERVAL`, lalu refresh lagi. Selain itu cukup refresh sekali.
  - Memori di-refresh setiap kali.
  - Total jaringan = jumlah `total_received()` / `total_transmitted()` dari semua antarmuka yang bukan loopback.
  - Kecepatan dihitung dengan `rates(last, now)`, lalu `now` disimpan.
- Periksa nama method persis untuk `sysinfo` 0.39 di docs.rs: `refresh_cpu_usage`, `global_cpu_usage`, `refresh_memory`, `used_memory`, `total_memory`, `Networks::refresh(true)`.
- **`rates`:**
  - Selisih byte dibagi selisih detik.
  - Penghitung yang mundur, misalnya antarmuka di-reset → 0.
  - Selisih waktu nol → 0.

- [ ] **Step 1: Tulis test yang gagal**

```rust
// gate.rs — helper entry(id, caps, enabled) membuat ModuleEntry dengan manifest valid
#[test] fn a_declared_capability_is_allowed() {
    let m = entry("system-stat", &[Capability::SystemStats], true);
    assert_eq!(authorize(Some(&m), "system-stat", "system.stats", "read"), Ok(Call::SystemStatsRead)); }
#[test] fn an_undeclared_capability_is_refused() {
    let m = entry("home", &[], true);
    assert_eq!(authorize(Some(&m), "home", "system.stats", "read"),
               Err(CallError::NotDeclared { module: "home".into(), capability: "system.stats".into() })); }
#[test] fn switched_off_or_unknown_modules_are_refused() {
    assert_eq!(authorize(None, "zzz", "system.stats", "read"), Err(CallError::UnknownModule("zzz".into())));
    let off = entry("system-stat", &[Capability::SystemStats], false);
    assert_eq!(authorize(Some(&off), "system-stat", "system.stats", "read"), Err(CallError::ModuleOff("system-stat".into()))); }
#[test] fn unknown_capabilities_and_methods_are_refused() {
    let m = entry("system-stat", &[Capability::SystemStats], true);
    assert_eq!(authorize(Some(&m), "system-stat", "keyboard.lock", "lock"), Err(CallError::UnknownCapability("keyboard.lock".into())));
    assert_eq!(authorize(Some(&m), "system-stat", "system.stats", "write"), Err(CallError::UnknownMethod("write".into()))); }
// system_stats.rs
#[test] fn rates_are_bytes_per_second() {
    let t = std::time::Instant::now();
    let a = NetSample { at: t, rx_total: 1_000_000, tx_total: 0 };
    let b = NetSample { at: t + std::time::Duration::from_secs(2), rx_total: 2_000_000, tx_total: 100_000 };
    assert_eq!(rates(&a, &b), (500_000.0, 50_000.0)); }
#[test] fn a_counter_reset_reads_as_zero()          // b.rx_total < a.rx_total → rx 0.0
#[test] fn zero_elapsed_reads_as_zero()            // at sama → (0.0, 0.0)
#[test] fn loopback_is_left_out() { assert!(is_loopback("lo0")); assert!(!is_loopback("en0")); }
#[test] fn live_read_is_plausible() {
    let s = SystemStats::new().read();
    assert!((0.0..=100.0).contains(&s.cpu)); assert!(s.mem_total > 0 && s.mem_used <= s.mem_total);
    assert!(s.rx >= 0.0 && s.tx >= 0.0); }
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -- gate:: system_stats::` → FAIL

- [ ] **Step 3: Tambah `sysinfo`, lalu implementasikan `gate.rs` dan `system_stats.rs` sesuai Interfaces**

Run: `(cd src-tauri && cargo tree -d | grep objc2-app-kit || true)`
Expected: paling banyak satu versi `objc2-app-kit`.

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cargo test --manifest-path src-tauri/Cargo.toml` → PASS

- [ ] **Step 5: Commit**

`git add src-tauri/src/modules src-tauri/src/system_stats.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock && git commit -m "feat(native): capability gate and system stats"`

---

### Task 4: Kit modul (TS): protokol pesan, klien, huruf titik-titik, format angka

**Files:**
- Create:
  - `src/kit/protocol.ts`, `src/kit/client.ts`, `src/kit/dots.ts`, `src/kit/format.ts`, `src/kit/kit.css`
  - `src/kit/test-helpers.ts`
- Modify: `package.json` (`npm i @fontsource/space-grotesk@5 @fontsource/space-mono@5`)
- Test: `src/kit/protocol.test.ts`, `src/kit/client.test.ts`, `src/kit/dots.test.ts`, `src/kit/format.test.ts`

**Interfaces:**
- Produces:
```ts
// protocol.ts — pesan antara notch (host) dan bingkai modul; dipakai kedua sisi
export type Lang = 'id' | 'en';
export type HostMessage =
  | { type: 'notching:init'; moduleId: string; lang: Lang }
  | { type: 'notching:result'; id: number; ok: true; value: unknown }
  | { type: 'notching:result'; id: number; ok: false; error: string };
export type FrameMessage =
  | { type: 'notching:ready' }
  | { type: 'notching:call'; id: number; capability: string; method: string; args?: unknown }
  | { type: 'notching:key'; key: 'Escape' | 'Quit' };
export function isHostMessage(x: unknown): x is HostMessage;
export function isFrameMessage(x: unknown): x is FrameMessage;
// client.ts — dipakai di dalam modul
export interface Kit {
  readonly moduleId: string; readonly lang: Lang;
  call<T>(capability: string, method: string, args?: unknown): Promise<T>;
}
export function connectKit(win?: Window): Promise<Kit>;
// dots.ts — huruf titik-titik dari beranda-nothing.html
export const GLYPHS: Record<string, readonly string[]>;
export function dotText(text: string, pitch: number): string;   // <svg class="dm" width height viewBox fill="currentColor"> + <circle>
export function dotBar(count: number, lit: number): string;     // baris titik Beranda N2: r 1.7, jarak 6, menyala #fff, sisanya rgba(255,255,255,.16)
// format.ts
export function formatPercent(v: number): string;                      // dibulatkan, dibatasi 0–100: "23%"
export function formatRate(bytesPerSec: number, lang: Lang): string;   // basis 1000: B/s, KB/s, MB/s, GB/s
export function formatBytes(bytes: number, lang: Lang): string;        // basis 1024: B, KB, MB, GB, TB
```

**`connectKit`:**
- Hanya menerima pesan yang `e.source === win.parent` dan lolos `isHostMessage`.
- Saat `notching:init` pertama datang:
  - resolve `Kit`,
  - kirim `{ type: 'notching:ready' }`.
- `call()`:
  - id bertambah mulai 1,
  - resolve atau reject dengan `Error(error)` saat `notching:result` dengan id yang sama datang.
- `keydown` di `win.document`:
  - Esc → `{ type: 'notching:key', key: 'Escape' }`,
  - Meta+Q → `preventDefault()` + `key: 'Quit'`.
- Semua kiriman memakai `win.parent.postMessage(msg, '*')`. Target `'*'` perlu, karena modul tidak tahu asal halaman notch.

**Glyph:**
- Salin digit 0–9 dan `°` persis dari `G` di `beranda-nothing.html`.
- Tambah `%`: `['11000','11001','00010','00100','01000','10011','00011']`.
- Lebar dan posisi titik memakai rumus `dots()` di mockup:
  - setiap glyph maju `kolom + 1`,
  - `W = (x − 1) × pitch`, `H = 7 × pitch`,
  - jari-jari `0,4 × pitch`.
- Karakter yang tidak dikenal → `throw`.

**Format:**
- Pilih satuan terbesar yang nilainya ≥ 1. Naik satuan kalau nilai ≥ 999,5, supaya tidak muncul "1.000 KB/s".
- Nilai < 10 → maksimal 1 desimal. Selain itu → bulat.
- Format angka memakai `Intl.NumberFormat(lang)`, jadi Indonesia memakai koma desimal.

**`kit.css`:**
- `@import` `@fontsource/space-grotesk/latin-400.css`, `latin-500.css`, dan `@fontsource/space-mono/latin-400.css`.
- Token `--w`, `--g1`, `--g2`, `--g3`, `--red` (Global Constraints).
- `html, body`: margin 0, latar transparan, warna `--w`, Space Grotesk 13 px, `tabular-nums`, `-webkit-font-smoothing: antialiased`, `user-select: none`.
- `.lab`, `.rd`, `.vdots`, `.hdots`, `.dm` disalin dari `beranda-nothing.html`.
- Jangan set `color-scheme` di kit maupun halaman notch. Perbedaan `color-scheme` antara halaman induk dan iframe bisa membuat iframe digambar dengan latar tidak transparan.

- [ ] **Step 1: Tulis test yang gagal**

`test-helpers.ts`:
- `frameWindow()` membuat `<iframe>` jsdom dan mengembalikan `win = iframe.contentWindow`.
- `posted`: daftar pesan, dari `vi.spyOn(window, 'postMessage')`.
- `hostSays(win, data)`: `win.dispatchEvent(new MessageEvent('message', { data, source: window }))`.

```ts
// @vitest-environment jsdom
// client.test.ts
test('connects once the host says hello', async () => {
  const { win, posted } = frameWindow(); const p = connectKit(win);
  hostSays(win, { type: 'notching:init', moduleId: 'system-stat', lang: 'en' });
  const kit = await p; expect(kit.lang).toBe('en'); expect(kit.moduleId).toBe('system-stat');
  expect(posted).toContainEqual({ type: 'notching:ready' }); });
test('ignores messages that do not come from the host', async () => {
  const { win } = frameWindow(); let done = false; void connectKit(win).then(() => { done = true; });
  win.dispatchEvent(new MessageEvent('message', { data: { type: 'notching:init', moduleId: 'x', lang: 'id' }, source: win }));
  await new Promise(r => setTimeout(r, 0)); expect(done).toBe(false); });
test('calls resolve and reject by id', async () => {
  const { win, posted } = frameWindow(); const p = connectKit(win);
  hostSays(win, { type: 'notching:init', moduleId: 'system-stat', lang: 'id' }); const kit = await p;
  const a = kit.call('system.stats', 'read'); const b = kit.call('system.stats', 'read');
  expect(posted).toContainEqual({ type: 'notching:call', id: 1, capability: 'system.stats', method: 'read' });
  hostSays(win, { type: 'notching:result', id: 2, ok: false, error: 'nope' });
  hostSays(win, { type: 'notching:result', id: 1, ok: true, value: { cpu: 5 } });
  await expect(a).resolves.toEqual({ cpu: 5 }); await expect(b).rejects.toThrow('nope'); });
test('Escape and Cmd+Q are passed to the host', async () => {
  const { win, posted } = frameWindow(); const p = connectKit(win);
  hostSays(win, { type: 'notching:init', moduleId: 'm', lang: 'id' }); await p;
  win.document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  win.document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', metaKey: true }));
  expect(posted).toContainEqual({ type: 'notching:key', key: 'Escape' });
  expect(posted).toContainEqual({ type: 'notching:key', key: 'Quit' }); });
// protocol.test.ts
test('frame messages are checked by shape', () => {
  expect(isFrameMessage({ type: 'notching:call', id: 1, capability: 'system.stats', method: 'read' })).toBe(true);
  for (const bad of [null, 'x', { type: 'notching:call', id: '1', capability: 'a', method: 'b' }, { type: 'other' },
                     { type: 'notching:key', key: 'Tab' }]) expect(isFrameMessage(bad)).toBe(false); });
// dots.test.ts
test('a digit is 5 × 7 dots at the given pitch', () => {
  const svg = dotText('1', 6); expect(svg).toContain('width="30" height="42"'); expect(svg.match(/<circle/g)).toHaveLength(10); });
test('glyphs sit one dot apart', () => expect(dotText('11', 6)).toContain('width="66"'));
test('percent has its own glyph', () => expect(dotText('%', 5).match(/<circle/g)).toHaveLength(13));
test('unknown characters are a programming error', () => expect(() => dotText('a', 6)).toThrow());
test('the dot bar lights the first n dots', () => expect(dotBar(18, 9).match(/fill="#fff"/g)).toHaveLength(9));
// format.test.ts
test('percent', () => { expect(formatPercent(23.4)).toBe('23%'); expect(formatPercent(101)).toBe('100%'); expect(formatPercent(-1)).toBe('0%'); });
test('rates use base 1000 and the language decimal mark', () => {
  expect(formatRate(0, 'id')).toBe('0 B/s'); expect(formatRate(850_000, 'id')).toBe('850 KB/s');
  expect(formatRate(1_200_000, 'id')).toBe('1,2 MB/s'); expect(formatRate(1_200_000, 'en')).toBe('1.2 MB/s');
  expect(formatRate(12_400_000, 'en')).toBe('12 MB/s'); expect(formatRate(999_700, 'en')).toBe('1 MB/s'); });
test('memory uses base 1024', () => {
  expect(formatBytes(16 * 1024 ** 3, 'id')).toBe('16 GB'); expect(formatBytes(9.8 * 1024 ** 3, 'id')).toBe('9,8 GB'); });
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/kit` → FAIL

- [ ] **Step 3: Pasang font, lalu implementasikan semua file kit sesuai Interfaces dan aturan di atas**

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx tsc --noEmit && npm test` → PASS

- [ ] **Step 5: Commit**

`git add src/kit package.json package-lock.json && git commit -m "feat(kit): module message protocol, client, dot font and number formats"`

---

### Task 5: Kartu Beranda sementara dan kartu System stat

**Files:**
- Create:
  - `modules/home/index.html`, `modules/home/main.ts`, `modules/home/style.css`
  - `modules/system-stat/index.html`, `modules/system-stat/main.ts`, `modules/system-stat/card.ts`, `modules/system-stat/poll.ts`, `modules/system-stat/style.css`
  - `src/vite-env.d.ts` (`/// <reference types="vite/client" />`)
- Modify: `tsconfig.json` (`"include": ["src", "modules"]`), `vitest.config.ts` (`include: ['src/**/*.test.ts', 'modules/**/*.test.ts']`)
- Test: `modules/system-stat/card.test.ts`, `modules/system-stat/poll.test.ts`

**Interfaces:**
- Consumes: `connectKit`, `Kit`, `Lang`, `dotText`, `dotBar`, `formatPercent`, `formatRate`, `formatBytes` (Task 4).
- Produces:
```ts
// modules/system-stat/card.ts
export interface Stats { cpu: number; memUsed: number; memTotal: number; rx: number; tx: number }   // = Stats Rust (Task 3)
export interface StatStrings { cpu: string; memory: string; network: string }
export const DOT_PITCH = 5;
export function renderCard(root: HTMLElement, strings: StatStrings): { update(s: Stats, lang: Lang): void };
// modules/system-stat/poll.ts
export const POLL_MS = 1500;
export function startPolling(kit: Pick<Kit, 'call'>, onStats: (s: Stats) => void,
                             setTimer: (fn: () => void, ms: number) => void): void;
```

**Kartu System stat (480 × 80, area dalam 444 × 80):**
- Tiga kolom dalam satu baris flex dengan jarak 18 px, dipisah `.vdots`. Ini usulan untuk dicek pemilik di Task 7.
- **CPU** (`data-k="cpu"`):
  - `.lab` berisi `strings.cpu`,
  - `.big` berisi `dotText(formatPercent(cpu), DOT_PITCH)` dengan warna `--w`,
  - di bawahnya `dotBar(18, Math.round(cpu / 100 * 18))`.
- **Memori** (`data-k="mem"`):
  - `.lab` berisi `strings.memory`,
  - `.big` berisi `dotText(formatPercent(memUsed / memTotal × 100), DOT_PITCH)`,
  - di bawahnya `.lab` berisi `formatBytes(memUsed) + ' / ' + formatBytes(memTotal)`.
- **Jaringan** (`data-k="net"`):
  - `.lab` berisi `strings.network`,
  - dua baris `.rate` (Space Grotesk 15 px, tebal 500, tinggi baris 19 px): `↓ ` + `formatRate(rx)`, lalu `↑ ` + `formatRate(tx)`.
- Jarak vertikal di dalam kolom 8 px.
- Sebelum data pertama datang, area angka dibiarkan kosong, tanpa tanda strip.

**Polling:**
- `startPolling` langsung memanggil `kit.call('system.stats', 'read')`.
- Setiap kali panggilan selesai, berhasil atau gagal, jadwalkan panggilan berikutnya `POLL_MS` kemudian. Jadi tidak pernah ada dua permintaan sekaligus.
- Kalau gagal, data lama tetap tampil.
- Polling berhenti dengan sendirinya karena bingkai dibuang saat panel menutup.

**Kartu Beranda sementara (540 × 72):** nama modul (Space Grotesk 17 px, tebal 500) dan `.lab` berisi `soon`.

**`main.ts` kedua modul:**
- Import `../../src/kit/kit.css` dan `./style.css`.
- `await connectKit()`.
- Pilih teks dari `./locales/id.json` atau `en.json` sesuai `kit.lang`.
- Gambar kartu ke `#card`.
- System stat juga memanggil `startPolling(kit, s => view.update(s, kit.lang), (fn, ms) => void setTimeout(fn, ms))`.
- Bungkus semuanya dalam `async function start()`.

**`index.html`:** `<!doctype html>`, `<meta charset="UTF-8">`, `<div id="card"></div>`, `<script type="module" src="./main.ts"></script>`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
// @vitest-environment jsdom
// card.test.ts
const GiB = 1024 ** 3; const ID = { cpu: 'CPU', memory: 'Memori', network: 'Jaringan' };
const S = { cpu: 23.4, memUsed: 9.8 * GiB, memTotal: 16 * GiB, rx: 1_200_000, tx: 80_000 };
test('shows CPU as dot digits with a dot bar', () => {
  const root = document.createElement('div'); renderCard(root, ID).update(S, 'id');
  expect(root.querySelector('[data-k="cpu"] .big')!.innerHTML).toBe(dotText('23%', DOT_PITCH));
  expect(root.querySelectorAll('[data-k="cpu"] circle[fill="#fff"]')).toHaveLength(4); });
test('shows memory as a percentage and as used / total', () => {
  const root = document.createElement('div'); renderCard(root, ID).update(S, 'id');
  expect(root.querySelector('[data-k="mem"] .big')!.innerHTML).toBe(dotText('61%', DOT_PITCH));
  expect(root.textContent).toContain('9,8 / 16 GB'); });
test('shows network speed both ways', () => {
  const root = document.createElement('div'); renderCard(root, ID).update(S, 'en');
  expect(root.textContent).toContain('↓ 1.2 MB/s'); expect(root.textContent).toContain('↑ 80 KB/s'); });
test('labels follow the strings', () => {
  const root = document.createElement('div'); renderCard(root, { cpu: 'CPU', memory: 'Memory', network: 'Network' });
  expect(root.textContent).toContain('Memory'); });
// poll.test.ts — setTimer palsu menyimpan (fn, ms)
test('reads at once, then 1.5 s after each answer', async () => {
  // call → resolve → onStats dipanggil sekali; setTimer dipanggil dengan 1500; menjalankan timer → call kedua
});
test('never asks twice at the same time', async () => {
  // call pertama belum selesai → belum ada timer → call hanya sekali
});
test('a failed read keeps polling', async () => {
  // call reject → onStats tidak dipanggil, setTimer tetap dipanggil dengan 1500
});
```
Badan ketiga test polling ditulis dari komentarnya. `kit.call` adalah `vi.fn`, dan promise-nya dikendalikan test.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run modules` → FAIL

- [ ] **Step 3: Implementasikan kedua modul sesuai Interfaces dan aturan di atas**

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx tsc --noEmit && npm test` → PASS

- [ ] **Step 5: Commit**

`git add modules src/vite-env.d.ts tsconfig.json vitest.config.ts && git commit -m "feat(modules): System stat card and the temporary Home card"`

---

### Task 6: Pengendali dan tampilan siap untuk kartu modul

**Files:**
- Modify: `src/notch/controller.ts`, `src/notch/hit.ts`, `src/notch/view.ts`, `src/bridge.ts`, `src/styles.css`, `src/notch/test-helpers.ts`, `src/main.ts`
- Test: `src/notch/controller.test.ts`, `src/notch/hit.test.ts`, `src/notch/view.test.ts`

**Interfaces:**
- Consumes: `NotchController`, `CardSize`, `hitRects`, `Rect` (rencana 1).
- Produces:
```ts
// controller.ts — PLACEHOLDER_CARD dihapus
export class NotchController {
  /* ...seperti sebelumnya... */
  get card(): CardSize;
  setCard(card: CardSize): void;          // pemanggil lalu memanggil kick()
}
// hit.ts
export function containsPoint(rects: Rect[], x: number, y: number): boolean;
// view.ts
export interface PillItem { id: string; label: string; icon: string }   // icon = URL file SVG
export interface ViewDeps {
  raf: (cb: (now: number) => void) => number; caf: (id: number) => void;
  onHitRects: (rects: Rect[]) => void; onPhase: (p: Phase) => void; onQuit: () => void;
  onSelect: (id: string) => void;          // klik ikon modul di pil
}
export interface NotchView {
  kick(): void; destroy(): void;
  readonly content: HTMLElement;            // wadah isi kartu, diisi Task 7
  setPill(items: PillItem[], active: string | null, moreLabel: string): void;
}
export function mountNotch(root: HTMLElement, c: NotchController, deps: ViewDeps): NotchView;
// test-helpers.ts
export const TEST_CARD: CardSize;           // { width: 400, height: 90 }, ukuran PLACEHOLDER_CARD lama; ctl() memakainya
```

**Perubahan perilaku:**
- **`setCard`:** mengganti kartu yang dipakai `panelSize()`.
  - Saat terbuka, pegas pw/ph bergerak ke ukuran baru.
  - Isi kartu tersembunyi sampai panel "dekat" ukuran baru, dengan aturan dekat yang sama seperti rencana 1.
  - Pil tetap tampil.
- **`hitRects` saat terbuka:**
  - `w = max(size.w, pw.x)` dan `h = max(size.h, ph.x)`, supaya panel yang sedang mengecil tetap menangkap klik.
  - Kalau `pill` diberikan, `h = max(h, pill.y)`, supaya celah 10 px antara panel dan pil tidak tembus klik. Ini minor tertunda dari rencana 1.
  - Rect panel = `{ x: CX − w/2 − 12, y: 0, w: w + 24, h }`.
- **Tampilan:**
  - Kartu sementara dihapus. `.notch-content` sekarang hanya wadah kosong.
  - Setiap frame:
    - `content.style.width = panelSize().w + 'px'`,
    - selama panel tampil, `pill.style.top = Math.round(ph.x) + 10 + 'px'`, sehingga pil ikut tinggi panel saat kartu berganti.
  - Tulis gaya hanya kalau nilainya berubah.
- **`setPill`:**
  - Bangun ulang isi pil dengan DOM API, tanpa string `style="..."`. Ini menjaga CSP di Task 8.
  - Setiap item: `<span class="ic" data-id role="button" aria-label=label><i class="glyph"></i></span>`, dengan `glyph.style.setProperty('--icon', 'url("…")')`.
  - Item aktif diberi kelas `on`.
  - Terakhir, ikon ⋯ (SVG lama) dengan `aria-label=moreLabel` dan tanpa `data-id`. Ikon ini masih belum membuka apa-apa sampai rencana 3.
  - Jeda animasi masuk lewat `ic.style.animationDelay`.
- **Klik di pil:** `closest('.ic[data-id]')` → `deps.onSelect(id)`.
- **CSS `.glyph`:**
  - ukuran 15×15, `background: currentColor`, `mask: var(--icon) center / contain no-repeat` dan `-webkit-mask` yang sama,
  - `opacity .4`, menjadi 1 di dalam `.on`.
  - Titik putih 3 px tetap dari `.on::after`.
- **Minor tertunda yang ikut dikerjakan:**
  - `containsPoint` di `hit.ts` menggantikan dua salinan `contains` di `bridge.ts` dan `view.ts`.
  - Konstruktor pengendali tidak lagi memakai penjaga `this.motion ? … : 0`. Tambahkan `private targetsAt(t: number): Targets`. `targets()` memanggil `targetsAt(this.motion.t)`, dan konstruktor membuat motion dengan `targetsAt(0)`.
- **`main.ts` sementara:** memakai kartu `{ width: 400, height: 90 }` dan `onSelect: () => {}`, sampai Task 7 menggantinya dengan `startApp`.

- [ ] **Step 1: Ubah dua harapan lama dan tulis test baru yang gagal**

Harapan lama yang diubah karena celah panel–pil kini tertutup:
- `hit.test.ts` › `open rects cover the panel and the visible pill` → `[{ x: 108, y: 0, w: 424, h: 134 }, pill]`.
- `view.test.ts` › `the pill hit rect is centred like the pill itself` → `[{ x: 108, y: 0, w: 424, h: 134 }, { x: 281, y: 134, w: 78, h: 34 }]`.

```ts
// controller.test.ts
test('switching cards while open moves the panel to the new size', () => {
  const c = ctl(null); c.click(); runUntilNear(c); timers.advance(1000);
  c.setCard({ width: 500, height: 100 }); expect(c.panelSize()).toEqual({ w: 500, h: 134 });
  frames(c, 240); expect(c.motion.springs.pw.x).toBeCloseTo(500, 0); expect(c.pillVisible).toBe(true); });
test('content hides while the panel resizes and returns when near', () => {
  const c = ctl(null); c.click(); runUntilNear(c);
  c.setCard({ width: 540, height: 72 }); frames(c, 1); expect(c.contentVisible).toBe(false);
  runUntilNear(c); expect(c.contentVisible).toBe(true); });
test('setCard while idle changes nothing visible', () => {
  const c = ctl(null); c.setCard({ width: 540, height: 72 });
  expect(c.targets()).toEqual({ W: 42, H: 4, s: 0, bx: 0, pw: 0, ph: 0 }); });
// hit.test.ts
test('a shrinking panel keeps its hit area until it has shrunk', () => {
  const c = ctl(null); c.click(); frames(c, 240); c.setCard({ width: 300, height: 60 });
  expect(hitRects(c, null)[0].w).toBeGreaterThan(324); frames(c, 240);
  const r = hitRects(c, null)[0]; expect(r.x).toBeCloseTo(158, 0); expect(r.w).toBeCloseTo(324, 0); expect(r.h).toBeCloseTo(94, 0); });
test('the gap between panel and pill catches clicks', () => {
  const c = ctl(null); c.click(); expect(hitRects(c, { x: 281, y: 134, w: 78, h: 34 })[0].h).toBe(134); });
test('containsPoint uses half-open edges', () => {
  const r = [{ x: 0, y: 0, w: 10, h: 10 }]; expect(containsPoint(r, 0, 0)).toBe(true); expect(containsPoint(r, 10, 5)).toBe(false); });
// view.test.ts
const ITEMS = [{ id: 'home', label: 'Beranda', icon: '/m/home/icon.svg' }, { id: 'system-stat', label: 'System stat', icon: '/m/system-stat/icon.svg' }];
test('the pill lists the given modules and marks the active one', () => {
  const root = document.createElement('div'); const v = mountNotch(root, ctl(null), deps(fakeRaf()));
  v.setPill(ITEMS, 'system-stat', 'Pengaturan'); const ics = root.querySelectorAll('.notch-pill .ic');
  expect(ics).toHaveLength(3); expect(ics[1].classList.contains('on')).toBe(true);
  expect(ics[0].getAttribute('aria-label')).toBe('Beranda'); expect(ics[2].getAttribute('aria-label')).toBe('Pengaturan');
  expect((ics[0].querySelector('.glyph') as HTMLElement).style.getPropertyValue('--icon')).toContain('/m/home/icon.svg'); });
test('clicking a module icon selects it; the ⋯ icon does not', () => {
  const root = document.createElement('div'); const onSelect = vi.fn();
  const v = mountNotch(root, ctl(null), { ...deps(fakeRaf()), onSelect }); v.setPill(ITEMS, 'home', 'Pengaturan');
  const ics = root.querySelectorAll<HTMLElement>('.notch-pill .ic'); ics[1].click(); ics[2].click();
  expect(onSelect).toHaveBeenCalledTimes(1); expect(onSelect).toHaveBeenCalledWith('system-stat'); });
test('the pill and the content area follow the card size', () => {
  const r = fakeRaf(); const root = document.createElement('div'); const c = ctl(null); const v = mountNotch(root, c, deps(r));
  const pill = root.querySelector<HTMLElement>('.notch-pill')!;
  c.click(); v.kick(); r.runAll(600); expect(pill.style.top).toBe('134px'); expect(v.content.style.width).toBe('400px');
  c.setCard({ width: 500, height: 100 }); v.kick(); r.runAll(600);
  expect(pill.style.top).toBe('144px'); expect(v.content.style.width).toBe('500px'); });
```
`deps(r)` di `test-helpers.ts` ditambah `onSelect: vi.fn()`.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/notch` → FAIL

- [ ] **Step 3: Implementasikan perubahan di atas**

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx tsc --noEmit && npm test` → PASS

- [ ] **Step 5: Commit**

`git add src/notch src/bridge.ts src/main.ts src/styles.css && git commit -m "feat(notch): card-sized panel, module pill and a closed panel–pill gap"`

---

### Task 7: Bingkai modul, pilihan kartu, teks dua bahasa, dan pratinjau di browser

**Files:**
- Create:
  - `src/modules/types.ts`, `src/modules/cards.ts`, `src/modules/frame.ts`
  - `src/i18n/index.ts`, `src/i18n/id.json`, `src/i18n/en.json`
  - `src/app.ts`, `src/bridge-browser.ts`
- Modify: `src/bridge.ts` (`Bridge` bertambah; `browserBridge` pindah ke `bridge-browser.ts`; `tauriBridge` bertambah), `src/main.ts`, `src/styles.css`, `src/notch/test-helpers.ts`
- Test: `src/modules/cards.test.ts`, `src/modules/frame.test.ts`, `src/i18n/i18n.test.ts`, `src/app.test.ts`

**Interfaces:**
- Consumes:
  - `Lang`, `isFrameMessage`, `HostMessage` (Task 4),
  - `NotchView`, `PillItem`, `setCard`, `connect` (Task 6 dan rencana 1).
- Produces:
```ts
// modules/types.ts — sama dengan ModuleStateDto Rust (Task 8)
export interface ModuleInfo {
  id: string; name: string; description: string; version: string; entry: string; icon: string;
  card: CardSize; installed: boolean; enabled: boolean;
}
export interface ModuleState { lang: Lang; modules: ModuleInfo[]; lastCard: string | null }
// bridge.ts — anggota baru Bridge
moduleState(): Promise<ModuleState>;
onModuleState(cb: (s: ModuleState) => void): () => void;
setLastCard(id: string): Promise<void>;
moduleCall(moduleId: string, capability: string, method: string, args?: unknown): Promise<unknown>;
moduleUrl(id: string, file: string): string;
readonly moduleSandbox: string;
// cards.ts
export const EMPTY_CARD: CardSize;                              // { width: 360, height: 56 }
export function activeModules(s: ModuleState): ModuleInfo[];   // installed && enabled, urutan asli
export function pickCard(s: ModuleState, current: string | null, panelOpen: boolean): ModuleInfo | null;
// i18n/index.ts
export interface HostStrings { emptyTitle: string; emptyHint: string; loadFailed: string; settings: string }
export function hostStrings(lang: Lang): HostStrings;
// frame.ts
export const READY_TIMEOUT_MS = 3000;
export interface FrameHostDeps {
  bridge: Pick<Bridge, 'moduleCall' | 'moduleUrl' | 'moduleSandbox'>;
  setTimer: (fn: () => void, ms: number) => () => void;
  onKey: (key: 'Escape' | 'Quit') => void;
}
export interface FrameHost {
  readonly current: string | null;
  show(module: ModuleInfo | null, lang: Lang, strings: HostStrings): void;
  clear(): void; destroy(): void;
}
export function mountFrameHost(container: HTMLElement, deps: FrameHostDeps): FrameHost;
// app.ts
export interface AppEnv {
  raf: (cb: (now: number) => void) => number; caf: (id: number) => void;
  setTimer: (fn: () => void, ms: number) => () => void;
}
export interface App { readonly controller: NotchController; readonly view: NotchView; destroy(): void }
export function startApp(root: HTMLElement, bridge: Bridge, env: AppEnv): Promise<App>;
// bridge-browser.ts
export function browserBridge(root: HTMLElement): Bridge;
```

**Teks host:**

| Kunci | `id.json` | `en.json` |
|---|---|---|
| `emptyTitle` | Semua modul mati. | Every module is off. |
| `emptyHint` | Nyalakan lagi di Pengaturan. | Turn one on in Settings. |
| `loadFailed` | Modul ini gagal dimuat. | This module didn't load. |
| `settings` | Pengaturan | Settings |

**`pickCard`, berurutan:**
1. Panel terbuka dan `current` masih aktif → tetap `current`.
2. `lastCard` aktif → `lastCard`.
3. Modul aktif pertama.
4. Kalau tidak ada → `null`.

**`mountFrameHost`:**
- **`show(module)`:**
  - Kalau `current` dan `lang` sama dengan sekarang → tidak berbuat apa-apa.
  - Selain itu, buang isi lama, lalu buat `<iframe class="module-frame">` dengan:
    - `sandbox` = `bridge.moduleSandbox`,
    - `src` = `bridge.moduleUrl(id, entry)`,
    - `title` = nama modul,
    - tinggi `card.height` lewat `style.height`.
  - Mulai timer siap `READY_TIMEOUT_MS` sejak `show`.
  - Saat event `load`, kirim `{ type: 'notching:init', moduleId, lang }` ke `contentWindow` dengan target `'*'`.
- **`show(null)`:** tampilkan `.notch-empty` dengan `.big` = `emptyTitle` dan `.lab` = `emptyHint`.
- **`message` di `window`** — hanya diterima kalau `e.source === iframe.contentWindow` dan lolos `isFrameMessage`:
  - `ready` → batalkan timer siap.
  - `call` → `bridge.moduleCall(current, capability, method, args)`. Hasilnya dikirim sebagai `notching:result` dengan id yang sama, hanya kalau iframe itu masih terpasang.
  - `key` → `deps.onKey(key)`.
- **Timer siap habis:** buang iframe dan tampilkan `.notch-error .lab` = `loadFailed`.
- **`clear()`:** buang semuanya, batalkan timer, dan `current = null`.

**`startApp`:**
- **Mulai:**
  - Ambil `screenInfo()` dan `moduleState()`.
  - `card = pickCard(state, null, false)`.
  - Buat `NotchController` dengan `card?.card ?? EMPTY_CARD`.
  - Buat `connect()`, `mountNotch()`, dan `mountFrameHost(view.content, …)`.
  - `view.setPill(…)` dari `activeModules` dengan `icon = bridge.moduleUrl(id, icon)` dan `label = name`.
  - `document.documentElement.lang = state.lang`.
- **`onPhase`:**
  - Teruskan ke `connect`.
  - `'open'` → `frames.show(card, lang, strings)`.
  - Perpindahan dari `'closing'` ke `'idle'` atau `'hover'` → `frames.clear()`.
- **`onSelect(id)`:**
  - Abaikan kalau id itu sudah kartu sekarang.
  - Selain itu:
    - `controller.setCard(…)`,
    - `frames.show(…)` kalau panel terbuka,
    - `view.setPill(…, id, …)`,
    - `bridge.setLastCard(id)`,
    - `kick()`.
- **`onModuleState(s)`:**
  - Simpan state.
  - `next = pickCard(s, current, phase === 'open')`.
  - Kalau kartu atau ukurannya berubah → `setCard`, lalu `frames.show` kalau terbuka.
  - Kalau bahasa berubah dan panel terbuka → `frames.show` (memuat ulang bingkai dengan bahasa baru).
  - Perbarui pil dan `lang` di `<html>`, lalu `kick()`.
- **Tombol dari bingkai:**
  - `Escape` → `controller.escape()` dan `kick()`.
  - `Quit` → `onQuit` dari `connect`.

**`tauriBridge` (anggota baru):**
- `invoke('get_module_state')`.
- `listen('notching://module-state')` dari `@tauri-apps/api/event`. Event ini disiarkan ke semua jendela.
- `invoke('set_last_card', { id })`.
- `invoke('module_call', { moduleId, capability, method, args })`.
- `moduleUrl` = `notchmod://localhost/${id}/${file}`. Di Windows nanti bentuknya `http://notchmod.localhost/...`; tulis catatan ini sebagai komentar.
- `moduleSandbox` = `'allow-scripts'`.

**`browserBridge`:**
- Pindahkan apa adanya, lalu tambahkan:
  - katalog dari `modules/index.json`, manifest, dan locales lewat `import.meta.glob(…, { eager: true, import: 'default' })`;
  - `?lang=en` (bawaan `id`);
  - `?off=home,system-stat` untuk mematikan modul;
  - `moduleUrl` = `/modules/${id}/${file}`, dilayani Vite dari sumber;
  - `moduleSandbox` = `'allow-scripts allow-same-origin'`. Pratinjau browser saja: tanpa ini, skrip modul dari server Vite terkena CORS. Ini bukan batas keamanan.
  - `setLastCard` menyimpan di memori lalu menyiarkan state.
  - `moduleCall`:
    - tolak kemampuan yang tidak ada di manifest;
    - `system.stats/read` → data palsu yang bergerak pelan: CPU 5–40%, memori 9,8 / 16 GiB, rx 0–2 MB/s, tx 0–200 KB/s.

**`fakeBridge` di `test-helpers.ts`:**
- Bertambah semua anggota baru.
- `emitModuleState(s)` memicu callback.
- `moduleUrl` = `` `mod://${id}/${file}` ``, `moduleSandbox` = `'allow-scripts'`.
- `state`: awalnya `TEST_STATE`, yaitu `lang 'id'`, modul `moduleInfo('home')` dan `moduleInfo('system-stat')`, `lastCard null`.
- Helper baru `moduleInfo(id, over?)`:
  - `home` → 540×72, `system-stat` → 480×80, lainnya 400×90,
  - `name = id`, `entry 'index.html'`, `icon 'icon.svg'`, `version '1.0.0'`,
  - terpasang dan menyala.

- [ ] **Step 1: Tulis test yang gagal**

```ts
// cards.test.ts
const S = (over: Partial<ModuleState> = {}): ModuleState =>
  ({ lang: 'id', lastCard: null, modules: [moduleInfo('home'), moduleInfo('system-stat')], ...over });
test('opens the last card', () => expect(pickCard(S({ lastCard: 'system-stat' }), null, false)?.id).toBe('system-stat'));
test('falls back to the first module that is on', () => expect(pickCard(S({ lastCard: 'system-stat',
  modules: [moduleInfo('home'), moduleInfo('system-stat', { enabled: false })] }), null, false)?.id).toBe('home'));
test('an uninstalled last card is skipped', () => expect(pickCard(S({ lastCard: 'home',
  modules: [moduleInfo('home', { installed: false, enabled: false }), moduleInfo('system-stat')] }), null, false)?.id).toBe('system-stat'));
test('an open card stays while it is on', () => expect(pickCard(S({ lastCard: 'home' }), 'system-stat', true)?.id).toBe('system-stat'));
test('nothing on gives no card', () => expect(pickCard(S({ modules: [moduleInfo('home', { enabled: false })] }), null, false)).toBeNull());

// @vitest-environment jsdom
// frame.test.ts — helper host(): container + mountFrameHost dengan fakeBridge, timers.setTimer, onKey vi.fn()
test('shows one sandboxed frame for the module', () => {
  // show(system-stat) → satu iframe: src 'mod://system-stat/index.html', sandbox 'allow-scripts', style.height '80px';
  // show(home) → tetap satu iframe, src 'mod://home/index.html'
});
test('says hello with the module id and language once loaded', () => {
  // spy iframe.contentWindow.postMessage; iframe.dispatchEvent(new Event('load'))
  // → dipanggil dengan ({ type: 'notching:init', moduleId: 'system-stat', lang: 'en' }, '*')
});
test('forwards calls from its own frame only', async () => {
  // MessageEvent dengan source = iframe.contentWindow → moduleCall('system-stat', 'system.stats', 'read', undefined)
  //   lalu postMessage({ type: 'notching:result', id: 1, ok: true, value }, '*');
  // pesan yang sama dengan source = window → moduleCall tidak dipanggil
});
test('a late answer never reaches the next module', async () => {
  // moduleCall menggantung; show(home); resolve → postMessage bingkai home tidak menerima notching:result
});
test('passes Escape up', () => { /* { type: 'notching:key', key: 'Escape' } dari bingkai → onKey('Escape') */ });
test('a module that never says ready shows the load error', () => {
  // timers.advance(3000) → container.textContent memuat 'Modul ini gagal dimuat.' dan tidak ada iframe;
  // kalau 'notching:ready' datang lebih dulu → tidak ada pesan galat
});
test('no module shows the empty card', () => { /* show(null) → teks 'Semua modul mati.' dan 'Nyalakan lagi di Pengaturan.' */ });

// i18n.test.ts
test('host strings have the same keys in both languages', () => expect(Object.keys(en).sort()).toEqual(Object.keys(id).sort()));
test('every module has the same keys in both languages', () => {
  // import.meta.glob('../../modules/*/locales/*.json', { eager: true, import: 'default' }); kelompokkan per modul; bandingkan kunci id vs en
});
test('hostStrings picks the language', () => expect(hostStrings('en').settings).toBe('Settings'));

// @vitest-environment jsdom
// app.test.ts — helper open(app, r): controller.click(); view.kick(); r.runAll(600); timers.advance(1000); r.runAll(600)
test('the pill shows modules that are on, in order', async () => { /* data-id: ['home', 'system-stat'] */ });
test('opens the last card', async () => {
  // state lastCard 'system-stat' → open → iframe src memuat 'system-stat'; controller.panelSize().w === 480
});
test('picking a module switches the card and remembers it', async () => {
  // open; klik ikon home → setLastCard('home'); iframe home; panelSize().w === 540; .on ada di ikon home
});
test('a module switched off while open gives way to the next one', async () => {
  // open di system-stat; emitModuleState(system-stat enabled false) → iframe home; pil tanpa system-stat
});
test('a card picked on another screen opens here next time', async () => {
  // panel tertutup; emitModuleState({ ...TEST_STATE, lastCard: 'home' }) → open → iframe home
});
test('every module off shows the empty card', async () => {
  // semua enabled false → open → teks 'Semua modul mati.'; panelSize().w === 360
});
test('Escape from inside the module closes the panel', async () => {
  // open; MessageEvent { type: 'notching:key', key: 'Escape' } dari iframe.contentWindow → controller.phase === 'closing'
});
test('the frame goes away once the panel has closed', async () => {
  // open; controller.escape(); view.kick(); r.runAll(600) → tidak ada iframe di root
});
test('a language change reloads the frame in the new language', async () => {
  // open; emitModuleState({ ...state, lang: 'en' }) → iframe baru; load → init dengan lang 'en';
  // aria-label ⋯ === 'Settings'; document.documentElement.lang === 'en'
});
```
Badan test yang hanya berupa komentar ditulis dari komentar itu, dengan helper yang disebut.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src` → FAIL

- [ ] **Step 3: Implementasikan semua file sesuai Interfaces dan aturan di atas**

Ganti `main.ts` dengan:
- pemilihan bridge seperti sebelumnya (`tauriBridge` atau `browserBridge`),
- lalu `startApp(root, bridge, { raf, caf, setTimer })`.

Tambahkan gaya `.module-frame`, `.notch-empty`, `.notch-error`, dan `.big` ke `styles.css`, lalu `@import './kit/kit.css'` di bagian atas file itu.

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx tsc --noEmit && npm test` → PASS

- [ ] **Step 5: Cek di browser bersama pemilik**

Run: `npm run dev`, lalu buka satu per satu:
- `http://localhost:1420/`
- `?notch=1`
- `?lang=en`
- `?off=home,system-stat`

Minta pemilik melihat dan melaporkan:
1. Pil berisi ikon Beranda dan System stat, lalu ⋯. Ada titik putih di bawah ikon kartu yang terbuka.
2. Klik ikon lain → panel pindah ke ukuran kartu baru dengan pegas yang sama, dan isi kartu muncul setelah panel hampir diam.
3. **Tampilan kartu System stat** dengan data palsu: tiga kolom, angka titik-titik, label, dan baris titik CPU.
4. Teks kartu Beranda sementara, teks kartu kosong, dan teks bahasa Inggris.
5. Di `?notch=1`, isi kartu mulai di bawah kamera.

Pemilik yang memutuskan semua soal tampilan dan teks. Terapkan perubahan yang diminta, jalankan test lagi, lalu cek ulang bersama pemilik.

Catat di pesan commit bahwa pemilik sudah menyetujui. Kalau ukuran kartu berubah, ubah `card` di manifest dan angka yang terkait di test.

- [ ] **Step 6: Commit**

`git add src modules && git commit -m "feat: module frames, card choice, two languages and the browser preview"`

---

### Task 8: Sambungan native: perintah, protokol `notchmod`, dan paket modul di app

**Files:**
- Create: `src-tauri/src/app_core.rs`, `src-tauri/src/module_commands.rs`, `src-tauri/src/modules/protocol.rs`, `scripts/build-modules.mjs`
- Modify: `src-tauri/src/lib.rs`, `src-tauri/src/modules/mod.rs`, `src-tauri/tauri.conf.json`, `package.json`, `.gitignore`
- Test: di dalam `app_core.rs` dan `protocol.rs`

**Interfaces:**
- Consumes: Task 1–3 (`Settings`, `load_settings`, `save_settings`, `Lang`, `resolve_lang`, `device_locale`, `ModuleStore`, `ModuleEntry`, `authorize`, `SystemStats`) dan nama perintah/event dari Task 7.
- Produces:
```rust
// app_core.rs — nama file bukan core.rs, supaya tidak bentrok dengan crate `core`
#[derive(Clone, Debug, PartialEq, serde::Serialize)] #[serde(rename_all = "camelCase")]
pub struct ModuleInfoDto {
    pub id: String, pub name: String, pub description: String, pub version: String,
    pub entry: String, pub icon: String, pub card: CardSize, pub installed: bool, pub enabled: bool,
}
#[derive(Clone, Debug, PartialEq, serde::Serialize)] #[serde(rename_all = "camelCase")]
pub struct ModuleStateDto { pub lang: Lang, pub modules: Vec<ModuleInfoDto>, pub last_card: Option<String> }
#[derive(Debug, PartialEq)]
pub enum CoreError { Store(StoreError), Save(String) }   // Display → teks untuk JS
pub struct AppCore { /* settings_path, settings, store, device_locale, modules: Vec<ModuleEntry> */ }
impl AppCore {
    pub fn open(settings_path: PathBuf, store: ModuleStore, device_locale: Option<String>) -> AppCore;  // load → sync → list
    pub fn state(&self) -> ModuleStateDto;
    pub fn module(&self, id: &str) -> Option<&ModuleEntry>;
    pub fn servable(&self, id: &str) -> bool;                 // terpasang dan menyala
    pub fn active_dir(&self) -> &Path;
    pub fn set_last_card(&mut self, id: &str) -> Result<(), CoreError>;   // id harus ada di daftar
    pub fn set_enabled(&mut self, id: &str, enabled: bool) -> Result<(), CoreError>;
    pub fn uninstall(&mut self, id: &str) -> Result<(), CoreError>;
    pub fn reinstall(&mut self, id: &str) -> Result<(), CoreError>;
}
pub struct CoreState(pub std::sync::Mutex<AppCore>);
pub struct StatsState(pub std::sync::Mutex<SystemStats>);
// modules/protocol.rs
pub const SCHEME: &str = "notchmod";
pub const MODULE_CSP: &str = "default-src 'none'; script-src notchmod:; style-src notchmod: 'unsafe-inline'; img-src notchmod: data:; font-src notchmod:; connect-src 'none'";
pub fn resolve(active_dir: &Path, uri_path: &str) -> Option<(String, PathBuf)>;
pub fn content_type(path: &Path) -> &'static str;
pub fn respond(active_dir: &Path, servable: impl Fn(&str) -> bool, uri_path: &str) -> tauri::http::Response<Vec<u8>>;
// module_commands.rs
pub const MODULE_STATE_EVENT: &str = "notching://module-state";
#[tauri::command] pub fn get_module_state(core: State<CoreState>) -> ModuleStateDto;
#[tauri::command] pub fn set_last_card(app: AppHandle, core: State<CoreState>, id: String) -> Result<(), String>;
#[tauri::command] pub fn set_module_enabled(app: AppHandle, core: State<CoreState>, id: String, enabled: bool) -> Result<(), String>;
#[tauri::command] pub fn uninstall_module(app: AppHandle, core: State<CoreState>, id: String) -> Result<(), String>;
#[tauri::command] pub fn reinstall_module(app: AppHandle, core: State<CoreState>, id: String) -> Result<(), String>;
#[tauri::command] pub async fn module_call(app: AppHandle, module_id: String, capability: String, method: String,
                                           args: Option<serde_json::Value>) -> Result<serde_json::Value, String>;
```

**Keputusan teknis yang dikunci:**
- **`AppCore`:**
  - Setiap perubahan langsung `save_settings`, lalu daftar modul dihitung ulang.
  - `lang` = `resolve_lang(settings.language, device_locale)`.
- **Perintah perubahan:**
  - Ambil `state()` di dalam lock, lepaskan lock, lalu `app.emit(MODULE_STATE_EVENT, state)`. Event ini sampai ke semua overlay, dan nanti ke jendela pengaturan.
  - Perintah nyala, mati, copot, dan pasang lagi belum dipanggil UI di rencana ini. Rencana 3 memakainya.
- **`module_call`:**
  - `authorize` dijalankan di dalam lock `CoreState`, lalu lock dilepas.
  - `Call::SystemStatsRead` dijalankan di `tauri::async_runtime::spawn_blocking`, dengan `app.state::<StatsState>()` di dalamnya. Pembacaan pertama bisa tidur sekitar 200 ms, jadi tidak boleh di main thread.
  - Hasilnya `serde_json::to_value`. Kesalahan → `CallError` sebagai teks.
- **`protocol::resolve`:**
  - Path harus `/<id>/<file…>`.
  - `id` harus lolos `is_module_id`, dan sisanya harus lolos `is_package_path`.
  - Tanda `%` ditolak seluruhnya, jadi nama file modul harus polos.
- **`respond`:**
  - 404 kalau path tidak lolos, modul tidak `servable`, atau file tidak ada.
  - 200 dengan header `Content-Type`, `Access-Control-Allow-Origin: *`, dan `Content-Security-Policy: MODULE_CSP` (khusus HTML).
  - ACAO perlu karena bingkai sandbox beralamat `null`, sedangkan skrip modul, font, dan ikon (mask) diambil dengan CORS.
- **`content_type`:** `html`, `js`, `css`, `json`, `svg`, `woff2`, `woff`, `png`; selain itu `application/octet-stream`.
- **`lib.rs`:**
  - `mod app_core; mod module_commands;` (tanpa `cfg`).
  - `.register_uri_scheme_protocol(SCHEME, |ctx, req| …)`:
    - pakai `ctx.app_handle().try_state::<CoreState>()`;
    - kalau belum ada → 404;
    - selain itu → `respond(core.active_dir(), |id| core.servable(id), req.uri().path())`.
  - Daftarkan keenam perintah baru di `generate_handler!`.
  - Di `setup`, **sebelum** `rebuild_overlays`:
    - `bundle = resource_dir()/modules`,
    - `active = app_data_dir()/modules`,
    - `settings = app_config_dir()/settings.json`,
    - lalu `app.manage(CoreState(…AppCore::open(…)))` dan `app.manage(StatsState(…SystemStats::new()))`.
- **`scripts/build-modules.mjs`:**
  - Baca `modules/index.json` dan hapus `dist-modules/`.
  - Untuk setiap id, panggil `build()` dari Vite dengan:
    - `configFile: false`,
    - `root: modules/<id>`,
    - `base: './'`,
    - `logLevel: 'warn'`,
    - `build.outDir: <repo>/dist-modules/<id>`,
    - `emptyOutDir: true`.
  - Salin `manifest.json`, file `icon`, dan `locales/` ke `dist-modules/<id>/`.
  - Pastikan file `entry` ada. Kalau tidak, gagal dengan pesan jelas.
  - Terakhir, salin `index.json` ke `dist-modules/index.json`.
- **`package.json`:**
  - `"build:modules": "node scripts/build-modules.mjs"`,
  - `"build": "tsc && vite build && npm run build:modules"`.
- **`tauri.conf.json`:**
  - `build.beforeDevCommand`: `"npm run build:modules && npm run dev"`.
  - `bundle.resources`: `{ "../dist-modules/": "modules/" }`.
  - `app.security.csp`: `"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' notchmod: data:; font-src 'self'; frame-src notchmod:; connect-src ipc: http://ipc.localhost"`. Ini minor tertunda dari rencana 1.
- **`.gitignore`:** tambah `dist-modules/`.
- **Saat mengubah kode modul di `tauri dev`:** jalankan ulang `npm run tauri dev`. Modul dibangun ulang di `beforeDevCommand`.

- [ ] **Step 1: Tulis test yang gagal**

```rust
// protocol.rs
#[test] fn resolves_files_inside_a_module() {
    let d = Path::new("/active");
    assert_eq!(resolve(d, "/system-stat/assets/index-1a.js"),
               Some(("system-stat".into(), d.join("system-stat/assets/index-1a.js")))); }
#[test] fn refuses_paths_that_leave_the_module() {
    for p in ["/", "/a", "/ab/", "/ab/../cd/x", "/../x", "/ab/./x", "/ab//x", "/ab/%2e%2e/x", "/ab\\x", "/AB/x"] {
        assert_eq!(resolve(Path::new("/active"), p), None, "{p}"); } }
#[test] fn content_types_by_extension() {
    assert_eq!(content_type(Path::new("a.html")), "text/html; charset=utf-8");
    assert_eq!(content_type(Path::new("a.js")), "text/javascript; charset=utf-8");
    assert_eq!(content_type(Path::new("a.woff2")), "font/woff2");
    assert_eq!(content_type(Path::new("a.bin")), "application/octet-stream"); }
#[test] fn serves_only_modules_that_are_on() {
    // tempdir/ab/index.html berisi "hi"
    // respond(dir, |id| id == "ab", "/ab/index.html") → 200, body "hi",
    //   header access-control-allow-origin "*", content-security-policy == MODULE_CSP
    // respond(dir, |_| false, "/ab/index.html") → 404; respond(dir, |_| true, "/ab/missing.js") → 404
}
// app_core.rs — fake_bundle (Task 2) di tempdir/bundle, active di tempdir/active, settings di tempdir/settings.json
#[test] fn state_lists_the_modules_in_the_device_language()   // open(.., Some("en-US")) → lang En, nama ["Module A","Module B"], last_card None
#[test] fn the_last_card_survives_a_restart()                 // set_last_card("b"); AppCore::open lagi → last_card Some("b")
#[test] fn an_unknown_last_card_is_refused()                  // set_last_card("zzz") → Err; settings.json tidak berubah
#[test] fn a_switched_off_module_is_not_served()              // set_enabled("a", false) → !servable("a"); state: a.enabled false
#[test] fn uninstall_and_reinstall_round_trip() {
    // uninstall("a") → active/a hilang, state a.installed false, !servable("a");
    // AppCore::open lagi → a tetap dicopot; reinstall("a") → active/a ada, servable("a")
}
```
Badan test yang hanya berupa komentar ditulis dari komentar itu.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -- protocol:: app_core::` → FAIL

- [ ] **Step 3: Implementasikan `protocol.rs`, `app_core.rs`, `module_commands.rs`, `lib.rs`, skrip build, dan konfigurasi**

- [ ] **Step 4: Bangun modul, lalu jalankan semua test**

Run: `npm run build:modules && ls dist-modules/system-stat && npx tsc --noEmit && npm test && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: `dist-modules/system-stat` berisi `index.html`, `manifest.json`, `icon.svg`, `locales/`, dan `assets/`. Semua test PASS.

- [ ] **Step 5: Cek di perangkat**

Run: `npm run tauri dev`

Minta pemilik melihat dan melaporkan:
1. Pil berisi Beranda, System stat, dan ⋯. Pembukaan pertama menampilkan Beranda.
2. Klik ikon System stat → panel berganti ukuran dengan halus. CPU, memori, dan jaringan berubah kira-kira setiap 1,5 detik, dan angkanya masuk akal dibanding Activity Monitor.
3. Klik di dalam kartu, lalu tekan Esc → panel menutup. Buka TextEdit, ulangi, lalu langsung mengetik → huruf muncul di TextEdit.
4. Tutup, lalu buka lagi → System stat. Buka panel di layar lain → System stat juga.
5. Panel terbuka, tekan Cmd+Q, lalu jalankan `npm run tauri dev` lagi → panel membuka System stat.

Lalu, oleh pelaksana:
- **CPU selama System stat terbuka:**
  - Jalankan `for i in $(seq 10); do ps -o %cpu= -p $(pgrep -x notching); sleep 1; done`.
  - Jalankan juga `ps -Ao %cpu,comm | grep -i webcontent`.
  - Catat angkanya, dan laporkan ke pengendali kalau rata-rata `notching` di atas 3.
- **CPU setelah panel ditutup:** tunggu 10 detik, lalu jalankan perintah yang sama. Semua nilai harus di bawah 1,0, karena polling sudah berhenti.
- **Bahasa:**
  - Keluarkan app (`pkill -x notching`).
  - Set `"language": "en"` di `~/Library/Application Support/id.web.notching/settings.json`, lalu jalankan lagi.
  - Pemilik melaporkan label kartu dalam bahasa Inggris (Memory, Network, dan teks kartu Home).
  - Kembalikan ke `"auto"`.
- **Mati dan copot lewat file pengaturan:** keluarkan app setiap kali sebelum mengubah file.
  - `"disabledModules": ["home"]` → pemilik melihat hanya ikon System stat.
  - `"uninstalledModules": ["system-stat"]` (dengan `disabledModules` kosong) → `ls ~/Library/Application\ Support/id.web.notching/modules` tanpa `system-stat`, dan pemilik melihat ikonnya hilang.
  - Kosongkan keduanya → folder dan ikon kembali.
- **Build rilis singkat:**
  - Jalankan `npm run tauri build -- --bundles app`.
  - Pastikan `ls src-tauri/target/release/bundle/macos/Notching.app/Contents/Resources/modules/system-stat` berisi `index.html`.
  - Buka `.app` itu, lalu pemilik memastikan kartu System stat tampil. Ini membuktikan CSP dan protokol jalan di build rilis.

Kalau bingkai kosong di build rilis tapi jalan di dev, curigai CSP lebih dulu.

- [ ] **Step 6: Commit**

`git add scripts src-tauri/src src-tauri/tauri.conf.json package.json .gitignore && git commit -m "feat(native): module commands, notchmod protocol and bundled module packages"`

---

### Task 9: CPU saat mouse bergerak

Pemantau global di `pointer.rs` membangunkan app untuk setiap gerakan mouse di mana pun, sehingga CPU naik ke 3–7% (rencana 1). Target task ini: rata-rata `notching` **di bawah 1,0%** selama mouse bergerak jauh dari notch, tanpa mengubah perilaku hover, klik, dan tembus klik.

**Files:**
- Modify: `src-tauri/src/pointer.rs`, `src-tauri/src/geometry.rs`, `src-tauri/src/commands.rs`, `src-tauri/src/overlay.rs`
- Create, hanya untuk perbaikan B: `src-tauri/src/sensor.rs`
- Modify, hanya untuk perbaikan B: `src-tauri/Cargo.toml` (fitur `objc2-app-kit`: `NSView`, `NSTrackingArea`, `NSColor`)
- Test: di dalam `geometry.rs`

**Interfaces:**
- Consumes: `PointerRouter`, `OverlayHit`, `css_rect_to_global`, `reroute_now`, `Overlays`, `set_mouse_passthrough`.
- Produces:
```rust
// geometry.rs
impl PointerRouter { pub fn any_inside(&self) -> bool; }
pub fn near_any(overlays: &[OverlayHit], px: f64, py: f64) -> bool;   // hanya perbaikan A: kursor di dalam frame overlay mana pun
```

- [ ] **Step 1: Ukur angka awal**

Buka build rilis dari Task 8. Minta pemilik menggerakkan mouse memutar di tengah layar, jauh dari notch, selama 20 detik. Selama itu, jalankan:

Run: `for i in $(seq 15); do ps -o %cpu= -p $(pgrep -x notching); sleep 1; done`

Catat rata-ratanya.

- [ ] **Step 2: Profil penyebabnya**

Selama pemilik menggerakkan mouse lagi, jalankan:

Run: `sample notching 10 -file "$TMPDIR/notching-pointer.txt"`

Di pohon panggilan main thread, hitung:
- `busy` = total sampel dikurangi sampel yang daunnya `mach_msg2_trap` (menunggu).
- `ours` = sampel di bawah `reroute_now`.

- [ ] **Step 3: Pilih perbaikan**

- **`ours ≥ busy / 2` → perbaikan A.** Biayanya ada di kode kita:
  - Simpan `Vec<OverlayHit>` di `thread_local!` di `pointer.rs`. Isinya diperbarui oleh `refresh_hits(app)`, yang dipanggil dari `set_hit_rects` dan dari akhir `apply_screens`.
  - `reroute_now` tidak lagi mengunci `Overlays`.
  - `reroute_now` langsung kembali kalau `!router.any_inside() && !near_any(&hits, x, y)`.
- **Selain itu → perbaikan B.** Biayanya ada di pengiriman event dan run loop: app bangun untuk setiap gerakan. Hentikan pemantau global selama kursor jauh, dan pakai "sensor" agar app tahu saat kursor masuk:
  - **Sensor:**
    - Satu `NSPanel` polos per hit rect, paling banyak dua per layar (hot zone atau panel, dan pil). Frame-nya persis rect global hasil `css_rect_to_global`.
    - Gaya: borderless dan nonactivating. Level `NSStatusWindowLevel`, sama dengan overlay, dan diurutkan tepat **di bawah** overlay-nya.
    - Collection behavior sama dengan overlay.
    - `opaque = false`, latar `NSColor::colorWithWhite_alpha(0.0, 0.01)`, `hasShadow = false`, `ignoresMouseEvents = false`.
    - Isinya `NSView` buatan `define_class!` (`NotchingSensorView`) dengan `NSTrackingArea` (`MouseEnteredAndExited | ActiveAlways | InVisibleRect`). `mouseEntered:` memanggil `reroute_now`.
    - Sensor tidak pernah ditutup. Sensor yang tidak terpakai hanya `orderOut`.
    - Sensor diperbarui di `set_hit_rects` dan `apply_screens`.
  - **Pemantau:**
    - Pemantau lokal tetap terpasang.
    - Pemantau global dipasang hanya selama `router.any_inside()`, dan dilepas dengan `NSEvent::removeMonitor` begitu tidak ada overlay yang berisi kursor.
    - Aturannya diterapkan di akhir setiap `reroute_now`.
  - **Uji coba dulu, tanpa commit.** Cek tiga anggapan:
    1. Sensor menerima `mouseEntered:` saat app lain aktif, tanpa mencuri fokus.
    2. Pemilik tidak bisa melihat sensor di menu bar terang maupun gelap.
    3. CPU di bawah 1,0% saat mouse bergerak jauh.

    Kalau salah satu gagal, kembalikan file dengan `git checkout -- src-tauri/src src-tauri/Cargo.toml` dan hapus `sensor.rs`. Laporkan angka dan temuan ke pengendali. Jangan merakit desain ketiga.
  - **Minor tertunda yang ikut dikerjakan kalau B dipilih**, karena `overlay.rs` ikut diubah: `apply_screens` tidak lagi berhenti di layar yang gagal dibuat atau dimuat ulang. Tulis `eprintln!` lalu lanjut ke layar berikutnya.
- **Kedua perbaikan:** tambahkan `RightMouseDragged | OtherMouseDragged` ke mask pemantau. Ini minor tertunda dari rencana 1.

- [ ] **Step 4: Tulis test yang gagal untuk bagian murni**

```rust
#[test] fn router_knows_when_the_cursor_left_every_overlay() {
    let mut r = PointerRouter::default(); let o = vec![hit("notch-0")];
    assert!(!r.any_inside()); r.route(&o, 735.0, 940.0); assert!(r.any_inside());
    r.route(&o, 100.0, 100.0); assert!(!r.any_inside()); }
// hanya perbaikan A:
#[test] fn far_moves_need_no_routing() {
    let o = vec![hit("notch-0")];                 // overlay {415, 596, 640, 360}
    assert!(!near_any(&o, 100.0, 100.0)); assert!(near_any(&o, 735.0, 700.0)); }
```

- [ ] **Step 5: Jalankan test, pastikan gagal, lalu implementasikan perbaikan yang dipilih**

Run: `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml geometry` → FAIL, lalu PASS setelah implementasi.

- [ ] **Step 6: Ukur ulang**

Jalankan build rilis baru dan ulangi Step 1.
Expected: rata-rata di bawah 1,0.

Kalau target belum tercapai, berhenti dan laporkan angka sebelum dan sesudah ke pengendali.

- [ ] **Step 7: Cek perilaku bersama pemilik**

Kode kursor berubah, jadi minta pemilik mengulang dan melaporkan:
1. Hover di kedua layar → tetesan. Keluar dari notch → tetesan kembali.
2. Klik → panel dan pil. Ikon pil bisa diklik.
3. Kursor keluar ke samping panel yang terbuka, lalu masuk lagi → panel tetap bisa diklik.
4. Saat diam, menu app di menu bar dekat tengah layar utama bisa diklik.
5. Klik di luar dan Esc menutup panel.
6. Cabut monitor, lalu pasang lagi → semua tetap jalan.

Untuk perbaikan B, tambah satu cek: dengan wallpaper terang dan gelap, tidak ada bayangan atau kotak di sekitar notch.

- [ ] **Step 8: Commit**

`git add src-tauri/src src-tauri/Cargo.toml && git commit -m "perf(native): stop waking on every mouse move away from the notch"`

---

### Task 10: Verifikasi akhir di perangkat

**Files:**
- Create: `docs/superpowers/verification/2026-10-27-notching-2-modules.md` (hasil cek, dengan format seperti verifikasi rencana 1)

- [ ] **Step 1: Jalankan semua test dan catat jumlahnya**

Run: `npx tsc --noEmit && npm test && npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: semua PASS.

- [ ] **Step 2: Build rilis, lalu catat ukuran**

Run: `npm run tauri build -- --bundles app && du -sh src-tauri/target/release/bundle/macos/Notching.app dist-modules/*/`

Catat ukuran app dan ukuran setiap paket modul. Spec 6 memperkirakan paket modul "puluhan sampai ratusan KB".

- [ ] **Step 3: Ukur CPU**

Gunakan `pgrep -x notching` dan `ps -Ao %cpu,comm | grep -i webcontent`, 10 sampel per keadaan. Catat semuanya.
1. **Diam 10 detik** → semua di bawah 1,0.
2. **System stat terbuka 15 detik** → catat angkanya, tanpa batas keras.
3. **10 detik setelah panel ditutup** → semua di bawah 1,0.
4. **Mouse bergerak jauh dari notch** (pemilik yang menggerakkan) → rata-rata di bawah 1,0.

- [ ] **Step 4: Checklist bersama pemilik, tulis hasilnya di file verifikasi**

1. Pil berisi Beranda, System stat, dan ⋯, dengan titik putih di bawah kartu yang terbuka.
2. Berganti kartu: panel pindah ukuran dengan pegas yang terasa sama, tanpa kedip, dan pil ikut bergerak.
3. Angka System stat berubah kira-kira setiap 1,5 detik dan masuk akal dibanding Activity Monitor.
4. Kartu terakhir diingat setelah panel ditutup dan dibuka, setelah app dimulai ulang, dan di layar lain.
5. Esc setelah klik di dalam kartu menutup panel, dan ketikan kembali ke TextEdit.
6. `"language": "en"` → teks Inggris. `"auto"` → mengikuti bahasa perangkat.
7. Dimatikan, dicopot, dan dipasang lagi lewat file pengaturan:
   - ikon hilang dan kembali,
   - folder modul aktif terhapus dan kembali.
8. Perilaku rencana 1 tetap ada:
   - menu bar dekat tengah bisa diklik,
   - notch tetap ada saat pindah Space,
   - notch tidak tampil di layar penuh,
   - monitor bisa dicabut dan dipasang lagi.

Di kolom catatan, tulis "Dilaporkan pemilik" untuk setiap poin yang dicek pemilik.

- [ ] **Step 5: Perbaiki temuan dengan `superpowers:systematic-debugging`, lalu ulangi langkah yang gagal**

- [ ] **Step 6: Commit**

`git add docs/superpowers/verification/2026-10-27-notching-2-modules.md && git commit -m "docs: verification notes for the module system"`
