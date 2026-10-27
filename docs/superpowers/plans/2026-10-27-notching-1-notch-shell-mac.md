# Notching 1: Kerangka Notch di Mac — Rencana Kerja

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notch Notching sudah hidup di MacBook Air M4 dan monitor tambahan:
- Diam: tidak terlihat di layar ber-notch, berupa lensa tipis di layar lain.
- Hover: tetesan.
- Klik: panel dengan kartu sementara dan pil.
- Menutup: Esc atau klik di luar.
- Selama itu, klik tetap tembus ke menu bar dan CPU tetap hemat saat diam.

**Architecture:**
- **Tauri 2.** Satu jendela panel transparan (`NSPanel` lewat `tauri-nspanel` v2.1) di tengah atas setiap layar.
- **Rust:**
  - membaca layar dan notch dari AppKit,
  - memantau kursor secara global dengan event `NSEvent` (bukan polling),
  - menyalakan atau mematikan "tembus klik" per jendela berdasarkan area interaktif yang dikirim frontend.
- **Frontend (TypeScript tanpa framework):**
  - menjalankan fisika pegas dan menggambar SVG,
  - hanya meminta frame animasi selama ada yang bergerak.

**Tech Stack:**
- Tauri 2.12+, Rust stable.
- `tauri-nspanel` 2.1, `objc2` / `objc2-app-kit` 0.3.x (versi yang sama dengan yang dipakai Tauri).
- Vite + TypeScript, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-27-notch-design.md` (bagian 3, 4.1–4.3, 4.5, 4.6). Acuan gerak: `docs/superpowers/specs/2026-10-27-notch-mockups/full-flow-v3.html` (layar tanpa notch) dan `full-flow-notch.html` (layar ber-notch).

### Rangkaian rencana

Ini rencana 1 dari 5 untuk tahap "versi Mac untuk dipakai sendiri". Setiap rencana menghasilkan app yang bisa dijalankan:

1. **Kerangka notch di Mac** (rencana ini).
2. **Sistem modul dan kartu:**
   - manifest, daftar modul, pil yang terisi dari modul,
   - kartu terakhir diingat,
   - nyala, mati, copot, pasang lagi,
   - penyimpanan pengaturan,
   - teks Indonesia dan Inggris.
3. **Jendela pengaturan S1:**
   - enam bagian, pencarian,
   - slider dengan pratinjau,
   - halaman Izin,
   - ekspor dan impor,
   - mulai saat login,
   - pilihan layar,
   - keluar.
4. **Beranda dan notifikasi:**
   - Beranda: huruf titik-titik, cuaca, sholat, reminder.
   - Notifikasi: telinga, pil, G2, suara, titik terlewat.
5. **Enam modul tahap 1 lainnya.**

Setelah itu: versi Windows, lalu rilis publik.

## Global Constraints

- **Repo:** `/Users/hamdaniasril/dev/notch`. App ditaruh di root folder ini, di samping `docs/`.
- **Identitas app:**
  - Nama produk `Notching`.
  - Bundle identifier `id.web.notching`.
  - Nama paket Cargo `notching`.
- **Sistem:** macOS 13 ke atas, khusus Apple Silicon. Diuji di MacBook Air M4 (layar bawaan ber-notch, Retina) dan monitor 1920×1080 yang menjadi layar utama (menu bar ada di sana).
- **Gerak:** pegas, Euler semi-implisit, 6 sub-langkah per frame, dt per frame dibatasi 0,05 detik sebelum dikali skala waktu.
- **Konstanta pegas (kekakuan, redaman):**
  - W 110 / 13
  - H 80 / 6
  - s 90 / 14
  - bx 60 / 9
  - pw 170 / 18,5
  - ph 150 / 17,5
- **Redaman dan waktu:**
  - Redaman pegas tetesan dikali `1,7 − (kenyal / 100) × 1,3`.
  - Redaman pegas panel (pw, ph) dikali 1, tidak ikut kenyal.
  - Skala waktu `kecepatan / 100`.
- **Slider (rentang, bawaan):**

  | Slider | Rentang | Bawaan |
  |---|---|---|
  | kenyal | 0–100 | 100 |
  | kecepatan | 40–200 | 200 |
  | jarak tetesan | 2–28 px | 9 px |
  | tebal notch | 2–14 px | 4 px |

  Di rencana ini nilainya tetap bawaan. UI slider ada di rencana 3.
- **Pil:** muncul 320 ms (pada kecepatan 100) setelah panel "dekat" ukuran akhirnya (selisih lebar < 40, tinggi < 20). Angka ini dibagi skala waktu, jadi 160 ms pada kecepatan 200.
- **Bentuk panel:**
  - Sudut bawah R = `min(28, w, h/2)`.
  - Lengkung atas ke luar fl = `min(12, w × 0,3)`.
  - Warna #000.
- **Perilaku jendela:**
  - Tembus klik di luar area notch, panel, dan pil.
  - Tidak mencuri fokus, kecuali saat panel terbuka setelah diklik. Fokus dikembalikan begitu panel ditutup.
  - Tampil di atas semua jendela dan di semua Spaces.
  - Tidak tampil di Space layar penuh.
- **Hemat daya:** tidak ada `requestAnimationFrame` dan tidak ada event kursor ke frontend saat notch diam.
- **Jaringan:** tidak ada akses jaringan di rencana ini.

## Review Focus

1. **Klik ke menu bar saat notch diam.** Overlay berukuran 640×360 di tengah atas layar utama tidak boleh menghalangi klik ke menu app atau ikon status. → Uji di Task 4 (`idle rects stay within the hot zone`) dan cek manual di Task 9.
2. **Fokus keyboard setelah panel ditutup.** Setelah Esc atau klik di luar, ketikan harus kembali ke app sebelumnya, tidak "hilang" ke panel transparan. → Uji di Task 8 (`closing hands key status back`) dan cek manual di Task 9.
3. **Interaksi cepat:**
   - masuk-keluar hover berkali-kali,
   - Esc saat panel masih mengembang,
   - klik saat panel sedang menutup.

   Tidak boleh ada status macet, misalnya panel setengah terbuka atau pil tampil saat tertutup. → Uji di Task 4.
4. **Layar berubah saat app berjalan:** monitor dicabut atau dipasang, resolusi diganti. Overlay harus dibangun ulang tanpa jendela yatim dan tanpa crash. → Cek manual di Task 9.
5. **Dua layar dengan skala berbeda** (Retina 2× dan 1×). Posisi tengah, ketajaman bentuk, dan area hover harus tepat di kedua layar. → Uji di Task 6 (`css_rect_to_global` dan `global_to_css` di layar mana pun) dan cek manual di Task 9.

---

### Task 1: Alat kerja dan kerangka proyek

**Files:**
- Create (dari scaffold `create-tauri-app`): `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `src/main.ts`, `src/styles.css`, `src-tauri/**`
- Modify: `src-tauri/tauri.conf.json`, `.gitignore`, `package.json`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `npm test` (Vitest), `npm run dev` (Vite di port 1420), `npm run tauri dev`, `cargo test --manifest-path src-tauri/Cargo.toml`.

