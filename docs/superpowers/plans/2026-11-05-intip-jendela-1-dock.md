# Intip jendela, rencana 1: alat, Pengaturan, intip dan klik Dock

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alat latar "Intip jendela" yang dipasang dari Katalog. Rencana ini mencakup tahap 1 dan 2 desain: intip dari Dock (gambar semua jendela app, tombol jendela, mengintip) dan klik ikon Dock (minimize semua atau munculkan semua), lengkap dengan pengaturannya di Pintasan.

**Architecture:** Aturan murni (urutan jendela, rencana klik, mesin tekan Dock, letak panel, cache gambar) ada di `peek_rules.rs` dan dites tanpa AppKit. Sisi macOS dipecah per tugas:
- `ax.rs` mendapat fungsi Aksesibilitas baru,
- `peek_windows.rs` mengurus daftar dan aksi jendela,
- `peek_capture.rs` mengambil gambar,
- `peek_dock.rs` mendengar kursor di Dock,
- `peek_tap.rs` menahan klik di Dock,
- `peek_service.rs` menyatukan panel, perintah, izin, dan pengaturan.

Dua halaman web baru: `peek.html`, kartu intip yang bisa diklik, dan `peek-stage.html`, lapisan redup saat mengintip yang tidak menerima klik.

**Tech Stack:** Rust (Tauri 2, tauri-nspanel, objc2 0.6 / objc2-* 0.3, FFI ApplicationServices dan CoreGraphics), TypeScript tanpa framework, Vitest + jsdom, `cargo test --lib`.

**Spec:** `docs/superpowers/specs/2026-11-05-intip-jendela-design.md`. Prototipe: `docs/superpowers/specs/2026-11-05-intip-jendela-mockups/prototipe.html`. Pengalih jendela (tahap 3) punya rencana sendiri nanti. Rencana ini tidak menyentuh ⌘Tab.

## Global Constraints

- macOS 13 ke atas (`minimumSystemVersion` 13.0). ScreenCaptureKit untuk gambar hanya di macOS 14 ke atas.
- CPU 0,0% saat diam. Tidak ada polling. Gambar diambil hanya selama panel terbuka, dan sekali tepat sebelum Notching me-minimize jendela.
- Gambar jendela hanya di memori. Tidak pernah ditulis ke disk dan tidak dikirim ke mana pun.
- Panel Notching tidak pernah ditutup (`close`), hanya disembunyikan (`order_out`). Menutup panel nspanel membuat app crash (`NSRangeException`).
- Tanpa izin Aksesibilitas, atau saat alat mati: Dock bekerja persis seperti biasa.
- Menyeret ikon Dock untuk menyusun ulang dan menahan klik untuk menu tetap bekerja.
- Fungsi tidak resmi macOS untuk gambar jendela yang di-minimize (pilihan pemilik). Kalau gagal: gambar terakhir di memori, lalu ikon app dan judul. Kegagalan dicatat di log sekali per jalannya app.
- Notching tidak mengubah setelan Dock macOS.
- Paket `window-peek` tidak langsung terpasang, juga bagi pengguna yang memperbarui app.
- Teks persis seperti tabel desain bagian 4 dan 9. Kedua bahasa (id, en).
- Commit memakai `git -c user.email=216042476+HamdaniAsril@users.noreply.github.com commit`. Tidak ada push tanpa izin pemilik.

## Review Focus

1. **Dock dimulai ulang** (`killall Dock`, mengganti setelan Dock): pengamat harus menempel lagi ke proses Dock yang baru, tanpa app dibuka ulang. Ditangani di Task 9: pemberitahuan app diluncurkan untuk `com.apple.dock`, plus uji di Mac.
2. **Aksi pada jendela yang sudah hilang** (app keluar sendiri atau jendela ditutup dari luar saat panel terbuka): tombol tidak boleh panik atau macet. Panel digambar ulang tanpa jendela itu, dan menutup sendiri kalau app sudah tidak jalan. Test di Task 5 (`find_window` None) dan Task 8 (kartu hilang dari tampilan baru).
3. **App dengan banyak jendela** (misalnya 20): panel tidak boleh keluar layar. Gambar-gambar turun ke baris berikutnya, dan lebar panel dibatasi layar. Test di Task 5 (`peek_frame` menjepit ukuran) dan Task 8 (`.thumbs` membungkus).
4. **Klik tahan dan seret pada ikon app yang sedang di depan:** tidak boleh me-minimize. Tekanan diteruskan ke Dock. Test di Task 5 (`DockPress`).
5. **Jendela tanpa judul** (beberapa app memberi judul kosong): kartu memakai nama app. Test di Task 8.

---

## Struktur file

**Rust (`src-tauri/src/`)**
- Baru:
  - `peek_rules.rs`: tipe dan aturan murni.
  - `peek_windows.rs`: daftar dan aksi jendela.
  - `peek_capture.rs`: gambar jendela.
  - `peek_dock.rs`: pengamat Dock.
  - `peek_tap.rs`: event tap klik Dock.
  - `peek_service.rs`: panel, perintah, sinkronisasi.
- Ubah:
  - `ax.rs`, `modules/manifest.rs`, `modules/store.rs`,
  - `settings.rs`, `app_core.rs`, `settings_window.rs`,
  - `tools.rs`, `cut_service.rs` (konstanta izin jadi `pub`),
  - `lib.rs`, `Cargo.toml`.

**Paket:** `modules/window-peek/`, berisi `manifest.json`, `icon.svg`, `locales/id.json`, `locales/en.json`, `package.test.ts`, ditambah `modules/index.json`.

**Web:**
- Baru:
  - `peek.html`, `peek-stage.html`,
  - `src/peek/main.ts`, `src/peek/view.ts`, `src/peek/peek.css`,
  - `src/peek/stage.ts`, `src/peek/stage.css`,
  - tesnya di `src/peek/*.test.ts`.
- Ubah:
  - `vite.config.ts`,
  - `src/modules/types.ts`, `src/notch/test-helpers.ts`, `src/bridge-browser.ts`,
  - `src/settings/{types,bridge-tauri,bridge-browser,test-helpers,search}.ts`,
  - `src/settings/pages/modules.ts`, `src/i18n/{id,en}.json`, `src/settings/changelog.ts`.

---

### Task 1: Paket yang tidak langsung terpasang

**Files:**
- Modify: `src-tauri/src/modules/manifest.rs`, `src-tauri/src/modules/store.rs`, `src-tauri/src/settings.rs`, `src/bridge-browser.ts` (fungsi `catalog`)
- Test: `src-tauri/src/modules/store.rs` (mod tests), `src-tauri/src/modules/manifest.rs` (mod tests)

