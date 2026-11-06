# Intip jendela, rencana 2: pengalih jendela (⌘Tab)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pengalih jendela Intip jendela, menurut desain bagian 2 butir 3 dan bagian 6 "Pengalih jendela":
- tahan ⌘ lalu tekan Tab untuk membuka panel berisi semua jendela (Per jendela) atau app beserta jendelanya (Per app), di tengah layar atau turun dari notch;
- lepas ⌘ membuka yang dipilih;
- tombol M, W, Q, dan tombol pintasnya bisa diganti di Pintasan.

**Architecture:**
- **Aturan murni di `switch_rules.rs`:** tombol saat panel terbuka, daftar dan urutan item, pilihan awal, dan navigasi.
- **Sisi macOS:**
  - `switch_symbolic.rs` mematikan dan menyalakan ⌘Tab bawaan (fungsi tidak resmi, pilihan pemilik),
  - `switch_tap.rs` adalah event tap keyboard,
  - `switch_service.rs` membuat daftar, mengurus panel, menyimpan tombol, dan berbagi pengamat kursor dengan rencana 1.
- **Halaman:** `switcher.html` dengan `src/peek/switcher.ts`.
- **Yang dipakai ulang dari rencana 1:** `peek_windows`, `peek_capture`, `card_point`, aturan izin, dan pola panel `PanelBuilder`.

**Tech Stack:** Rust (Tauri 2, tauri-nspanel, objc2, FFI CoreGraphics dan SkyLight), TypeScript tanpa framework, Vitest + jsdom, `cargo test --lib`.

**Spec:** `docs/superpowers/specs/2026-11-05-intip-jendela-design.md`, terutama bagian 2, 6 "Pengalih jendela", "Mengambil alih ⌘Tab", dan 7. Prototipe: `docs/superpowers/specs/2026-11-05-intip-jendela-mockups/prototipe.html`. Rencana 1 dan catatan verifikasinya sudah selesai.

## Global Constraints

- CPU 0,0% saat diam. Tap keyboard hanya mengenali tombol pengalih saat panel tertutup. Ketikan lain diteruskan tanpa diproses.
- ⌘Tab bawaan dimatikan hanya selama pengalih menyala dengan tombol ⌘Tab atau ⌘⇧Tab. Dinyalakan lagi saat pengalih atau alat dimatikan, saat izin Aksesibilitas dicabut, saat Notching keluar, dan **setiap Notching dibuka, sebelum hal lain**.
- Tanpa izin Aksesibilitas: ⌘Tab seperti macOS biasa.
- Panel tidak pernah ditutup (`close`), hanya `order_out`.
- Panel pengalih tidak pernah menjadi key. Kursor dikirim native (`notching://switch-pointer`), seperti kartu intip di rencana 1.
- Tombol pengalih ikut aturan bentrok: Screenshot, Atur jendela, Keep awake, dan Shelf tidak boleh memakai tombol yang sama, dan sebaliknya.
- Pilihan bawaan: `switcher: true`, tombol ⌘Tab (`code 48`, `mods CMD`), `layout: windows`, `place: center`.
- Teks persis seperti desain bagian 9 (`{n} jendela · {n} app`) dan tabel di bawah. Dua bahasa.
- Commit memakai `git -c user.email=216042476+HamdaniAsril@users.noreply.github.com commit`. Tidak ada push tanpa izin pemilik.
- Build uji dijalankan lewat `open -n …`, bukan binary langsung, dan setiap build baru butuh izin diberikan ulang.

## Review Focus

1. **⌘Tab ditekan cepat lalu dilepas** (sebelum panel sempat tergambar): harus langsung pindah ke jendela kedua, seperti ⌘Tab macOS, tanpa panel berkedip. Test di Task 2: `Open` lalu `Release` sebelum daftar siap menghasilkan `Commit`.
2. **Notching crash atau dipaksa keluar saat ⌘Tab bawaan mati:** dibuka lagi, ⌘Tab bawaan harus hidup. Ditangani di Task 4 (menyalakan di awal `setup`), diuji di Mac di Task 7.
3. **App yang hang** saat daftar dibuat: panel tetap muncul dalam 0,5 detik, tanpa jendela app itu. Ditangani di Task 5 (daftar per app paralel dengan batas waktu). Test aturan penggabungan di Task 2.
4. **Tombol selain navigasi** saat panel terbuka, misalnya mengetik huruf lain: ditahan dan diabaikan, tidak sampai ke app di belakang. Test di Task 2.
5. **Semua jendela ditutup lewat W** saat panel terbuka: panel menutup sendiri. Test di Task 2 (daftar kosong menghasilkan `Close`).