- [ ] **Step 1: Pasang Rust stable**

Run: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && source "$HOME/.cargo/env" && rustc --version`
Expected: `rustc 1.x.y (...)`. Xcode Command Line Tools sudah terpasang di `/Library/Developer/CommandLineTools`.

- [ ] **Step 2: Buat kerangka Tauri di folder sementara, lalu pindahkan ke repo**

Run:
```bash
cd "$(mktemp -d)" && npm create tauri-app@latest notching -- --template vanilla-ts --manager npm --identifier id.web.notching --yes \
  && rsync -a notching/ /Users/hamdaniasril/dev/notch/ && cd /Users/hamdaniasril/dev/notch && npm install
```
Expected: `src-tauri/Cargo.toml` berisi `name = "notching"`. `docs/` dan `.superpowers/` tetap utuh.

- [ ] **Step 3: Atur `src-tauri/tauri.conf.json`**

Isi yang diubah:
- `"productName": "Notching"`
- `"identifier": "id.web.notching"`
- `"app.windows": []`, karena overlay dibuat dari Rust
- `"bundle.macOS.minimumSystemVersion": "13.0"`

- [ ] **Step 4: Tambahkan Vitest dan jsdom**

Run: `npm i -D vitest jsdom`. Tambahkan script `"test": "vitest run --passWithNoTests"` ke `package.json`, lalu buat `vitest.config.ts` dengan `test.include: ['src/**/*.test.ts']`.

- [ ] **Step 5: Lengkapi `.gitignore`**

Pastikan ada `node_modules/`, `dist/`, `src-tauri/target/`, dan `.superpowers/`.

- [ ] **Step 6: Pastikan semua perintah jalan**

Run: `npm test && npm run build && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: ketiganya selesai tanpa error.

- [ ] **Step 7: Commit awal, lalu buat cabang kerja**

```bash
git init -b main && git add -A && git commit -m "chore: scaffold Notching (Tauri 2, vanilla TS) with design docs"
git switch -c feat/notch-shell
```

---

### Task 2: Pegas, konfigurasi, dan gerak

**Files:**
- Create: `src/notch/config.ts`, `src/notch/spring.ts`, `src/notch/motion.ts`
- Test: `src/notch/config.test.ts`, `src/notch/motion.test.ts`

**Interfaces:**
- Produces:
```ts
// config.ts
export interface NotchConfig { bounce: number; speed: number; dropDepth: number; thickness: number }
export const DEFAULT_CONFIG: NotchConfig;            // { bounce: 100, speed: 200, dropDepth: 9, thickness: 4 }
export const CONFIG_RANGES: Record<keyof NotchConfig, readonly [number, number]>;
export function clampConfig(c: Partial<NotchConfig>): NotchConfig;
// spring.ts
export interface Spring { x: number; v: number; t: number; k: number; c: number }
export function spring(x: number, k: number, c: number): Spring;           // v = 0, t = x
export function stepSpring(s: Spring, dt: number, dampingScale: number): void; // v += (k(t−x) − c·scale·v)·dt; x += v·dt
export function springAtRest(s: Spring): boolean;                        // |t−x| < 0.05 && |v| < 0.05
// motion.ts
export type SpringKey = 'W' | 'H' | 's' | 'bx' | 'pw' | 'ph';
export type Targets = Record<SpringKey, number>;
export const SPRING_CONSTANTS: Record<SpringKey, { k: number; c: number }>;
export const SUBSTEPS = 6; export const MAX_FRAME_DT = 0.05;
export function dropletDamping(bounce: number): number;  // 1.7 − bounce/100 × 1.3
export function timeScale(speed: number): number;        // speed / 100
export class NotchMotion {
  springs: Record<SpringKey, Spring>;
  t: number;                                   // waktu simulasi (detik, sudah dikali skala)
  constructor(start: Targets);
  setTargets(t: Targets): void;
  advance(frameSeconds: number, config: NotchConfig): number; // mengembalikan dt simulasi yang dipakai
  atRest(): boolean;
}
```

- [ ] **Step 1: Tulis test yang gagal**

```ts
// config.test.ts
test('defaults match the spec', () =>
  expect(DEFAULT_CONFIG).toEqual({ bounce: 100, speed: 200, dropDepth: 9, thickness: 4 }));
test('clampConfig keeps values inside the slider ranges', () =>
  expect(clampConfig({ bounce: 150, speed: 10, dropDepth: 40, thickness: 1 }))
    .toEqual({ bounce: 100, speed: 40, dropDepth: 28, thickness: 2 }));

// motion.test.ts
test('droplet damping follows 1.7 − bounce/100 × 1.3', () => {
  expect(dropletDamping(100)).toBeCloseTo(0.4); expect(dropletDamping(0)).toBeCloseTo(1.7); });
test('time scale is speed / 100', () => expect(timeScale(200)).toBe(2));
test('frame dt is capped at 0.05 s before scaling', () => {
  const m = new NotchMotion(rest()); expect(m.advance(1.0, { ...DEFAULT_CONFIG, speed: 100 })).toBeCloseTo(0.05); });
test('panel springs ignore the bounce slider', () => {
  const run = (bounce: number) => simulateOpen(bounce);     // pw 0→400 dan ph 0→124, 120 frame @ 1/60 s, kecepatan 100
  expect(run(0)).toEqual(run(100)); });
test('panel overshoot stays small, like the mockup', () => {
  const peak = Math.max(...simulateOpen(100).map(f => f.pw));
  expect(peak / 400).toBeGreaterThan(1.02); expect(peak / 400).toBeLessThan(1.06); });
test('motion comes to rest', () => {
  const m = new NotchMotion(rest()); m.setTargets({ ...rest(), pw: 400, ph: 124 });
  for (let i = 0; i < 300; i++) m.advance(1 / 60, DEFAULT_CONFIG);
  expect(m.atRest()).toBe(true); });
```
`rest()` dan `simulateOpen()` adalah helper kecil di file test yang sama. `rest()` mengembalikan `{ W: 42, H: 4, s: 0, bx: 0, pw: 0, ph: 0 }`.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/notch` → FAIL (modul belum ada).

- [ ] **Step 3: Implementasikan `config.ts`, `spring.ts`, `motion.ts` sesuai Interfaces**

`advance()`:
- dt = `min(MAX_FRAME_DT, frameSeconds) × timeScale(speed)`.
- `t += dt`.
- Lalu 6× `stepSpring(dt/6)`, dengan scale `dropletDamping(bounce)` untuk W/H/s/bx dan 1 untuk pw/ph.

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run src/notch` → PASS