**Interfaces:**
- Produces:
  - `Manifest.opt_in: bool`. Di JSON namanya `"optIn"`, bawaan `false`.
  - `Settings.installed_opt_in: Vec<String>`, dengan `#[serde(deserialize_with = "lenient")]` dan bawaan kosong.
  - Paket `optIn` terpasang hanya kalau id-nya ada di `installed_opt_in`.

- [ ] **Step 1: Write the failing tests** di `store.rs`. Bantu dengan paket uji ber-manifest `"optIn": true` seperti paket uji lain di file itu.

```rust
#[test]
fn an_opt_in_package_waits_to_be_installed() {
    let (store, _d) = store_with(&[("a", GOOD), ("p", OPT_IN)]);
    let mut s = Settings::default();
    let p = store.list(&s, Lang::Id).into_iter().find(|e| e.manifest.id == "p").unwrap();
    assert!(!p.installed && !p.enabled);
    store.sync(&s);
    assert!(!store.active_dir().join("p").exists());
    store.reinstall("p", &mut s).unwrap();
    assert_eq!(s.installed_opt_in, vec!["p".to_string()]);
    assert!(store.list(&s, Lang::Id).iter().find(|e| e.manifest.id == "p").unwrap().installed);
    store.uninstall("p", &mut s).unwrap();
    assert!(s.installed_opt_in.is_empty());
    assert!(!store.list(&s, Lang::Id).iter().find(|e| e.manifest.id == "p").unwrap().installed);
}
```

Juga di `manifest.rs`: `"optIn": true` terbaca sebagai `opt_in == true`, dan tanpa field itu `false`.

- [ ] **Step 2:** `cd src-tauri && cargo test --lib opt_in`. Expected: FAIL, karena field `opt_in` dan `installed_opt_in` belum ada.
- [ ] **Step 3:** Implementasi:
  - Field baru di `Manifest` dan `Settings` (bawaan `Vec::new()`).
  - `removed(settings, id)` menjadi `removed(settings, id, opt_in: bool)`. Untuk opt-in: `!settings.installed_opt_in.contains(id)`. Selain itu aturan lama.
  - `sync` dan `list` membaca `opt_in` dari manifest bundel. Tambahkan `fn opt_in(&self, id) -> bool` mirip `is_module`.
  - `reinstall`: untuk paket opt-in, id ditambahkan ke `installed_opt_in`.
  - `uninstall`: id dibuang dari `installed_opt_in`.
  - `catalog()` di `src/bridge-browser.ts`: paket ber-`optIn` tampil belum terpasang, kecuali ada di daftar terpasang yang diberikan.
- [ ] **Step 4:** `cargo test --lib` dan `npm test`. Expected: semua lulus.
- [ ] **Step 5:** Commit: `feat(modules): packages can wait in the Katalog until installed (optIn)`.

### Task 2: Paket `window-peek`

**Files:**
- Create: `modules/window-peek/manifest.json`, `icon.svg`, `locales/id.json`, `locales/en.json`, `package.test.ts`
- Modify: `modules/index.json` (setelah `"window-keys"`), `src-tauri/src/modules/manifest.rs` (`Capability::Peek`, `#[serde(rename = "peek")]`)

**Interfaces:**
- Produces: id paket `window-peek` dan kemampuan `peek`. Manifest:

```json
{
  "id": "window-peek", "version": "1.0.0", "category": "window", "icon": "icon.svg", "optIn": true,
  "permissions": ["accessibility", "screen-recording"],
  "capabilities": ["peek", "notify"], "tool": "peek",
  "notifications": [{ "id": "access", "on": true, "sound": false }]
}
```

- [ ] **Step 1: Write the failing test** `modules/window-peek/package.test.ts`, mencontoh `modules/window-keys/package.test.ts`:
  - ikon `viewBox="0 0 24 24"` dengan `stroke=`,
  - paket ini tepat setelah `window-keys` dan sebelum `waktu`,
  - `[entry, card, action, tool]` sama dengan `[null, null, null, true]`,
  - `permissions` sama dengan `['accessibility', 'screen-recording']`,
  - `installed === false` di `catalog('id', [])`,
  - nama `'Intip jendela'` dan `'Window peek'`.
- [ ] **Step 2:** `npx vitest run modules/window-peek`. Expected: FAIL (paket belum ada).
- [ ] **Step 3:** Buat berkasnya.
  - Locale id: `name` "Intip jendela", `shortName` "Intip", `description` "Lihat semua jendela app dari Dock dan dari pengalih jendela", `channels.access` "Izin", `notice.access` dengan `title` "Intip jendela butuh izin Aksesibilitas" dan `detail` "Buka Pengaturan → Izin".
  - Locale en: "Window peek", "Peek", "See every window of an app from the Dock and the window switcher", "Access", lalu "Window peek needs Accessibility access" / "Open Settings → Permissions".
  - Ikon: garis 24×24, dua persegi bertumpuk dengan satu garis Dock di bawah, gaya ikon `window-keys`.
- [ ] **Step 4:** `npm test` dan `cd src-tauri && cargo test --lib`. Expected: lulus. Termasuk tes manifest yang membaca semua paket bundel, kalau ada.
- [ ] **Step 5:** Commit: `feat(window-peek): the Intip jendela package, waiting in the Katalog`.

### Task 3: Pengaturan Intip jendela tersimpan

**Files:**
- Create: `src-tauri/src/peek_rules.rs`, bagian pengaturan saja.
- Modify:
  - `src-tauri/src/settings.rs`: field `window_peek: crate::peek_rules::PeekSettings`, `#[serde(deserialize_with = "lenient")]`.
  - `src-tauri/src/app_core.rs`:
    - `ModuleState.peek`,
    - `fn peek_settings(&self) -> PeekSettings`,
    - `fn set_peek_settings(&mut self, p: PeekSettings) -> Result<(), CoreError>`.
  - `src-tauri/src/settings_window.rs`: perintah `set_peek_settings`.
  - `src-tauri/src/lib.rs`: `mod peek_rules;`, perintah didaftarkan.
  - TS: `src/modules/types.ts`, `src/notch/test-helpers.ts`, `src/bridge-browser.ts`, `src/settings/types.ts`, `src/settings/bridge-tauri.ts`, `src/settings/bridge-browser.ts`, `src/settings/test-helpers.ts`.
- Test: `peek_rules.rs` (mod tests) dan `app_core.rs` (mod tests).

**Interfaces:**
- Produces (Rust, `serde(rename_all = "camelCase")`, enum `lowercase` dengan `#[serde(other)]` di nilai bawaan):