---

## Struktur file

**Rust (`src-tauri/src/`)**
- Baru:
  - `switch_rules.rs`: aturan murni.
  - `switch_symbolic.rs`: ⌘Tab bawaan.
  - `switch_tap.rs`: tap keyboard.
  - `switch_service.rs`: daftar, panel, perintah, dan tombol.
- Ubah:
  - `peek_rules.rs`: `PeekSettings` bertambah.
  - `app_core.rs`.
  - `shot_hotkey.rs`, `win_service.rs`, `app_keys_service.rs`: bentrok dengan tombol pengalih.
  - `shot_keys.rs` / `win_rules.rs` / `app_keys.rs`: varian galat `Peek`.
  - `lib.rs`, `tools.rs`.

**Web:**
- Baru:
  - `switcher.html`,
  - `src/peek/switcher.ts`, `src/peek/switcher-main.ts`, `src/peek/switcher.css`,
  - `src/peek/switcher.test.ts`.
- Ubah:
  - `vite.config.ts`,
  - `src/modules/types.ts`,
  - `src/settings/pages/modules.ts` (`peekRows`),
  - `src/settings/{types,bridge-tauri,bridge-browser,test-helpers,search}.ts`,
  - `src/i18n/{id,en}.json`,
  - `src-tauri/capabilities/peek.json` (tambah jendela `switcher`).

---

### Task 1: Pengaturan pengalih

**Files:** `src-tauri/src/peek_rules.rs`, `src/modules/types.ts`, test di `peek_rules.rs`.

**Interfaces:**
- Produces (Rust, di `PeekSettings`, camelCase):
  - `switcher: bool` (bawaan `true`),
  - `switcher_key: crate::shot_keys::Combo` (bawaan `Combo { code: 48, mods: CMD }`),
  - `layout: SwitchLayout { Windows /* bawaan, serde other */, Apps }`,
  - `place: SwitchPlace { Center /* bawaan, serde other */, Notch }`.
- Produces (TS): `PeekSettings` bertambah `switcher: boolean; switcherKey: { code: number; mods: number }; layout: 'windows' | 'apps'; place: 'center' | 'notch'`. `DEFAULT_PEEK` diperbarui.

- [ ] **Step 1: Failing test:** `switcher_settings_default_and_old_files_keep_working`.
  - JSON lama tanpa field baru, `{"dock":false}`, terbaca dengan `switcher: true`, `switcher_key == Combo{48, CMD}`, `layout == Windows`, `place == Center`, dan `dock: false`.
  - `"layout":"nonsense"` terbaca `Windows`.
- [ ] **Step 2:** `cargo test --lib switcher_settings` → FAIL.
- [ ] **Step 3:** Implementasi, lalu perbarui `DEFAULT_PEEK` dan test-helpers yang membandingkan `PeekSettings` penuh.
- [ ] **Step 4:** `cargo test --lib`, `npm test`, `npx tsc --noEmit` → lulus.
- [ ] **Step 5:** Commit `feat(window-peek): the switcher's settings`.

### Task 2: Aturan murni pengalih

**Files:** Create `src-tauri/src/switch_rules.rs`, test di dalamnya. Tambahkan `mod switch_rules;` di `lib.rs`, tanpa cfg.

**Interfaces:**

```rust
/// One thing the switcher lists.
#[derive(Clone, Debug, PartialEq)]
pub enum Item { Window { pid: i32, id: u32, title: String, minimized: bool }, App { pid: i32, name: String } }
/// Windows newest first across apps (window server order `z`), minimized after, then
/// apps that run with no window here (no window on this Space, hidden, or none at all).
pub fn items(windows: Vec<WinInfo>, z: &[u32], apps: &[(i32, String)]) -> Vec<Item>
/// Per app: running apps in the order their newest window comes, then the others.
pub fn apps_of(items: &[Item]) -> Vec<i32>
pub enum SwitchKey { Down { code: u16, mods: u32, repeat: bool }, Flags { mods: u32 } }   // Carbon modifiers
pub enum SwitchAction { Pass, Open, Swallow, Next, Prev, NextWin, PrevWin, Commit, Cancel, Act(Act) }
pub enum Act { Minimize, Close, Quit }
#[derive(Default)] pub struct SwitchKeys { /* private: open, sticky */ }
impl SwitchKeys {
    pub fn on(&mut self, key: SwitchKey, trigger: Combo) -> SwitchAction
    pub fn acted(&mut self)        // after M/W/Q or a button: releasing the trigger no longer commits (sticky)
    pub fn closed(&mut self)
    pub fn is_open(&self) -> bool
}
pub fn needs_symbolic_off(c: Combo) -> bool   // ⌘Tab or ⌘⇧Tab
pub fn first_selection(len: usize) -> usize   // 1 if len > 1, else 0
pub fn step(sel: usize, len: usize, d: i32) -> usize // wraps
```

