# Fokus jendela: rencana pengerjaan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alat latar "Fokus jendela" yang dipasang dari Katalog. ⌃⌥F membuat semua yang ada di belakang jendela aktif menjadi blur. Fokus ikut pindah saat pengguna pindah, ada intipan sepertiga atas jendela di bawah kursor, dan pengguna bisa memfokuskan dua jendela.

**Architecture:**
- Aturan murni ada di `focus_rules.rs` dan dites tanpa AppKit: siapa yang difokuskan, jendela mana yang diintip, lubang intipan, dan kadar gelap.
- `focus_layer.rs` adalah panel AppKit asli, satu per layar. Polanya mengikuti `sensor.rs`, tanpa webview. Isinya `NSVisualEffectView` (`behindWindow`), lapisan gelap, dan mask untuk lubang intipan. Panel diurutkan tepat di bawah jendela fokus dengan `orderWindow:relativeTo:`.
- `focus_service.rs` menyatukan semuanya: shortcut, pemberitahuan NSWorkspace, observer Aksesibilitas, intipan, klik, seret, status di notch, dan izin.

**Tech Stack:** Rust (Tauri 2, objc2 0.6 / objc2-* 0.3, FFI ApplicationServices dan CoreGraphics), TypeScript tanpa framework, Vitest + jsdom, `cargo test --lib`.

**Spec:** `docs/superpowers/specs/2026-11-18-fokus-jendela-design.md` (disetujui pemilik, termasuk bagian 10).

## Global Constraints

- macOS 13 ke atas. Hanya izin Aksesibilitas, tanpa Screen Recording.
- CPU 0,0% saat alat mati, dan saat alat terpasang tapi mode fokus mati. Tidak ada polling. Semua pendengar dipasang saat mode fokus menyala dan dilepas saat mati.
- Panel lapisan tidak pernah ditutup (`close`), hanya `orderOut`, sama seperti `sensor.rs` dan `keyclean_dim.rs`.
- Lapisan blur tidak pernah menjadi key window dan tidak mengaktifkan Notching saat diklik.
- Mode fokus hanya ada di memori.
- Paket `window-focus` tidak langsung terpasang (`optIn`), juga bagi pengguna yang memperbarui app.
- Shortcut bawaan ⌃⌥F (Fokus) dan ⌃⌥⇧F (Tambah), keduanya bisa diganti di Pintasan.
- Kadar Gelapkan: Tidak 0 %, Sedikit 15 % (bawaan), Banyak 35 %.
- Intipan: sepertiga atas jendela jelas (pemilik, setelah uji pertama), lalu gradasi sampai blur penuh di tepi bawah. Transisi 120 ms.
- Maksimal dua jendela fokus. Jendela ketiga menggantikan yang paling lama.
- Teks dalam dua bahasa (id, en), persis seperti tabel di Task 2 dan Task 4.
- Commit memakai `git -c user.email=216042476+HamdaniAsril@users.noreply.github.com commit`. Tidak ada push tanpa izin pemilik.

## Review Focus

1. **Jendela fokus ditutup saat app-nya tidak aktif**, misalnya jendela pasangan dari app lain ditutup lewat skrip atau oleh app itu sendiri. Lapisan tidak boleh tetap diurutkan di bawah jendela yang sudah hilang. Jendela yang tersisa harus tetap jelas, atau blur dijeda. Ditangani di Task 8 (observer untuk app setiap jendela fokus, plus `alive`), dengan test `gone_picked_with_partner_keeps_partner` di Task 5.
2. **Layar dicabut atau disambung saat mode fokus menyala.** Layar baru langsung ter-blur, panel layar yang hilang di-`orderOut`, dan tidak ada panik. Ditangani di Task 7 (`show` membaca layar setiap kali) dan Task 8 (perubahan layar memanggil `apply` ulang). Dicek manual di Task 9.
3. **App yang tidak menjawab Aksesibilitas** (sedang hang). ⌃⌥F tidak boleh membekukan Notching. Semua panggilan `ax::` sudah memakai batas waktu pesan. Jendela yang gagal dibaca dianggap `None`, jadi mode fokus tidak menyala. Test `toggle_without_window_stays_off` di Task 5.
4. **Klik cepat berturut-turut di jendela yang diintip**, saat app tujuan masih aktif. Event `Click` lalu `Focused` untuk jendela yang sama tidak boleh menggeser fokus dua kali atau membuat kedip ganda. Test `focused_picked_is_nothing` di Task 5.
5. **Mode fokus menyala lalu alat dicopot atau dimatikan dari Pengaturan.** Lapisan harus hilang, ikon di notch dibersihkan, dan pendengar dilepas. Ditangani di Task 8 (`sync`). Dicek manual di Task 9.

---

## Struktur file

**Rust (`src-tauri/src/`)**
- Baru:
  - `focus_rules.rs`: aturan murni dan pengaturan.
  - `focus_layer.rs`: panel blur per layar.
  - `focus_service.rs`: wiring.