```rust
pub struct PeekSettings { pub dock: bool, pub dock_click: DockClick, pub card: CardColor, pub material: Material, pub minimized: bool }
pub enum DockClick { Toggle /* default */, Mac }
pub enum CardColor { System /* default */, Light, Dark }
pub enum Material { Solid /* default */, Glass }
```

  Bawaan: `dock: true`, `dock_click: Toggle`, `card: System`, `material: Solid`, `minimized: true`. Field yang hilang atau rusak memakai nilai bawaannya masing-masing.
- Produces (TS):
  - `interface PeekSettings { dock: boolean; dockClick: 'toggle' | 'mac'; card: 'system' | 'light' | 'dark'; material: 'solid' | 'glass'; minimized: boolean }`,
  - `ModuleState.peek: PeekSettings`,
  - `SettingsBridge.setPeekSettings(p: PeekSettings): Promise<void>`, dengan `invoke('set_peek_settings', { settings: p })`.
  - Perintah Rust `set_peek_settings(app, core, settings: PeekSettings)` menyimpan lewat `change(...)`, lalu memanggil `crate::peek_service::sync(&app)`. Sampai Task 11, isinya cukup fungsi kosong.

- [ ] **Step 1: Write the failing tests**:

```rust
#[test]
fn peek_settings_default_and_survive_bad_fields() {
    let p: PeekSettings = serde_json::from_str(r#"{"dock":false,"dockClick":"nonsense","card":"light"}"#).unwrap();
    assert_eq!(p, PeekSettings { dock: false, dock_click: DockClick::Toggle, card: CardColor::Light, ..PeekSettings::default() });
    assert_eq!(serde_json::to_value(PeekSettings::default()).unwrap(),
        serde_json::json!({"dock":true,"dockClick":"toggle","card":"system","material":"solid","minimized":true}));
}
```

  Ditambah di `app_core.rs` `peek_settings_are_kept`: simpan `material: Glass`, buka ulang, nilainya sama, dan `state().peek` ikut.
- [ ] **Step 2:** `cargo test --lib peek`. Expected: FAIL (tipe belum ada).
- [ ] **Step 3:** Implementasi sesuai Interfaces.
- [ ] **Step 4:** `cargo test --lib`, `npx tsc --noEmit`, dan `npm test`. Expected: lulus.
- [ ] **Step 5:** Commit: `feat(window-peek): its settings, saved with their defaults`.

### Task 4: Baris Intip jendela di Pintasan

**Files:**
- Modify:
  - `src/settings/pages/modules.ts`:
    - di `toolFold`, cabang `m.id === 'window-peek'` memakai `peekSettingsBox(ctx)`,
    - `MODULE_SETTINGS['window-peek']`.
  - `src/settings/types.ts`:
    - `SettingsInfo.dockMinimizeToApp: boolean`,
    - `SettingsBridge.openDockSettings(): Promise<void>`.
  - Bridges dan test helpers, untuk pasangan fungsi yang sama.
  - `src/settings/search.ts`.
  - `src/i18n/{id,en}.json`, termasuk teks Izin.
  - Rust:
    - `settings_window.rs`:
      - info `dock_minimize_to_app`, dibaca dengan `CFPreferencesCopyAppValue("minimize-to-application", "com.apple.dock")`, `false` kalau tidak ada,
      - perintah `open_dock_settings`, yang membuka `x-apple.systempreferences:com.apple.Desktop-Settings.extension`.
- Test: `src/settings/pages/shortcuts.test.ts` dan `src/settings/search.test.ts`.

**Interfaces:**
- Consumes: `ModuleState.peek` dan `setPeekSettings` (Task 3).
- Produces: `export function peekSettingsBox(ctx: PageContext): HTMLElement`. Isinya baris dengan `data-row` berikut, urut:
  1. `tool.window-peek.access`: baris Aksesibilitas yang sudah ada (`accessRow`).
  2. `tool.window-peek.screen`: baris baru Perekaman Layar, dari `info.screenRecording` dan `openScreenRecordingSettings`.
  3. `peek.dock`: toggle.
  4. `peek.dockClick`: `choice`, dengan opsi `toggle` dan `mac`.
  5. `peek.dockHint`: hanya kalau `dockClick === 'toggle'` dan `!info.dockMinimizeToApp`. Teks petunjuk, plus tombol `peek.dockSettings` yang memanggil `openDockSettings`.
  6. `peek.card`: `choice`, opsi `system`, `light`, `dark`.
  7. `peek.material`: `choice`, opsi `solid` dan `glass`.
  8. `peek.minimized`: toggle.

  Setiap perubahan memanggil `setPeekSettings({ ...ctx.state.peek, <field>: v })` lewat `ctx.save(key, …)`.

Teks (`settingsWindow.peek`):

| Kunci | id | en |
|---|---|---|
| dock / dockHint | Intip dari Dock / Arahkan kursor ke ikon app di Dock. | Peek from the Dock / Point at an app's icon in the Dock. |
| dockClick / dockClickHint | Klik ikon Dock / Klik sekali menyembunyikan semua jendela app yang sedang di depan, klik lagi memunculkan semuanya. | Click a Dock icon / One click hides every window of the app in front, another brings them all back. |
| dockClickToggle / dockClickMac | Minimize / munculkan / Bawaan macOS | Minimize / bring back / macOS default |
| minimizeTip / minimizeTipButton | Supaya jendela masuk ke ikon app-nya, nyalakan "Minimize jendela ke ikon app" di Pengaturan Sistem. / Buka Desktop & Dock | To send windows into their app's icon, turn on "Minimize windows into application icon" in System Settings. / Open Desktop & Dock |
| card / cardSystem / cardLight / cardDark | Warna kartu / Sistem / Terang / Gelap | Card colour / System / Light / Dark |
| material / materialHint / materialSolid / materialGlass | Bahan / Pekat: kartu tidak tembus pandang. Liquid glass: yang di belakangnya terlihat samar. / Pekat / Liquid glass | Material / Solid: the card is opaque. Liquid glass: what is behind shows through, blurred. / Solid / Liquid glass |
| minimized / minimizedHint | Jendela yang diminimize / Ikut ditampilkan, dengan tanda. | Minimized windows / Shown too, marked. |
| screenRecordingHint (di `tools`) | Tanpa izin ini, gambar jendela diganti ikon app. | Without it, windows show as their app's icon. |

Halaman Izin:
- `accessibilityHint` id menjadi "Untuk mengunci keyboard, memotong file, mengatur jendela, dan mengintip jendela."; en: "To lock the keyboard, cut files, arrange windows and peek at windows."
- `screenRecordingHint` id menjadi "Untuk mengambil gambar layar dan gambar jendela."; en: "To capture the screen and pictures of windows."