Aturan `SwitchKeys::on`, yang tidak ditentukan oleh signature:
- **Tertutup:**
  - `Down` dengan `code == trigger.code` dan semua modifier `trigger.mods` ditekan (`mods & trigger.mods == trigger.mods`) menghasilkan `Open`, dan panel dianggap terbuka.
  - Selain itu `Pass`.
- **Terbuka:**
  - `Down` Tab (48): `Next`. Dengan ⇧: `Prev`.
  - → (124) / ← (123): `Next` / `Prev`.
  - ↓ (125) / ` (50): `NextWin`. ↑ (126): `PrevWin`.
  - Return (36): `Commit`. Esc (53): `Cancel`.
  - M (46): `Act(Minimize)`. W (13): `Act(Close)`. Q (12): `Act(Quit)`.
  - Tombol lain: `Swallow`. `repeat` diperlakukan sama, jadi Tab yang ditahan terus bergerak.
- **`Flags`:** saat terbuka, tidak sticky, dan salah satu modifier `trigger.mods` sudah tidak ditekan, hasilnya `Commit`. Selain itu `Pass`.
- **Setelah `Commit` / `Cancel`:** panel dianggap tertutup. Yang memanggil memanggil `closed()`.

- [ ] **Step 1: Failing tests:**
  - `opens_on_the_trigger_only`: ⌘Tab → `Open`; Tab tanpa ⌘ → `Pass`; ⌘⇧Tab dengan trigger ⌘Tab → `Open`.
  - `navigates_while_open`: Tab, ⇧Tab, →, ←, ↓, `, ↑, Return, Esc, M, W, Q menghasilkan aksi di atas; huruf X → `Swallow` (Review Focus 4).
  - `releasing_the_modifier_commits`: `Open`, lalu `Flags{mods: 0}` → `Commit`. Juga `Open` langsung disusul `Flags{0}` → `Commit` (Review Focus 1: yang memanggil yang mengurus daftar yang belum siap).
  - `after_an_action_release_does_not_commit`: `acted()`, lalu `Flags{0}` → `Pass`; Return tetap `Commit`.
  - `items_order_windows_then_minimized_then_apps`: dua app dengan z `[5, 1, 9]`, satu jendela minimize, satu app tanpa jendela, hasil persis urut.
  - `apps_of_follows_the_newest_window`.
  - `first_selection_is_the_second_item`: `first_selection(3)==1`, `first_selection(1)==0`, `first_selection(0)==0`.
  - `step_wraps`: `step(2,3,1)==0`, `step(0,3,-1)==2`.
  - `symbolic_off_only_for_command_tab`: ⌘Tab dan ⌘⇧Tab → true; ⌥Tab dan ⌘` → false.
- [ ] **Step 2:** `cargo test --lib switch_rules` → FAIL.
- [ ] **Step 3:** Implementasi.
- [ ] **Step 4:** `cargo test --lib switch_rules` → lulus.
- [ ] **Step 5:** Commit `feat(window-peek): the switcher's rules`.

### Task 3: Baris pengalih di Pintasan dan bentrok tombol

**Files:**
- `src/settings/pages/modules.ts` (`peekRows`) dan `shortcuts.test.ts`.
- `src/settings/{types,bridge-tauri,bridge-browser,test-helpers,search}.ts`.
- `src/i18n/{id,en}.json`.
- Rust:
  - `shot_hotkey.rs` (`SetKeyError::Peek`), `win_rules.rs` (`WinKeyError::Peek`), `app_keys.rs` (`AppKeyError::Peek`),
  - `win_service.rs`, `app_keys_service.rs`, `shot_hotkey.rs`: panggil `crate::switch_service::holds(&app, c)`,
  - `switch_service.rs`: kerangka berisi `holds`, perintah `switch_set_key`, dan `switch_reset_key`.