- [ ] **Step 5: Commit**

`git add src/notch && git commit -m "feat(notch): spring physics and motion config"`

---

### Task 3: Bentuk lensa, notch, dan panel

**Files:**
- Create: `src/notch/shape.ts`
- Test: `src/notch/shape.test.ts`

**Interfaces:**
- Consumes: tidak ada.
- Produces:
```ts
export interface Liquid { W: number; H: number; s: number; bx: number }
export interface NotchSize { width: number; height: number }
export function liquidDepth(x: number, m: Liquid, minH: number): number;
export function lensPath(m: Liquid): string;                      // 90 segmen, minH 0.5
export function notchPath(notch: NotchSize, m: Liquid): string;   // fl 6, NR 10, 120 segmen, minH 0
export function panelPath(pw: number, ph: number): string;
```
Rumusnya disalin dari mockup, tanpa diubah:
- `depth()` dan `lensPath()`: `full-flow-v3.html` baris 152–169.
- `panelPath()`: `full-flow-v3.html` baris 170–175.
- `extra()` dan `notchPath()`: `full-flow-notch.html` baris 171–186.

Semua angka ditulis dengan `toFixed(2)`. Satu-satunya pengecualian adalah tepi atas `y = 0`, yang ditulis `0`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
const flat = { W: 42, H: 4, s: 0, bx: 0 };
test('lens is full depth at the centre and zero at and beyond the edges', () => {
  expect(liquidDepth(0, flat, 0.5)).toBeCloseTo(4);
  expect(liquidDepth(42, flat, 0.5)).toBe(0); expect(liquidDepth(-50, flat, 0.5)).toBe(0); });
test('lens is never thinner than minH at the centre', () =>
  expect(liquidDepth(0, { ...flat, H: 0.1 }, 0.5)).toBeCloseTo(0.5));
test('bead profile halfway out', () =>
  expect(liquidDepth(21, { W: 42, H: 13, s: 1, bx: 0 }, 0)).toBeCloseTo(13 * Math.pow(0.75, 2.4)));
test('cursor bias moves the deepest point', () =>
  expect(liquidDepth(6, { W: 42, H: 13, s: 1, bx: 6 }, 0)).toBeCloseTo(13));
test('panel path for a 400 × 124 panel', () => expect(panelPath(400, 124)).toBe(
  'M -212.00 0 Q -200.00 0 -200.00 12.00 L -200.00 96.00 Q -200.00 124.00 -172.00 124.00 ' +
  'L 172.00 124.00 Q 200.00 124.00 200.00 96.00 L 200.00 12.00 Q 200.00 0 212.00 0 Z'));
test('notch path starts at the physical notch outline', () =>
  expect(notchPath({ width: 164, height: 32 }, { W: 70, H: 0, s: 0, bx: 0 }))
    .toMatch(/^M -88\.00 0 Q -82\.00 0 -82\.00 6\.00 L -82\.00 22\.00 /));
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/notch/shape.test.ts` → FAIL

- [ ] **Step 3: Implementasikan `shape.ts` sesuai Interfaces**

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run src/notch/shape.test.ts` → PASS

- [ ] **Step 5: Commit**

`git add src/notch && git commit -m "feat(notch): lens, notch and panel shapes"`

---

### Task 4: Pengendali status dan area interaktif

**Files:**
- Create: `src/notch/controller.ts`, `src/notch/hit.ts`, `src/notch/test-helpers.ts`
- Test: `src/notch/controller.test.ts`, `src/notch/hit.test.ts`

**Interfaces:**
- Consumes: `NotchMotion`, `Targets`, `timeScale` (Task 2), `NotchSize` (Task 3), `NotchConfig`.
- Produces:
```ts
// controller.ts
export type Phase = 'idle' | 'hover' | 'open' | 'closing';
export interface CardSize { width: number; height: number }
export const PLACEHOLDER_CARD: CardSize;                    // { width: 400, height: 90 }
export interface ControllerDeps {
  notch: NotchSize | null; config: NotchConfig; card: CardSize;
  setTimer: (fn: () => void, ms: number) => () => void;     // mengembalikan fungsi pembatal
}
export class NotchController {
  readonly motion: NotchMotion;
  constructor(deps: ControllerDeps);
  get phase(): Phase; get pillVisible(): boolean; get contentVisible(): boolean; get panelVisible(): boolean;
  pointer(inside: boolean, cursorX: number): void;   // cursorX relatif terhadap tengah overlay
  click(): void; escape(): void; resignKey(): void;
  frame(frameSeconds: number): void;                 // memajukan gerak + status
  targets(): Targets;
  panelSize(): { w: number; h: number };             // ukuran akhir panel untuk kartu ini
  needsFrames(): boolean;                            // false hanya jika idle/closing selesai dan motion.atRest()
}
// hit.ts
export interface Rect { x: number; y: number; w: number; h: number }  // px CSS, origin kiri-atas jendela overlay
export const OVERLAY_SIZE: { w: 640; h: 360 };
export function hitRects(c: NotchController, pill: Rect | null): Rect[];
```
Target per status. Rumusnya dari `setTargets()` kedua mockup. `T` = tebal notch, `d` = jarak tetesan.

