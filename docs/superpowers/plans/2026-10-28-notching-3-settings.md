# Notching 3: Jendela Pengaturan S1 — Rencana Kerja

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pengaturan bisa diubah lewat jendela, bukan lagi dengan menyunting `settings.json`:
- Ikon ⋯ di ujung kanan pil membuka jendela pengaturan biasa. Selama jendela terbuka, ikon Notching ada di Dock dan Cmd+Tab.
- Sidebar berisi enam bagian (Umum, Tampilan notch, Notifikasi, Modul, Izin, Tentang), dengan kotak cari di atasnya yang juga mencari nama modul.
- **Umum:** bahasa (otomatis, Indonesia, English), layar tempat notch muncul, dan buka saat login.
- **Tampilan notch:** empat slider (kenyal 100, kecepatan 200, jarak tetesan 9 px, tebal 4 px) dengan pratinjau langsung. Notch sungguhan ikut berubah begitu slider dilepas.
- **Modul:** daftar modul terpasang dengan tombol nyala/mati dan ukurannya. Setiap modul punya halaman sendiri dengan tombol "Copot modul". Ada "+ Tambah modul" untuk memasang lagi modul bawaan yang pernah dicopot.
- **Notifikasi, Izin, Tentang:** halaman jujur yang singkat, karena fiturnya belum ada.
- Jendela mengikuti mode terang atau gelap macOS.

**Architecture:**
- **Rust tetap memegang semua pengaturan.**
  - `settings.json` bertambah `notch` (empat nilai slider) dan `screen` (nama layar pilihan, atau `null` untuk semua layar).
  - Nilai yang salah tipe atau di luar rentang hanya mengembalikan field itu ke bawaan, tidak membuang seluruh file.
  - Perintah lama dari rencana 2 (nyala, mati, copot, pasang lagi) dipakai apa adanya.
  - Perintah baru untuk bahasa, slider, layar, dan buka saat login. Setiap perubahan disimpan lalu disiarkan ke semua jendela.
- **Dua siaran:**
  - `notching://module-state` (rencana 2) sekarang juga membawa `notch`, plus `size` dan `iconSvg` setiap modul. Overlay notch memakainya untuk slider, dan jendela pengaturan untuk daftar modul.
  - `notching://settings` (baru) membawa pilihan bahasa, pilihan layar, daftar layar yang tersambung, status buka saat login, dan versi app. Hanya jendela pengaturan yang mendengarkan.
- **Jendela pengaturan** adalah jendela Tauri biasa berlabel `settings`, dengan halaman `settings.html`. Jendela ini bukan panel nspanel.
  - Dibuat saat ⋯ diklik, muncul di tengah layar tempat ⋯ diklik, dan dibuang saat ditutup.
  - Saat dibuat, app beralih ke `ActivationPolicy::Regular` supaya ada ikon di Dock dan Cmd+Tab. Saat jendela hilang, app kembali ke `Accessory`.
- **Frontend pengaturan (TypeScript tanpa framework)** ada di `src/settings/`.
  - Shell: sidebar, kotak cari, dan pane yang dibangun ulang dari state.
  - Halaman per bagian.
  - Pencarian berupa fungsi murni atas indeks teks.
  - Pratinjau Tampilan notch memakai `NotchController` dan `mountNotch` yang sama dengan overlay, jadi geraknya persis sama.
- **Layar pilihan** diterapkan di Rust saat overlay dibangun ulang. Layar yang tidak dipilih diparkir seperti layar yang dicabut.

**Tech Stack:**
- Sama dengan rencana 2: Tauri 2.12, `tauri-nspanel` 2.1, objc2 0.6 / objc2-app-kit 0.3, Vite 8, TypeScript, Vitest + jsdom.
- Tambahan Rust: `objc2-service-management` 0.3 (`SMAppService`, untuk buka saat login).
- Tidak ada tambahan npm.

**Spec:** `docs/superpowers/specs/2026-10-27-notch-design.md`.
- Bagian 8 mengikat untuk jendela pengaturan.
- Bagian 4.3 mengatur keempat slider: rentang dan bawaannya.
- Bagian 4.5 mengatur banyak monitor dan pembatasan ke satu layar.
- Bagian 5 mengatur gaya visual, tema terang/gelap jendela, bahasa, dan suara teks.
- Bagian 6 mengatur status modul, "+ Tambah modul", dan urutan modul.

Acuan visual: `docs/superpowers/specs/2026-10-27-notch-mockups/settings.html`, pilihan **S1** (mode gelap).

Rencana sebelumnya: `docs/superpowers/plans/2026-10-27-notching-2-module-system.md`. Perintah modul, `settings.json`, dan siaran `module-state` berasal dari sana.

**Keputusan pemilik saat menyusun rencana ini (28 Oktober 2026):**
- "Buka saat login" ada di Umum.
- Ekspor dan impor pengaturan ditunda. Spec bagian 8 diperbarui bersama commit rencana ini.
- Selama jendela pengaturan terbuka, ikon Notching muncul di Dock dan Cmd+Tab.

### Rangkaian rencana

Ini rencana 3 dari 5 untuk tahap "versi Mac untuk dipakai sendiri":

1. **Kerangka notch di Mac.** Selesai.
2. **Sistem modul dan kartu, dengan System stat.** Selesai, di `main` 61f3c96.
3. **Jendela pengaturan S1** (rencana ini).
4. **Beranda dan notifikasi.**
   - Mengisi halaman Notifikasi: cahaya G2, lama tampil, notifikasi per modul.
   - Menentukan cara halaman modul menampilkan pengaturan modul itu, dimulai dari Beranda.
5. **Lima modul tahap 1 lainnya.**
   - Mengisi halaman Izin: status setiap izin dan tombol ke pengaturan sistem.
   - Pengaturan modul-modul itu di halaman modulnya.

## Global Constraints

- **Repo dan git:**
  - Repo ada di root folder ini dan tidak punya remote. Folder ini dipakai bersama sesi lain.
  - Kerjakan di cabang `feat/settings` dari `main` (61f3c96). Commit pertamanya adalah rencana ini.
  - Commit hanya dengan path eksplisit. Jangan pernah `git add -A`, dan jangan pernah meng-commit `.claude/` atau `.superpowers/`.
  - Merge ke `main` hanya kalau pemilik memintanya.
- **Identitas app:** nama produk `Notching`, bundle id `id.web.notching`, paket Cargo `notching`, nama proses `notching`.
- **Shell:** di shell non-interaktif, jalankan `export PATH="$HOME/.cargo/bin:$PATH"` dulu sebelum perintah `cargo`.
- **Perintah:**
  - `npm test` (100 lulus di awal), `npx tsc --noEmit`, dan `cargo test --manifest-path src-tauri/Cargo.toml` (50 lulus di awal).
  - Jalankan `npm run build:modules` sebelum perintah `cargo` apa pun.
- **Build rilis:** `npm run tauri build -- --bundles app`, hasilnya `src-tauri/target/release/bundle/macos/Notching.app`.
- **Panel tidak pernah ditutup:**
  - Panel notch (`tauri-nspanel`) hanya disembunyikan, dipindah, atau dimuat ulang. Menutupnya membuat app abort karena `NSRangeException`.
  - Jendela pengaturan adalah jendela Tauri biasa dan boleh ditutup. Jangan pernah membuatnya lewat `PanelBuilder`.
- **Jangan pakai `panel_event!`.** Pakai observer `NSNotificationCenter` atau `on_window_event`.
- **Gerak dan rasa dari rencana 1 dan 2 tidak berubah.** Slider hanya mengubah empat nilai `NotchConfig`. Konstanta pegas, bentuk panel, jeda pil, dan ukuran kartu tetap.
- **Slider (spec 4.3):**

  | Nilai | Kunci JSON | Rentang | Bawaan | Langkah |
  |---|---|---|---|---|
  | Kenyal | `bounce` | 0–100 | 100 | 1 |
  | Kecepatan | `speed` | 40–200 | 200 | 1 |
  | Jarak tetesan | `dropDepth` | 2–28 px | 9 | 1 |
  | Tebal notch | `thickness` | 2–14 px | 4 | 1 |

  Rentangnya sama dengan `CONFIG_RANGES` di `src/notch/config.ts`. Rust memakai salinan rentang yang sama.
- **Pengaturan:** `~/Library/Application Support/id.web.notching/settings.json`.
  - Isi setelah rencana ini: `version`, `language`, `lastCard`, `disabledModules`, `uninstalledModules`, `notch`, `screen`.
  - Status buka saat login tidak disimpan di sini. Sumbernya macOS (`SMAppService`).
- **Jendela pengaturan:**
  - Label `settings`, halaman `settings.html`.
  - Ukuran awal 680 × 600, minimal 600 × 480. Ukuran 680 × 600 sama dengan mockup.
  - Judul bar tersembunyi (`TitleBarStyle::Overlay` + `hidden_title`). Tombol merah-kuning-hijau menumpang di atas sidebar.
  - Satu jendela saja. ⋯ saat jendela sudah terbuka hanya membawanya ke depan.
- **Gaya visual (spec 5):**
  - Mode gelap memakai warna dan ukuran `settings.html` S1.
  - Mode terang adalah kebalikannya: latar putih, teks hitam, abu dari hitam transparan.
  - Merah #E8262E tidak dipakai di rencana ini.
  - Label: Space Mono 10 px, huruf kapital, jarak huruf .12em, abu. Teks: Space Grotesk. Pemisah: garis titik-titik.
- **Teks:**
  - Semua teks antarmuka ada di `src/i18n/id.json` dan `src/i18n/en.json`. Teks jendela pengaturan ada di bawah kunci `settingsWindow`.
  - Gaya DynamicNotch: kalimat pendek dan tegas, menyapa "kamu", tanpa "kami".
  - Teks dari modul atau dari pengguna masuk lewat `textContent`, tidak pernah lewat `innerHTML`. `innerHTML` hanya untuk SVG ikon tetap di `src/settings/icons.ts`.
- **Hemat daya:**
  - Jendela pengaturan tidak punya loop dan tidak polling.
  - Pratinjau notch hanya meminta frame selama ada yang bergerak, sama seperti overlay.
  - Menutup jendela membuang webview-nya.
  - Saat diam, overlay tetap tanpa `requestAnimationFrame`.
- **Jaringan:** tidak ada akses jaringan. Font ikut di dalam app.
- **Jangan membangun fitur rencana 4 dan 5:** cahaya G2, lama tampil notifikasi, status izin, pengaturan per modul, ekspor/impor, cek update, dan tautan donasi.
- **Cek manual:** hasil cek manual (melihat layar, mencoba klik) hanya diisi dari laporan pemilik. Jangan pernah menandainya lulus berdasarkan dugaan.

## Review Focus