**Interfaces:**
- Produces (Rust):
  - `pub fn holds(app: &AppHandle, c: Combo) -> bool`: alat terpasang dan menyala, `switcher` hidup, dan `c == switcher_key`.
  - `#[tauri::command] switch_set_key(app, key: ShotKeyPress) -> Result<(), SwitchKeyError>` (pengaturan baru sampai lewat module state seperti biasa), dengan `SwitchKeyError { Invalid, Shot, Window, App }` (serde `kind`, lowercase). Kunci diterjemahkan lewat `shot_keys::from_web`, dan wajib ada ⌘, ⌃, atau ⌥.
  - `switch_reset_key(app)` mengembalikan ⌘Tab.
  - Keduanya menyimpan lewat `set_peek_settings`, lalu `switch_service::sync`.
- Produces (TS): `SettingsBridge.switchSetKey(key: ShotKeyPress): Promise<void>` dan `switchResetKey(): Promise<void>`.
- Baris baru di `peekRows`, sesudah `peek.dockHint` dan sebelum `peek.card`:
  1. `peek.switcher`: toggle, plus keycap `peek.switcherKey` yang merekam lewat `recorder()` yang sudah ada. Hint "Menggantikan ⌘Tab bawaan macOS. Klik tombolnya untuk mengganti." / "Takes over macOS's ⌘Tab. Click the key to change it." Penolakan dibaca dengan teks yang sudah ada: `s.shot`, `s.window`, `s.app`, `s.invalid` dari `shortcuts`.
  2. `peek.switcherReset`: tombol "Kembalikan ke ⌘Tab" / "Back to ⌘Tab", hanya kalau tombolnya bukan ⌘Tab.
  3. `peek.layout`: `choice` `windows` / `apps`, "Tampilkan" / "Show", "Per jendela" / "Per window", "Per app" / "Per app".
  4. `peek.place`: `choice` `center` / `notch`, "Muncul di" / "Appears at", "Tengah layar" / "Screen centre", "Dari notch" / "From the notch".
- Penolakan di tempat lain: Screenshot, Atur jendela, dan tombol app menampilkan "Dipakai Intip jendela" / "Used by Window peek" untuk kind `peek`.

- [ ] **Step 1: Failing tests:**
  - TS `shortcuts.test.ts`:
    - urutan baris fold bertambah `peek.switcher`, `peek.layout`, `peek.place` di tempatnya,
    - klik keycap lalu tekan ⌥Tab memanggil `switchSetKey`,
    - penolakan `{kind:'shot'}` menampilkan teks Screenshot,
    - "Per app" memanggil `setPeekSettings` dengan `layout: 'apps'`,
    - `peek.switcherReset` hanya ada kalau tombolnya bukan ⌘Tab.
  - TS `search.test.ts`: "pengalih" menemukan `peek.switcher`.
  - Rust `switch_service.rs`: `the_switcher_key_refuses_keys_others_hold` dengan fungsi murni `fn refusal(c, shot: bool, window: bool, app: bool) -> Option<SwitchKeyError>`.
  - Rust: `win_rules.rs` / `shot_keys.rs` / `app_keys.rs` membaca dan menulis `Peek`.
- [ ] **Step 2:** Jalankan → FAIL.
- [ ] **Step 3:** Implementasi.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`, `cargo test --lib` → lulus.
- [ ] **Step 5:** Commit `feat(settings): the switcher's rows on Pintasan, its key and its clashes`.

### Task 4: ⌘Tab bawaan dan tap keyboard

**Files:** Create `switch_symbolic.rs` dan `switch_tap.rs`. Modify `lib.rs`: `switch_symbolic::restore()` paling awal di `setup`, dan juga di `RunEvent::Exit`.

**Interfaces:**
- `switch_symbolic`:
  - `pub fn set_native(enabled: bool)`: ID 1 (⌘Tab) dan 2 (⌘⇧Tab).
  - `pub fn restore()` sama dengan `set_native(true)`.
  - Lewat `dlopen` SkyLight dan `dlsym`, nama `SLSSetSymbolicHotKeyEnabled` lalu `CGSSetSymbolicHotKeyEnabled`, dengan signature `extern "C" fn(i32, bool) -> i32`.
  - Simbol hilang: log sekali, lalu tidak terjadi apa-apa.
- `switch_tap`:
  - `pub fn sync(want: bool)`: tap sesi untuk `KeyDown | KeyUp | FlagsChanged`, di thread sendiri, mencontoh `peek_tap`.
  - Callback mengubah flags CG ke modifier Carbon (`NS_CMD`, … seperti `shot_keys`), lalu memanggil `SwitchKeys::on`.
  - Saat tertutup, selain `Open`, event langsung dikembalikan tanpa mengunci apa pun yang lama.
  - `Open` dan semua aksi saat terbuka dikirim ke `switch_service::key(action)` di thread utama, dan event ditahan.
  - `KeyUp` saat terbuka ditahan. `Flags` yang menghasilkan `Commit` diteruskan.