| Status | Tanpa notch | Dengan notch (NW × NH) |
|---|---|---|
| diam | W 42, H T, s 0, bx 0, pw 0, ph 0 | W 70, H 0, s 0, bx 0, pw 0,8·NW, ph 0,8·NH |
| hover | W 42 − min(16, 0,6·d), H (T+d)(1 + 0,035·sin 2,2t), s 1, bx clamp(0,08·cursorX, ±6) | W 44 − min(16, 0,6·d), H d(1 + 0,035·sin 2,2t), s 1, bx clamp(0,08·cursorX, ±8) |
| terbuka | W 42, H T, s 0, bx 0, pw card.width, ph 18 + card.height + 16 | W 70, H 0, s 0, bx 0, pw card.width, ph NH + 10 + card.height + 16 |

- **Saat klik (posisi awal panel):**
  - Tanpa notch: `pw.x = max(16, 0,9·W)`, `ph.x = max(8, H)`, `ph.v = 60`.
  - Dengan notch: `pw.x = NW`, `ph.x = NH + max(0, H)`, `ph.v = 60`.
- **Menutup selesai** (status kembali `idle`, panel disembunyikan) saat:
  - tanpa notch: pw < 8 dan ph < 8,
  - dengan notch: pw < NW + 4 dan ph < NH + 4.
- **Area interaktif** (overlay 640 lebar, tengah cx = 320):

| Kondisi | Tanpa notch | Dengan notch |
|---|---|---|
| Diam | `{x: 260, y: 0, w: 120, h: 34}` | `{x: cx − NW/2 − 10, y: 0, w: NW + 20, h: NH + 10}` |
| Hover | tinggi `max(34, 14 + d + T)` | tinggi `NH + 14 + d` |
| Terbuka | panel `{x: cx − pw/2 − 12, y: 0, w: pw + 24, h: ph}` dari `panelSize()`, ditambah rect pil kalau terlihat | sama |

- [ ] **Step 1: Tulis test yang gagal**

```ts
// controller.test.ts — memakai timer palsu: setTimer menyimpan callback, test memajukannya
test('rest targets without a notch', () => expect(ctl(null).targets()).toEqual({ W: 42, H: 4, s: 0, bx: 0, pw: 0, ph: 0 }));
test('hover targets without a notch', () => {
  const c = ctl(null); c.pointer(true, 100);
  expect(c.targets()).toMatchObject({ W: 36.6, H: 13, s: 1, bx: 6 }); });
test('notched Mac is invisible at rest', () =>
  expect(ctl({ width: 164, height: 32 }).targets()).toMatchObject({ W: 70, H: 0, pw: 131.2, ph: 25.6 }));
test('open panel size follows the card', () => {
  expect(ctl(null).panelSize()).toEqual({ w: 400, h: 124 });
  expect(ctl({ width: 164, height: 32 }).panelSize()).toEqual({ w: 400, h: 148 }); });
test('pill appears 160 ms after the panel is near, at speed 200', () => {
  const c = ctl(null); c.click(); runUntilNear(c);
  timers.advance(159); expect(c.pillVisible).toBe(false);
  timers.advance(1); expect(c.pillVisible).toBe(true); });
test('escape while opening cancels the pill and ends idle', () => {
  const c = ctl(null); c.click(); frames(c, 3); c.escape();
  timers.advance(1000); expect(c.pillVisible).toBe(false);
  frames(c, 240); expect(c.phase).toBe('idle'); expect(c.panelVisible).toBe(false); });
test('click while closing reopens', () => {
  const c = ctl(null); c.click(); runUntilNear(c); c.escape(); frames(c, 2); c.click(); expect(c.phase).toBe('open'); });
test('rapid hover in/out never leaves the pill or panel showing', () => {
  const c = ctl(null); for (let i = 0; i < 20; i++) { c.pointer(i % 2 === 0, 0); frames(c, 1); }
  c.pointer(false, 0); frames(c, 240);
  expect(c.phase).toBe('idle'); expect(c.pillVisible).toBe(false); expect(c.needsFrames()).toBe(false); });
test('hovering keeps frames running (breathing)', () => { const c = ctl(null); c.pointer(true, 0); frames(c, 240); expect(c.needsFrames()).toBe(true); });

// hit.test.ts
test('idle rects stay within the hot zone (no notch)', () => expect(hitRects(ctl(null), null)).toEqual([{ x: 260, y: 0, w: 120, h: 34 }]));
test('idle rects stay within the hot zone (notch)', () =>
  expect(hitRects(ctl({ width: 164, height: 32 }), null)).toEqual([{ x: 228, y: 0, w: 184, h: 42 }]));
test('hover zone grows with drop depth', () => {
  const c = ctl(null, { dropDepth: 28 }); c.pointer(true, 0); expect(hitRects(c, null)[0].h).toBe(46); });
test('open rects cover the panel and the visible pill', () => {
  const c = ctl(null); c.click(); const pill = { x: 280, y: 134, w: 80, h: 34 };
  expect(hitRects(c, pill)).toEqual([{ x: 108, y: 0, w: 424, h: 124 }, pill]); });
```
Helper bersama ada di `src/notch/test-helpers.ts`, dan dipakai lagi di Task 5 dan 8:
- `timers`: `setTimer` palsu dengan `advance(ms)`, di-reset di `beforeEach`.
- `ctl(notch, override?)`: membuat `NotchController` dengan `DEFAULT_CONFIG` digabung `override`, `PLACEHOLDER_CARD`, dan `timers.setTimer`.
- `frames(c, n)`: menjalankan n frame 1/60 detik.
- `runUntilNear(c)`: menjalankan frame sampai panel "dekat" ukuran akhirnya.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/notch` → FAIL

- [ ] **Step 3: Implementasikan `controller.ts` dan `hit.ts` sesuai Interfaces dan tabel di atas**

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run src/notch` → PASS

- [ ] **Step 5: Commit**

`git add src/notch && git commit -m "feat(notch): state controller and hit rects"`

---

### Task 5: Tampilan SVG, loop animasi, dan pratinjau di browser

**Files:**
- Create: `src/notch/view.ts`, `src/bridge.ts`
- Modify: `index.html`, `src/main.ts`, `src/styles.css`
- Test: `src/notch/view.test.ts`