1. **Jendela dibuka dan ditutup berulang kali.**
   - Kejadiannya: ⋯ diklik dua kali, ⋯ diklik dari layar lain saat jendela terbuka, ditutup dengan tombol merah, dengan Cmd+W, atau app ditutup dengan Cmd+Q dari jendela pengaturan.
   - Yang diharapkan: tidak pernah ada dua jendela, app tidak pernah abort, dan ikon Dock muncul serta hilang bersama jendela.
   - Diuji di Task 2 (`⋯ closes the panel and opens settings`) dan dicek manual di Task 7 dan 9.
2. **Layar pilihan sedang tidak tersambung.**
   - Notch muncul di semua layar, tidak pernah di nol layar.
   - Pilihan itu tetap tercantum di daftar dengan tanda "(tidak tersambung)", dan notch kembali ke layar itu saat tersambung lagi.
   - Diuji di Task 7 (`a_missing_screen_falls_back_to_every_screen`) dan Task 4 (`a chosen screen that is not connected stays listed and says so`), dan dicek manual di Task 7.
3. **Fokus keyboard bertahan saat halaman dibangun ulang.**
   - Setiap perubahan menyiarkan state, dan halaman dibangun ulang dari state itu.
   - Tombol atau slider yang sedang fokus harus tetap fokus, supaya slider bisa digeser dengan panah berkali-kali.
   - Diuji di Task 4 (`focus stays on a control after a re-render`) dan Task 6 (`arrow keys keep working after each save`).
4. **`settings.json` lama atau hasil suntingan tangan.**
   - Nilai slider di luar rentang dipotong ke batasnya.
   - Nilai yang salah tipe hanya mengembalikan field itu ke bawaan.
   - Nama layar yang tidak dikenal berarti semua layar.
   - File tidak pernah dibuang karena satu nilai.
   - Diuji di Task 1 (`notch_values_are_clamped_to_the_slider_ranges`, `a_value_of_the_wrong_type_resets_only_that_field`) dan Task 7.
5. **Ganti bahasa dari jendela pengaturan.**
   - Jendela, pencarian, nama modul, pil notch, dan kartu yang terbuka semuanya pindah bahasa sekaligus.
   - Diuji di Task 1 (`a_language_choice_renames_the_modules_and_survives_a_restart`), Task 3 (`follows the language`), Task 4 (`choosing a language saves it, and the window follows the new language`), dan rencana 2 (`a language change reloads the frame in the new language`). Dicek manual di Task 7.

---

### Task 1: Pengaturan baru dan state modul yang lebih lengkap (Rust)

**Files:**
- Modify: `src-tauri/src/settings.rs`, `src-tauri/src/app_core.rs`, `src-tauri/src/modules/store.rs`
- Test: di dalam ketiga file

**Interfaces:**
- Consumes: `Settings`, `load_settings`, `save_settings`, `AppCore`, `ModuleStore`, `ModuleEntry`, `fake_bundle` (rencana 2).
- Produces:
```rust
// settings.rs
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NotchConfig { pub bounce: f64, pub speed: f64, pub drop_depth: f64, pub thickness: f64 }
impl Default for NotchConfig {}                 // 100, 200, 9, 4
impl NotchConfig { pub fn clamped(self) -> NotchConfig; }
pub struct Settings { /* field lama */ pub notch: NotchConfig, pub screen: Option<String> }  // bawaan: NotchConfig::default(), None
// store.rs
pub struct ModuleEntry { /* field lama */ pub size: u64, pub icon_svg: String }
pub fn package_size(dir: &std::path::Path) -> u64;
// app_core.rs
pub struct ModuleInfoDto { /* field lama */ pub size: u64, pub icon_svg: String }   // JSON: size, iconSvg
pub struct ModuleStateDto { /* field lama */ pub notch: NotchConfig }
impl AppCore {
    pub fn language(&self) -> LanguageSetting;
    pub fn screen(&self) -> Option<&str>;
    pub fn set_language(&mut self, language: LanguageSetting) -> Result<(), CoreError>;
    pub fn set_notch(&mut self, config: NotchConfig) -> Result<(), CoreError>;
    pub fn set_screen(&mut self, name: Option<String>) -> Result<(), CoreError>;
}
```

**Aturan:**
- **Membaca file dengan toleran:**
  - Setiap field `Settings` dan `NotchConfig` memakai `#[serde(deserialize_with = "lenient")]`.
  - `lenient` membaca `serde_json::Value`, lalu `serde_json::from_value(v).unwrap_or_default()`. Akibatnya, nilai yang salah tipe hanya mengembalikan field itu ke bawaan.
  - `#[serde(other)]` di `LanguageSetting` tetap ada.
  - JSON yang rusak total tetap disimpan sebagai `.broken` (rencana 2).
- **`clamped`:**
  - Setiap nilai dipotong ke rentang di Global Constraints.
  - Nilai yang bukan angka hingga (`NaN`, tak hingga) diganti nilai bawaannya.
  - `load_settings` memotong `notch` setelah membaca.
- **`set_language`:** simpan, lalu hitung ulang daftar modul supaya nama dan keterangannya memakai bahasa baru.
- **`set_notch`:** simpan `config.clamped()`.
- **`set_screen`:** string kosong dibaca sebagai `None`. Simpan.
- **`store.list`:**
  - `icon_svg` = isi `bundle/<id>/<manifest.icon>`, atau `""` kalau tidak terbaca.
  - `size` = `package_size(bundle/<id>)`.
  - Keduanya dibaca dari bundle, supaya modul yang dicopot juga punya ikon dan ukuran untuk "+ Tambah modul".
- **`package_size`:** jumlah ukuran semua file di dalam folder, rekursif. Symlink tidak diikuti. Folder yang tidak ada → 0.

- [ ] **Step 1: Pastikan berada di cabang kerja**

Run: `git branch --show-current`
Expected: `feat/settings`

- [ ] **Step 2: Tulis test yang gagal**

```rust
// settings.rs
#[test] fn the_new_defaults() {
    let s = Settings::default();
    assert_eq!(s.notch, NotchConfig { bounce: 100.0, speed: 200.0, drop_depth: 9.0, thickness: 4.0 });
    assert_eq!(s.screen, None); }
#[test] fn notch_values_are_clamped_to_the_slider_ranges() {
    let d = tempfile::tempdir().unwrap(); let p = d.path().join(SETTINGS_FILE);
    std::fs::write(&p, r#"{"notch":{"bounce":500,"speed":10,"dropDepth":9.5,"thickness":-3}}"#).unwrap();
    assert_eq!(load_settings(&p).notch, NotchConfig { bounce: 100.0, speed: 40.0, drop_depth: 9.5, thickness: 2.0 }); }
#[test] fn a_value_of_the_wrong_type_resets_only_that_field() {
    let d = tempfile::tempdir().unwrap(); let p = d.path().join(SETTINGS_FILE);
    std::fs::write(&p, r#"{"language":"en","lastCard":"system-stat","notch":{"bounce":"x","speed":150},
                         "disabledModules":"home","screen":5}"#).unwrap();
    let s = load_settings(&p);
    assert_eq!(s.language, LanguageSetting::En); assert_eq!(s.last_card, Some("system-stat".into()));
    assert_eq!((s.notch.bounce, s.notch.speed), (100.0, 150.0));
    assert!(s.disabled_modules.is_empty()); assert_eq!(s.screen, None);
    assert!(!d.path().join("settings.json.broken").exists()); }
#[test] fn the_screen_choice_survives_a_save_and_load()   // screen Some("DELL U2723QE") → save → load sama
#[test] fn clamped_replaces_values_that_are_not_numbers() {
    let c = NotchConfig { bounce: f64::NAN, speed: f64::INFINITY, ..Default::default() }.clamped();
    assert_eq!((c.bounce, c.speed), (100.0, 200.0)); }
// store.rs
#[test] fn list_reports_the_icon_and_package_size() {
    // fake_bundle → list(.., Lang::En): a.icon_svg == "<svg/>"; a.size == package_size(&bundle.join("a")); a.size > 0
}
#[test] fn package_size_counts_nested_files() {
    // tempdir: x berisi "abc", sub/y berisi "12345" → 8; folder yang tidak ada → 0
}
// app_core.rs
#[test] fn a_language_choice_renames_the_modules_and_survives_a_restart() {
    // open(&d, Some("en-US")) → set_language(LanguageSetting::Id) → state().lang Id, nama ["Modul A","Modul B"];
    // open lagi → language() == LanguageSetting::Id
}
#[test] fn notch_config_is_clamped_saved_and_shared() {
    // set_notch(NotchConfig { bounce: 150.0, thickness: 1.0, ..Default::default() })
    // → state().notch == { bounce 100, speed 200, drop_depth 9, thickness 2 }; open lagi → sama
}
#[test] fn an_empty_screen_name_means_every_screen() {
    // set_screen(Some("".into())) → screen() None; set_screen(Some("DELL".into())) → open lagi → screen() Some("DELL")
}
#[test] fn state_carries_icons_and_sizes()   // state().modules[0].icon_svg == "<svg/>" dan size > 0
```
Badan test yang hanya berupa komentar ditulis dari komentar itu, dengan helper `open` dan `setup` yang sudah ada.

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml -- settings:: store:: app_core::` → FAIL (gagal kompilasi)

- [ ] **Step 4: Implementasikan sesuai Interfaces dan aturan di atas**

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `cargo test --manifest-path src-tauri/Cargo.toml` → PASS (50 test lama + 11 test baru)

- [ ] **Step 6: Commit**

`git add src-tauri/src/settings.rs src-tauri/src/app_core.rs src-tauri/src/modules/store.rs && git commit -m "feat(native): notch look, screen choice and module sizes in settings and state"`

---

### Task 2: Notch membaca slider dan membuka pengaturan

**Files:**
- Modify: `src/notch/controller.ts`, `src/notch/view.ts`, `src/app.ts`, `src/bridge.ts`, `src/bridge-browser.ts`, `src/modules/types.ts`, `src/notch/test-helpers.ts`
- Test: `src/notch/controller.test.ts`, `src/notch/view.test.ts`, `src/app.test.ts`

**Interfaces:**
- Consumes: `NotchConfig`, `DEFAULT_CONFIG`, `clampConfig` (`src/notch/config.ts`), `ModuleStateDto` baru (Task 1).
- Produces:
```ts
// controller.ts
setConfig(config: NotchConfig): void;   // berlaku mulai frame berikutnya; pemanggil lalu memanggil kick()
// view.ts — ViewDeps
onMore: () => void;                     // ikon ⋯ diklik
// bridge.ts — Bridge
openSettings(): Promise<void>;          // tauriBridge: invoke('open_settings')
// modules/types.ts
interface ModuleInfo { /* field lama */ size: number; iconSvg: string }
interface ModuleState { /* field lama */ notch: NotchConfig }
// bridge-browser.ts
export function catalog(lang: Lang, off: string[]): ModuleInfo[];   // diekspor untuk Task 3
// test-helpers.ts
// moduleInfo(): size 0, iconSvg ''; TEST_STATE.notch = DEFAULT_CONFIG; fakeBridge.openSettings = vi.fn(); deps(): onMore vi.fn()
```

**Aturan:**
- **`setConfig`** mengganti config yang dibaca `targets()`, `motion.advance`, jeda pil, dan `hitRects`. Simpan di field privat, bukan di `deps`.
- **Ikon ⋯** diberi kelas `more`. Klik di pil:
  - `.ic[data-id]` → `onSelect(id)`;
  - `.ic.more` → `onMore()`.
- **`startApp`:**
  - Controller dibuat dengan `clampConfig(state.notch)`.
  - `onModuleState`: kalau `notch` berbeda dari config sekarang → `controller.setConfig(clampConfig(next.notch))`, lalu `kick()`.
  - `onMore`: `controller.escape()`, `view.kick()`, lalu `void bridge.openSettings()`.
- **`browserBridge`:**
  - `catalog` diekspor, dan setiap modul diberi:
    - `iconSvg` dari `import.meta.glob('../modules/*/icon.svg', { query: '?raw', import: 'default', eager: true })`,
    - `size` palsu `140 * 1024`, karena browser tidak bisa mengukur paket.
  - `state.notch = DEFAULT_CONFIG`.
  - `openSettings` → `window.open('/settings.html' + location.search, 'notching-settings')`.
- **`tauriBridge.openSettings`** memanggil perintah yang baru ada di Task 7. Sebelum itu, klik ⋯ di `tauri dev` menghasilkan galat di konsol, dan itu wajar.

- [ ] **Step 1: Tulis test yang gagal**

```ts
// controller.test.ts
test('a new config applies from the next frame', () => {
  const c = ctl(null); expect(c.targets().H).toBe(4);
  c.setConfig({ ...DEFAULT_CONFIG, thickness: 10 });
  expect(c.targets().H).toBe(10); expect(c.config.thickness).toBe(10); });
