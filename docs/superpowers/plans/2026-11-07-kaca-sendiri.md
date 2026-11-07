# Kaca buatan Notching: rencana pembangunan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kartu Intip jendela dan pengalih ⌘Tab dengan bahan Liquid glass memakai kaca yang digambar Notching sendiri dari potret diam layar di belakangnya: blur, tepi yang melengkungkan isi di belakang dengan sedikit pelangi, kilau tepi, dan warna kartu 40%.

**Architecture:**
- **Aturan murni di `glass_rules.rs`:** angka kaca, rumus lengkung, area potong, kapan kaca buatan dipakai, keadaan potret (`Slot`), dan animasi membuka.
- **Sisi macOS:**
  - `glass_capture.rs` memotret satu layar dengan ScreenCaptureKit, tanpa jendela panel itu sendiri;
  - `glass_draw.rs` menggambar kaca dengan Core Image (kernel dari prototipe);
  - `glass_view.rs` memasang hasilnya sebagai lapisan di bawah halaman, di tempat `NSGlassEffectView` sekarang, dengan animasi membuka dan pudar.
- **Sambungan:** `peek_service.rs` (kartu, lapisan intip, tombol jendela) dan `switch_service.rs` (pengalih).
- **Halaman:** kelas `own` dan `--own-tint` untuk warna 40%.

**Tech Stack:** Rust (Tauri 2, tauri-nspanel, objc2 0.6 dengan objc2-screen-capture-kit, objc2-core-image dan objc2-quartz-core 0.3), TypeScript tanpa framework, Vitest + jsdom, `cargo test --lib`.

**Cara membangun:** dikerjakan langsung di satu sesi (pemilik, 7 Nov 2026), superpowers:executing-plans, dengan satu reviewer di akhir.

**Spec:** `docs/superpowers/specs/2026-11-07-kaca-sendiri-design.md` (disetujui pemilik 7 Nov 2026). Acuan tampilan: `GLASS` di `docs/superpowers/specs/2026-11-07-kaca-sendiri-mockups/prototipe.html`. Desain Intip jendela: `docs/superpowers/specs/2026-11-05-intip-jendela-design.md`.

## Global Constraints

- **Kapan mulai:** setelah uji pengalih ⌘Tab (`docs/superpowers/plans/2026-11-06-intip-jendela-2-pengalih.md`) selesai dan masuk `main`. Mulai dari `main` terbaru.
- **Cakupan:** hanya kartu dan pengalih dengan bahan Liquid glass. Pekat tidak berubah. Tidak ada pilihan baru di Pengaturan.
- **Angka awal pemilik:**
  - warna 40%, blur 3,5 pt, lengkung di tepi 18 pt, lebar tepi kaca 26 pt;
  - tepi lebih tajam dari tengah 35%, pelangi 35% (di kernel 0,175), kilau 50%, saturasi 130%.
- **Tampilan sekarang** (kaca macOS 0,3 di macOS 26+, popover di 14–25, warna 10% terang / 12% gelap) dipakai saat:
  - tidak ada izin Rekaman Layar;
  - macOS sebelum 14;
  - "Kurangi transparansi" menyala;
  - potret gagal atau belum ada setelah 1 detik.
- **Izin:** tidak ada permintaan izin baru. `shot_service::screen_access()` (preflight) diperiksa sebelum memanggil ScreenCaptureKit apa pun.
- **Kapan memotret:** hanya saat kartu atau pengalih akan muncul atau sedang terbuka. Satu potret berjalan pada satu waktu. Tidak ada potret di belakang layar.
- **Memori:** potret hanya di memori dan dibuang saat panel tersembunyi. Tidak pernah ditulis ke disk.
- **Panel tidak menunggu potret.** Potret yang terlambat masuk dengan pudar 150 ms. Lebih dari 1 detik: tampilan sekarang selama panel itu terbuka. Kegagalan dicatat di log sekali per jalannya app.
- **Yang tidak ikut terpotret:** hanya jendela kartu, lapisan intip, dan pengalih. Jendela Notching lain tetap ikut.
- **Panel nspanel tidak pernah ditutup**, hanya disembunyikan.
- **Commit:** `git -c user.email=216042476+HamdaniAsril@users.noreply.github.com commit`. Tidak ada push tanpa izin pemilik.
- **Build uji:**
  - `npx tauri build --bundles app`;
  - cadangkan settings.json;
  - tutup Notching yang terpasang, lalu jalankan lewat `open -n … --stdout log --stderr log`;
  - pemilik sendiri yang memberi izin Aksesibilitas dan Rekaman Layar ke build uji.