- Ubah:
  - `modules/manifest.rs` (`Capability::Focus`),
  - `settings.rs`, `app_core.rs`, `settings_window.rs`,
  - `app_keys.rs`, `app_keys_service.rs`,
  - `ax.rs` (`full_screen`),
  - `shelf_watch.rs` (`Watch` dipakai ulang; hanya visibilitas),
  - `tools.rs`, `lib.rs`, `Cargo.toml`.

**Paket:** `modules/window-focus/` berisi `manifest.json`, `icon.svg`, `locales/id.json`, `locales/en.json`, `package.test.ts`, ditambah `modules/index.json`.

**Web:**
- `src/modules/types.ts`, `src/notch/test-helpers.ts`, `src/bridge-browser.ts`,
- `src/settings/{types,bridge-tauri,bridge-browser,test-helpers,search}.ts`,
- `src/settings/pages/{modules,shortcuts}.ts`, `src/i18n/{id,en}.json`, `src/settings/changelog.ts`.

**Dokumen:** `docs/superpowers/verification/2026-11-18-fokus-jendela.md`, dan `README.md` (bagian alat latar).

---

### Task 1: Uji pertama (spike), lanjut atau berhenti

Uji buang-pakai di Mac sungguhan, sebelum kode app ditulis. Hasilnya menentukan apakah rencana ini diteruskan (spec bagian 8).

**Files:**
- Create (tidak di-commit): `<scratchpad>/focus-spike/spike.swift`
- Create: `docs/superpowers/verification/2026-11-18-fokus-jendela.md`, bagian "Uji pertama"

- [ ] **Step 1: Tulis `spike.swift`**, satu skrip AppKit yang dijalankan dengan `swift spike.swift` dari Terminal yang sudah punya izin Aksesibilitas. Isinya:
  1. `NSApplication` dengan `.accessory`.
  2. Satu `NSPanel` borderless dan non-activating seukuran layar utama, `isOpaque = false`, latar bening, level `.normal`, dengan `collectionBehavior` `[.canJoinAllSpaces, .transient, .ignoresCycle]`.
  3. Isi panel: `NSVisualEffectView`, `blendingMode = .behindWindow`, `material = .fullScreenUI`, `state = .active`, `appearance = darkAqua`.
  4. Jendela teratas app lain di layer 0 dicari dari `CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], 0)`, dengan pid bukan milik sendiri. Panel lalu di-`order(.below, relativeTo: id)`.
  5. Setelah 3 detik: mask di layer `NSVisualEffectView` melubangi jendela kedua di daftar. Mask berisi `CAShapeLayer` even-odd (bounds dikurangi bingkai jendela) dan `CAGradientLayer` di setengah bawah bingkai (bening ke hitam).
  6. Setelah 6 detik: jendela kedua itu, dari app lain, dinaikkan dengan `AXUIElementPerformAction(kAXRaiseAction)`, lalu panel diurutkan di bawahnya. Tujuannya mengecek dua jendela dari dua app sama-sama jelas.
- [ ] **Step 2: Jalankan dan periksa** dengan dua app terbuka, misalnya Safari di depan, Finder dan Notes di belakang. Ambil gambar dengan `screencapture -x <scratchpad>/focus-spike/1.png` di setiap tahap, lalu minta pemilik ikut melihat. Catat jawaban keempat pertanyaan spec bagian 8:
  1. Panel ada tepat di bawah jendela app lain, dan tetap di sana saat jendela itu diklik.
  2. Jendela app lain di belakang panel ter-blur, bukan hanya desktop.
  3. Lubang intipan bergradasi halus.
  4. Dua jendela dari dua app sama-sama di atas panel setelah raise.
- [ ] **Step 3: Putuskan, sesuai spec bagian 8.**
  - Nomor 1 atau 2 gagal: berhenti, tulis hasilnya, kembali ke pemilik.
  - Nomor 3 gagal: lanjut, intipan memakai lubang bertepi tegas. Task 7 memakai `CAShapeLayer` saja untuk setengah atas.
  - Nomor 4 gagal: lanjut tanpa pasangan dari app berbeda, dan tanyakan pemilik sebelum Task 5. Pilihannya pasangan hanya dari app yang sama, atau jendela lain milik app aktif ikut jelas.
- [ ] **Step 4: Commit** catatan verifikasi: `docs(window-focus): hasil uji pertama Fokus jendela`.

### Task 2: Paket `window-focus`

**Files:**
- Create: `modules/window-focus/manifest.json`, `icon.svg`, `locales/id.json`, `locales/en.json`, `package.test.ts`
- Modify: `modules/index.json` (setelah `"window-peek"`), `src-tauri/src/modules/manifest.rs` (`Capability::Focus`, `#[serde(rename = "focus")]`)

**Interfaces:**
- Produces: id paket `window-focus` dan kemampuan `focus`. Manifest:

```json
{
  "id": "window-focus", "version": "1.0.0", "category": "window", "icon": "icon.svg", "optIn": true,
  "permissions": ["accessibility"],
  "capabilities": ["focus", "status", "notify"], "tool": "focus",
  "notifications": [{ "id": "access", "on": true, "sound": false }]
}
```