// view.test.ts
test('the ⋯ icon opens settings', () => {
  const root = document.createElement('div'); const onMore = vi.fn(); const onSelect = vi.fn();
  const v = mountNotch(root, ctl(null), { ...deps(fakeRaf()), onMore, onSelect }); v.setPill(ITEMS, 'home', 'Pengaturan');
  root.querySelector<HTMLElement>('.notch-pill .ic.more')!.click();
  expect(onMore).toHaveBeenCalledTimes(1); expect(onSelect).not.toHaveBeenCalled(); });
// app.test.ts
test('⋯ closes the panel and opens settings', async () => {
  const { root, app, r, bridge } = await start(); open(app, r);
  root.querySelector<HTMLElement>('.notch-pill .ic.more')!.click();
  expect(bridge.openSettings).toHaveBeenCalledTimes(1); expect(app.controller.phase).toBe('closing'); });
test('the notch starts with the saved look', async () => {
  const { app } = await start({ ...TEST_STATE, notch: { ...DEFAULT_CONFIG, dropDepth: 20 } });
  expect(app.controller.config.dropDepth).toBe(20); });
test('a new look from settings reaches the notch, clamped', async () => {
  const { app, bridge } = await start();
  bridge.emitModuleState({ ...TEST_STATE, notch: { ...DEFAULT_CONFIG, thickness: 10, bounce: 400 } });
  expect(app.controller.config).toEqual({ ...DEFAULT_CONFIG, thickness: 10, bounce: 100 }); });
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/notch src/app.test.ts` → FAIL

- [ ] **Step 3: Implementasikan sesuai Interfaces dan aturan di atas**

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx tsc --noEmit && npm test` → PASS

- [ ] **Step 5: Commit**

`git add src/notch src/app.ts src/bridge.ts src/bridge-browser.ts src/modules/types.ts src/app.test.ts && git commit -m "feat(notch): the notch follows the saved look and ⋯ opens settings"`

---

### Task 3: Teks, pencarian, dan bridge pengaturan untuk browser

**Files:**
- Create: `src/settings/types.ts`, `src/settings/search.ts`, `src/settings/bridge-browser.ts`
- Modify: `src/i18n/id.json`, `src/i18n/en.json`, `src/i18n/index.ts`
- Test: `src/settings/search.test.ts`, `src/i18n/i18n.test.ts`

**Interfaces:**
- Consumes: `ModuleInfo`, `ModuleState`, `Lang`, `NotchConfig`, `catalog` (Task 2).
- Produces:
```ts
// i18n/index.ts
export type SettingsStrings = typeof import('./id.json')['settingsWindow'];
export function settingsStrings(lang: Lang): SettingsStrings;
export function fill(template: string, values: Record<string, string | number>): string;   // "{n} terpasang" → "2 terpasang"
// settings/types.ts
export type LanguageChoice = 'auto' | 'id' | 'en';
export type LoginItem = 'on' | 'off' | 'needsApproval' | 'unavailable';
export interface SettingsInfo {          // sama dengan SettingsDto Rust (Task 7)
  language: LanguageChoice; screen: string | null; screens: string[]; login: LoginItem; version: string;
}
export type SectionId = 'general' | 'look' | 'notifications' | 'modules' | 'permissions' | 'about';
export type Route = { page: SectionId } | { page: 'module'; id: string } | { page: 'add' };
export interface SettingsBridge {
  moduleState(): Promise<ModuleState>; onModuleState(cb: (s: ModuleState) => void): () => void;
  settings(): Promise<SettingsInfo>; onSettings(cb: (s: SettingsInfo) => void): () => void;
  setLanguage(language: LanguageChoice): Promise<void>;
  setNotchConfig(config: NotchConfig): Promise<void>;
  setScreen(name: string | null): Promise<void>;
  setLaunchAtLogin(on: boolean): Promise<void>;
  openLoginItems(): Promise<void>;
  setModuleEnabled(id: string, enabled: boolean): Promise<void>;
  uninstallModule(id: string): Promise<void>;
  reinstallModule(id: string): Promise<void>;
  quit(): Promise<void>;
}
export interface SettingsEnv {
  raf: (cb: (now: number) => void) => number; caf: (id: number) => void;
  setTimer: (fn: () => void, ms: number) => () => void;
}
// settings/search.ts
export interface SearchEntry { key: string; label: string; where: string; route: Route; text: string }
export function normalize(s: string): string;   // huruf kecil, tanpa tanda aksen (NFD lalu buang tanda gabung), spasi dirapikan
export function searchIndex(s: SettingsStrings, modules: ModuleInfo[]): SearchEntry[];
export function search(entries: SearchEntry[], query: string): SearchEntry[];
// settings/bridge-browser.ts
export function browserSettingsBridge(params: URLSearchParams): SettingsBridge;
```

**Teks `settingsWindow`** (kunci bersarang memakai titik):

| Kunci | `id.json` | `en.json` |
|---|---|---|
| `title` | Pengaturan | Settings |
| `search` | Cari pengaturan | Search settings |
| `noResults` | Tidak ada yang cocok. | Nothing matches. |
| `saveFailed` | Gagal menyimpan. Coba lagi. | Couldn't save. Try again. |
| `sections.general` | Umum | General |
| `sections.look` | Tampilan notch | Notch look |
| `sections.notifications` | Notifikasi | Notifications |
| `sections.modules` | Modul | Modules |
| `sections.permissions` | Izin | Permissions |
| `sections.about` | Tentang | About |
| `general.language` | Bahasa | Language |
| `general.languageHint` | Untuk notch dan jendela ini. | For the notch and this window. |
| `general.languageAuto` | Otomatis | Automatic |
| `general.languageId` | Indonesia | Indonesia |
| `general.languageEn` | English | English |
| `general.screen` | Notch muncul di | Show the notch on |
| `general.screenEvery` | Semua layar | Every screen |
| `general.screenMissing` | {name} (tidak tersambung) | {name} (not connected) |
| `general.screenMissingHint` | Layar ini sedang tidak tersambung. Sampai tersambung lagi, notch muncul di semua layar. | This screen isn't connected. Until it is, the notch shows on every screen. |
| `general.login` | Buka saat login | Open at login |
| `general.loginHint` | Notching siap begitu kamu masuk. | Notching is ready as soon as you log in. |
| `general.loginUnavailable` | Hanya bisa diatur dari Notching.app yang terpasang. | Only available in the installed Notching.app. |
| `general.loginNeedsApproval` | macOS menunggu persetujuanmu di Login Items. | macOS is waiting for your OK in Login Items. |
| `general.loginOpen` | Buka Login Items | Open Login Items |
| `look.preview` | Pratinjau | Preview |
| `look.previewHint` | Arahkan kursor ke notch, lalu klik. | Point at the notch, then click. |
| `look.bounce` | Kenyal | Bounce |
| `look.speed` | Kecepatan | Speed |
| `look.dropDepth` | Jarak tetesan | Drop depth |
| `look.thickness` | Tebal notch | Notch thickness |
| `look.thicknessHint` | Hanya terlihat di layar tanpa notch. | Only on screens without a notch. |
| `look.reset` | Kembalikan bawaan | Reset to defaults |
| `notifications.sub` | Belum ada yang mengirim notifikasi. | Nothing sends notifications yet. |
| `notifications.note` | Begitu ada modul yang memberi notifikasi, cahaya, lama tampil, dan pilihan per modul diatur di sini. | Once a module sends notifications, its glow, duration and per-module choices live here. |
| `modules.summary` | {n} terpasang · {size} | {n} installed · {size} |
| `modules.none` | Belum ada modul terpasang. | No modules installed. |
| `modules.add` | + Tambah modul | + Add module |
| `modules.noSettings` | Modul ini belum punya pengaturan. | This module has no settings yet. |
| `modules.versionSize` | Versi {version} · {size} | Version {version} · {size} |
| `modules.uninstall` | Copot modul | Uninstall module |
| `modules.uninstallConfirm` | Yakin? Klik lagi | Sure? Click again |
| `modules.uninstallNote` | Salinan aslinya tetap ada di app. Kamu bisa memasangnya lagi kapan saja. | The original stays in the app. Add it back any time. |
| `modules.addTitle` | Tambah modul | Add module |
| `modules.addSub` | Modul bawaan yang pernah kamu copot. | Built-in modules you've uninstalled. |
| `modules.addOne` | Pasang | Add |
| `modules.addNone` | Semua modul bawaan sudah terpasang. | Every built-in module is installed. |
| `permissions.sub` | Belum ada modul yang butuh izin sistem. | No module needs a system permission yet. |
| `permissions.note` | Kalau nanti ada, di sini kamu lihat izin apa, untuk apa, dan modul mana yang memakainya. | When one does, you'll see here which permission, what it's for and which module uses it. |
| `about.name` | Notching | Notching |
| `about.version` | Versi | Version |
| `about.trust` | Gratis. Tanpa iklan. Tanpa pelacakan. | Free. No ads. No tracking. |
| `about.later` | Cek update dan tautan donasi hadir saat rilis publik. | Update checks and the donation link come with the public release. |
| `keywords.language` | bahasa indonesia inggris english language otomatis | language english indonesian bahasa automatic |
| `keywords.screen` | layar monitor eksternal display screen | screen display monitor external |
| `keywords.login` | login masuk mulai startup otomatis | login startup launch automatic |
| `keywords.bounce` | kenyal pegas pantul bounce | bounce spring |
| `keywords.speed` | kecepatan cepat lambat animasi speed | speed fast slow animation |
| `keywords.dropDepth` | tetesan hover turun jarak drop | drop hover depth droplet |
| `keywords.thickness` | tebal tipis lensa garis | thickness thin lens line |
| `keywords.version` | versi update donasi | version update donate |