**Interfaces:**
- Consumes: `NotchController`, `hitRects`, `lensPath`, `notchPath`, `panelPath`, `Rect`.
- Produces:
```ts
// view.ts
export interface ViewDeps {
  raf: (cb: (now: number) => void) => number; caf: (id: number) => void;
  onHitRects: (rects: Rect[]) => void;   // dipanggil hanya jika rect berubah (dibulatkan ke 1 px)
  onPhase: (p: Phase) => void;           // dipanggil saat phase berubah
  onQuit: () => void;                    // Cmd+Q saat panel terbuka
}
export function mountNotch(root: HTMLElement, c: NotchController, deps: ViewDeps): { kick(): void; destroy(): void };
// bridge.ts
export interface ScreenInfo { label: string; hasNotch: boolean; notchWidth: number; notchHeight: number }
export interface PointerUpdate { inside: boolean; x: number; y: number }   // px CSS jendela overlay
export interface Bridge {
  screenInfo(): Promise<ScreenInfo>;
  setHitRects(rects: Rect[]): Promise<void>;
  setPanelKey(key: boolean): Promise<void>;
  onPointer(cb: (p: PointerUpdate) => void): () => void;
  onResignKey(cb: () => void): () => void;
  quit(): Promise<void>;
}
export function browserBridge(root: HTMLElement): Bridge;  // untuk `npm run dev` di browser biasa
```
Isi `browserBridge`:
- `?notch=1` di URL memalsukan notch 164×32.
- Pointer diambil dari `mousemove` dan `mouseleave` DOM terhadap `hitRects`.
- `setPanelKey` dan `quit` hanya `console.info`.

**Isi DOM** (satu `<svg>` 640×360 dengan origin x di tengah, `viewBox="-320 0 640 360"`):
- Path lensa atau notch: lensa untuk layar tanpa notch, notch fisik + cairan untuk layar ber-notch.
- Path panel, hanya saat `panelVisible`.
- `<div class="card">` sementara di dalam panel. Isinya teks "Notching" dan "Kartu Beranda menyusul." Muncul saat `contentVisible`, di bawah kamera kalau ada notch.
- `<div class="pill">` berisi ikon garis rumah dan ⋯ (salin SVG dari mockup). Ikon aktif diberi titik putih 3 px di bawahnya.

**Gaya:** `html`, `body`, dan root berlatar transparan, tanpa margin, `overflow: hidden`.

**Loop:**
- `kick()` meminta frame kalau belum berjalan.
- Setiap frame menjalankan `c.frame(dt)`, menggambar, lalu memanggil `onHitRects` dan `onPhase` kalau ada perubahan.
- Loop berhenti kalau `!c.needsFrames()`.

**Event yang dipasang `mountNotch`:**
- Klik pada area hot zone → `c.click()`.
- `keydown Escape` → `c.escape()`.
- `keydown Meta+q` → `deps.onQuit()`.

**`main.ts` (sementara):**
- Pakai `browserBridge` kalau `window.__TAURI_INTERNALS__` tidak ada.
- Sambungkan `bridge.onPointer` → `c.pointer(inside, x − 320)` → `kick()`.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan dua helper ke `test-helpers.ts`:
- `fakeRaf()`: antrean frame dengan `runAll(maxFrames)` dan `pending()`.
- `deps(r)`: `ViewDeps` berisi `vi.fn()` untuk setiap callback.

```ts
// @vitest-environment jsdom
test('loop stops once the notch is at rest', () => {
  const r = fakeRaf(); const c = ctl(null); mountNotch(document.body, c, deps(r)).kick();
  r.runAll(600); expect(r.pending()).toBe(0); });
test('kick restarts the loop after a pointer change', () => {
  const r = fakeRaf(); const c = ctl(null); const v = mountNotch(document.body, c, deps(r)); r.runAll(600);
  c.pointer(true, 0); v.kick(); expect(r.pending()).toBe(1); });
test('hit rects are reported on change only', () => {
  const r = fakeRaf(); const spy = vi.fn(); const c = ctl(null);
  mountNotch(document.body, c, { ...deps(r), onHitRects: spy }).kick(); r.runAll(600);
  expect(spy).toHaveBeenCalledTimes(1); });
test('Escape closes and Cmd+Q quits', () => {
  const r = fakeRaf(); const quit = vi.fn(); const c = ctl(null);
  mountNotch(document.body, c, { ...deps(r), onQuit: quit }); c.click();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); expect(c.phase).toBe('closing');
  c.click(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', metaKey: true })); expect(quit).toHaveBeenCalled(); });
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/notch/view.test.ts` → FAIL

- [ ] **Step 3: Implementasikan `view.ts`, `bridge.ts` (`browserBridge`), `main.ts`, `index.html`, `styles.css`**

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npm test` → PASS

- [ ] **Step 5: Cek di browser**

Run: `npm run dev`, lalu buka `http://localhost:1420/` dan `http://localhost:1420/?notch=1`.

Expected (latar putih):
- Hover di lensa → satu tetesan kenyal yang mengikuti kursor.
- Klik → panel mengembang dengan pantulan kecil, lalu pil muncul sesaat kemudian.
- Esc → panel menutup.
- Di `?notch=1`, saat diam yang terlihat hanya bentuk notch fisik.

Gerakannya harus terasa sama dengan `full-flow-v3.html` dan `full-flow-notch.html` di folder mockup.

- [ ] **Step 6: Commit**

`git add -A && git commit -m "feat(notch): SVG view, frame loop and browser preview"`

---

### Task 6: Geometri layar dan router kursor (Rust, tanpa AppKit)

**Files:**
- Create: `src-tauri/src/geometry.rs`
- Modify: `src-tauri/src/lib.rs` (tambah `mod geometry;`)
- Test: di dalam `geometry.rs` (`#[cfg(test)] mod tests`)