- [ ] **Step 1: Write the failing tests** di `shortcuts.test.ts`, dengan `moduleInfo('window-peek', { tool: true, permissions: ['accessibility', 'screen-recording'] })` terpasang:
  - membuka fold menampilkan baris di atas dalam urutan itu,
  - `peek.dockHint` tidak ada saat `dockMinimizeToApp: true`, dan ada saat `false`,
  - klik opsi "Liquid glass" memanggil `setPeekSettings` dengan `material: 'glass'` dan field lain tetap,
  - klik "Bawaan macOS" menghilangkan `peek.dockHint` setelah state baru dipancarkan,
  - teks bahasa Inggris "Card colour".

  Di `search.test.ts`: "liquid" menemukan `peek.material` dengan route `{ page: 'shortcuts' }`, hanya saat `window-peek` terpasang.
- [ ] **Step 2:** `npx vitest run src/settings`. Expected: FAIL.
- [ ] **Step 3:** Implementasi. Gunakan pola `accessRow`, `row`, `choice`, dan `toggle` yang sudah ada. Entri pencarian dibuat untuk `peek.dock`, `peek.dockClick`, `peek.card`, `peek.material`, dan `peek.minimized` dengan kata kunci baru `keywords.peek` ("intip jendela dock kartu terang gelap kaca liquid glass minimize" / "peek window dock card light dark glass liquid minimize").
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`, `cargo test --lib`. Expected: lulus.
- [ ] **Step 5:** Commit: `feat(settings): Intip jendela's row on Pintasan with every setting, its permissions and the Dock tip`.

### Task 5: Aturan murni

**Files:**
- Modify: `src-tauri/src/peek_rules.rs`
- Test: `src-tauri/src/peek_rules.rs` (mod tests)

**Interfaces:**
- Produces:

```rust
#[derive(Clone, Debug, PartialEq)] pub struct WinInfo { pub id: u32, pub pid: i32, pub title: String, pub minimized: bool, pub frame: Rect }
pub struct AxWin { pub id: u32, pub title: String, pub minimized: bool, pub frame: Rect }   // from Accessibility, AX order
pub fn merge(pid: i32, ax: Vec<AxWin>, z: &[crate::notify::WindowBox]) -> Vec<WinInfo>
pub fn find_window(list: &[WinInfo], id: u32) -> Option<&WinInfo>
pub enum ClickPlan { Pass, MinimizeAll(Vec<u32>), ShowAll(Vec<u32>) }
pub fn click_plan(pid: i32, windows: &[WinInfo], front_pid: Option<i32>) -> ClickPlan
pub enum PressEvent { Down { on_app: Option<i32>, at: (f64, f64), ms: u64 }, Dragged { at: (f64, f64) }, Up { ms: u64 }, Timer { ms: u64 } }
pub enum PressAction { Pass, Swallow, Replay, Act(i32) }
#[derive(Default)] pub struct DockPress { /* private */ }
impl DockPress { pub fn on(&mut self, ev: PressEvent) -> PressAction }
pub const LONG_PRESS_MS: u64 = 350;
pub const DRAG_SLOP: f64 = 4.0;
pub enum DockEdge { Bottom, Left, Right }
pub fn dock_edge(icon: Rect, screen: Rect) -> DockEdge
pub fn peek_frame(icon: Rect, edge: DockEdge, size: (f64, f64), visible: Rect) -> Rect
pub struct PictureCache { /* LRU */ }
impl PictureCache { pub const CAP: usize = 64; pub fn put(&mut self, id: u32, png: Arc<Vec<u8>>); pub fn get(&mut self, id: u32) -> Option<Arc<Vec<u8>>>; pub fn forget_missing(&mut self, alive: &[u32]) }
pub fn fit(w: f64, h: f64, max_w: f64, max_h: f64) -> (f64, f64)
#[derive(Deserialize, Clone, Copy, PartialEq, Debug)] #[serde(rename_all = "lowercase")]
pub enum WindowAct { Minimize, Restore, Close, Quit }   // dari halaman kartu (Task 8, Task 11)
```

Semua koordinat memakai koordinat global CG (asal kiri atas), sama dengan `notify::window_list`.

Aturan yang tidak ditentukan oleh signature:
- **`merge`:**
  - Jendela yang tidak di-minimize diurutkan menurut posisinya di `z`, yaitu urutan depan ke belakang, dicari lewat `number == id`. Jendela yang tidak ada di `z` (Space lain) dibuang.
  - Jendela yang di-minimize menyusul di belakang, dalam urutan AX.
  - Judul kosong dibiarkan kosong. Halaman yang menggantinya dengan nama app.
- **`click_plan`:**
  - Tanpa jendela sama sekali: `Pass`.
  - `front_pid == Some(pid)` dan ada jendela yang tidak di-minimize: `MinimizeAll(id yang terlihat)`.
  - Selain itu: `ShowAll(semua id dalam urutan merge)`.
- **`DockPress`:**
  - `Down` dengan `on_app: Some(pid)`: `Swallow`, simpan titik dan waktu. `Down` dengan `None`: `Pass`.
  - Saat menahan:
    - `Dragged` lebih dari `DRAG_SLOP` dari titik awal: `Replay`, lalu terus `Pass` sampai `Up` berikutnya.
    - `Timer` dengan `ms - down >= LONG_PRESS_MS`: `Replay`, lalu `Pass` sampai `Up`.
    - `Up`: `Act(pid)`, lalu kembali diam.
  - Saat diam: `Up`, `Dragged`, dan `Timer` menghasilkan `Pass`.
- **`dock_edge`:** sisi layar yang paling dekat dengan pusat ikon.
- **`peek_frame`:**
  - Panel menempel 10 pt dari ikon ke arah tengah layar (di atas untuk `Bottom`, di kanan untuk `Left`, di kiri untuk `Right`).
  - Panel dipusatkan pada ikon di sumbu Dock, lalu dijepit ke `visible` dengan tepi 12 pt.
  - Ukuran yang lebih besar dari `visible` dikurangi 24 pt, lalu dijepit.
- **`fit`:** memperkecil dengan perbandingan tetap supaya muat. Tidak pernah memperbesar.