Pemilik meninjau teks ini di Task 6.

**`searchIndex`** — urutan entri:
1. Untuk setiap bagian, berurutan: entri `section.<id>` (label = judul bagian, `where` = `''`), lalu baris bagian itu.
2. Baris:
   - Umum: `general.language`, `general.screen`, `general.login`.
   - Tampilan notch: `look.bounce`, `look.speed`, `look.dropDepth`, `look.thickness`.
   - Tentang: `about.version`.
   - `route` setiap baris adalah bagiannya, dan `where` adalah judul bagiannya.
   - `text` = `normalize(label + ' ' + where + ' ' + keywords)`. Kunci `keywords.*` dipasangkan ke baris dengan nama yang sama.
3. Modul, langsung setelah `section.modules`, dalam urutan katalog:
   - `key` = `module.<id>`, `label` = nama, `where` = judul Modul, `text` juga memuat keterangan.
   - `route` = `{ page: 'module', id }` kalau terpasang, selain itu `{ page: 'add' }`.

**`search`:**
- Query dinormalisasi lalu dipecah per kata. Query kosong → `[]`.
- Entri cocok kalau setiap kata ada di `text`.
- Urutan: entri yang label-nya (dinormalisasi) diawali kata pertama lebih dulu. Selebihnya mengikuti urutan indeks.

**`browserSettingsBridge`:** state di memori untuk `npm run dev`.
- Modul dari `catalog(lang, [])`. `?lang=en` (bawaan `id`).
- Info: `{ language: 'auto', screen: null, screens: ['Built-in Retina Display', 'DELL U2723QE'], login: 'off', version: '0.1.0' }`.
- Setiap setter mengubah state lalu memanggil semua pendengar:
  - `setLanguage` juga mengganti `lang` dan nama modul (`auto` → `id`),
  - `uninstallModule` → `installed: false, enabled: false`,
  - `reinstallModule` → `installed: true, enabled: true`.
- `quit`, `openLoginItems` → `console.info`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
// i18n.test.ts — test kunci lama diganti versi dalam
const keysDeep = (o: object, p = ''): string[] => Object.entries(o).flatMap(([k, v]) =>
  v && typeof v === 'object' ? keysDeep(v, `${p}${k}.`) : [`${p}${k}`]).sort();
test('both languages have the same keys at every depth', () => expect(keysDeep(en)).toEqual(keysDeep(id)));
test('fill puts values into a template', () =>
  expect(fill('{n} terpasang · {size}', { n: 2, size: '276 KB' })).toBe('2 terpasang · 276 KB'));
// search.test.ts
const mods = [moduleInfo('home', { name: 'Beranda', description: 'Tanggal, cuaca, sholat, reminder' }),
              moduleInfo('system-stat', { name: 'System stat', description: 'CPU, memori, jaringan' })];
const idx = (m = mods, lang: Lang = 'id') => searchIndex(settingsStrings(lang), m);
test('finds a setting by its label', () => expect(search(idx(), 'bahasa')[0].key).toBe('general.language'));
test('finds a setting by a keyword', () => expect(search(idx(), 'monitor')[0].key).toBe('general.screen'));
test('finds a module by name or description and opens its page', () => {
  expect(search(idx(), 'system')[0].route).toEqual({ page: 'module', id: 'system-stat' });
  expect(search(idx(), 'cuaca')[0].route).toEqual({ page: 'module', id: 'home' }); });
test('an uninstalled module leads to Add module', () =>
  expect(search(idx([moduleInfo('home', { name: 'Beranda', installed: false, enabled: false })]), 'beranda')[0].route)
    .toEqual({ page: 'add' }));
test('ignores case and accents', () => expect(search(idx(), 'KÉNYAL')[0].key).toBe('look.bounce'));
test('every word must match', () => {
  expect(search(idx(), 'tebal notch')[0].key).toBe('look.thickness'); expect(search(idx(), 'bahasa zzz')).toEqual([]); });
test('labels that start with the query come first', () =>
  expect(search(idx(), 'ke').slice(0, 2).map(e => e.key)).toEqual(['look.bounce', 'look.speed']));
test('follows the language', () => expect(search(idx(mods, 'en'), 'language')[0].key).toBe('general.language'));
test('a blank query finds nothing', () => expect(search(idx(), '   ')).toEqual([]));
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/settings src/i18n` → FAIL

- [ ] **Step 3: Tulis teks, lalu implementasikan `types.ts`, `search.ts`, `bridge-browser.ts`, dan `i18n/index.ts`**

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx tsc --noEmit && npm test` → PASS

- [ ] **Step 5: Commit**

`git add src/settings src/i18n && git commit -m "feat(settings): strings, search index and the browser settings bridge"`

---

### Task 4: Kerangka jendela, kontrol, dan halaman Umum, Notifikasi, Izin, Tentang

**Files:**
- Create:
  - `settings.html`
  - `src/settings/main.ts`, `src/settings/shell.ts`, `src/settings/controls.ts`, `src/settings/icons.ts`, `src/settings/settings.css`
  - `src/settings/pages/general.ts`, `src/settings/pages/info.ts`
  - `src/settings/test-helpers.ts`
- Modify: `vite.config.ts`
- Test: `src/settings/shell.test.ts`, `src/settings/controls.test.ts`, `src/settings/pages/general.test.ts`

**Interfaces:**
- Consumes: semua dari Task 3, `formatBytes` (`src/kit/format.ts`).
- Produces:
```ts
// settings/types.ts (tambahan)
export interface PageContext {
  strings: SettingsStrings; lang: Lang; state: ModuleState; info: SettingsInfo;
  bridge: SettingsBridge; env: SettingsEnv;
  go(route: Route): void;
  save(key: string, pending: Promise<void>): void;   // kalau gagal: strings.saveFailed di baris itu (lihat aturan save)
  onCleanup(fn: () => void): void;                   // dijalankan sebelum halaman diganti
}
export type PageRender = (ctx: PageContext, route: Route) => HTMLElement;
// shell.ts
export interface SettingsApp { readonly route: Route; go(route: Route): void; destroy(): void }
export function mountSettings(root: HTMLElement, bridge: SettingsBridge, env: SettingsEnv): Promise<SettingsApp>;
export const PAGES: Partial<Record<Route['page'], PageRender>>;   // Task 5 dan 6 menambah isinya
// controls.ts — baris diberi data-row=key; elemen yang bisa difokus diberi data-key yang unik.
// Fokus dikembalikan lewat data-key; sorotan pencarian dan pesan galat memakai data-row.
export function row(o: { key: string; label: string; hint?: string; control?: HTMLElement }): HTMLElement;
export function toggle(key: string, label: string, on: boolean, onChange: (on: boolean) => void, disabled?: boolean): HTMLElement;
export function slider(o: { key: string; label: string; min: number; max: number; step: number; value: number;
  format: (v: number) => string; onInput: (v: number) => void; onChange: (v: number) => void }): HTMLElement;
export function choice<T extends string>(key: string, options: { value: T; label: string }[], value: T,
  onChange: (v: T) => void): HTMLElement;
export function select(key: string, options: { value: string; label: string }[], value: string,
  onChange: (v: string) => void): HTMLElement;
export function button(key: string, label: string, onClick: () => void, solid?: boolean): HTMLElement;
export function head(o: { title: string; sub?: string; icon?: HTMLElement; side?: HTMLElement }): HTMLElement;
// icons.ts — path SVG dari settings.html
export type IconName = 'gear' | 'drop' | 'bell' | 'grid' | 'shield' | 'info' | 'search' | 'chev' | 'back' | 'plus';
export function icon(name: IconName): HTMLElement;   // <span class="icon"> berisi <svg> dari string tetap
// pages/general.ts, pages/info.ts
export const generalPage: PageRender;
export const notificationsPage: PageRender, permissionsPage: PageRender, aboutPage: PageRender;
// test-helpers.ts
export const TEST_INFO: SettingsInfo;   // { language 'auto', screen null, screens ['Built-in Retina Display','DELL U2723QE'], login 'off', version '0.1.0' }
export function fakeSettingsBridge(state?: ModuleState, info?: SettingsInfo): SettingsBridge & {
  emitModuleState(s: ModuleState): void; emitSettings(s: SettingsInfo): void };   // setiap method vi.fn
export function mountForTest(state?: ModuleState, info?: SettingsInfo): Promise<{ root: HTMLElement; bridge: ReturnType<typeof fakeSettingsBridge>; app: SettingsApp; r: ReturnType<typeof fakeRaf> }>;
// env = { raf: r.raf, caf: r.caf, setTimer: timers.setTimer } dari src/notch/test-helpers.ts
```

**Tata letak (dari `settings.html` S1):**
- `.side`, lebar 188 px:
  - strip seret 36 px di atas (`data-tauri-drag-region`), tempat tombol merah-kuning-hijau,
  - kotak cari `<input type="search" class="search">` dengan ikon `search`,
  - lima item: Umum (`gear`), Tampilan notch (`drop`), Notifikasi (`bell`), Modul (`grid`, dengan `.n` = jumlah modul terpasang), Izin (`shield`),
  - ruang kosong, lalu Tentang (`info`) di bawah.
  - Item adalah `<button class="nav" data-key="nav.<id>">`. Item aktif diberi kelas `on` dan `aria-current="page"`.
- `.pane`, bisa di-scroll, dengan strip seret 28 px di atas. Halaman dibuka dengan `head()`: judul `<h1>` 19 px/500 dan `.sub` 12 px abu.
- Baris `.row`: label, `small` untuk hint, lalu kontrol di kanan. Pemisah bawah garis titik-titik seperti `.rw` di mockup.
- Ukuran, warna, dan jarak lainnya disalin dari CSS S1 di mockup.

**`settings.css`:**
- `@import '../kit/kit.css'`.
- Token `:root`: `--bg`, `--side`, `--field`, `--sel`, `--line`, `--knob`, `--fg`, ditambah `--w`, `--g1`, `--g2`, `--g3` dari kit.
  - Mode gelap (bawaan): `#000`, `#0b0b0b`, `#161616`, `#1c1c1c`, `#2a2a2a`, `#777`, `#fff`.
  - `@media (prefers-color-scheme: light)`: `#fff`, `#f4f4f4`, `#e9e9e9`, `#e4e4e4`, `#d6d6d6`, `#fff`, `#000`. `--w` `#000`, `--g1`/`--g2`/`--g3` = `rgba(0,0,0,.68/.45/.16)`.