**Interfaces:**
- Produces:
```rust
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Rect { pub x: f64, pub y: f64, pub w: f64, pub h: f64 }   // AppKit: origin kiri-bawah, satuan point
impl Rect { pub fn contains(&self, px: f64, py: f64) -> bool; pub fn max_x(&self) -> f64; pub fn max_y(&self) -> f64 }
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
pub struct NotchGeom { pub width: f64, pub height: f64 }
pub const OVERLAY_W: f64 = 640.0;
pub const OVERLAY_H: f64 = 360.0;
pub fn notch_from_screen(frame: Rect, safe_top: f64, aux_left: Rect, aux_right: Rect) -> Option<NotchGeom>;
pub fn overlay_frame(screen: Rect) -> Rect;                      // tengah horizontal, menempel di tepi atas
pub fn css_rect_to_global(overlay: Rect, css: Rect) -> Rect;     // css: origin kiri-atas jendela
pub fn global_to_css(overlay: Rect, px: f64, py: f64) -> (f64, f64);
pub struct OverlayHit { pub label: String, pub frame: Rect, pub css_rects: Vec<Rect> }
#[derive(Debug, PartialEq)]
pub struct PointerRoute { pub label: String, pub inside: bool, pub changed: bool, pub x: f64, pub y: f64 }
#[derive(Default)] pub struct PointerRouter { /* status inside per label */ }
impl PointerRouter { pub fn route(&mut self, overlays: &[OverlayHit], px: f64, py: f64) -> Vec<PointerRoute> }
```
Aturan `route()` untuk setiap overlay:
- Kalau status inside berubah → kirim satu `PointerRoute` dengan `changed: true`.
- Kalau tetap di dalam → kirim `changed: false`, supaya tetesan bisa mengikuti kursor.
- Kalau tetap di luar → tidak kirim apa-apa.

- [ ] **Step 1: Tulis test yang gagal**

```rust
#[test] fn notch_is_screen_width_minus_aux_areas() {
    let f = Rect { x: 0.0, y: 0.0, w: 1470.0, h: 956.0 };
    let l = Rect { x: 0.0, y: 924.0, w: 653.0, h: 32.0 }; let r = Rect { x: 817.0, y: 924.0, w: 653.0, h: 32.0 };
    assert_eq!(notch_from_screen(f, 32.0, l, r), Some(NotchGeom { width: 164.0, height: 32.0 }));
    assert_eq!(notch_from_screen(f, 0.0, l, r), None); }
#[test] fn overlay_is_centred_at_the_top_of_any_screen() {
    assert_eq!(overlay_frame(Rect { x: 0.0, y: 0.0, w: 1470.0, h: 956.0 }), Rect { x: 415.0, y: 596.0, w: 640.0, h: 360.0 });
    assert_eq!(overlay_frame(Rect { x: -1920.0, y: 0.0, w: 1920.0, h: 1080.0 }), Rect { x: -1280.0, y: 720.0, w: 640.0, h: 360.0 }); }
#[test] fn css_and_global_coordinates_round_trip() {
    let o = Rect { x: 415.0, y: 596.0, w: 640.0, h: 360.0 };
    assert_eq!(css_rect_to_global(o, Rect { x: 260.0, y: 0.0, w: 120.0, h: 34.0 }), Rect { x: 675.0, y: 922.0, w: 120.0, h: 34.0 });
    assert_eq!(global_to_css(o, 735.0, 940.0), (320.0, 16.0));
    let left = overlay_frame(Rect { x: -1920.0, y: 0.0, w: 1920.0, h: 1080.0 });   // monitor di kiri layar utama
    let g = css_rect_to_global(left, Rect { x: 260.0, y: 0.0, w: 120.0, h: 34.0 });
    assert_eq!(g, Rect { x: -1020.0, y: 1046.0, w: 120.0, h: 34.0 });
    assert_eq!(global_to_css(left, g.x + 60.0, g.y + 17.0), (320.0, 17.0)); }
#[test] fn router_reports_enter_moves_and_exit_once() {
    let mut r = PointerRouter::default(); let o = vec![hit("notch-0")];   // hot zone global {675, 922, 120, 34}
    assert!(r.route(&o, 100.0, 100.0).is_empty());
    assert_eq!(r.route(&o, 735.0, 940.0)[0].changed, true);
    assert_eq!(r.route(&o, 736.0, 940.0)[0].changed, false);
    let out = r.route(&o, 100.0, 100.0); assert_eq!((out[0].inside, out[0].changed), (false, true));
    assert!(r.route(&o, 101.0, 100.0).is_empty()); }
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cargo test --manifest-path src-tauri/Cargo.toml geometry` → FAIL (gagal kompilasi)

- [ ] **Step 3: Implementasikan `geometry.rs` sesuai Interfaces**

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cargo test --manifest-path src-tauri/Cargo.toml geometry` → PASS

- [ ] **Step 5: Commit**

`git add src-tauri && git commit -m "feat(native): screen geometry and pointer router"`

---

### Task 7: Jendela overlay per layar

**Files:**
- Create: `src-tauri/src/screens.rs`, `src-tauri/src/overlay.rs`, `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json`, `src/bridge.ts` (tambah `tauriBridge()`), `src/main.ts`

**Interfaces:**
- Consumes: `Rect`, `NotchGeom`, `overlay_frame`, `notch_from_screen` (Task 6), dan `Bridge` (Task 5).
- Produces:
```rust
// screens.rs (main thread)
pub struct ScreenInfo { pub index: usize, pub frame: Rect, pub notch: Option<NotchGeom> }
pub fn current_screens(mtm: objc2::MainThreadMarker) -> Vec<ScreenInfo>;
pub fn watch_screen_changes(app: tauri::AppHandle);   // debounce 300 ms → overlay::rebuild_overlays
// overlay.rs
pub struct OverlayEntry { pub screen: ScreenInfo, pub frame: Rect, pub css_rects: Vec<Rect> }
#[derive(Default)] pub struct Overlays(pub std::sync::Mutex<std::collections::HashMap<String, OverlayEntry>>);
pub fn rebuild_overlays(app: &tauri::AppHandle) -> tauri::Result<()>;   // label "notch-{index}"
pub fn set_mouse_passthrough(app: &tauri::AppHandle, label: &str, passthrough: bool);
// commands.rs — semua panggilan AppKit lewat app.run_on_main_thread
#[tauri::command] fn get_screen_info(window: tauri::WebviewWindow, overlays: tauri::State<Overlays>) -> Result<ScreenInfoDto, String>;
#[tauri::command] fn set_hit_rects(window: tauri::WebviewWindow, overlays: tauri::State<Overlays>, rects: Vec<Rect>);
#[tauri::command] fn set_panel_key(app: tauri::AppHandle, window: tauri::WebviewWindow, key: bool) -> Result<(), String>;
#[tauri::command] fn quit_app(app: tauri::AppHandle);
#[derive(serde::Serialize)] #[serde(rename_all = "camelCase")]
pub struct ScreenInfoDto { label: String, has_notch: bool, notch_width: f64, notch_height: f64 }
```
```ts
// bridge.ts
export function tauriBridge(): Bridge;   // invoke('get_screen_info' | 'set_hit_rects' | 'set_panel_key' | 'quit_app'),
                                         // listen('notch://pointer'), listen('notch://resign-key') pada jendela ini