## Review Focus

1. **Koordinat terbalik atau skala salah.** Gambar CG mulai dari kiri atas, Core Image dari kiri bawah, dan layar Retina 2×. Kaca yang menampilkan isi dari tempat yang salah langsung terlihat aneh. Test di Task 3: tepi atas mengambil warna dari atas panel, tepi bawah dari bawah, di skala 1 dan 2.
2. **Layar kedua dengan skala lain** (monitor 1× di samping Retina): skala diambil dari layar potretnya, bukan layar utama. Test di Task 3: gambar tanpa efek sama dengan potretnya di skala 1,0 dan 2,0.
3. **Panel di tepi layar** (ikon Dock paling kiri, pengalih Dari notch di tepi atas): area potong dijepit ke layar dan kernel tidak membaca di luar potret. Test di Task 1 (`crop` dijepit) dan Task 3 (panel menempel tepi kiri: ukuran hasil benar, tanpa panik).
4. **Kursor menyapu Dock dengan cepat:** potret tidak menumpuk, dan potret lama tidak dipakai untuk pembukaan yang lebih baru. Test di Task 1: `Slot` menolak potret kedua di layar yang sama, dan membuang hasil tiket lama setelah `forget`.
5. **Bahan atau Kurangi transparansi diganti saat Notching jalan:** pembukaan berikutnya harus ikut. Test di Task 1: tabel `own_possible`.

---

## Struktur file

**Rust (`src-tauri/src/`)**
- Baru:
  - `glass_rules.rs`: aturan murni, tanpa `cfg`, seperti `peek_rules.rs`.
  - `glass_capture.rs`: potret ScreenCaptureKit (macOS).
  - `glass_draw.rs`: Core Image (macOS).
  - `glass_view.rs`: lapisan di bawah halaman (macOS, main thread).
- Ubah:
  - `peek_service.rs`: `dress_window`, `on_hover`, `peek_size`, `peek_pointer`, `peek_hover`, `clear_stage`, `peek_act`, `hide_now`, `start`.
  - `switch_service.rs`: `open`, `switch_size`, `relist`, `hide`, jalur `EARLY_COMMIT`.
  - `lib.rs`: modul baru.
  - `Cargo.toml`:
    - objc2-core-image `CIContext`, `CIImage`, `CIKernel`, `CIVector`;
    - objc2-quartz-core `CALayer`, `CAShapeLayer`, `CAAnimation`, `CAMediaTimingFunction`, `CATransaction`;
    - objc2-app-kit `NSAccessibility` dan `objc2-quartz-core`;
    - objc2-core-graphics `CGContext`, `CGBitmapContext`, `CGColorSpace` (untuk test).
    - Pastikan nama fitur dengan `cargo check`.

**Halaman (`src/peek/`)**
- Ubah: `peek.css`, `view.ts`, `switcher.ts`, `main.ts`, `switcher-main.ts`, `view.test.ts`, `switcher.test.ts`.
- Baru: `peek-css.test.ts`.

---

### Task 1: Aturan kaca (`glass_rules.rs`)

**Files:** Create `src-tauri/src/glass_rules.rs`; Modify `src-tauri/src/lib.rs` (`mod glass_rules;` tanpa `cfg`).