- [ ] **Step 1:** Implementasi, mengikuti pola `peek_tap`, termasuk mengaktifkan lagi tap yang dimatikan macOS dan menandai event milik sendiri (`MARK` "ncsw").
- [ ] **Step 2:** `cargo build` dan `cargo clippy --lib` → tanpa peringatan baru.
- [ ] **Step 3:** Commit `feat(window-peek): the switcher's key tap, and macOS's ⌘Tab off only while it is taken`.

### Task 5: Daftar, panel, dan halaman pengalih

**Files:**
- Create: `switcher.html`, `src/peek/switcher.ts`, `switcher-main.ts`, `switcher.css`, `switcher.test.ts`.
- Modify: `switch_service.rs`, `vite.config.ts`, `capabilities/peek.json`.

**Interfaces:**
- Rust `switch_service`:
  - `pub fn key(app, action: SwitchAction)` di thread utama.
  - `pub fn sync(app)`:
    - tap hidup bila alat menyala, terpercaya, dan `switcher`,
    - `switch_symbolic::set_native(!(want && needs_symbolic_off(key)))`.
  - `pub fn start(app)`, dan perintah `switch_view`, `switch_size(width, height)`, `switch_pointer(inside)`, `switch_pick(index, win: Option<usize>)`, `switch_open(index, win)`, `switch_act(index, win, act)`, `switch_picture(id)`.
- Event:
  - `notching://switch` membawa `SwitchViewDto { items: Vec<SwitchItemDto>, apps: Vec<SwitchAppDto>, sel: usize, win: usize, layout, place, card, material, accent, lang, sticky }`.
  - `notching://switch-pointer` membawa `{x, y} | null`.
- `SwitchItemDto`: `{ kind: 'window' | 'app', pid, id?, title, appName, minimized, icon }`. `SwitchAppDto`: `{ pid, name, icon, count }`.
- TS `renderSwitcher(root, v, calls)` dan `pointSwitcher(root, target, calls)`, dengan pola yang sama seperti `view.ts`.

Aturan:
- **Membuat daftar** saat `Open`:
  - Untuk setiap app biasa yang jalan (`NSWorkspace.runningApplications`, `activationPolicy == regular`, tanpa Notching), `peek_windows::app_windows(pid)` dijalankan di thread masing-masing.
  - Ditunggu paling lama 500 ms. App yang terlambat masuk sebagai kartu app (Review Focus 3).
  - Lalu `switch_rules::items(...)`. Jendela yang di-minimize dibuang kalau pengaturan `minimized` mati. Ikon app diambil dari `NSRunningApplication.icon`, dan disimpan di cache selama Notching berjalan.
- **Cepat:** kalau `Commit` datang sebelum daftar siap, langsung buka item `first_selection` begitu daftar siap, tanpa menampilkan panel (Review Focus 1).
- **Panel:**
  - Label `switcher`, `PanelBuilder` seperti `peek` dengan level 26, tidak pernah key, dan pengamat kursor native (pola `watch_pointer`).
  - Di layar tempat kursor.
  - Tengah: dipusatkan.
  - Dari notch: menempel di atas layar, di tengah.
  - Ukuran dari halaman (`switch_size`), mengikuti pola `peek_size`.
- **Membuka:**
  - Item jendela: `peek_windows::raise(pid, id)`.
  - Item app: aktifkan app itu (`NSRunningApplication` + AXFrontmost). macOS sendiri yang pindah Space.
- **Aksi:**
  - `Act(Minimize)` meminimize jendela, atau memulihkannya kalau sudah di-minimize (`set_all_minimized`). `Act(Close)` memanggil `close`. `Act(Quit)` memanggil `quit(pid)`.
  - Lalu `SwitchKeys::acted()`, daftar dibuat ulang, dan pilihan tetap di indeks yang sama, dijepit ke panjang daftar.
  - Daftar kosong: tutup panel (Review Focus 5).
- **Tampilan:** salin CSS prototipe blok `#sw`, `.swh`, `.swgrid`, `.sc`, `.ap`, `.subwins`, `.badge`, dan `.ico` (baris 118–175), dengan variabel warna kartu dan bahan yang sama seperti `peek.css`.
  - Kartu pilihan memakai cincin aksen.
  - `.acts` muncul di kartu yang dipilih dan di bawah kursor.
  - Dari notch: kelas `notch`, sudut `0 0 30px 30px`, padding atas 44 px, animasi `drop`.