| Kunci locale | id | en |
|---|---|---|
| name / shortName | Fokus jendela / Fokus | Window focus / Focus |
| description | Semua yang di belakang jendela kerjamu jadi blur | Blurs everything behind the window you work in |
| channels.access | Izin | Access |
| notice.access.title / detail | Fokus jendela butuh izin Aksesibilitas / Buka Pengaturan → Izin | Window focus needs Accessibility access / Open Settings → Permissions |

- [ ] **Step 1: Write the failing test** `modules/window-focus/package.test.ts`, mencontoh `modules/window-peek/package.test.ts`:
  - ikon `viewBox="0 0 24 24"` dengan `stroke=`,
  - posisinya tepat setelah `window-peek` dan sebelum `waktu`,
  - `[entry, card, action, tool]` sama dengan `[null, null, null, true]`,
  - `permissions` sama dengan `['accessibility']`,
  - `installed === false` di `catalog('id', [])`,
  - nama `'Fokus jendela'` dan `'Window focus'`.
- [ ] **Step 2:** `npx vitest run modules/window-focus`. Expected: FAIL (paket belum ada).
- [ ] **Step 3:** Buat berkasnya dan `Capability::Focus`. Ikonnya garis 24×24: satu persegi tegas di tengah, dikelilingi tiga garis putus-putus, mengikuti gaya ikon `window-peek`.
- [ ] **Step 4:** `npm test` dan `cd src-tauri && cargo test --lib`. Expected: lulus, termasuk tes manifest yang membaca semua paket bundel.
- [ ] **Step 5:** Commit: `feat(window-focus): the Fokus jendela package, waiting in the Katalog`.

### Task 3: Pengaturan Gelapkan tersimpan

**Files:**
- Create: `src-tauri/src/focus_rules.rs`, bagian pengaturan saja.
- Modify:
  - `settings.rs`: field `window_focus: crate::focus_rules::FocusSettings`, `#[serde(deserialize_with = "lenient")]`.
  - `app_core.rs`: `ModuleState.focus`, `fn focus_settings(&self) -> FocusSettings`, `fn set_focus_settings(&mut self, f: FocusSettings) -> Result<(), CoreError>`.
  - `settings_window.rs`: perintah `set_focus_settings`.
  - `lib.rs`: `mod focus_rules;`, perintah didaftarkan.
  - TS: `src/modules/types.ts`, `src/notch/test-helpers.ts`, `src/bridge-browser.ts`, `src/settings/types.ts`, `src/settings/bridge-tauri.ts`, `src/settings/bridge-browser.ts`, `src/settings/test-helpers.ts`.
- Test: `focus_rules.rs` (mod tests) dan `app_core.rs` (mod tests).

**Interfaces:**
- Produces (Rust, `serde(rename_all = "camelCase")`, enum `lowercase` dengan `#[serde(other)]` di nilai bawaan):

```rust
pub struct FocusSettings { pub dim: Dim }
pub enum Dim { None, Little /* default */, Much }
impl Dim { pub fn alpha(self) -> f64 } // 0.0, 0.15, 0.35
```

- Produces (TS):
  - `interface FocusSettings { dim: 'none' | 'little' | 'much' }`,
  - `ModuleState.focus: FocusSettings`,
  - `SettingsBridge.setFocusSettings(f: FocusSettings): Promise<void>`, dengan `invoke('set_focus_settings', { settings: f })`.
  - Perintah Rust `set_focus_settings(app, core, settings: FocusSettings)` menyimpan lewat `change(...)`, lalu memanggil `crate::focus_service::sync(&app)`. Sampai Task 8, `focus_service.rs` cukup berisi `pub const MODULE_ID: &str = "window-focus";` dan `pub fn sync(_app: &AppHandle) {}`.

- [ ] **Step 1: Write the failing tests**:

```rust
#[test]
fn focus_settings_default_and_survive_bad_fields() {
    let f: FocusSettings = serde_json::from_str(r#"{"dim":"nonsense"}"#).unwrap();
    assert_eq!(f, FocusSettings::default());
    assert_eq!(serde_json::to_value(FocusSettings::default()).unwrap(), serde_json::json!({"dim":"little"}));
    assert_eq!([Dim::None.alpha(), Dim::Little.alpha(), Dim::Much.alpha()], [0.0, 0.15, 0.35]);
}
```

  Ditambah di `app_core.rs` `focus_settings_are_kept`: simpan `dim: Much`, buka ulang, nilainya sama, dan `state().focus` ikut.
- [ ] **Step 2:** `cd src-tauri && cargo test --lib focus`. Expected: FAIL (tipe belum ada).
- [ ] **Step 3:** Implementasi sesuai Interfaces.
- [ ] **Step 4:** `cargo test --lib`, `npx tsc --noEmit`, dan `npm test`. Expected: lulus.
- [ ] **Step 5:** Commit: `feat(window-focus): its Darken setting, saved with its default`.

### Task 4: Dua shortcut dan baris Fokus jendela di Pintasan