- [ ] **Step 1: Write the failing tests**, satu per aturan di atas, dengan nilai konkret:
  - `merge_orders_front_to_back_then_minimized_and_drops_other_spaces`,
  - `click_plan_minimizes_the_front_app_and_shows_any_other`: pid 7 di depan dengan [a terlihat, b terlihat, c minimize] menghasilkan `MinimizeAll([a, b])`. Kalau `front_pid` 9, hasilnya `ShowAll([a, b, c])`. Daftar kosong menghasilkan `Pass`.
  - `a_short_click_acts_and_is_swallowed`: Down(Some(7)) menghasilkan Swallow, Up menghasilkan Act(7).
  - `a_drag_replays_the_press_for_the_dock`: Dragged 5 pt menghasilkan Replay, Dragged berikutnya Pass, Up Pass.
  - `a_long_press_replays_for_the_menu`: Timer 350 menghasilkan Replay, Up Pass.
  - `a_press_off_any_app_icon_passes`,
  - `dock_edge_finds_bottom_left_right`,
  - `peek_frame_sits_above_a_bottom_dock_and_stays_on_screen`: ikon di x=5 menjepit ke x=12. Ukuran 4000×300 di layar 1440 lebar menjadi lebar 1416.
  - `peek_frame_sits_beside_side_docks`,
  - `picture_cache_drops_the_least_recently_used_beyond_cap`,
  - `picture_cache_forgets_closed_windows`,
  - `fit_scales_down_never_up`,
  - `find_window_of_a_closed_window_is_none` (Review Focus 2).
- [ ] **Step 2:** `cargo test --lib peek_rules`. Expected: FAIL.
- [ ] **Step 3:** Implementasi.
- [ ] **Step 4:** `cargo test --lib peek_rules`. Expected: lulus.
- [ ] **Step 5:** Commit: `feat(window-peek): the rules for window order, Dock clicks and panel placement`.

### Task 6: Aksesibilitas dan inti jendela

**Files:**
- Modify: `src-tauri/src/ax.rs`
- Create: `src-tauri/src/peek_windows.rs`
- Test: `cargo test --lib` (tidak ada tes AppKit), lalu cek di Task 12.

**Interfaces:**
- Produces di `ax.rs`:

```rust
pub fn windows(app: &Cf) -> Vec<Cf>                 // kAXWindowsAttribute
pub fn is_standard(window: &Cf) -> bool              // AXSubrole == "AXStandardWindow"
pub fn minimized(window: &Cf) -> Option<bool>         // "AXMinimized"
pub fn set_minimized(window: &Cf, on: bool) -> bool
pub fn raise(window: &Cf) -> bool                     // AXUIElementPerformAction "AXRaise"
pub fn press_close(window: &Cf) -> bool               // "AXCloseButton" lalu "AXPress"
pub fn window_id(window: &Cf) -> Option<u32>          // _AXUIElementGetWindow (ApplicationServices, tidak resmi)
pub fn children(element: &Cf) -> Vec<Cf>
pub fn role(element: &Cf) -> Option<String>
pub fn subrole(element: &Cf) -> Option<String>
pub fn url(element: &Cf) -> Option<String>            // "AXURL", file URL sebagai path
pub fn element_at(app: &Cf, x: f64, y: f64) -> Option<Cf>
pub fn selected_children(element: &Cf) -> Vec<Cf>     // "AXSelectedChildren"
```

- Produces di `peek_windows.rs`:

```rust
pub fn app_windows(pid: i32) -> Vec<WinInfo>           // ax::windows → AxWin (standar saja, dengan id) → peek_rules::merge(pid, …, &notify::window_list())
pub fn front_pid() -> Option<i32>                       // jendela layer 0 terdepan dari notify::window_list() yang bukan milik Notching
pub fn minimize(pid: i32, id: u32) -> bool
pub fn restore(pid: i32, id: u32) -> bool               // set_minimized(false)
pub fn raise(pid: i32, id: u32) -> bool                 // restore bila perlu, raise, lalu aktifkan app (NSRunningApplication activate)
pub fn show_all(pid: i32, ids: &[u32])                  // restore semua, raise dari belakang ke depan supaya urutan tetap, lalu aktifkan app
pub fn close(pid: i32, id: u32) -> bool
pub fn quit(pid: i32) -> bool                           // NSRunningApplication terminate (sopan, bukan forceTerminate)
```

Setiap fungsi mencari elemen AX jendela berdasarkan `window_id`. Kalau tidak ketemu, hasilnya `false` dan tidak ada yang terjadi. Pemanggilan AX memakai batas waktu 0,5 detik yang sudah ada.

- [ ] **Step 1:** Tambahkan FFI dan fungsi `ax.rs`, mengikuti gaya `copy`, `string`, dan `frame` di file itu. `window_id` mendeklarasikan `fn _AXUIElementGetWindow(element: *const c_void, out: *mut u32) -> i32;` di blok `ApplicationServices`.
- [ ] **Step 2:** Tulis `peek_windows.rs` sesuai Interfaces. `mod peek_windows;` didaftarkan dengan `#[cfg(target_os = "macos")]`.
- [ ] **Step 3:** `cargo test --lib` dan `cargo clippy --lib`. Expected: lulus, tanpa peringatan baru di file ini.
- [ ] **Step 4:** Commit: `feat(window-peek): list an app's windows and minimize, restore, raise, close or quit them`.

### Task 7: Gambar jendela

**Files:**
- Create: `src-tauri/src/peek_capture.rs`
- Modify: `src-tauri/Cargo.toml` (tambah `objc2-screen-capture-kit = { version = "0.3", default-features = false, features = ["std", "block2", "objc2-core-graphics", "SCScreenshotManager", "SCShareableContent", "SCStream", "SCError"] }`; dan fitur `CGImage` sudah ada)
- Test: `peek_rules::fit` sudah dites di Task 5. Cek di Mac di Task 12.

**Interfaces:**
- Consumes: `peek_rules::{fit, PictureCache}`.
- Produces:

```rust
pub enum PictureSize { Thumb, Full }   // Thumb: muat 368×236 (2× kartu 184×118); Full: ukuran jendela
pub fn picture(id: u32, minimized: bool, size: PictureSize) -> Option<Arc<Vec<u8>>>   // PNG
pub fn remember_before_minimize(id: u32)                                         // diambil sebelum Notching me-minimize
pub fn forget(alive: &[u32])
```