- **Kepala panel:**
  - "{n} jendela" / "{n} windows", atau "{n} app" / "{n} apps".
  - Petunjuk tombol: "Tab berikutnya · ⇧Tab sebelumnya · lepas ⌘ untuk buka" / "Tab next · ⇧Tab back · let go of ⌘ to open". Di Per app ada tambahan "↓ jendela berikutnya" / "↓ next window".
  - Setelah aksi (sticky): "Enter buka · Esc tutup" / "Return opens · Esc closes".

- [ ] **Step 1: Failing tests** (`switcher.test.ts`):
  - Per jendela menggambar satu kartu per item, dengan kartu app tanpa gambar dan berikon. Kartu terpilih ber-`sel`.
  - Per app menggambar baris app dengan jumlah jendela, dan baris jendela app terpilih.
  - `pointSwitcher` ke kartu memanggil `pick(index)`, dan klik memanggil `open(index)`.
  - Klik tombol × memanggil `act(index, 'close')`.
  - Kepala sticky menampilkan teks Enter/Esc.
  - Bahasa Inggris "3 windows".
  - `place: 'notch'` memberi kelas `notch`.
- [ ] **Step 2:** `npx vitest run src/peek/switcher.test.ts` → FAIL.
- [ ] **Step 3:** Implementasi halaman dan layanan.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`, `cargo test --lib`, `cargo clippy --lib` → lulus.
- [ ] **Step 5:** Commit `feat(window-peek): the window switcher`.

### Task 6: Sambungan, Yang baru, README

**Files:** `lib.rs` (perintah dan `switch_service::start`), `tools.rs` (`module_changed` dan `settings_opened` memanggil `switch_service::sync`), `settings_window.rs` (`set_peek_settings` juga memanggil `switch_service::sync`), `src/settings/changelog.ts`, `README.md`.

- Item 0.1.4 diperbarui: "Intip jendela (pasang dari Katalog): …, dan ⌘Tab menampilkan semua jendela, termasuk yang di-minimize." / "Window peek (install it from the Catalog): …, and ⌘Tab shows every window, minimized ones too."
- README: satu bullet di "2 background tools", yang menjadi 3: "**Window peek.** Point at a Dock icon to see every window of the app; ⌘Tab shows every window, minimized ones too. Install it from the Catalog."

- [ ] **Step 1:** Implementasi.
- [ ] **Step 2:** Semua suite → lulus.
- [ ] **Step 3:** Commit `feat(window-peek): wire the switcher in; What's new and README`.

### Task 7: Review, build uji, cek di Mac, catatan verifikasi

- [ ] **Step 1:** Satu reviewer (model paling mampu) memeriksa seluruh perubahan sejak commit rencana ini. Satu putaran perbaikan untuk Critical/Important, masing-masing dengan tes yang gagal dulu bila bisa diuji tanpa AppKit.
- [ ] **Step 2:**
  - `npx tauri build --bundles app`.
  - Cadangkan settings.json.
  - Tutup v0.1.3, lalu jalankan build uji lewat `open -n … --stdout log --stderr log`.
  - Pemilik memberi izin Aksesibilitas dan Rekam Layar ke build uji.
- [ ] **Step 3:** CPU diam 60 detik dengan pengalih menyala. Expected: rata-rata 0,00%.
- [ ] **Step 4:** Pemilik mencoba, lalu dicocokkan dengan log:
  1. ⌘Tab ditahan, lalu Tab, ⇧Tab, dan lepas ⌘,
  2. ⌘Tab cepat,
  3. Per app dengan ↓,
  4. M, W, Q, lalu Enter/Esc,
  5. Dari notch,
  6. mengganti tombol ke ⌥Tab, lalu memastikan ⌘Tab bawaan kembali bekerja,
  7. mematikan pengalih, lalu ⌘Tab bawaan bekerja,
  8. menutup paksa Notching lewat Activity Monitor saat ⌘Tab diambil alih, membuka lagi, lalu ⌘Tab bekerja (Review Focus 2).
- [ ] **Step 5:** Tutup build uji, buka lagi v0.1.3, dan ingatkan pemilik memasang lagi izin v0.1.3. Tulis `docs/superpowers/verification/2026-11-06-intip-jendela-2.md`, lalu commit.