**Files:**
- Modify:
  - `src-tauri/src/app_keys.rs`: `Action::Focus`, `Action::FocusAdd`, `AppKeys.focus`, `AppKeys.focus_add`.
  - `src-tauri/src/app_keys_service.rs`: `pressed` memanggil `crate::focus_service::pressed(app, false)` untuk `Focus` dan `pressed(app, true)` untuk `FocusAdd`. Stub-nya di `focus_service.rs`: `pub fn pressed(_app: &AppHandle, _add: bool) {}`.
  - `src/settings/types.ts`: `AppAction` ditambah `'focus' | 'focusAdd'`.
  - `src/settings/pages/shortcuts.ts`: `DEFAULT_LABELS`, `MODULE_OF` (`'window-focus'`), `MODULE_NAME` (`'Window focus'`), `names`.
  - `src/settings/pages/modules.ts`: di `toolFold`, cabang `m.id === 'window-focus'` memakai `focusSettingsBox(ctx)`.
  - `src/settings/search.ts`, `src/i18n/{id,en}.json`, test helpers dan bridge browser untuk tombol bawaannya.
- Test: `app_keys.rs` (mod tests), `src/settings/pages/shortcuts.test.ts`, `src/settings/search.test.ts`.

**Interfaces:**
- Consumes: `ModuleState.focus` dan `setFocusSettings` (Task 3).
- Produces (Rust):
  - `Action::ALL` menjadi `[Awake, Shelf, Focus, FocusAdd]`. Serde `"focus"` dan `"focusAdd"`. `module()` untuk keduanya `"window-focus"`.
  - Bawaan `focus: Combo { code: 0x03, mods: CONTROL | OPTION }` (⌃⌥F) dan `focus_add: Combo { code: 0x03, mods: CONTROL | OPTION | SHIFT }` (⌃⌥⇧F).
- Produces (TS): `export function focusSettingsBox(ctx: PageContext): HTMLElement`. Isinya baris dengan `data-row` berikut, urut:
  1. `tool.window-focus.access`: `accessRow` yang sudah ada.
  2. `focus.dim`: `choice` dengan opsi `none`, `little`, `much`. Setiap perubahan memanggil `ctx.save('focus.dim', () => ctx.bridge.setFocusSettings({ ...ctx.state.focus, dim: v }))`.

| Kunci | id | en |
|---|---|---|
| `shortcuts.focus` | Nyalakan atau matikan Fokus jendela | Turn Window focus on or off |
| `shortcuts.focusAdd` | Tambah jendela ke Fokus jendela | Add a window to Window focus |
| `settingsWindow.focus.dim` / `dimHint` | Gelapkan / Lapisan gelap tipis di atas blur. | Darken / A thin dark layer over the blur. |
| `settingsWindow.focus.dimNone` / `dimLittle` / `dimMuch` | Tidak / Sedikit / Banyak | None / A little / A lot |
| `permissions.accessibilityHint` (baris 427) | Untuk mengunci keyboard, memotong file, mengatur jendela, mengintip jendela, dan memfokuskan jendela. | To lock the keyboard, cut files, arrange windows, peek at windows and focus on a window. |
| kata kunci cari `shortcuts` | ditambah "fokus jendela blur" | ditambah "window focus blur" |

- [ ] **Step 1: Write the failing tests.**
  - `app_keys.rs`:
    - `defaults_are_control_option_k_and_v` ditambah `label(k.focus) == "⌃⌥F"` dan `label(k.focus_add) == "⌃⌥⇧F"`.
    - `ids_round_trip` diubah: `Action::from_id(5) == None`.
    - `focus_and_focus_add_are_different_keys`: `set_key(keys, Action::FocusAdd, Some(keys.focus), false, false) == Err(AppKeyError::Duplicate { action: Action::Focus })`.
  - `shortcuts.test.ts`, dengan `moduleInfo('window-focus', { tool: true, permissions: ['accessibility'] })` terpasang:
    - baris `shortcuts.focus` berlabel "⌃⌥F" dan `shortcuts.focusAdd` berlabel "⌃⌥⇧F",
    - membuka fold menampilkan `tool.window-focus.access` lalu `focus.dim`,
    - klik "Banyak" memanggil `setFocusSettings({ dim: 'much' })`,
    - dalam bahasa Inggris tertulis "Darken".
  - `search.test.ts`: mencari "blur" menemukan Pintasan.
- [ ] **Step 2:** `cd src-tauri && cargo test --lib app_keys` dan `npx vitest run src/settings`. Expected: FAIL.
- [ ] **Step 3:** Implementasi sesuai Interfaces dan tabel.
- [ ] **Step 4:** `cargo test --lib`, `npx tsc --noEmit`, dan `npm test`. Expected: lulus.
- [ ] **Step 5:** Commit: `feat(window-focus): ⌃⌥F and ⌃⌥⇧F on Pintasan, with the Darken setting`.

### Task 5: Aturan fokus

**Files:**
- Modify: `src-tauri/src/focus_rules.rs`
- Test: `focus_rules.rs` (mod tests)

**Interfaces:**
- Produces:

```rust
pub type WinId = u32;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Win { pub id: WinId, pub pid: i32 }

/// What the service heard. Front/Focused/Created come only from the active app,
/// Gone from any app that has a picked window.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Event {
    Toggle(Option<Win>),  // ⌃⌥F with the active app's focused window
    Add(Option<Win>),     // ⌃⌥⇧F
    Click(Win),           // a click on the peeked window
    ShiftClick(Win),
    Front(Option<Win>),   // the active app or Space changed; None: no window here, or full screen
    Focused(Win),         // AXFocusedWindowChanged in the active app
    Created(Win),         // AXWindowCreated in the active app
    Gone(WinId),          // closed or minimized
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Layer {
    Off,
    Paused,
    /// Raise in this order; the layer goes right below `raise[0]`. The last is the one in use.
    Shown { raise: Vec<WinId> },
}

pub const MAX_PICKED: usize = 2;

#[derive(Default)]
pub struct Focus { /* picked (oldest first), previous, fresh, on, paused */ }
impl Focus {
    pub fn is_on(&self) -> bool;
    pub fn picked(&self) -> Vec<WinId>;
    pub fn pids(&self) -> Vec<i32>;     // the apps of the picked windows, for observers
    /// None: nothing on screen changes.
    pub fn step(&mut self, e: Event) -> Option<Layer>;
}
```

Aturan, sesuai spec bagian 4. `previous` adalah jendela yang terakhir digantikan oleh `Click`, `Focused`, atau `Front`. `fresh` adalah jendela yang dibuat app dari jendela fokus setelah pilihan terakhir.

- [ ] **Step 1: Write the failing tests.** Gunakan `A = Win{id:1,pid:10}`, `B = Win{id:2,pid:10}`, `C = Win{id:3,pid:20}`, `D = Win{id:4,pid:30}`, `N = Win{id:5,pid:10}`:

| Test | Langkah | Hasil terakhir |
|---|---|---|
| `toggle_on_picks_the_active_window` | `Toggle(Some(A))` | `Some(Shown{raise:[1]})`, `is_on()` |
| `toggle_without_window_stays_off` | `Toggle(None)` | `None`, `!is_on()` |
| `toggle_on_the_picked_window_turns_off` | `Toggle(Some(A))`, `Toggle(Some(A))` | `Some(Off)` |
| `toggle_on_a_new_window_picks_it_alone` | `Toggle(Some(A))`, `Created(N)`, `Toggle(Some(N))` | `Some(Shown{raise:[5]})` |
| `click_moves_focus` | `Toggle(Some(A))`, `Click(C)` | `Some(Shown{raise:[3]})` |
| `add_after_a_click_brings_back_the_previous` | `Toggle(Some(A))`, `Click(C)`, `Add(Some(C))` | `Some(Shown{raise:[1,3]})` |
| `shift_click_adds` | `Toggle(Some(A))`, `ShiftClick(C)` | `Some(Shown{raise:[1,3]})` |
| `a_third_replaces_the_oldest` | `Toggle(Some(A))`, `ShiftClick(C)`, `ShiftClick(D)` | `Some(Shown{raise:[3,4]})` |
| `add_when_off_turns_on` | `Add(Some(A))` | `Some(Shown{raise:[1]})` |
| `front_of_another_app_moves_focus` | `Toggle(Some(A))`, `Front(Some(C))` | `Some(Shown{raise:[3]})` |
| `front_of_a_pair_app_keeps_the_pair` | `Toggle(Some(A))`, `ShiftClick(C)`, `Front(Some(A))` | `Some(Shown{raise:[3,1]})` |
| `front_none_pauses_then_resumes` | `Toggle(Some(A))`, `Front(None)`, `Front(Some(D))` | `Some(Paused)`, lalu `Some(Shown{raise:[4]})` |
| `a_new_window_stays_clear` | `Toggle(Some(A))`, `Created(N)`, `Focused(N)` | `None`, dan `picked() == [1]` |
| `an_old_window_of_the_same_app_moves_focus` | `Toggle(Some(A))`, `Focused(B)` | `Some(Shown{raise:[2]})` |
| `focused_picked_is_nothing` | `Toggle(Some(A))`, `Click(C)`, `Focused(C)` | `None` |
| `gone_picked_with_partner_keeps_partner` | `Toggle(Some(A))`, `ShiftClick(C)`, `Gone(1)` | `Some(Shown{raise:[3]})` |
| `gone_last_pauses_and_the_next_focus_resumes` | `Toggle(Some(A))`, `Gone(1)`, `Focused(B)` | `Some(Paused)`, lalu `Some(Shown{raise:[2]})` |
| `a_new_window_gone_changes_nothing` | `Toggle(Some(A))`, `Created(N)`, `Gone(5)` | `None` |
| `another_apps_new_window_is_not_fresh` | `Toggle(Some(A))`, `Created(D)`, `Focused(D)` | `Some(Shown{raise:[4]})` |
| `off_ignores_everything_but_the_keys` | `Front(Some(A))`, `Click(A)`, `Gone(1)` | semuanya `None`, `!is_on()` |

- [ ] **Step 2:** `cd src-tauri && cargo test --lib focus_rules`. Expected: FAIL.
- [ ] **Step 3:** Implementasi `Focus::step`. `Front(Some(w))` saat ada jendela fokus dengan `w.pid` yang sama mempertahankan pasangan, dan jendela milik pid itu dinaikkan terakhir. `Focused(w)` dengan `w` yang ada di `picked` atau `fresh` mengembalikan `None`. `Toggle`/`Add` saat `Paused` berlaku seperti saat menyala.
- [ ] **Step 4:** `cargo test --lib focus_rules`. Expected: semua lulus.
- [ ] **Step 5:** Commit: `feat(window-focus): the rules for which windows stay clear`.