- `color-scheme: light dark`. `body` memakai latar `--bg` dan warna `--fg`. `user-select: none`, kecuali di kotak cari.
- **Saklar 30 × 18:**
  - mati: latar `--line`, kenop `--knob`;
  - nyala: latar `--fg`, kenop `--bg`;
  - nonaktif: `opacity .4`.
- **Slider:** track 2 px warna `--line`, bagian terisi `--fg`, thumb bulat 14 px warna `--fg`. Angka di kanan memakai Space Mono 11 px.
- **`.found`:** latar `--sel` yang memudar dalam 1,2 detik.

**`mountSettings`:**
- **Mulai:**
  - Ambil `moduleState()` dan `settings()` bersamaan.
  - Dengarkan `onModuleState` dan `onSettings`.
  - Bangun sidebar sekali, lalu `render()`. Rute awal `{ page: 'general' }`.
- **`render()`** dipanggil saat state, info, atau rute berubah, dan saat isi kotak cari berubah:
  - perbarui teks sidebar, placeholder kotak cari, angka `.n`, `document.title` (= `strings.title`), dan `<html lang>`;
  - catat `data-key` elemen yang sedang fokus dan `scrollTop` pane;
  - jalankan semua `onCleanup` halaman lama, lalu ganti isi pane:
    - kotak cari berisi → hasil pencarian,
    - selain itu → `PAGES[route.page]`, atau `head()` judul bagian saja kalau halamannya belum ada (hanya terjadi di antara Task 4 dan 6);
  - kembalikan fokus ke elemen dengan `data-key` yang sama, lalu kembalikan `scrollTop`.
- **Rute:**
  - `module` dan `add` menandai item Modul di sidebar.
  - Rute `module` untuk modul yang tidak ada atau sudah dicopot → `{ page: 'modules' }`.
- **Pencarian:**
  - Indeks dibangun ulang dari `strings` dan `state.modules` setiap kali `render()`.
  - Hasil adalah tombol `.result` berisi label dan, kalau ada, `small` berisi `where`. Tidak ada hasil → `.note` = `noResults`.
  - Klik hasil:
    - kosongkan kotak cari dan `go(route)`;
    - beri `[data-row=<entry.key>]` kelas `found` selama 1200 ms lewat `env.setTimer`;
    - `scrollIntoView({ block: 'nearest' })` kalau method itu ada.
  - Esc di kotak cari mengosongkannya.
- **Tombol:**
  - Meta+F di mana saja → fokus ke kotak cari dan pilih isinya.
  - Meta+Q → `bridge.quit()`.
  - Cmd+W ditangani menu bawaan macOS (Close Window), bukan halaman.
- **`save(key, pending)`:** kalau `pending` ditolak, tambahkan `<small class="err">` berisi `saveFailed` ke `[data-row=key]`, atau kalau tidak ada, ke induk `[data-key=key]`. Hanya satu `.err` per tempat.

**Kontrol:**
- **`row`:** `<div class="row" data-row=key>`, berisi label, `small` hint, dan kontrol.
- **`toggle`:** `<button role="switch" aria-checked aria-label=label data-key>`. Klik → `onChange(!on)`. Tampilan berubah lewat state yang kembali dari bridge, bukan langsung.
- **`choice`:** `<div role="radiogroup">` berisi `<button role="radio" aria-checked data-key="<key>.<value>">`.
- **`select`:** `<select data-key>` biasa.
- **`slider`:** satu `row` (`data-row=key`) berisi `<input type="range" data-key=key>` dan `<span class="val">`.
  - `input` → perbarui `.val` dan panggil `onInput`.
  - `change` → panggil `onChange`.
- **`button`:** `<button class="btn">`, atau `btn solid` untuk tombol putih (hitam di mode terang). Teks Space Mono 10 px, huruf kapital.

**Halaman:**
- **Umum:**
  - `general.language`: `choice` [`auto` → `languageAuto`, `id` → `languageId`, `en` → `languageEn`]. Pilih → `save(key, bridge.setLanguage(v))`.
  - `general.screen`: `select` berisi `''` → `screenEvery`, lalu setiap nama di `info.screens`.
    - Kalau `info.screen` tidak ada di `info.screens`, tambahkan opsi `fill(screenMissing, { name })` dan hint `screenMissingHint`.
    - Pilih → `bridge.setScreen(v || null)`.
  - `general.login`: `toggle` dengan `on = info.login === 'on'` dan hint `loginHint`.
    - `unavailable` → saklar nonaktif, hint `loginUnavailable`.
    - `needsApproval` → hint `loginNeedsApproval` dan `button('general.loginOpen', loginOpen, …)` → `bridge.openLoginItems()`.
    - Ubah → `bridge.setLaunchAtLogin(on)`.
- **Notifikasi dan Izin:** `head({ title, sub })`, lalu satu `<p class="note">` berisi `note`.
- **Tentang:**
  - `head` dengan judul Tentang.
  - Nama app (`about.name`, 17 px/500).
  - Baris `about.version` dengan nilai `info.version` (Space Mono).
  - `.note` `about.trust`, lalu `.note` `about.later`.

**`main.ts`:** `mountSettings(document.getElementById('settings-root')!, browserSettingsBridge(new URLSearchParams(location.search)), env)`, dengan `env` dari `requestAnimationFrame`, `cancelAnimationFrame`, dan `setTimeout`. Task 7 menambahkan pilihan bridge Tauri.

**`settings.html`:** sama dengan `index.html`, tetapi memakai:
- `<link rel="stylesheet" href="/src/settings/settings.css" />`,
- `<script type="module" src="/src/settings/main.ts">`,
- `<div id="settings-root">`.

**`vite.config.ts`:** `build.rolldownOptions.input = { main: 'index.html', settings: 'settings.html' }`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
// @vitest-environment jsdom
// controls.test.ts
test('a switch reports the flipped value', () => {
  const f = vi.fn(); const t = toggle('k', 'Beranda', false, f);
  expect(t.getAttribute('role')).toBe('switch'); expect(t.getAttribute('aria-checked')).toBe('false');
  t.click(); expect(f).toHaveBeenCalledWith(true); });
test('a slider reports while moving and on release', () => {
  // slider({ key: 'look.bounce', min 0, max 100, step 1, value 100, format: v => `${v} px`, onInput, onChange })
  // input.value = '50' + Event('input') → onInput(50), .val '50 px', onChange belum; Event('change') → onChange(50)
});
test('a choice marks one option', () => { /* value 'auto' → hanya [data-key="k.auto"] aria-checked true; klik 'en' → onChange('en') */ });
// shell.test.ts — memakai mountForTest()
test('opens on Umum, with six sections and the module count', async () => {
  // label .nav: ['Umum','Tampilan notch','Notifikasi','Modul','Izin','Tentang']; .nav.on = Umum; h1 'Umum';
  // [data-key="nav.modules"] .n === '2'
});
test('the sidebar opens each section', async () => { /* klik nav.about → h1 'Tentang', teks memuat 'Versi' dan '0.1.0' */ });
test('choosing a language saves it, and the window follows the new language', async () => {
  // klik [data-key="general.language.en"] → setLanguage('en');
  // emitSettings({ ...TEST_INFO, language: 'en' }); emitModuleState({ ...TEST_STATE, lang: 'en' })
  // → label nav pertama 'General'; document.documentElement.lang 'en'; [data-key="general.language.en"] aria-checked 'true'
});
test('search shows matches and opens the setting', async () => {
  // isi .search 'monitor' + Event('input') → satu .result memuat 'Notch muncul di' dan 'Umum';
  // klik → h1 'Umum'; [data-row="general.screen"] punya kelas found; .search value ''
});
test('a search with no match says so', async () => { /* 'zzz' → teks 'Tidak ada yang cocok.' */ });
test('Escape clears the search', async () => { /* 'bahasa' lalu keydown Escape di .search → value '', h1 'Umum' */ });
test('Cmd+F focuses the search', async () => { /* keydown { key: 'f', metaKey: true } di document → activeElement .search */ });
test('Cmd+Q quits', async () => { /* keydown { key: 'q', metaKey: true } → bridge.quit dipanggil */ });
test('focus stays on a control after a re-render', async () => {
  // focus [data-key="general.language.id"]; emitSettings(TEST_INFO) → activeElement.dataset.key 'general.language.id'
});
test('a failed save says so next to the setting', async () => {
  // setLanguage ditolak → setelah promise selesai, [data-row="general.language"] memuat 'Gagal menyimpan. Coba lagi.'
});
// general.test.ts
test('the screen list offers every screen first', async () => {
  // opsi select: ['Semua layar', 'Built-in Retina Display', 'DELL U2723QE'], value ''
});
test('picking a screen saves it; every screen saves null', async () => { /* 'DELL U2723QE' → setScreen('DELL U2723QE'); '' → setScreen(null) */ });
test('a chosen screen that is not connected stays listed and says so', async () => {
  // info { screen: 'LG UltraFine', screens: ['Built-in Retina Display'] } → opsi terpilih 'LG UltraFine (tidak tersambung)';
  // teks memuat 'Sampai tersambung lagi, notch muncul di semua layar.'
});
test('open at login follows the system state', async () => {
  // login 'on' → saklar aria-checked 'true'; klik → setLaunchAtLogin(false)
  // login 'unavailable' → saklar disabled, teks 'Hanya bisa diatur dari Notching.app yang terpasang.'
  // login 'needsApproval' → klik [data-key="general.loginOpen"] → openLoginItems()
});
```
Badan test yang hanya berupa komentar ditulis dari komentar itu.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/settings` → FAIL

- [ ] **Step 3: Implementasikan semua file sesuai Interfaces dan aturan di atas**

- [ ] **Step 4: Jalankan test dan build**

Run: `npx tsc --noEmit && npm test && npm run build && ls dist/settings.html`
Expected: semua PASS, dan `dist/settings.html` ada.

- [ ] **Step 5: Commit**

`git add settings.html vite.config.ts src/settings && git commit -m "feat(settings): window shell, search, controls and the General, Notifications, Permissions and About pages"`

---

### Task 5: Halaman Modul, halaman tiap modul, dan Tambah modul

**Files:**
- Create: `src/settings/pages/modules.ts`
- Modify: `src/settings/shell.ts` (daftarkan halaman di `PAGES`), `src/settings/settings.css`
- Test: `src/settings/pages/modules.test.ts`

**Interfaces:**
- Consumes: `PageRender`, `PageContext`, kontrol dan `icon` (Task 4), `formatBytes`, `fill`.
- Produces:
```ts
export const modulesPage: PageRender;    // { page: 'modules' }
export const modulePage: PageRender;     // { page: 'module', id }
export const addPage: PageRender;        // { page: 'add' }
export const UNINSTALL_CONFIRM_MS = 4000;
export function moduleIcon(svg: string): HTMLElement;   // <i class="glyph"> dengan --icon = url("data:image/svg+xml,…"); svg kosong → icon('grid')
```