**Interfaces:**
- Consumes: `crate::geometry::Rect`, `peek_rules::{Material, GlassShape, SwitchPlace}`.
- Produces:
  - `pub struct GlassLook { pub tint: f64, pub blur: f64, pub bend: f64, pub rim: f64, pub crisp: f64, pub rainbow: f64, pub shine: f64, pub saturation: f64 }`, dengan `Default` = `0.40, 3.5, 18.0, 26.0, 0.35, 0.35, 0.50, 1.30`.
  - `pub fn look(tuned: Option<&str>) -> GlassLook`. Isinya `NOTCHING_GLASS_LOOK`, misalnya `"bend=22,blur=4"`. Kunci = nama field. Pasangan rusak, kunci tak dikenal, dan angka negatif diabaikan; `tint`, `crisp`, `rainbow`, `shine` dibatasi 0..1.
  - `pub fn bend_at(depth: f64, look: &GlassLook) -> f64` = `bend × (1 − √(1 − (1 − u)²))`, dengan `u = clamp(depth / rim, 0, 1)`.
  - `pub fn margin(look: &GlassLook) -> f64` = `bend + 3 × blur`.
  - `pub fn crop(panel: Rect, screen: Rect, look: &GlassLook) -> Rect`: panel diperluas `margin` di keempat sisi, lalu dipotong ke `screen`.
  - `pub fn own_possible(material: Material, can_capture: bool, reduce_transparency: bool, macos_major: i64) -> bool`.
  - `pub enum Snap { None, Waiting, Ready, Failed }`.
  - `#[derive(Default)] pub struct Slot`, dengan method:
    - `begin(&mut self, screen: Rect, force: bool) -> Option<u64>`;
    - `finish(&mut self, ticket: u64, ok: bool) -> bool`;
    - `give_up(&mut self, ticket: u64)`;
    - `forget(&mut self)`;
    - `state(&self) -> Snap`;
    - `screen(&self) -> Option<Rect>`.
  - `pub enum Opening { Rise, Fade, Drop }` dan `pub fn opening(switcher: Option<SwitchPlace>) -> Opening`: kartu `Rise`, Tengah `Fade`, Dari notch `Drop`.
  - Konstanta:
    - `RISE_MS: u64 = 160`, `RISE_PT: f64 = 8.0`, `FADE_IN_MS: u64 = 120`, `DROP_MS: u64 = 260`;
    - `DROP_CURVE: [f64; 4] = [0.2, 0.9, 0.3, 1.15]`, `DROP_FROM: [f64; 4] = [0.0, 0.40, 0.92, 0.40]` (inset atas, kanan, bawah, kiri, sebagai pecahan);
    - `LATE_FADE_MS: u64 = 150`, `GIVE_UP: Duration = 1 s`, `STAGE_SHADE: f64 = 0.55`.

- [ ] **Step 1: Failing tests** (`#[cfg(test)] mod tests`):
  - `default_look_is_the_owners_pick`: semua delapan angka di atas.
  - `tuned_look_takes_good_pairs_only`:
    - `look(Some("bend=22, blur=4,x=1,shine=9,rim=-3"))` → `bend 22`, `blur 4`, `shine 1.0`, `rim 26` (yang lain bawaan);
    - `look(None)` = `Default`.
  - `bend_is_full_at_the_edge_and_gone_past_the_rim`:
    - `bend_at(0)` = 18; `bend_at(26)` = 0; `bend_at(40)` = 0;
    - `bend_at(13)` ≈ 2,412 (±0,01);
    - menurun untuk kedalaman 0, 5, 10, 20.
  - `margin_covers_bend_and_blur`: 28,5.
  - `crop_grows_by_the_margin_and_stays_on_screen`:
    - panel `{x:500,y:600,w:636,h:210}` di layar `{0,0,1470,956}` → `{471.5, 571.5, 693, 267}`;
    - panel `{x:4,y:700,w:300,h:240}` → `x = 0` dan bawah tidak lewat 956.
  - `own_glass_needs_glass_capture_full_transparency_and_macos_14`:
    - `(Glass, true, false, 27)` → true;
    - `(Solid, …)`, `(Glass, false, …)`, `(Glass, true, true, …)`, `(Glass, true, false, 13)` → false.
  - `slot_keeps_one_picture_per_screen` (Review Focus 4):
    - `begin(A, false)` → `Some(t1)`;
    - `begin(A, false)` lagi selagi `Waiting` → `None`;
    - `finish(t1, true)` → true dan `Ready`;
    - `begin(A, false)` → `None`; `begin(A, true)` → `Some(t2)`; `begin(B, false)` → `Some`.
  - `slot_drops_late_and_forgotten_pictures`:
    - `begin` → t1, `forget()`, `finish(t1, true)` → false dan `Snap::None`;
    - t1 lalu paksa t2: `finish(t1, …)` → false;
    - `give_up(t)` selagi `Waiting` → `Failed`; `finish(t, false)` → `Failed`.
  - `opening_follows_the_pages_animations`: membaca `include_str!("../../src/peek/peek.css")` dan `switcher.css`, lalu memastikan `rise .16s`, `fade .12s`, `drop .26s cubic-bezier(.2, .9, .3, 1.15)` dan `inset(0 40% 92% 40%` ada. Dengan begitu konstanta di atas tidak bisa diam-diam beda dari CSS.
  - `opening_maps_card_center_and_notch`: `opening(None)` = `Rise`, `opening(Some(SwitchPlace::Center))` = `Fade`, `opening(Some(SwitchPlace::Notch))` = `Drop`.
  - `stage_shade_matches_the_peek_layer`: `stage.css` berisi `rgba(0, 0, 0, .55)`.