### Task 6: Aturan intipan

**Files:**
- Modify: `src-tauri/src/focus_rules.rs`
- Test: `focus_rules.rs` (mod tests)

**Interfaces:**
- Produces:

```rust
/// A window under the layer, from the window server's list (CG points, top-left of the main screen).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Below { pub id: WinId, pub pid: i32, pub frame: crate::geometry::Rect }
pub const PEEK_CLEAR: f64 = 0.5;   // the top half is clear
pub const PEEK_FADE_MS: u64 = 120;
/// The topmost window under the point; `below` is front to back.
pub fn peek_target(x: f64, y: f64, below: &[Below]) -> Option<Below>;
/// The clear top part and the fading bottom part of `frame`.
pub fn peek_hole(frame: Rect) -> (Rect, Rect);
```

- [ ] **Step 1: Write the failing tests.**
  - `peek_target_is_the_topmost_under_the_point`: dua jendela bertumpuk. Titik di area tumpang tindih memberi jendela pertama di daftar. Titik hanya di jendela kedua memberi jendela kedua. Titik di luar keduanya memberi `None`.
  - `peek_hole_splits_the_window_in_half`: `peek_hole(Rect{x:100.,y:50.,w:400.,h:300.})` sama dengan `(Rect{x:100.,y:50.,w:400.,h:150.}, Rect{x:100.,y:200.,w:400.,h:150.})`.
- [ ] **Step 2:** `cargo test --lib focus_rules::tests::peek`. Expected: FAIL.
- [ ] **Step 3:** Implementasi. `peek_target` memakai `Rect::contains`.
- [ ] **Step 4:** `cargo test --lib focus_rules`. Expected: lulus.
- [ ] **Step 5:** Commit: `feat(window-focus): which window a peek shows, and its clear half`.

### Task 7: Lapisan blur