**Aturan:**
- **Ikon modul:**
  - `moduleIcon` memakai `encodeURIComponent(svg)` di dalam `url("data:image/svg+xml,…")`, sebagai mask berwarna `currentColor` seperti `.glyph` di pil.
  - SVG tidak pernah dimasukkan ke DOM, jadi isi file ikon tidak bisa menjalankan apa pun.
  - CSP app sudah mengizinkan `img-src data:`.
- **Halaman Modul:**
  - `head`: judul Modul, `sub` = `fill(summary, { n, size })`.
    - `n` = jumlah modul terpasang.
    - `size` = `formatBytes(jumlah size modul terpasang, lang)`.
    - Di kanan, `button('modules.add', add, …, true)` → `go({ page: 'add' })`.
  - Satu baris `.module` per modul terpasang, dalam urutan katalog:
    - ikon, nama, dan `small` keterangan,
    - `.size` = `formatBytes(size, lang)`,
    - `toggle('module.<id>.on', nama, enabled, …)` → `save(key, bridge.setModuleEnabled(id, on))`,
    - ikon `chev`.
    - Klik di baris, kecuali di saklar → `go({ page: 'module', id })`. Baris punya `data-key="module.<id>"`, `role="button"`, dan `tabindex="0"`. Enter juga membukanya.
  - Kalau tidak ada modul terpasang → `.note` `none`.
- **Halaman satu modul:**
  - Di atas: tombol kembali `data-key="module.back"` (ikon `back` + judul Modul) → `go({ page: 'modules' })`.
  - `head`: ikon modul, nama, `sub` keterangan, dan di kanan saklar yang sama dengan di daftar. `head` punya `data-row="module.<id>"`, supaya hasil pencarian modul menyorotnya.
  - `.note` `noSettings`.
  - Kaki: `.size` = `fill(versionSize, { version, size })`, lalu tombol `module.<id>.uninstall`.
    - Klik pertama: teks berganti `uninstallConfirm`, kelas `confirm`, dan timer `UNINSTALL_CONFIRM_MS` mulai. Saat timer habis, tombol kembali seperti semula.
    - Klik kedua sebelum timer habis → `bridge.uninstallModule(id)`. Kalau berhasil → `go({ page: 'modules' })`. Kalau gagal → `save` menampilkan galat.
    - Timer dibatalkan lewat `onCleanup`.
  - Di bawahnya `.note` kecil `uninstallNote`.
- **Tambah modul:**
  - Tombol kembali seperti di atas.
  - `head`: `addTitle`, `sub` `addSub`.
  - Satu baris per modul yang tidak terpasang: ikon, nama, keterangan, ukuran, dan `button('add.<id>', addOne, …)` → `bridge.reinstallModule(id)`, lalu `go({ page: 'modules' })`.
  - Kalau tidak ada → `.note` `addNone`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