Urutan cadangan, yang tidak ditentukan oleh signature:
- **Terlihat, macOS 14 ke atas:** ScreenCaptureKit, `SCShareableContent` untuk mendapat `SCWindow` dengan `windowID == id`, lalu `SCScreenshotManager captureImageWithFilter:configuration:` dengan `SCContentFilter initWithDesktopIndependentWindow:`. Lebar dan tinggi diambil dari `fit`. Ditunggu lewat channel dengan batas waktu 1 detik.
- **Terlihat, macOS 13, atau ScreenCaptureKit gagal:** cara tidak resmi di bawah.
- **Di-minimize, atau semua cara di atas gagal:** fungsi tidak resmi dari SkyLight, `CGSMainConnectionID() -> i32` dan `CGSHWCaptureWindowList(cid: i32, ids: *const u32, count: u32, options: u32) -> CFArrayRef` (CGImage). Opsi `(1 << 11) | (1 << 9)` (`kCGSCaptureIgnoreGlobalClipShape | kCGSWindowCaptureNominalResolution`). Dimuat dengan `dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight")` dan `dlsym`, supaya kalau simbolnya hilang app tidak gagal dibuka. Gagal: `eprintln!("notching: window picture through SkyLight failed")` sekali per jalannya app.
- **Masih gagal:** gambar di cache. Kalau tidak ada: `None`, dan halaman memakai ikon app.
- Gambar yang berhasil disimpan di cache: `Thumb` per id. `Full` tidak disimpan.
- PNG dibuat lewat `NSBitmapImageRep initWithCGImage:` lalu `representationUsingType:PNG`, seperti `shelf_service::image_png`.

- [ ] **Step 1:** Implementasi sesuai urutan di atas. Panggilan berat dilakukan di luar thread utama (perintah Tauri async).
- [ ] **Step 2:** `cargo build` dan `cargo test --lib`. Expected: lulus.
- [ ] **Step 3:** Commit: `feat(window-peek): window pictures through ScreenCaptureKit and SkyLight, kept in memory`.

### Task 8: Halaman kartu intip dan lapisan intip

**Files:**
- Create:
  - `peek.html` (root `#peek-root`, script `/src/peek/main.ts`),
  - `peek-stage.html` (root `#stage-root`, script `/src/peek/stage.ts`),
  - `src/peek/view.ts`, `src/peek/main.ts`, `src/peek/peek.css`, `src/peek/stage.ts`, `src/peek/stage.css`.
- Modify: `vite.config.ts`, tambah input `peek: "peek.html"` dan `peekStage: "peek-stage.html"`. Perbarui komentar jumlah halaman.
- Test: `src/peek/view.test.ts` dan `src/peek/stage.test.ts` (jsdom).

**Interfaces:**
- Produces (TS, dan bentuk JSON yang dikirim Rust di Task 11):

```ts
export interface PeekWindow { id: number; title: string; minimized: boolean; front: boolean }
export interface PeekView { app: string; icon: string | null; windows: PeekWindow[]; card: 'system' | 'light' | 'dark'; material: 'solid' | 'glass'; accent: string; lang: Lang }
export type WindowAct = 'minimize' | 'restore' | 'close' | 'quit';
export interface PeekCalls { size(w: number, h: number): void; pointer(inside: boolean): void; open(id: number): void; act(id: number, act: WindowAct): void; hover(id: number | null): void; picture(id: number): Promise<string | null> }
export function renderPeek(root: HTMLElement, v: PeekView, calls: PeekCalls): void
export interface StageView { frame: { x: number; y: number; w: number; h: number }; minimized: boolean; picture: string | null; accent: string; lang: Lang }
export function renderStage(root: HTMLElement, v: StageView | null): void
```

`main.ts` menghubungkan `PeekCalls` ke `invoke`, yaitu `peek_size`, `peek_pointer`, `peek_open`, `peek_act`, `peek_hover`, dan `peek_picture { id, full: false }`. Ia juga mendengarkan `notching://peek`, ditambah `peek_view` saat dimuat. `stage.ts` mendengarkan `notching://peek-stage`.

Aturan tampilan:
- **Huruf dan token:** `peek.css` mengimpor `../kit/volt-tokens.css`, seperti halaman lain.
- **CSS dari prototipe:** salin blok `#peek` sampai `.empty` (baris 96–117) dan blok v2 (baris 176–211): variabel warna kartu dan bahan, `.acts`, dan `.ab`. Abaikan aturan `#screen`, wallpaper, dan `.th .x`.
- **Kelas di `#peek`:**
  - `card-light` atau `card-dark`. `system` mengikuti `prefers-color-scheme`.
  - `mat-glass` atau `mat-solid`.
- **Liquid glass:** di halaman, latar `mat-glass` berupa tint dari prototipe di atas latar transparan. Buramnya dibuat native (Task 11).
- **Aksen:** dari `applyAccent(document.documentElement, v.accent)`. Kartu terang memakai `--v-acc-deep`.
- **Kartu gambar:**
  - Isinya ikon app (`v.icon`) dan judul dulu. Gambar dari `calls.picture(id)` menggantikannya begitu ada.
  - Judul kosong diganti `v.app`.
- **Tanda:** "Di depan" untuk `front`, "Diminimize" untuk `minimized`. Bahasa Inggris: "In front" dan "Minimized".
- **Kepala:** nama app dan `{n} jendela` / `{n} window(s)`.
- **Kosong:** "Tidak ada jendela yang terbuka" / "No open windows".
- **Tombol:**
  - `minimize` atau `restore` (untuk yang di-minimize), `close`, dan `quit`. Ikon SVG sama dengan prototipe (`ICON`), dengan `title` dan `aria-label` dari desain bagian 9: "Minimize", "Pulihkan", "Tutup jendela", "Keluar dari {app}".
  - Klik tombol memanggil `calls.act` dan tidak memanggil `open`.
- **Klik kartu:** `calls.open(id)`.
- **Kursor:**
  - Masuk ke kartu: `calls.hover(id)`. Keluar: `calls.hover(null)`.
  - Masuk ke `#peek`: `calls.pointer(true)`. Keluar: `calls.pointer(false)`.
- **Ukuran:** `.thumbs` memakai `flex-wrap: wrap`. Setelah digambar, ukuran `#peek` dikirim lewat `calls.size(w, h)`.
- **Lapisan intip:**
  - Seluruh panel `rgba(0,0,0,.55)`.
  - Gambar di `frame` dengan cincin aksen 3 px dan sudut 11 px.
  - Untuk `minimized`, label "DIMINIMIZE" / "MINIMIZED" dengan gaya `.win.ghost::after` di prototipe.
  - `null` mengosongkan lapisan.

- [ ] **Step 1: Write the failing tests** (`view.test.ts`):
  - tiga jendela, dengan satu `front` dan satu `minimized`: tanda yang benar, tombol pertama jendela minimize berlabel "Pulihkan",
  - klik tombol close memanggil `act(id, 'close')` dan bukan `open`,
  - klik kartu memanggil `open(id)`,
  - judul kosong tampil sebagai nama app (Review Focus 5),
  - tampilan baru tanpa jendela 2 menghilangkan kartunya (Review Focus 2),
  - nol jendela menampilkan "Tidak ada jendela yang terbuka",
  - 20 jendela: `.thumbs` ber-`flex-wrap: wrap` (Review Focus 3), dan `size` dipanggil sekali per gambar ulang,
  - `card: 'light'` dan `material: 'glass'` memberi kelas `card-light mat-glass`,
  - bahasa Inggris: "2 windows" dan "Quit Word".

  `stage.test.ts`: `frame` menjadi posisi gambar, label minimize muncul hanya untuk `minimized`, dan `null` mengosongkan lapisan.