- [ ] **Step 2:** `cargo test --manifest-path src-tauri/Cargo.toml --lib glass_rules` → FAIL (modul belum ada).
- [ ] **Step 3:** Implementasi di `glass_rules.rs`.
- [ ] **Step 4:** Test yang sama → lulus; `cargo clippy --manifest-path src-tauri/Cargo.toml --lib` → tanpa peringatan baru.
- [ ] **Step 5:** Commit `feat(window-peek): the rules of Notching's own glass`.

### Task 2: Potret layar untuk kartu (`glass_capture.rs`)

**Files:** Create `src-tauri/src/glass_capture.rs`; Modify `lib.rs` (`#[cfg(target_os = "macos")] mod glass_capture;`), `Cargo.toml`, `peek_service.rs` (`on_hover`, `hide_now`).

**Interfaces:**
- Consumes: `glass_rules::{Slot, Snap, own_possible}`, `shot_service::screen_access()`, `peek_rules::Material`.
- Produces:
  - `pub enum Owner { Card, Switcher }`.
  - `pub struct Snapshot { pub screen: Rect, pub scale: f64, pub image: CFRetained<CGImage> }`. `screen` dalam pt CG global; `scale` = piksel per pt dari display yang dipotret.
  - `pub fn can_draw(material: Material) -> bool`: `own_possible` dengan `screen_access()`, `NSWorkspace…accessibilityDisplayShouldReduceTransparency()`, dan versi macOS dari `NSProcessInfo`.
  - `pub fn begin(app: &AppHandle, owner: Owner, screen: Rect, exclude: Vec<u32>, ready: fn(&AppHandle, Owner))`.
  - `pub fn retake(app: &AppHandle, owner: Owner, exclude: Vec<u32>, ready: fn(&AppHandle, Owner))`: layar terakhir, `force = true`.
  - `pub fn snapshot(owner: Owner) -> Option<Arc<Snapshot>>`.
  - `pub fn state(owner: Owner) -> Snap`.
  - `pub fn forget(owner: Owner)`.
  - `pub fn give_up_later(app: &AppHandle, owner: Owner)`: setelah `GIVE_UP`, `Slot::give_up` untuk tiket saat itu.

Cara kerjanya:
- `begin` dan `retake` tidak berbuat apa-apa tanpa `screen_access()`, walau pemanggilnya lupa memeriksa `can_draw`.
- Satu `Slot` per `Owner` di balik `Mutex`.
- `SCShareableContent::getShareableContentExcludingDesktopWindows_onScreenWindowsOnly_completionHandler(false, true, …)`.
- Display = `SCDisplay` yang `frame()`-nya memuat titik tengah `screen`.
- Filter `initWithDisplay_excludingWindows`, dengan `SCWindow` yang `windowID()` ada di `exclude`.
- `SCStreamConfiguration`: lebar/tinggi = `frame × scale` (piksel asli), `showsCursor(false)`.
- Pola blok dan antreannya sama dengan `peek_capture::screen_capture_kit`.
- Hasil diterima hanya kalau `Slot::finish` setuju, lalu `ready` dipanggil lewat `app.run_on_main_thread`.
- Log: `notching: glass picture {w}x{h} px in {ms} ms ({owner:?})` setiap potret, dan `notching: no glass picture: {why}` sekali per jalannya app.

Sambungan kartu:
- `on_hover`, cabang `Some(item)`, sebelum `later(OPEN_MS, …)` dan juga saat kartu sudah tampil: kalau `can_draw(settings(&app).material)`, panggil `begin(&app, Owner::Card, screen, card_exclude(app), card_glass_ready)`.
  - `screen` = layar penuh dari `screen_at` di titik tengah ikon.
  - `card_exclude` = `windowNumber()` panel `peek` dan `peek-stage` yang sudah ada.