// @vitest-environment jsdom
// modules.test.ts — STATE berisi home (size 136 * 1024) dan system-stat (size 140 * 1024), nama Beranda dan System stat
test('lists installed modules in order, with size and switch', async () => {
  // go modules → baris .module: ['Beranda', 'System stat']; teks memuat '136 KB' dan '140 KB'; sub '2 terpasang · 276 KB'
});
test('switching a module off asks the bridge', async () => { /* klik [data-key="module.home.on"] → setModuleEnabled('home', false) */ });
test('a row opens its module page; its switch does not', async () => {
  // klik saklar → route tetap modules; klik baris home → h1 'Beranda', teks 'Modul ini belum punya pengaturan.', 'Versi 1.0.0 · 136 KB'
});
test('uninstalling asks once more, then returns to the list', async () => {
  // halaman home; klik uninstall → teks 'Yakin? Klik lagi', uninstallModule belum; klik lagi → uninstallModule('home'); route modules
});
test('the confirmation wears off', async () => {
  // klik sekali; timers.advance(4000) → teks 'Copot modul'; klik sekali → uninstallModule belum dipanggil
});
test('a module page whose module is gone falls back to the list', async () => {
  // halaman home; emitModuleState(home installed false) → h1 'Modul'
});
test('Add module lists uninstalled built-ins and adds them back', async () => {
  // home installed false → klik modules.add → h1 'Tambah modul', satu baris Beranda; klik add.home → reinstallModule('home'); route modules
});
test('Add module with nothing to add says so', async () => { /* semua terpasang → 'Semua modul bawaan sudah terpasang.' */ });
test('a search for a module name opens its page', async () => { /* cari 'system' → klik hasil → h1 'System stat' */ });
test('module icons are masks, never markup', async () => {
  // iconSvg '<svg onload="x()"/>' → tidak ada <svg onload> di DOM; .glyph style --icon memuat 'data:image/svg+xml,'
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/settings` → FAIL

- [ ] **Step 3: Implementasikan `pages/modules.ts`, daftarkan di `PAGES`, dan tambahkan gayanya**

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx tsc --noEmit && npm test` → PASS

- [ ] **Step 5: Commit**

`git add src/settings && git commit -m "feat(settings): Modules page, module pages with uninstall, and Add module"`

---

### Task 6: Tampilan notch dengan pratinjau, lalu cek di browser bersama pemilik

**Files:**
- Create: `src/settings/pages/look.ts`, `src/settings/preview.ts`, `src/notch/local-pointer.ts`, `src/notch/notch.css`
- Modify:
  - `src/styles.css`: gaya `.notch-svg`, `.notch-content`, `.notch-pill`, dan keyframe-nya pindah ke `notch.css`, lalu di-`@import`.
  - `src/bridge-browser.ts`: pakai `localPointer`.
  - `src/notch/connect.ts`: parameter `bridge` menyempit.
  - `src/settings/shell.ts`: daftarkan halaman.
  - `src/settings/settings.css`: `@import '../notch/notch.css'` dan gaya pratinjau.
- Test: `src/settings/preview.test.ts`, `src/settings/pages/look.test.ts`, `src/notch/local-pointer.test.ts`

**Interfaces:**
- Consumes: `NotchController`, `mountNotch`, `connect`, `EMPTY_CARD`, `CONFIG_RANGES`, `DEFAULT_CONFIG`, `clampConfig`, `PageRender`.
- Produces:
```ts
// notch/local-pointer.ts — dipindah dari browserBridge
export function localPointer(root: HTMLElement): Pick<Bridge, 'setHitRects' | 'onPointer' | 'onResignKey'> & { dispose(): void };
// notch/connect.ts
export type NotchWiring = Pick<Bridge, 'setHitRects' | 'setPanelKey' | 'onPointer' | 'onResignKey' | 'quit'>;
export function connect(c: NotchController, bridge: NotchWiring, kick: () => void): /* sama seperti sebelumnya */;
// settings/preview.ts
export interface Preview { readonly controller: NotchController; setConfig(c: NotchConfig): void; destroy(): void }
export function mountPreview(box: HTMLElement, config: NotchConfig, env: SettingsEnv, label: string): Preview;
// settings/pages/look.ts
export const lookPage: PageRender;
```

**Aturan:**
- **`localPointer`:** perilaku `mousemove`, `mouseleave`, dan klik di luar dari `browserBridge` dipindah apa adanya. `dispose()` melepas ketiga pendengar.
- **`mountPreview`:**
  - `box` (`.preview`): tinggi 150 px, `overflow: hidden`, radius 10 px, latar `--sel`, sehingga lensa hitam terlihat di kedua tema.
  - Di dalam `box`, buat `.preview-root` 640 × 360 yang diposisikan absolut di tengah (`left: 50%; margin-left: -320px`) tanpa `transform`, supaya koordinat klik tetap cocok.
  - Controller: `notch: null`, `card: EMPTY_CARD`, `config`, `env.setTimer`.
  - `connect(controller, { ...localPointer(root), setPanelKey: async () => {}, quit: async () => {} }, kick)`.
  - `mountNotch` memakai `onSelect` dan `onMore` kosong. `setPill([], null, label)`, sehingga pil hanya berisi ⋯.
  - `view.content` berisi satu `.lab` = `look.preview`.
  - `setConfig` → `controller.setConfig(clampConfig(c))` lalu `kick()`.
  - `destroy` → `view.destroy()`, `wiring.dispose()`, dan `pointer.dispose()`.
- **Halaman Tampilan notch:**
  - `head`: judul bagian.
  - Pratinjau, lalu `small` `previewHint`.
  - Empat `slider`, kunci `look.<nilai>`, dengan rentang dan langkah dari Global Constraints.
    - `format`: kenyal dan kecepatan berupa angka saja; jarak tetesan dan tebal memakai ` px`.
    - Tebal notch diberi hint `thicknessHint`.
  - Nilai awal dari `ctx.state.notch`. Halaman menyimpan `local: NotchConfig`.
    - `onInput` → ubah `local`, lalu `preview.setConfig(local)`.
    - `onChange` → `save(key, bridge.setNotchConfig(local))`.
  - `button('look.reset', reset, …)` → `local = DEFAULT_CONFIG`, `preview.setConfig`, dan `bridge.setNotchConfig(DEFAULT_CONFIG)`.
  - `onCleanup(() => preview.destroy())`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
// @vitest-environment jsdom
// local-pointer.test.ts — jsdom: getBoundingClientRect root = 0, jadi koordinat lokal = clientX/Y
test('reports entering and leaving the hit rects', () => {
  // setHitRects([{ x: 0, y: 0, w: 10, h: 10 }]); mousemove (5,5) → cb({ inside: true, x: 5, y: 5 }); (50,50) → inside false
});
test('a click outside the rects resigns; dispose stops listening', () => { /* klik (50,50) → onResignKey; dispose; klik lagi → tidak */ });
// preview.test.ts
test('hovering the preview lens grows the droplet; a click opens the panel', () => {
  // mountPreview(box, DEFAULT_CONFIG, { raf, caf, setTimer }, 'Pratinjau'); r.runAll(5)
  // mousemove clientX 320, clientY 5 → controller.phase 'hover'; klik di titik yang sama → 'open'
});
test('a new config reshapes the lens', () => {
  // ambil d dari .notch-svg path; setConfig({ ...DEFAULT_CONFIG, thickness: 14 }); r.runAll(600) → d berbeda;
  // controller.targets().H === 14
});
test('destroy leaves nothing behind', () => { /* destroy → box kosong; mousemove → tidak ada error, tidak ada raf baru */ });
// look.test.ts
test('the sliders start at the saved look', async () => {
  // go look → input [data-key^="look."] bernilai ['100','200','9','4'], min/max sesuai CONFIG_RANGES; teks '9 px'
});
test('moving a slider waits for release before saving', async () => {
  // look.bounce: value '50' + input → setNotchConfig belum; change → setNotchConfig({ ...DEFAULT_CONFIG, bounce: 50 })
});
test('arrow keys keep working after each save', async () => {
  // focus look.speed; set value '199' + change; emitModuleState(notch speed 199)
  // → activeElement.dataset.key 'look.speed', value '199'
});
test('reset puts the defaults back', async () => { /* state notch bounce 20 → klik look.reset → setNotchConfig(DEFAULT_CONFIG) */ });
test('thickness says it only shows without a notch', async () => { /* teks memuat 'Hanya terlihat di layar tanpa notch.' */ });
```
Badan test yang hanya berupa komentar ditulis dari komentar itu.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/settings src/notch` → FAIL

- [ ] **Step 3: Implementasikan sesuai Interfaces dan aturan di atas**

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx tsc --noEmit && npm test` → PASS

- [ ] **Step 5: Cek di browser bersama pemilik**

Run: `npm run dev`, lalu buka:
- `http://localhost:1420/settings.html`
- `http://localhost:1420/settings.html?lang=en`
- `http://localhost:1420/`, lalu klik ⋯ di pil (membuka tab pengaturan)

Minta pemilik melihat dan melaporkan:
1. Sidebar berisi enam bagian, dengan kotak cari di atas dan jumlah modul di samping Modul. Bentuknya mirip mockup S1.
2. **Umum:** ganti bahasa → semua teks berganti. Daftar layar berisi dua layar palsu. Buka saat login bisa dinyalakan (palsu di browser).
3. **Tampilan notch:** arahkan kursor ke lensa di pratinjau → tetesan; klik → panel dan pil ⋯. Geser slider → pratinjau langsung berubah. "Kembalikan bawaan" bekerja.
4. **Modul:** daftar, ukuran, saklar, halaman modul, copot dengan konfirmasi, lalu pasang lagi dari "+ Tambah modul".
5. **Cari:** "bahasa", "kenyal", "system", lalu "zzz".
6. Teks Notifikasi, Izin, dan Tentang.
7. **Mode terang dan gelap:** ganti Appearance di System Settings selagi halaman terbuka.

Pemilik yang memutuskan semua soal tampilan dan teks. Terapkan perubahan yang diminta, jalankan test lagi, lalu cek ulang bersama pemilik. Catat di pesan commit bahwa pemilik sudah menyetujui.

- [ ] **Step 6: Commit**

`git add src/settings src/notch src/styles.css src/bridge-browser.ts && git commit -m "feat(settings): Notch look page with a live preview"`

---

### Task 7: Jendela native, perintah pengaturan, dan pilihan layar

**Files:**
- Create: `src-tauri/src/settings_window.rs`, `src-tauri/capabilities/settings.json`, `src/settings/bridge-tauri.ts`
- Modify:
  - `src-tauri/src/lib.rs`: `#[cfg(target_os = "macos")] mod settings_window;`, `.manage(overlay::ConnectedScreens::default())`, dan perintah baru.
  - `src-tauri/src/geometry.rs`, `src-tauri/src/screens.rs`, `src-tauri/src/overlay.rs` (helper test `screen()` diberi `name`), `src-tauri/src/module_commands.rs` (`change` menjadi `pub(crate)`).
  - `src/bridge.ts`: `syncUnlisten` diekspor.
  - `src/settings/main.ts`: memilih `tauriSettingsBridge()` kalau `'__TAURI_INTERNALS__' in window`.
- Test: di dalam `geometry.rs`

**Interfaces:**
- Consumes: `AppCore::{language, screen, set_language, set_notch, set_screen}` (Task 1), `SettingsBridge` dan nama perintahnya (Task 3), `change` dan `MODULE_STATE_EVENT` (rencana 2).
- Produces:
```rust
// geometry.rs
pub fn pick_screens(names: &[&str], choice: Option<&str>) -> Vec<usize>;   // indeks layar yang diberi notch
pub fn centered_origin(screen: Rect, w: f64, h: f64) -> (f64, f64);        // titik kiri-bawah AppKit
// screens.rs
pub struct ScreenInfo { /* field lama */ pub name: String }                // NSScreen.localizedName
// overlay.rs
#[derive(Default)] pub struct ConnectedScreens(pub std::sync::Mutex<Vec<String>>);  // nama unik, urutan NSScreen
// settings_window.rs
pub const SETTINGS_LABEL: &str = "settings";
pub const SETTINGS_EVENT: &str = "notching://settings";
pub const SETTINGS_SIZE: (f64, f64) = (680.0, 600.0);
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)] #[serde(rename_all = "camelCase")]
pub enum LoginItem { On, Off, NeedsApproval, Unavailable }
#[derive(Clone, Debug, PartialEq, serde::Serialize)] #[serde(rename_all = "camelCase")]
pub struct SettingsDto { pub language: LanguageSetting, pub screen: Option<String>, pub screens: Vec<String>,
                         pub login: LoginItem, pub version: String }
pub fn settings_dto(app: &AppHandle) -> SettingsDto;
pub fn emit_settings(app: &AppHandle);
#[tauri::command] pub async fn open_settings(app: AppHandle, window: WebviewWindow) -> Result<(), String>;
#[tauri::command] pub fn get_settings(app: AppHandle) -> SettingsDto;
#[tauri::command] pub fn set_language(app: AppHandle, core: State<CoreState>, language: LanguageSetting) -> Result<(), String>;
#[tauri::command] pub fn set_notch_config(app: AppHandle, core: State<CoreState>, config: NotchConfig) -> Result<(), String>;
#[tauri::command] pub fn set_screen(app: AppHandle, core: State<CoreState>, name: Option<String>) -> Result<(), String>;
```
```ts
// settings/bridge-tauri.ts
export function tauriSettingsBridge(): SettingsBridge;
```

**Aturan:**
- **`pick_screens`:**
  - `None` → semua indeks.
  - `Some(nama)` → indeks layar dengan nama itu. Dua monitor bernama sama → keduanya.
  - Tidak ada yang cocok → semua indeks, sehingga notch tidak pernah hilang dari semua layar.
- **`apply_screens`:**
  1. Simpan nama unik semua layar ke `ConnectedScreens`.
  2. Baca `screen()` dari `CoreState`, lalu lepaskan lock. Jangan memegang dua lock sekaligus.
  3. Hanya layar hasil `pick_screens` yang ditempatkan. Layar lain tertinggal di `previous` dan diparkir oleh kode yang sudah ada.
  4. Terakhir, `emit_settings(app)`.
- **`settings_dto`:**
  - `language` dan `screen` dari `CoreState`.
  - `screens` dari `ConnectedScreens`.
  - `login` = `LoginItem::Unavailable` sampai Task 8.
  - `version` = `app.package_info().version.to_string()`.
- **Perintah perubahan:**
  - Pakai `change` dari `module_commands.rs`, sehingga state modul tersimpan lalu disiarkan.
  - Setelah itu panggil `emit_settings`.
  - `set_screen` juga menjalankan `rebuild_overlays` lewat `app.run_on_main_thread`.
- **`open_settings`:**
  - **Jendela `settings` sudah ada:** `unminimize`, `show`, lalu `set_focus`. Selesai.
  - **Belum ada:**
    - `app.set_activation_policy(ActivationPolicy::Regular)`.
    - Bangun `WebviewWindowBuilder::new(&app, SETTINGS_LABEL, WebviewUrl::App("settings.html".into()))` dengan:
      - `.title("Notching")`,
      - `.inner_size(680, 600)` dan `.min_inner_size(600, 480)`,
      - `.title_bar_style(TitleBarStyle::Overlay)` dan `.hidden_title(true)`,
      - `.visible(false)`,
      - `.on_page_load`: saat `PageLoadEvent::Finished` → `show()` dan `set_focus()`.
    - Posisi: kalau label `window` pemanggil ada di `Overlays`, hitung `centered_origin(frame layarnya, 680, 600)`. Lalu, di `run_on_main_thread`, panggil `setFrameOrigin` pada `NSWindow` dari `ns_window()`. Kalau tidak ada, pakai `.center()`.
    - `on_window_event`: `WindowEvent::Destroyed` → `set_activation_policy(ActivationPolicy::Accessory)`.
    - Kalau build gagal → kembali ke `Accessory`, lalu kembalikan galatnya.
  - Perintah ini `async`, karena membuat jendela dari perintah sinkron bisa macet.
- **`capabilities/settings.json`:** `{ "identifier": "settings", "windows": ["settings"], "permissions": ["core:default", "core:window:allow-start-dragging"] }`.
- **`tauriSettingsBridge`:**
  - `invoke('get_module_state')` dan `listen('notching://module-state')`.
  - `invoke('get_settings')` dan `listen('notching://settings')`.
  - Setter:
    - `invoke('set_language', { language })`, `invoke('set_notch_config', { config })`, `invoke('set_screen', { name })`,
    - `invoke('set_launch_at_login', { on })`, `invoke('open_login_items')`,
    - `invoke('set_module_enabled', { id, enabled })`, `invoke('uninstall_module', { id })`, `invoke('reinstall_module', { id })`,
    - `invoke('quit_app')`.
  - Dua perintah buka saat login baru ada di Task 8. Sebelum itu, saklarnya nonaktif karena `login` = `unavailable`.

- [ ] **Step 1: Tulis test yang gagal**

```rust
// geometry.rs
#[test] fn every_screen_when_nothing_is_chosen() { assert_eq!(pick_screens(&["A", "B"], None), vec![0, 1]); }
#[test] fn only_the_chosen_screen() { assert_eq!(pick_screens(&["A", "B"], Some("B")), vec![1]); }
#[test] fn two_screens_with_the_same_name_both_count() { assert_eq!(pick_screens(&["A", "A", "B"], Some("A")), vec![0, 1]); }
#[test] fn a_missing_screen_falls_back_to_every_screen() { assert_eq!(pick_screens(&["A", "B"], Some("C")), vec![0, 1]); }
#[test] fn a_window_is_centred_on_its_screen() {
    let s = Rect { x: -1920.0, y: 0.0, w: 1920.0, h: 1080.0 };
    assert_eq!(centered_origin(s, 680.0, 600.0), (-1300.0, 240.0)); }
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml -- geometry::` → FAIL

- [ ] **Step 3: Implementasikan semua sesuai Interfaces dan aturan di atas**

- [ ] **Step 4: Jalankan semua test**

Run: `npx tsc --noEmit && npm test && cargo test --manifest-path src-tauri/Cargo.toml` → PASS

- [ ] **Step 5: Cek di perangkat bersama pemilik**

Run: `npm run tauri dev`

Minta pemilik mencoba dan melaporkan:
1. Klik ⋯ di notch MacBook → panel menutup, jendela pengaturan muncul di tengah layar MacBook, dan ikon Notching ada di Dock dan Cmd+Tab. Ikonnya masih ikon bawaan Tauri, karena logo Notching belum ada. Ulangi dari monitor → jendela yang sama pindah ke depan, tidak ada jendela kedua.
2. Tutup dengan tombol merah, buka lagi, lalu tutup dengan Cmd+W. Ulangi tiga kali → app tetap jalan, dan ikon Dock hilang setiap kali jendela ditutup.
3. Ganti Appearance di System Settings selagi jendela terbuka → jendela ikut terang atau gelap.
4. Bahasa English → jendela langsung berganti. Buka panel notch → pil dan kartu dalam bahasa Inggris. Kembalikan ke Otomatis.
5. **Tampilan notch:**
   - Geser Tebal notch → pratinjau langsung berubah. Lepas → lensa di monitor ikut berubah.
   - Ubah Jarak tetesan, lalu hover notch MacBook → tetesan lebih dalam.
   - Ubah Kenyal dan Kecepatan, lalu buka panel → terasa berbeda.
   - Keluar (Cmd+Q), lalu jalankan lagi → nilainya tetap. Kembalikan bawaan.
6. **Layar:**
   - Pilih monitor → notch MacBook tidak bereaksi saat di-hover. Pilih Semua layar → kembali.
   - Pilih monitor, lalu cabut kabelnya → notch muncul di MacBook, dan pilihan tertulis "(tidak tersambung)". Pasang lagi → hanya di monitor. Kembalikan ke Semua layar.
7. **Modul:**
   - Matikan System stat → ikonnya hilang dari pil.
   - Copot → folder hilang. Pelaksana mengecek dengan `ls ~/Library/Application\ Support/id.web.notching/modules`.
   - Modul itu muncul di Tambah modul. Pasang → kembali menyala.
8. **Cari:** Cmd+F, ketik "kenyal" → hasil; klik → baris Kenyal disorot. Tempel teks dengan Cmd+V di kotak cari → berhasil.
9. Cmd+Q dari jendela pengaturan → app keluar.
10. **Perilaku lama tetap:**
    - klik di luar dan Esc menutup panel,
    - menu bar dekat tengah bisa diklik,
    - Esc setelah klik di dalam kartu menutup panel, dan ketikan kembali ke TextEdit.

Lalu, oleh pelaksana:
- **CPU:** jendela pengaturan terbuka dan diam 10 detik. Jalankan `for i in $(seq 10); do ps -o %cpu= -p $(pgrep -x notching); sleep 1; done` dan `ps -Ao %cpu,comm | grep -i webcontent`. Semua di bawah 1,0.
- **`settings.json`:** isinya memuat `notch` dan `screen` dengan nilai yang dipilih.
- **Build rilis:** jalankan `npm run tauri build -- --bundles app`, buka `.app`-nya, lalu pemilik membuka pengaturan lewat ⋯. Jendela harus terisi, yang membuktikan CSP, multi-page, dan capability jalan di build rilis.

Kalau jendela kosong di build rilis tapi jalan di dev, curigai `rolldownOptions.input` dan CSP lebih dulu.

- [ ] **Step 6: Commit**

`git add src-tauri/src src-tauri/capabilities/settings.json src/settings src/bridge.ts && git commit -m "feat(native): settings window, settings commands and the one-screen choice"`

---

### Task 8: Buka saat login

**Files:**
- Create: `src-tauri/src/login_item.rs`
- Modify:
  - `src-tauri/Cargo.toml`: `objc2-service-management = { version = "0.3", default-features = false, features = ["std", "objc2", "objc2-foundation", "SMAppService"] }` di bagian macOS.
  - `src-tauri/src/lib.rs`: `#[cfg(target_os = "macos")] mod login_item;` dan dua perintah baru.
  - `src-tauri/src/settings_window.rs`: `settings_dto.login` = `login_item::state()`.
- Test: di dalam `login_item.rs`

**Interfaces:**
- Consumes: `LoginItem`, `emit_settings` (Task 7).
- Produces:
```rust
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ServiceStatus { NotRegistered, Enabled, RequiresApproval, NotFound }
pub fn login_state(status: ServiceStatus, bundled: bool) -> LoginItem;
pub fn is_bundled(exe: &std::path::Path) -> bool;    // …/<Nama>.app/Contents/MacOS/<exe>
pub fn state() -> LoginItem;                          // SMAppService::mainAppService().status()
pub fn set(on: bool) -> Result<(), String>;
#[tauri::command] pub fn set_launch_at_login(app: AppHandle, on: bool) -> Result<(), String>;   // set, lalu emit_settings
#[tauri::command] pub fn open_login_items();                                                    // SMAppService::openSystemSettingsLoginItems()
```

**Aturan:**
- **`login_state`:**
  - Tidak di dalam bundle → `Unavailable`. Dari `tauri dev`, `mainAppService` tidak menunjuk ke app yang benar.
  - `Enabled` → `On`.
  - `RequiresApproval` → `NeedsApproval`.
  - `NotRegistered` dan `NotFound` → `Off`.
- **`set(on)`:**
  - Tidak di dalam bundle → `Err`.
  - `on` → `registerAndReturnError`, hanya kalau status belum `Enabled`.
  - `!on` → `unregisterAndReturnError`, hanya kalau status `Enabled` atau `RequiresApproval`.
  - Galat → `localizedDescription` dari `NSError`.
- `is_bundled` memakai `std::env::current_exe()` di `state()` dan `set()`.

- [ ] **Step 1: Tulis test yang gagal**

```rust
#[test] fn outside_an_app_bundle_it_is_unavailable() {
    assert_eq!(login_state(ServiceStatus::Enabled, false), LoginItem::Unavailable); }
#[test] fn the_system_status_maps_to_the_switch() {
    assert_eq!(login_state(ServiceStatus::Enabled, true), LoginItem::On);
    assert_eq!(login_state(ServiceStatus::RequiresApproval, true), LoginItem::NeedsApproval);
    assert_eq!(login_state(ServiceStatus::NotRegistered, true), LoginItem::Off);
    assert_eq!(login_state(ServiceStatus::NotFound, true), LoginItem::Off); }
#[test] fn knows_an_app_bundle_from_a_dev_build() {
    assert!(is_bundled(Path::new("/Applications/Notching.app/Contents/MacOS/notching")));
    assert!(!is_bundled(Path::new("/Users/x/dev/notch/src-tauri/target/debug/notching"))); }
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml -- login_item::` → FAIL

- [ ] **Step 3: Tambah dependensi, lalu implementasikan**

Run: `(cd src-tauri && cargo tree -d | grep objc2 || true)`
Expected: tidak ada dua versi `objc2`, `objc2-foundation`, atau `objc2-app-kit`.

- [ ] **Step 4: Jalankan semua test**

Run: `npx tsc --noEmit && npm test && cargo test --manifest-path src-tauri/Cargo.toml` → PASS

- [ ] **Step 5: Cek di perangkat bersama pemilik**

1. Di `npm run tauri dev`: saklar "Buka saat login" nonaktif, dengan teks "Hanya bisa diatur dari Notching.app yang terpasang."
2. Jalankan `npm run tauri build -- --bundles app`.
3. Tanyakan pemilik apakah `Notching.app` boleh disalin ke `/Applications`. Sebelum menyalin, cek dulu apakah sudah ada salinan lama di sana.
4. Buka `/Applications/Notching.app`, buka pengaturan, lalu nyalakan "Buka saat login". Pemilik melihat Notching di System Settings → General → Login Items.
5. Pemilik logout lalu login lagi, kapan pun ia siap → Notching jalan sendiri.
6. Matikan saklar → Notching hilang dari Login Items.
7. Kalau macOS meminta persetujuan → teks "macOS menunggu persetujuanmu di Login Items." dan tombol "Buka Login Items" membuka halaman itu.

Catat: app ini ditandatangani lokal. Setiap build baru bisa membuat macOS menganggapnya app berbeda, sehingga item login mungkin perlu dinyalakan ulang setelah memperbarui app. Ini terkait keputusan tanda tangan digital di spec bagian 9.

- [ ] **Step 6: Commit**

`git add src-tauri/src src-tauri/Cargo.toml src-tauri/Cargo.lock && git commit -m "feat(native): open at login through SMAppService"`

---

### Task 9: Verifikasi akhir di perangkat

**Files:**
- Create: `docs/superpowers/verification/2026-10-28-notching-3-settings.md`, dengan format seperti verifikasi rencana 2.

- [ ] **Step 1: Jalankan semua test dan catat jumlahnya**

Run: `npx tsc --noEmit && npm test && npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: semua PASS. Catat jumlahnya (awal: 100 web, 50 Rust).

- [ ] **Step 2: Build rilis, lalu catat ukuran**

Run: `npm run tauri build -- --bundles app && du -sh src-tauri/target/release/bundle/macos/Notching.app dist/assets`

Bandingkan dengan 4,4 MB di rencana 2.

- [ ] **Step 3: Ukur CPU dari build rilis**

Gunakan `pgrep -x notching` dan `ps -Ao %cpu,comm | grep -i webcontent`, 10 sampel per keadaan. Catat semuanya.
1. **Diam, jendela pengaturan tertutup** → semua di bawah 1,0.
2. **Jendela pengaturan terbuka dan diam** → semua di bawah 1,0.
3. **Menggeser slider di pengaturan** → catat angkanya, tanpa batas keras.
4. **10 detik setelah jendela ditutup** → semua di bawah 1,0, dan jumlah proses WebContent kembali seperti sebelum jendela dibuka.

- [ ] **Step 4: Checklist bersama pemilik, tulis hasilnya di file verifikasi**

1. ⋯ membuka satu jendela di tengah layar yang diklik, dengan ikon di Dock dan Cmd+Tab. Ikonnya hilang saat jendela ditutup.
2. Buka-tutup berulang (tombol merah, Cmd+W, ⋯ dua kali) tidak pernah membuat jendela kedua atau menghentikan app. Cmd+Q dari jendela menutup app.
3. Mode terang dan gelap mengikuti macOS.
4. Ganti bahasa mengubah jendela, pil, dan kartu sekaligus.
5. Keempat slider: pratinjau langsung berubah, notch sungguhan berubah saat slider dilepas, dan nilainya bertahan setelah app dimulai ulang.
6. Layar: hanya monitor, hanya MacBook, dan semua layar. Monitor dicabut saat terpilih → notch pindah ke semua layar, lalu kembali saat monitor dipasang lagi.
7. Modul: nyala/mati, copot dengan konfirmasi, dan pasang lagi lewat Tambah modul. Ikon pil dan folder modul aktif ikut berubah.
8. Pencarian menemukan pengaturan dan nama modul, dan baris yang dituju disorot.
9. Buka saat login: login berikutnya menjalankan Notching.
10. Perilaku rencana 1 dan 2 tetap ada:
    - menu bar dekat tengah bisa diklik,
    - klik di luar dan Esc menutup panel,
    - kartu terakhir diingat,
    - System stat berhenti membaca setelah panel ditutup,
    - layar penuh tetap bisa dipakai.

Di kolom catatan, tulis "Dilaporkan pemilik" untuk setiap poin yang dicek pemilik.

- [ ] **Step 5: Perbaiki temuan dengan `superpowers:systematic-debugging`, lalu ulangi langkah yang gagal**

- [ ] **Step 6: Commit**

`git add docs/superpowers/verification/2026-10-28-notching-3-settings.md && git commit -m "docs: verification notes for the settings window"`

Merge ke `main` hanya setelah pemilik memintanya.