- [ ] **Step 2:** `npx vitest run src/peek`. Expected: FAIL.
- [ ] **Step 3:** Implementasi.
- [ ] **Step 4:** `npm test` dan `npx tsc --noEmit`. Expected: lulus.
- [ ] **Step 5:** Commit: `feat(window-peek): the peek card and the peek layer pages`.

### Task 9: Mendengar kursor di Dock

**Files:**
- Create: `src-tauri/src/peek_dock.rs`
- Test: cek di Mac di Task 12.

**Interfaces:**
- Produces:

```rust
pub struct DockItem { pub pid: Option<i32>, pub name: String, pub frame: Rect /* CG global */ }
pub fn start(on_hover: fn(Option<DockItem>))   // pasang pengamat; main thread
pub fn stop()
pub fn dock_pid() -> Option<i32>
pub fn item_at(x: f64, y: f64) -> Option<DockItem>   // aman dari thread mana pun (dipakai event tap)
```

Cara kerja:
- Cari proses `com.apple.dock` lewat `NSRunningApplication`. Dari elemen AX app-nya, ambil anak pertama ber-role `AXList`.
- Pasang `AXObserverCreate` dengan notifikasi `AXSelectedChildrenChanged` di list itu. Sumber run loop-nya di run loop utama.
- **Callback:**
  - `selected_children(list)` kosong: `on_hover(None)`.
  - Ada item dengan subrole `AXApplicationDockItem`: `on_hover(Some(item))`. App-nya dicari dengan mencocokkan `url` dengan `bundleURL` dari `NSWorkspace.runningApplications`. App yang tidak jalan mendapat `pid: None`. Frame dari `ax::frame`.
- **Dock dimulai ulang** (Review Focus 1): pengamat `NSWorkspaceDidLaunchApplicationNotification` untuk bundle `com.apple.dock` memanggil `stop()` lalu memasang lagi. `eprintln!("notching: dock watch attached to pid {pid}")` setiap kali.
- **`item_at`:** `ax::element_at` pada elemen app Dock. Hasilnya diterima hanya kalau subrole-nya `AXApplicationDockItem`.

- [ ] **Step 1:** Implementasi, dengan FFI `AXObserverCreate`, `AXObserverAddNotification`, `AXObserverGetRunLoopSource`, dan `CFRunLoopAddSource` di `ax.rs` (`pub struct Observer`, `Drop` melepasnya).
- [ ] **Step 2:** `cargo build` dan `cargo clippy --lib`. Expected: lulus.
- [ ] **Step 3:** Commit: `feat(window-peek): hear which Dock icon the pointer is on, and follow a restarted Dock`.

### Task 10: Klik ikon Dock

**Files:**
- Create: `src-tauri/src/peek_tap.rs`
- Modify: `src-tauri/src/cut_service.rs`, supaya `ACCESS_CHANGED` menjadi `pub(crate)`.

**Interfaces:**
- Consumes:
  - `peek_rules::{DockPress, PressEvent, PressAction, click_plan, ClickPlan}`,
  - `peek_dock::item_at`,
  - `peek_windows::{app_windows, front_pid, minimize, show_all}`,
  - `peek_capture::remember_before_minimize`.
- Produces:

```rust
pub fn sync(want: bool)   // pasang atau lepas tap; aman dari thread mana pun
```

Cara kerja:
- **Tap:** satu tap sesi (`HEAD_INSERT`, bisa menahan) di thread sendiri, mencontoh `cut_service::Tap`. Mask: `LeftMouseDown | LeftMouseUp | LeftMouseDragged`.
- **Event milik Notching** ditandai `FIELD_USER_DATA = MARK` (`0x6e63_706b`, "ncpk") dan langsung diteruskan.
- **`Down`:**
  - Setiap klik pada ikon app di Dock menyembunyikan panel intip lewat `peek_service::hide()`, apa pun hasilnya.
  - `on_app` diisi hanya kalau semua ini benar: ada `item_at` dengan `pid: Some(pid)`, `app_windows(pid)` tidak kosong, dan pengaturan `dock_click == Toggle`.
  - Bersamaan dengan `Swallow` dipasang timer run loop `LONG_PRESS_MS`, yang mengirim `Timer`.
- **`Replay`:** buat ulang mouse down di titik awal dengan `CGEventCreateMouseEvent`, tandai `MARK`, kirim dengan `CGEventPost(kCGSessionEventTap)`, lalu teruskan event saat itu.
- **`Act(pid)`:** di thread lain, `click_plan(pid, &app_windows(pid), front_pid())`.
  - `MinimizeAll(ids)`: untuk setiap id, `remember_before_minimize(id)` lalu `minimize`.
  - `ShowAll(ids)`: `show_all`.
  - `Pass`: kirim ulang down dan up bertanda, supaya Dock menjalankan klik biasa.
  - Panel intip disembunyikan lewat `peek_service::hide()`.
- **Tap mati otomatis** (`kCGEventTapDisabledByTimeout` / `ByUserInput`): aktifkan lagi seperti `cut_service`.

- [ ] **Step 1:** Implementasi.
- [ ] **Step 2:** `cargo build`, `cargo test --lib`, dan `cargo clippy --lib`. Expected: lulus.
- [ ] **Step 3:** Commit: `feat(window-peek): a short click on a Dock icon minimizes or brings back all its windows`.

### Task 11: Layanan, panel, dan sambungan

**Files:**
- Create: `src-tauri/src/peek_service.rs`
- Modify:
  - `src-tauri/src/lib.rs`: modul, perintah, dan `peek_service::start(app.handle())` setelah `cut_service::start`.
  - `src-tauri/src/tools.rs`: `module_changed` memanggil `peek_service::sync` untuk `window-peek`. `settings_opened` juga.
  - `src/settings/changelog.ts`: item 0.1.4.

**Interfaces:**
- Consumes: semua tugas sebelumnya.
- Produces:
  - **Perintah Tauri:**
    - `peek_view(window) -> Option<PeekViewDto>`,
    - `peek_size(width: f64, height: f64)`,
    - `peek_pointer(inside: bool)`,
    - `peek_open(id: u32)`,
    - `peek_act(id: u32, act: WindowAct)`,
    - `peek_hover(id: Option<u32>)`,
    - `async peek_picture(id: u32, full: bool) -> Option<String>` (data URL `image/png;base64`),
    - `open_dock_settings`.
  - **Fungsi:** `pub fn sync(app: &AppHandle)`, `pub fn hide()`, `pub fn start(app: &AppHandle)`.
  - **Event:** `notching://peek` (PeekViewDto) ke label `peek`, dan `notching://peek-stage` (StageViewDto atau null) ke label `peek-stage`.