**Files:**
- Create: `src-tauri/src/focus_layer.rs`
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs` (`mod focus_layer;`)

**Interfaces:**
- Consumes: `screens::current_screens`, `geometry::Rect`, `focus_rules::{peek_hole, PEEK_FADE_MS}`.
- Produces (main thread saja):

```rust
pub struct Hooks { pub moved: fn(f64, f64), pub left: fn(), pub clicked: fn(f64, f64, bool /* shift */) } // CG points
pub fn init(hooks: Hooks);
/// One panel per screen now, each ordered right below `window`; `dim` is Dim::alpha().
pub fn show(mtm: MainThreadMarker, window: u32, dim: f64);
pub fn hide(mtm: MainThreadMarker);
/// Opens a peek hole over `frame` (CG points), or closes it, fading over PEEK_FADE_MS.
pub fn set_peek(mtm: MainThreadMarker, frame: Option<Rect>);
/// While a drag runs, every mouse event goes through to the windows below.
pub fn pass_through(mtm: MainThreadMarker, on: bool);
/// The layer's own window numbers, to skip in the window list.
pub fn own_windows(mtm: MainThreadMarker) -> Vec<u32>;
```

- [ ] **Step 1: Cargo features.** Tambahkan `"NSVisualEffectView"` ke `objc2-app-kit`, `"CAGradientLayer"` dan `"CAShapeLayer"` ke `objc2-quartz-core`, dan `"CGPath"` ke `objc2-core-graphics`. Jalankan `cd src-tauri && cargo build`. Expected: berhasil.
- [ ] **Step 2: Panel dan view.** Polanya mengikuti `sensor.rs`.
  - `define_class!` `FocusView` (subkelas NSView, layer-backed), dengan:
    - `acceptsFirstMouse:` → `true`;
    - `mouseMoved:` → `hooks.moved`;
    - `mouseExited:` → `hooks.left`;
    - `mouseDown:` → `hooks.clicked`, `shift` dari `modifierFlags`;
    - `rightMouseDown:`, `otherMouseDown:`, `scrollWheel:` ditelan tanpa aksi (spec 4.5);
    - tracking area `MouseMoved | MouseEnteredAndExited | ActiveAlways | InVisibleRect`.
  - `NSPanel` borderless dan `NonactivatingPanel`, `setOpaque(false)`, latar `clearColor`, tanpa bayangan, level normal (0).
  - `collectionBehavior` `CanJoinAllSpaces | Transient | IgnoresCycle`. `canBecomeKey` bawaan NSPanel non-activating, dan panel tidak pernah dibuat key.
  - Isinya `NSVisualEffectView`: `BehindWindow`, `FullScreenUI`, `Active`, appearance `NSAppearanceNameDarkAqua`, autoresize penuh. Di atasnya CALayer hitam dengan opacity `dim`.
  - Panel disimpan per `screen.index` di `thread_local!`, dan dipakai ulang.
- [ ] **Step 3: `show`/`hide`.** `show` membaca `current_screens` setiap kali. Setiap panel diatur bingkainya ke layarnya, opacity lapisan gelap ke `dim`, lalu `orderWindow_relativeTo(NSWindowOrderingMode::Below, window as isize)`. Panel untuk layar yang tidak ada lagi di-`orderOut`. `hide` me-`orderOut` semua panel.
- [ ] **Step 4: `set_peek`.** Hanya panel yang layarnya memotong `frame`.
  - Mask layer view efek berisi:
    - `CAShapeLayer` dengan `fillRule` even-odd: bounds dikurangi bingkai jendela;
    - `CAGradientLayer` di bagian pudar dari `peek_hole`, dengan `colors` bening ke hitam, berarah atas ke bawah dalam koordinat CG.
  - Konversi CG (kiri atas) ke koordinat view (kiri bawah) per layar.
  - Perubahan dibungkus `CATransaction` dengan durasi `PEEK_FADE_MS`.
  - `None` menghapus mask.
  - Kalau Task 1 nomor 3 gagal: tanpa `CAGradientLayer`, dan lubangnya hanya bagian jelas.
- [ ] **Step 5: `pass_through`** mengatur `setIgnoresMouseEvents(on)` di semua panel.
- [ ] **Step 6:** `cargo build` dan `cargo test --lib`. Expected: lulus. Lapisan ini dicek visual di Task 9.
- [ ] **Step 7:** Commit: `feat(window-focus): the blur layer, one panel per screen, with a peek hole`.

### Task 8: Menyatukan semuanya

**Files:**
- Modify: `src-tauri/src/focus_service.rs` (stub dari Task 3 dan 4 diganti), `ax.rs`, `shelf_watch.rs`, `tools.rs`, `lib.rs`.

**Interfaces:**
- Consumes:
  - `Focus`, `Event`, `Layer`, `Win`, `Below`, `peek_target` (Task 5 dan 6),
  - `focus_layer::*` (Task 7),
  - `ax::{app, focused_window, windows, window_id, raise, set_frontmost, Observer}`,
  - `status::{set_icon, clear}`, `Activity::On`,
  - `keyclean_tap::trusted`, `shelf_watch::Watch`.
- Produces:
  - `pub fn pressed(app: &AppHandle, add: bool)`,
  - `pub fn sync(app: &AppHandle)`: alat mati atau dicopot berarti mode fokus mati (`Layer::Off`). Kalau alat masih menyala dan mode fokus sedang tampil, `apply` diulang supaya Gelapkan yang baru langsung terlihat,
  - `pub fn no_access(app: &AppHandle)`: pemberitahuan izin paling sering sekali per menit, seperti `peek_service::no_access`,
  - di `ax.rs`: `pub fn full_screen(window: &Cf) -> bool` (atribut `AXFullScreen`, `false` kalau tidak ada).

- [ ] **Step 1: Keadaan dan `apply`.**
  - `static FOCUS: Mutex<Focus>`.
  - `fn send(app, e: Event)` memanggil `step`. Kalau hasilnya `Some(layer)`, jalankan `apply` di thread utama:
    - `Off`: `hide`, lepas semua pendengar, `status::clear(MODULE_ID)`.
    - `Paused`: `hide`, set peek `None`. Pendengar tetap.
    - `Shown{raise}`: untuk setiap id, cari elemen AX-nya di `ax::windows(ax::app(pid))` dengan `window_id`, lalu `ax::raise`. Setelah itu `focus_layer::show(raise[0], dim)` dan `status::set_icon(MODULE_ID, Activity::On)`.
  - Setelah `apply`, observer AX dipasang ulang untuk app aktif dan semua `pids()`.
- [ ] **Step 2: `pressed`.**
  - Kalau `!keyclean_tap::trusted(false)`, panggil `no_access` dan berhenti.
  - Kalau tidak, baca jendela aktif lewat `NSWorkspace.frontmostApplication` → `ax::focused_window` → `window_id`. Jendela layar penuh dianggap `None`.
  - Kirim `Toggle` atau `Add`.
  - Mode fokus yang baru menyala memasang pendengar.
- [ ] **Step 3: Pendengar**, hanya selama mode fokus menyala:
  - Pemberitahuan `NSWorkspaceDidActivateApplicationNotification` dan `NSWorkspaceActiveSpaceDidChangeNotification` mengirim `Front(jendela aktif)`.
  - `screens::watch_screen_changes` sudah ada. Tambahkan panggilan ke `focus_service::screens_changed`, yang memanggil `apply` dengan layer saat ini.
  - `ax::Observer` per pid:
    - `AXFocusedWindowChanged` → `Focused`;
    - `AXWindowCreated` → `Created`;
    - `AXUIElementDestroyed` dan `AXWindowMiniaturized` → untuk setiap id di `picked()` yang tidak lagi ada di `CGWindowListCopyWindowInfo(OptionOnScreenOnly)`, kirim `Gone(id)`. Elemen yang sudah hancur tidak bisa memberi nomor jendela.
  - `Focused`/`Created` hanya dikirim dari app aktif.
- [ ] **Step 4: Intipan dan klik** (hooks untuk `focus_layer::init`).
  - `moved(x, y)`: kalau titik masih di bingkai target terakhir, tidak ada yang dikerjakan. Kalau tidak, baca daftar jendela (`OnScreenOnly | ExcludeDesktopElements`, layer 0). Ambil yang ada setelah jendela-jendela `own_windows()` di daftar, dan buang pid Notching sendiri. Lalu `peek_target`, lalu `set_peek(target.frame)`.
  - `left`: `set_peek(None)`.
  - `clicked(x, y, shift)`: kalau ada target, kirim `Click`/`ShiftClick`, lalu aktifkan app-nya (`NSRunningApplication::activateWithOptions`) dan `ax::raise` jendelanya. Tanpa target, tidak ada yang terjadi.
- [ ] **Step 5: Seret.**
  - Jadikan `shelf_watch::Watch` dan konstantanya bisa dipakai modul lain (`pub(crate)`), tanpa mengubah perilaku Shelf.
  - Selama mode fokus menyala, pasang global monitor `LeftMouseDown | LeftMouseDragged | LeftMouseUp`. Begitu `Watch::dragged` memberi `true`, panggil `pass_through(true)` dan `set_peek(None)`. Saat `LeftMouseUp`, panggil `pass_through(false)`.
- [ ] **Step 6: Wiring.**
  - `tools.rs`: `focus_service::MODULE_ID` masuk `TOOLS`, dan `module_changed` memanggil `focus_service::sync`. Saat alat dinyalakan tanpa izin, alur `trusted(true)` yang sudah ada berlaku.
  - `lib.rs`: `mod focus_service;` dan `focus_layer::init`.
- [ ] **Step 7:** `cargo test --lib`, `npm test`, `npx tsc --noEmit`, dan `npm run tauri build -- --debug`. Expected: lulus dan ter-build.
- [ ] **Step 8:** Commit: `feat(window-focus): ⌃⌥F blurs everything behind the window you work in, follows ⌘Tab and clicks, peeks, and keeps two windows`.

### Task 9: Uji di Mac, catatan verifikasi, dan Yang baru

**Files:**
- Modify: `docs/superpowers/verification/2026-11-18-fokus-jendela.md`, `src/settings/changelog.ts`, `README.md`

- [ ] **Step 1: Jalankan `npm run tauri dev`**, pasang Fokus jendela dari Katalog, dan uji setiap baris berikut bersama pemilik. Catat lulus/gagal di catatan verifikasi:
  1. Fokus dan aturan mouse:
     - ⌃⌥F menyala dan mati;
     - ⌘Tab memindah fokus;
     - klik di jendela yang diintip memindah fokus, dan klik itu tidak sampai ke jendelanya;
     - ⇧-klik dan ⌃⌥⇧F menambah jendela kedua, dan jendela ketiga menggantikan yang lama;
     - dialog Simpan tetap jelas bersama jendelanya;
     - ⌘\` memindah fokus.
  2. Intipan:
     - sepertiga atas jelas lalu bergradasi;
     - scroll dan klik kanan di blur tidak melakukan apa-apa;
     - file bisa diseret dari jendela fokus ke jendela Finder yang ter-blur.
  3. Layar dan Space:
     - dua monitor: monitor lain ter-blur penuh;
     - mencabut dan menyambung monitor saat mode fokus menyala;
     - pindah Space, dan app layar penuh tanpa blur;
     - lapisan tidak muncul di Mission Control, App Exposé, pengalih Intip jendela, dan daftar jendela Screenshot.
  4. Menu bar, Dock, menu yang terbuka, notifikasi, dan panel Notching tetap jelas. Ikon di samping notch muncul selama mode fokus menyala.
  5. Izin dicabut: ⌃⌥F memberi pemberitahuan dan tidak menyala. Alat dicopot saat mode fokus menyala: lapisan hilang.
  6. CPU di Activity Monitor: 0,0% saat mode fokus mati. Saat mode fokus menyala dan kursor diam, juga tanpa beban yang terlihat.
- [ ] **Step 2: Perbaiki yang gagal**, masing-masing dengan test di task pemiliknya kalau aturannya murni, lalu ulangi baris itu.
- [ ] **Step 3: Yang baru.** Mulai entri `0.1.5` tanpa tanggal di atas `CHANGELOG`.
  - id: "Fokus jendela (pasang dari Katalog): tekan ⌃⌥F dan semua yang di belakang jendelamu jadi blur. Fokus ikut pindah saat kamu pindah jendela, arahkan kursor ke area blur untuk mengintip, dan ⌃⌥⇧F menambah jendela kedua."
  - en: "Window focus (install it from the Catalog): press ⌃⌥F and everything behind your window blurs. Focus follows you to another window, point at the blur to peek, and ⌃⌥⇧F adds a second window."
- [ ] **Step 4: README.**
  - Bagian alat latar menjadi "4 background tools", dengan butir **Window focus**, satu kalimat seperti butir lain.
  - Daftar izin Accessibility ditambah Window focus.
  - Bagian Shortcuts ditambah ⌃⌥F dan ⌃⌥⇧F.
- [ ] **Step 5:** `npm test` dan `cd src-tauri && cargo test --lib`. Expected: lulus.
- [ ] **Step 6:** Commit: `docs(window-focus): verification note, What's new and README`.