```

**Keputusan teknis yang dikunci:**
- **Dependensi Cargo:**
  - `tauri-nspanel = "2.1"`.
  - `objc2`, `objc2-foundation`, `objc2-app-kit`, dan `block2` di versi yang sama dengan yang ditarik Tauri. Fitur yang dibutuhkan: `NSScreen`, `NSEvent`, `NSWindow`, `NSPanel`, `NSResponder`, `NSApplication`, `NSGeometry`, `NSNotification`, `NSOperation`.
  - Periksa dengan `cargo tree -d | grep objc2`. Tidak boleh ada dua versi `objc2-app-kit`.
- **`lib.rs`:**
  - `.plugin(tauri_nspanel::init())`.
  - `.manage(Overlays::default())`.
  - Di `setup`: `app.set_activation_policy(tauri::ActivationPolicy::Accessory)` (tanpa ikon Dock), `rebuild_overlays`, `watch_screen_changes`.
- **Panel** dibuat dengan `tauri_panel! { panel!(NotchPanel { config: { can_become_key_window: true, is_floating_panel: true } }) }` dan `PanelBuilder`. Pengaturannya:
  - URL `index.html`
  - `.level(PanelLevel::Status)`
  - `.collection_behavior(CollectionBehavior::new().can_join_all_spaces().stationary().ignores_cycle())`. Sengaja **tanpa** `full_screen_auxiliary`, supaya overlay tidak tampil di Space layar penuh.
  - style mask `borderless().nonactivating_panel()`
  - `.transparent(true)`, `.has_shadow(false)`, `.no_activate(true)`, `.hides_on_deactivate(false)`
  - `.with_window(|w| w.accept_first_mouse(true))`, supaya klik pertama langsung sampai ke webview
- **Setelah panel dibuat:**
  - Frame diatur dengan koordinat AppKit lewat `setFrame_display(overlay_frame(screen.frame), true)` di `NSPanel`, bukan `set_position` Tauri. Ini supaya posisinya tepat di layar dengan skala berbeda.
  - Lalu `setIgnoresMouseEvents(true)` dan `show()`.
- **Kalau lensa tergambar di bawah menu bar,** ganti level ke `PanelLevel::Custom(27)`.
- **`set_panel_key(true)`** → `show_and_make_key()`. **`set_panel_key(false)`** → `hide()` lalu `show()`, supaya status key kembali ke app sebelumnya.
- **Capability:** `windows: ["notch-*"]` dengan `core:default`.

- [ ] **Step 1: Tambah dependensi, lalu `cargo check`**

Run: `cargo check --manifest-path src-tauri/Cargo.toml && (cd src-tauri && cargo tree -d | grep objc2-app-kit || true)`
Expected: kompilasi lulus. Baris `objc2-app-kit` paling banyak muncul satu versi.

- [ ] **Step 2: Implementasikan `screens.rs`, `overlay.rs`, `commands.rs`, dan perubahan `lib.rs`**

Untuk deteksi notch, `screens.rs` memakai `NSScreen::screens(mtm)`, `frame()`, `safeAreaInsets().top`, `auxiliaryTopLeftArea()`, dan `auxiliaryTopRightArea()`, lalu meneruskannya ke `notch_from_screen`. Untuk perubahan layar, `watch_screen_changes` memakai `NSNotificationCenter::defaultCenter()` dengan `NSApplicationDidChangeScreenParametersNotification` di main queue.

- [ ] **Step 3: Implementasikan `tauriBridge()`, lalu pakai di `main.ts` saat berjalan di Tauri**

Ukuran notch untuk `NotchController` diambil dari `screenInfo()`.

- [ ] **Step 4: Pastikan test lama tetap lulus**

Run: `npm test && cargo test --manifest-path src-tauri/Cargo.toml` → PASS

- [ ] **Step 5: Cek di perangkat**

Run: `npm run tauri dev`

Expected:
- Tidak ada ikon Dock.
- Di monitor 1920×1080, lensa hitam tipis tampil di tengah atas, di atas menu bar.
- Di layar MacBook, tidak ada yang terlihat.
- Klik di mana saja, termasuk menu app di dekat tengah menu bar, tetap berfungsi normal, karena overlay masih selalu tembus klik.

- [ ] **Step 6: Commit**

`git add -A && git commit -m "feat(native): transparent notch panel on every screen"`

---

### Task 8: Pemantau kursor, fokus, dan sambungan ke frontend

**Files:**
- Create: `src-tauri/src/pointer.rs`, `src/notch/connect.ts`
- Modify: `src-tauri/src/lib.rs`, `src-tauri/src/overlay.rs` (handler resign key), `src-tauri/src/commands.rs` (`set_hit_rects` memanggil `reroute_now`), `src/main.ts`, `src/notch/test-helpers.ts`
- Test: `src/notch/connect.test.ts`

**Interfaces:**
- Consumes: `PointerRouter`, `OverlayHit`, `global_to_css` (Task 6), `Overlays`, `set_mouse_passthrough` (Task 7), `NotchController`, `ViewDeps`, `Bridge`.
- Produces:
```rust
// pointer.rs (main thread)
#[derive(Clone, serde::Serialize)]
pub struct PointerPayload { pub inside: bool, pub x: f64, pub y: f64 }
pub fn start_pointer_monitor(app: tauri::AppHandle);
// Memasang NSEvent global monitor DAN local monitor untuk MouseMoved | LeftMouseDragged.
// Keduanya memanggil reroute_now: baca NSEvent::mouseLocation(), lalu router.route().
// Untuk setiap route: kalau changed → set_mouse_passthrough(label, !inside).
// Lalu app.emit_to(label, "notch://pointer", PointerPayload { inside, x, y }).
// Token monitor disimpan di thread_local! supaya tidak dilepas.
pub fn reroute_now(app: &tauri::AppHandle);
// Juga dipanggil set_hit_rects, supaya status tembus klik ikut berubah saat area mengecil
// atau membesar, tanpa menunggu mouse bergerak.
```
```ts
// connect.ts
export function connect(c: NotchController, bridge: Bridge, kick: () => void):
  Pick<ViewDeps, 'onHitRects' | 'onPhase' | 'onQuit'> & { dispose(): void };