- `card_glass_ready` di tugas ini hanya mencatat; gambarnya datang di Task 5.
- `hide_now`: `forget(Owner::Card)`.

- [ ] **Step 1:** Implementasi. Native, jadi tidak ada test unit; aturannya sudah diuji di Task 1.
- [ ] **Step 2:** `cargo build --manifest-path src-tauri/Cargo.toml` dan `cargo clippy --lib` → tanpa peringatan baru; `cargo test --lib` → lulus.
- [ ] **Step 3:** Commit `feat(window-peek): a still picture of the screen behind the card`.

### Task 3: Cek di Mac 1: tanda rekaman layar dan lama memotret (titik berhenti)

- [ ] **Step 1:** Build uji (Global Constraints). Bahan Liquid glass.
- [ ] **Step 2:** Pemilik menyorot 10 ikon Dock berbeda, lalu sekali lagi dengan bahan Pekat (tanpa potret) sebagai pembanding. Perhatikan bar menu dan Pusat Kontrol.
- [ ] **Step 3:** Dari log: catat median dan terlama `glass picture … ms`. Bandingkan dengan 350 ms.
- [ ] **Step 4:** **Lulus** kalau tanda rekaman layar sama dengan saat Pekat dan seperti sekarang. **Kalau berbeda: berhenti.** Tunjukkan ke pemilik dan tanyakan: diterima, atau kaca buatan dibatalkan. Jangan lanjut ke Task 4 tanpa jawaban.
- [ ] **Step 5:** Tulis hasilnya di `docs/superpowers/verification/2026-11-07-kaca-sendiri.md` (bagian "Cek 1"), lalu commit `docs(window-peek): glass capture check on the Mac`.

### Task 4: Menggambar kaca (`glass_draw.rs`)

**Files:** Create `src-tauri/src/glass_draw.rs`; Modify `lib.rs`, `Cargo.toml`, `peek_service.rs::start` (panggil `glass_draw::warm_up()` di thread sendiri).

**Interfaces:**
- Consumes: `glass_capture::Snapshot`, `glass_rules::{GlassLook, crop, margin, STAGE_SHADE}`, `peek_rules::GlassShape`.
- Produces:
  - `pub fn warm_up()`: kernel dikompilasi sekali, hasilnya disimpan.
  - `pub fn current_look() -> &'static GlassLook`: `glass_rules::look` dari `NOTCHING_GLASS_LOOK`, dibaca sekali per jalannya app. Semua pemanggil `render` dan `glass_view::show` memakai ini.
  - `pub struct Overlay { pub frame: Rect, pub picture: Option<Arc<Vec<u8>>> }`. `frame` dalam pt CG global; `picture` = PNG gambar jendela yang diintip.
  - `pub fn render(snap: &Snapshot, panel: Rect, shape: GlassShape, look: &GlassLook, overlay: Option<&Overlay>) -> Option<CFRetained<CGImage>>`.
    - Hasilnya berukuran `panel.w × scale` kali `panel.h × scale`.
    - Log: `notching: glass drawn in {ms} ms`.

Cara kerjanya:
- `CIContext` bawaan (Metal), disimpan.
- Dari potret: `crop` → `CIImage`.
  - Kalau ada `overlay`: kalikan warna dengan `1 − STAGE_SHADE`, lalu tempel gambar jendela di `frame`, bersudut 11 pt.
  - `imageByClampingToExtent`, lalu `imageByApplyingGaussianBlurWithSigma(blur × scale)` untuk versi buram.
- Kernel `CIKernel::kernelWithString` dengan dua sampler (tajam, buram), port dari `GLASS` di prototipe dengan angka dari `look`, semua jarak × `scale`:
  - `rainbow × 0.5` sebagai pelangi;
  - bobot buram `mix(1, smoothstep(0, .85, u), crisp)`;
  - normal dari selisih jarak ±0,5 pt;
  - bobot Rec. 709;
  - 1 pt terluar dihaluskan.