Aturan:
- **`sync`:**
  - Alat terpasang dan menyala, dan `keyclean_tap::trusted(false)`:
    - `peek_dock::start` kalau `settings.dock`,
    - `peek_tap::sync(dock_click == Toggle)`.
  - Selain itu: semua dilepas dan panel disembunyikan.
  - `start` mendaftarkan pengamat `ACCESS_CHANGED` yang memanggil `sync`, dengan pola `observe` di `cut_service`.
- **Waktu, di thread utama** (dengan nomor generasi supaya timer lama tidak berlaku):
  - Kursor masuk ikon app yang jalan: panel tampil setelah 350 ms. Kalau panel sudah tampil, isinya langsung diganti.
  - Kursor keluar dari ikon dan panel: panel disembunyikan setelah 220 ms.
  - App yang tidak jalan: tidak ada panel, Dock sendiri yang menampilkan nama.
- **Panel:**
  - Label `peek`: `PanelBuilder`, mencontoh `shot_pick::create`, dengan level 26, non-activating, `accept_first_mouse`, transparan, dan tanpa bayangan.
  - Label `peek-stage`: level 25, `set_ignores_mouse_events(true)`, dan seukuran layar ikon.
  - Keduanya dibuat sekali, lalu hanya ditampilkan dan disembunyikan.
- **Ukuran:** `peek_size` menghitung `peek_frame(item.frame, dock_edge(item.frame, layar), (w, h), visibleFrame layar)` dalam koordinat CG, lalu mengubahnya ke frame AppKit untuk panel.
- **Bahan:**
  - `Glass`: `set_effects`, dengan `Effect::HudWindow` untuk kartu gelap dan `Effect::Popover` untuk terang, `EffectState::Active`, radius 20. Di macOS 26 boleh memakai `NSGlassEffectView`.
  - `Solid`: `set_effects(None)`.
  - Tema jendela: `None` untuk Sistem, `Light` atau `Dark` untuk pilihan lain.
- **Isi PeekViewDto:**
  - `app_windows(pid)`, tanpa yang di-minimize kalau `minimized == false`,
  - `front` diisi untuk id jendela pertama yang terlihat bila `front_pid() == Some(pid)`,
  - `icon` dari `NSRunningApplication.icon` sebagai PNG data URL,
  - `accent` dari pengaturan,
  - `lang`.
- **`peek_act`:**
  - `minimize`: `remember_before_minimize` lalu `minimize`.
  - `restore`, `close`: sesuai namanya.
  - `quit`: `quit(pid)`.
  - Setelah aksi: kirim `PeekViewDto` baru. Kalau app sudah tidak jalan, `hide()`.
  - Jendela yang tidak ditemukan: tidak terjadi apa-apa, lalu tampilan baru dikirim.
- **`peek_open`:** `raise`, lalu `hide()`.
- **`peek_hover(Some(id))`:** `peek_capture::picture(id, minimized, PictureSize::Full)`, lalu StageViewDto dengan frame relatif ke layar. `None`: kirim null dan sembunyikan stage.
- **Tanpa izin:**
  - Saat kursor di Dock tidak ada apa-apa, karena pengamat tidak terpasang. Notching tidak bisa tahu alatnya sedang dipakai.
  - Saat alat dinyalakan atau dipasang tanpa Aksesibilitas, `keyclean_tap::trusted(true)` dipanggil lewat jalur yang sudah ada di `tools::module_changed`. Notch juga menampilkan notifikasi saluran `access` (teks dari locale paket), paling sering sekali per menit, dengan cara yang sama seperti `win_service`.
- **Cache:** `peek_capture::forget` dipanggil dengan id yang masih ada setiap kali panel disembunyikan.
- **Changelog:** item 0.1.4.
  - id: "Intip jendela (pasang dari Katalog): arahkan kursor ke ikon Dock untuk melihat semua jendela app, termasuk yang di-minimize, dan klik ikon Dock untuk me-minimize atau memunculkan semuanya."
  - en: "Window peek (install it from the Catalog): point at a Dock icon to see every window of the app, minimized ones too, and click the icon to minimize or bring them all back."

- [ ] **Step 1:** Implementasi.
- [ ] **Step 2:** `cargo test --lib`, `npm test`, `npx tsc --noEmit`, dan `cargo clippy --lib`. Expected: lulus, tanpa peringatan baru.
- [ ] **Step 3:** Commit: `feat(window-peek): the peek panels, their commands and the wiring`.

### Task 12: Build uji, cek di Mac, dan catatan verifikasi

**Files:**
- Create: `docs/superpowers/verification/2026-11-05-intip-jendela-1.md`

- [ ] **Step 1:**
  - `npx tauri build --bundles app`. Expected: lulus.
  - Cadangkan `settings.json` pemilik ke folder sementara sesi.
  - Tutup Notching di `/Applications`.
  - Jalankan `target/release/bundle/macos/Notching.app/Contents/MacOS/notching`, dengan log ke file.
- [ ] **Step 2:** CPU saat diam selama 60 detik (`ps -o %cpu=` per detik), dengan alat terpasang dan menyala. Expected: rata-rata 0,00%.
- [ ] **Step 3:** Pemilik mencoba, lalu setiap langkah dicocokkan dengan log:
  1. pasang dari Katalog,
  2. contoh tiga file Word,
  3. mengintip jendela yang di-minimize,
  4. tombol –, ×, ⏻,
  5. klik ikon Word dua kali,
  6. menyeret ikon Dock dan menahan klik,
  7. Dock di samping dan Dock sembunyi otomatis,
  8. `killall Dock`,
  9. dua layar,
  10. tanpa izin Perekaman Layar,
  11. Bahan Liquid glass terang dan gelap.

  Catat juga waktu CPU total selama pengujian (`ps -o time=` di awal dan akhir).
- [ ] **Step 4:** Tutup build uji, lalu buka lagi `/Applications/Notching.app`. Tulis catatan verifikasi dengan pola `2026-11-05-shelf-buka-saat-diseret.md`: yang dibangun, keputusan penulis, test otomatis, tabel langkah dengan bukti log, CPU, dan yang belum diuji.
- [ ] **Step 5:** Commit: `docs(superpowers): verification note for Intip jendela, plan 1`.