// pointer → c.pointer(inside, x − 320), lalu kick()
// resign-key → c.resignKey(), lalu kick()
// onPhase('open') → bridge.setPanelKey(true)
// onPhase('closing') kalau sebelumnya 'open' → bridge.setPanelKey(false)
// onHitRects → bridge.setHitRects
// onQuit → bridge.quit()
// main.ts: const h = connect(c, bridge, () => view.kick());
//          const view = mountNotch(root, c, { raf, caf, ...h });
```
Panel memasang `panel_event!(NotchPanelEvents { window_did_resign_key(notification: &NSNotification) -> () })`. Handler-nya meng-emit `notch://resign-key` ke label panel itu. Cara memasangnya lihat `docs/event-handling.md` di repo `tauri-nspanel` cabang v2.1.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan helper `fakeBridge()` ke `test-helpers.ts`. Isinya:
- semua method `Bridge` berupa `vi.fn()`,
- `emitPointer(p)` dan `emitResignKey()` untuk memicu callback yang terdaftar.

```ts
test('pointer events drive hover with a centred cursor x', () => {
  const b = fakeBridge(); const kick = vi.fn(); const c = ctl(null); connect(c, b, kick);
  b.emitPointer({ inside: true, x: 420, y: 10 });
  expect(c.phase).toBe('hover'); expect(c.targets().bx).toBe(6); expect(kick).toHaveBeenCalled(); });
test('closing hands key status back', () => {
  const b = fakeBridge(); const h = connect(ctl(null), b, vi.fn());
  h.onPhase('open'); expect(b.setPanelKey).toHaveBeenLastCalledWith(true);
  h.onPhase('closing'); expect(b.setPanelKey).toHaveBeenLastCalledWith(false); });
test('hover-only phases never take key status', () => {
  const b = fakeBridge(); const h = connect(ctl(null), b, vi.fn());
  h.onPhase('hover'); h.onPhase('idle'); expect(b.setPanelKey).not.toHaveBeenCalled(); });
test('resign key closes the panel', () => {
  const b = fakeBridge(); const c = ctl(null); connect(c, b, vi.fn());
  c.click(); b.emitResignKey(); expect(c.phase).toBe('closing'); });
test('hit rects and quit are forwarded', () => {
  const b = fakeBridge(); const h = connect(ctl(null), b, vi.fn()); const r = [{ x: 260, y: 0, w: 120, h: 34 }];
  h.onHitRects(r); h.onQuit(); expect(b.setHitRects).toHaveBeenCalledWith(r); expect(b.quit).toHaveBeenCalled(); });
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/notch/connect.test.ts` → FAIL

- [ ] **Step 3: Implementasikan `connect.ts`, lalu pakai di `main.ts` (menggantikan sambungan sementara dari Task 5)**

- [ ] **Step 4: Implementasikan `pointer.rs` dan handler resign key**

Panggil `start_pointer_monitor` di `setup`, dan `reroute_now` di akhir `set_hit_rects`.

- [ ] **Step 5: Jalankan semua test**

Run: `npm test && cargo test --manifest-path src-tauri/Cargo.toml` → PASS

- [ ] **Step 6: Cek di perangkat**

Run: `npm run tauri dev`

Expected di kedua layar:
- Kursor ke notch → tetesan.
- Klik → panel dan pil.
- Esc → panel menutup.

Lalu buka TextEdit, klik notch, tekan Esc, dan langsung mengetik. Huruf harus muncul di TextEdit.

- [ ] **Step 7: Commit**

`git add -A && git commit -m "feat: pointer tracking, key focus and notch interaction"`

---

### Task 9: Verifikasi akhir di perangkat

**Files:**
- Create: `docs/superpowers/verification/2026-10-27-notch-shell-mac.md` (hasil cek, diisi saat menjalankan)

- [ ] **Step 1: Jalankan build rilis**

Run: `npm run tauri build -- --bundles app`, lalu buka `src-tauri/target/release/bundle/macos/Notching.app`.

- [ ] **Step 2: Ukur CPU saat diam**

Setelah app diam 10 detik tanpa kursor di dekat notch, jalankan:

Run: `for i in $(seq 10); do ps -o %cpu= -p $(pgrep -x Notching); sleep 1; done`
Expected: semua nilai di bawah 1,0.

- [ ] **Step 3: Cek checklist berikut dan tulis hasilnya di file verifikasi**

1. Di layar MacBook, notch tidak terlihat saat diam. Di monitor eksternal, lensanya tipis (4 px) dan tepat di tengah.
2. Hover di layar MacBook → tetesan turun dari bawah notch fisik. Klik → isi kartu mulai di bawah kamera.
3. Saat diam, menu app yang panjang di menu bar monitor utama bisa diklik di dekat tengah layar.
4. Esc dan klik di luar sama-sama menutup panel, dan ketikan langsung kembali ke app sebelumnya.
5. Pindah Space (Ctrl+→) → notch tetap ada. Buka app layar penuh (misalnya Safari dengan Ctrl+Cmd+F) → notch tidak tampil di Space itu.
6. Cabut monitor, lalu pasang lagi → overlay muncul kembali di kedua layar tanpa jendela ganda. Cek dengan memeriksa `pgrep -x Notching` (cukup satu proses) dan menghitung lensa yang terlihat.
7. Ganti resolusi layar MacBook di Pengaturan Sistem → notch tetap tepat di tengah dan tetesan tetap menyatu dengan notch fisik.
8. Gerakan terasa sama dengan mockup: tetesan kenyal, panel memantul kecil, pil muncul sesaat setelah panel terbuka.

- [ ] **Step 4: Perbaiki temuan dengan `superpowers:systematic-debugging`, lalu ulangi langkah yang gagal**

- [ ] **Step 5: Commit**

`git add -A && git commit -m "docs: verification notes for the Mac notch shell"`