- **Core Image y-nya ke atas:**
  - area dari pt CG kiri atas jadi `y_ci = (snap.screen.h − (y − snap.screen.y + h)) × scale`;
  - arah cahaya kiri-atas `(−0,55, −0,85)` (y ke bawah) menjadi `(−0,55, +0,85)` di kernel.
- `flat_top`: persegi untuk jarak diperpanjang ke atas sejauh `radius + bend`, jadi tepi atas tidak melengkung dan tidak berkilau.
- Di luar bentuk panel: transparan.

- [ ] **Step 1: Failing tests** (`#[cfg(all(test, target_os = "macos"))]`). Potret buatan dibuat dengan `CGBitmapContext`.
  - `plain_glass_is_the_picture` (Review Focus 2): look dengan `bend 0, blur 0, shine 0, rainbow 0, saturation 1, crisp 1`, potret empat warna. Piksel tengah hasil = piksel potret di titik layar yang sama (±2 per kanal), di `scale` 1,0 dan 2,0.
  - `the_top_edge_bends_in_what_is_above` (Review Focus 1): potret merah di atas panel, hijau di bawahnya, biru di tempat panel. Look bawaan dengan `blur 0, shine 0`.
    - Piksel 0,5 pt di dalam tepi atas, di tengah lebar: merah lebih besar dari biru.
    - Piksel 0,5 pt di dalam tepi bawah: hijau lebih besar dari biru.
    - Di skala 1 dan 2.
  - `a_flat_top_does_not_bend`: sama, dengan `GlassShape { radius: 30.0, flat_top: true }`. Piksel 0,5 pt di dalam tepi atas tetap biru.
  - `a_panel_at_the_screen_edge_still_draws` (Review Focus 3): panel menempel tepi kiri layar. Hasilnya `Some`, ukurannya `panel × scale`.
- [ ] **Step 2:** `cargo test --manifest-path src-tauri/Cargo.toml --lib glass_draw` → FAIL.
- [ ] **Step 3:** Implementasi.
- [ ] **Step 4:** Test yang sama → lulus; `cargo test --lib` dan `cargo clippy --lib` → lulus.
- [ ] **Step 5:** Commit `feat(window-peek): Core Image draws the glass from the picture`.

### Task 5: Lapisan kaca, halaman, dan kaca kartu

**Files:**
- Create `src-tauri/src/glass_view.rs`.
- Modify:
  - `peek_service.rs`: `dress_window`, `peek_size`, `peek_pointer`, `card_glass_ready`, `hide_now`;
  - `switch_service.rs`: panggilan `dress_window` dengan `own: false`, sampai Task 7;
  - `src/peek/peek.css`, `view.ts`, `switcher.ts`, `main.ts`, `switcher-main.ts`, `view.test.ts`, `switcher.test.ts`.
- Create `src/peek/peek-css.test.ts`.

**Interfaces:**
- Consumes: Task 1, 2 dan 4.
- Produces:
  - `pub enum Enter { Opening(Opening), Fade, Now }`.
  - `pub fn show(app: &AppHandle, label: &str, panel: &NSPanel, image: &CGImage, shape: GlassShape, look: &GlassLook, enter: Enter)`.
  - `pub fn clear(app: &AppHandle, label: &str)`.
  - `pub fn showing(label: &str) -> bool`.
  - Keduanya mengirim `notching://glass` dengan `{ own: bool, tint: f64 }` ke jendela `label`.
  - `pub(crate) fn dress_window(app: &AppHandle, label: &str, s: PeekSettings, shape: GlassShape, own: bool)`:
    - `own` = `set_glass(false)`, tanpa efek;
    - selain itu jalur sekarang ditambah `glass_view::clear`.
  - TS: `export function setOwnGlass(root: HTMLElement, own: boolean, tint: number): void` di `view.ts`.
    - Menyimpan keadaan di `root.dataset.ownGlass` (`''` atau angka tint).
    - Memasang kelas `own` dan `style --own-tint` pada `#peek` atau `#sw`, sekarang dan setiap kali digambar ulang.
    - `renderPeek` dan `renderSwitcher` membacanya.

Lapisan:
- `NSView` berlapis, ditambahkan di bawah halaman dengan cara yang sama seperti `set_glass` (`addSubview_positioned_relativeTo(…, Below, None)`), seukuran content view.
- `layer.contents = image`, `cornerRadius = radius`, `masksToBounds`. `flat_top` hanya membulatkan sudut bawah (`maskedCorners`).
- `Enter::Opening`:
  - `Rise`: opacity 0→1 dan geser 8 pt ke atas, 160 ms ease-out;
  - `Fade`: opacity, 120 ms ease-out;
  - `Drop`: path `CAShapeLayer` dari `DROP_FROM` ke bentuk penuh, 260 ms, `CAMediaTimingFunction(DROP_CURVE)`. Kalau Core Animation menjepit 1,15, pakai `CAKeyframeAnimation` dengan lonjakan yang sama, dan cek di Mac.
- `Enter::Fade`: crossfade 150 ms.
- `Enter::Now`: tanpa animasi.

CSS (`peek.css`):
- `@property --c-bg { syntax: '<color>'; inherits: true; initial-value: transparent; }`;
- `#peek.mat-glass, #sw.mat-glass { transition: --c-bg .15s; }`;
- `#peek.mat-glass.own.card-light, #sw.mat-glass.own.card-light { --c-bg: rgba(255, 255, 255, var(--own-tint, .4)); }`;
- gelap: `rgba(16, 17, 15, var(--own-tint, .4))`.

Kaca kartu:
- `peek_size`, setelah `setFrame_display`:
  - kalau `can_draw` dan ada `snapshot(Card)` di layar yang sama: `render` → `dress_window(…, own: true)` → `glass_view::show`, dengan `Enter::Opening(opening(None))` saat kartu baru tampil (`first`) atau `Enter::Now` saat ukuran/tempat berubah;
  - kalau belum ada: `dress_window(…, own: false)`, dan `give_up_later` saat `first`.
- `card_glass_ready`: kalau kartu tampil, `render` → `show(Enter::Fade)`.
- `peek_pointer(inside: true)` pertama kali per pembukaan (bendera direset di `hide_now`): `retake(Owner::Card, …)`. Ini keadaan hover Dock, desain bagian 4.
- `hide_now`: `glass_view::clear(app, CARD)`.
- `render` boleh dipanggil di main thread: di percobaan butuh 2–5 ms. Desain bagian 6 menyarankan di luar main thread. Kalau log di Mac menunjukkan lebih dari 8 ms, pindahkan ke thread sendiri dan pasang hasilnya di main thread.

- [ ] **Step 1: Failing tests:**
  - `view.test.ts` `own glass adds its class and tint, and keeps them across renders`:
    - `setOwnGlass(root, true, 0.4)` lalu `mount({ ...VIEW, material: 'glass' })` → `#peek` berkelas `card-dark mat-glass own`, dan `style.getPropertyValue('--own-tint')` = `'0.4'`;
    - render ulang tetap `own`;
    - `setOwnGlass(root, false, 0.4)` → tanpa `own`.
  - `switcher.test.ts`: sama untuk `#sw`.
  - `peek-css.test.ts` (baca dari disk seperti `settings-css.test.ts`):
    - ada `rgba(255, 255, 255, var(--own-tint, .4))` dan `rgba(16, 17, 15, var(--own-tint, .4))` dalam aturan `.own`;
    - `rgba(255, 255, 255, .1)` dan `rgba(16, 17, 15, .12)` tetap ada di aturan `mat-glass` tanpa `.own`;
    - ada `@property --c-bg`.
- [ ] **Step 2:** `npx vitest run src/peek` → FAIL.
- [ ] **Step 3:** Implementasi halaman, `glass_view.rs`, dan sambungan kartu.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`, `cargo test --lib`, `cargo clippy --lib` → lulus.
- [ ] **Step 5:** Commit `feat(window-peek): the card shows Notching's own glass`.

### Task 6: Cek di Mac 2: kaca kartu

- [ ] **Step 1:** Build uji. Pemilik menilai kartu Terang dan Gelap di atas latar ramai (teks, garis, foto) dan latar polos, dibandingkan dengan prototipe.
- [ ] **Step 2:** Setel angka bersama pemilik lewat `NOTCHING_GLASS_LOOK`, dengan membuka ulang build uji. Angka akhir pemilik menggantikan `Default` di `glass_rules.rs`, dengan test `default_look_is_the_owners_pick` diperbarui.
- [ ] **Step 3:** Cocokkan dengan log:
  - lama memotret dan menggambar;
  - tanpa Rekaman Layar → tampilan sekarang, tanpa permintaan izin;
  - Kurangi transparansi → tampilan sekarang;
  - dua layar;
  - kartu pindah antar ikon;
  - kursor masuk ke kartu: nama app Dock, ikon membesar, dan Dock sembunyi-otomatis tidak tertinggal di kaca;
  - animasi naik seirama dengan halaman.
- [ ] **Step 4:** Tulis "Cek 2" di dokumen verifikasi, lalu commit `fix(window-peek): the owner's glass numbers` beserta catatannya.

### Task 7: Lapisan intip, tombol jendela, dan pengalih

**Files:** Modify `peek_service.rs` (`peek_hover`, `clear_stage`, `peek_act`), `switch_service.rs` (`open`, jalur `EARLY_COMMIT`, `switch_size`, `relist`, `hide`, `sw_glass_ready`).

**Interfaces:**
- Consumes: semua yang di atas.
- Produces: tidak ada yang baru.

Kartu:
- `peek_hover`: setelah lapisan intip tampil, kalau `glass_view::showing(CARD)`:
  - `render` dengan `Overlay { frame: window.frame, picture }` (PNG yang sama dengan untuk lapisan intip, disimpan sebelum diubah ke data URL);
  - `show(Enter::Now)`.
- `clear_stage`: gambar ulang tanpa overlay, `Enter::Now`.
- `peek_act`: setelah `show_for` setelah jeda 250 ms, `retake(Owner::Card, …)`. Hasilnya masuk lewat `card_glass_ready` (`Enter::Fade`).

Pengalih:
- `open`: kalau `can_draw(s.material)`, `begin(Owner::Switcher, screen, [windowNumber panel switcher], sw_glass_ready)`.
- `EARLY_COMMIT` (dilepas sebelum tampil) dan `hide`: `forget(Owner::Switcher)` dan `glass_view::clear(app, PANEL)`.
- `switch_size`: seperti `peek_size`, dengan `glass_shape(Some(s.place))` dan `Enter::Opening(opening(Some(s.place)))` saat `first`.
- `relist`: `retake(Owner::Switcher, …)`.
- `switcher-main.ts` mendengar `notching://glass` dan memanggil `setOwnGlass`.

- [ ] **Step 1:** Implementasi. Aturannya (`opening`, `Slot`) sudah diuji di Task 1; sisanya native dan dicek di Mac di Task 8.
- [ ] **Step 2:** `npm test`, `npx tsc --noEmit`, `cargo test --lib`, `cargo clippy --lib` → lulus.
- [ ] **Step 3:** Commit `feat(window-peek): the glass follows peeking, window buttons and the switcher`.

### Task 8: Review, cek di Mac 3, catatan verifikasi

- [ ] **Step 1:** Satu reviewer (model paling mampu) memeriksa seluruh perubahan sejak commit rencana ini, dengan desain di tangan. Satu putaran perbaikan untuk Critical/Important, masing-masing dengan tes yang gagal dulu bila bisa diuji tanpa AppKit.
- [ ] **Step 2:** Build uji. Pemilik mencoba, lalu dicocokkan dengan log:
  1. mengintip jendela: kaca ikut gelap dan gambar jendela ada di tempatnya;
  2. minimize dan tutup lewat tombol kartu: kaca menyusul dengan pudar;
  3. pengalih Tengah: pudar seirama;
  4. pengalih Dari notch: turun seirama, tepi atas tanpa lengkung;
  5. ⌘Tab cepat: tidak ada potret yang dipakai (log), tidak ada yang berkedip;
  6. M/W/Q di pengalih: kaca menyusul;
  7. potret pengalih lebih lama dari 140 ms (dari log): tampilan sekarang lalu pudar, tanpa kedip aneh;
  8. tanda rekaman layar di bar menu tetap seperti Cek 1.
- [ ] **Step 3:** CPU diam 60 detik dengan Intip jendela dan pengalih menyala. Expected: rata-rata 0,00%.
- [ ] **Step 4:**
  - Tutup build uji, buka lagi Notching yang terpasang, dan ingatkan pemilik memasang lagi izinnya.
  - Lengkapi dokumen verifikasi ("Cek 3", dengan bukti log), lalu commit `docs(window-peek): verification note for Notching's own glass`.
