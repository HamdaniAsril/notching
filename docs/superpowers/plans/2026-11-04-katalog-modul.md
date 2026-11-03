# Katalog modul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Katalog page in Settings › Modul where every built-in module and widget package (except `home`) can be installed and uninstalled.

**Architecture:** The Rust `ModuleStore` learns to uninstall and reinstall widget packages (not `home`); everything downstream already filters on `installed && enabled`. The Settings window replaces its "Tambah modul" page (`add` route) with a card grid (`catalog` route) in a new `src/settings/pages/catalog.ts`, reachable from Modul, search, and the page editor.

**Tech Stack:** Tauri 2, Rust (`cargo test`), TypeScript without a framework, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-04-katalog-modul-design.md`

## Global Constraints

- Built-in only: no network, no download, no third-party packages.
- `home` is never uninstallable and never shown in the catalog.
- `Settings.uninstalled_modules` keeps its name (old settings files must still load).
- `set_enabled` stays module-only.
- Uninstall in the catalog takes a second click within `UNINSTALL_CONFIRM_MS` (4000 ms), text "Yakin? Klik lagi".
- After Pasang or Copot the route stays `{ page: 'catalog' }`.
- Card order is `modules/index.json` order with modules first, then widget packages.
- Copy (id): title "Katalog", sub "Semua isi Notching. Sudah ada di app, tanpa unduhan.", chips "Semua" · "Modul" · "Widget", kind labels "MODUL"/"WIDGET", "{n} widget", "Butuh izin: {list}", "Tanpa izin sistem", "v{version} · {size}", "Pasang", "Terpasang", "Copot", editor line "Widget lain ada di Katalog". Modul button: "Katalog".
- Copy (en): "Catalog", "Everything Notching has. Already in the app, nothing to download.", "All" · "Modules" · "Widgets", "MODULE"/"WIDGETS", "{n} widgets", "Needs: {list}", "No system permission", "v{version} · {size}", "Install", "Installed", "Uninstall", "More widgets in the Catalog", "Catalog".
- Volt style only: accent for the Pasang button, red for Copot, nothing else coloured.

## Review Focus

1. Uninstalling the pack whose widget is placed on Beranda/a custom page: the page keeps the placement and the notch shows an empty slot, not an error — pinned in Task 1 (core `width_of` returns None) and checked in the app (Task 5).
2. Uninstalling Musik while Now playing runs: the perl helper stops — `uninstall_module` already calls `media_service::module_gone`; checked in the app (Task 5).
3. A search hit for an uninstalled module or any pack lands on the catalog with that card highlighted — test in Task 3.
4. A failed install/uninstall leaves the card usable and shows the save error — test in Task 2.
5. Language switch while on the catalog redraws every card text — test in Task 2.

---

### Task 1: Store uninstalls and reinstalls widget packages

**Files:**
- Modify: `src-tauri/src/modules/store.rs`
- Modify: `src-tauri/src/app_core.rs` (tests only)

**Interfaces:**
- Produces: `pub const CORE_PACKAGE: &str = "home";` in `store.rs`; `StoreError::Core(String)` (Display: `"{id} cannot be uninstalled"`); `uninstall`/`reinstall` accept any known package except `CORE_PACKAGE`; `list` gives a removed widget package `installed: false, enabled: false`; `sync` removes any uninstalled package.

- [ ] **Step 1: Replace `widget_packages_cannot_be_switched_off` with failing tests**
  - `widget_packages_cannot_be_switched_off`: only `set_enabled("w", false)` → `Err(NotAModule("w"))`.
  - `a_widget_package_can_be_uninstalled_and_reinstalled`: `uninstall("w")` → Ok, `active/w` gone, `s.uninstalled_modules == ["w"]`, list entry `!installed && !enabled`; `reinstall("w")` → Ok, `active/w/index.html` exists, entry `installed && enabled`.
  - `the_core_package_stays`: add a widget package `home` to the fixture bundle and index; `uninstall("home")` and `reinstall("home")` → `Err(StoreError::Core("home".into()))`; settings untouched.
  - `sync_removes_an_uninstalled_widget_package`: settings with `uninstalled_modules = ["w"]`, `sync` → `active/w` absent.
  - In `app_core.rs`: `an_uninstalled_widget_package_has_no_widths`: after `core.uninstall("w")`, `core.width_of("w/one")` (or the existing width lookup) is `None`.
- [ ] **Step 2:** `cd src-tauri && cargo test modules::store` → the new tests FAIL.
- [ ] **Step 3: Implement.** Replace `module_only` in `uninstall`/`reinstall` with `removable(id)`: `known(id)?`, then `Core` for `CORE_PACKAGE`. In `sync` drop the `&& self.is_module(&id)` condition. In `list`, `installed = !settings.uninstalled_modules.contains(&id)`, `enabled = installed && (!module || !disabled.contains(&id))`. Update the `NotAModule` doc comment.
- [ ] **Step 4:** `cd src-tauri && cargo test` → all PASS.
- [ ] **Step 5: Commit** `feat(modules): widget packages can be uninstalled and installed again, except Beranda's`

### Task 2: The Katalog page

**Files:**
- Create: `src/settings/pages/catalog.ts`, `src/settings/pages/catalog.test.ts`
- Modify: `src/settings/types.ts` (Route `{ page: 'add' }` → `{ page: 'catalog' }`), `src/settings/shell.ts` (PAGES `catalog: catalogPage`, `section()`), `src/settings/pages/modules.ts` (remove `addPage`; the head button `modules.catalog` with label `s.catalog`, solid, goes to `{ page: 'catalog' }`), `src/modules/types.ts`, `src/i18n/id.json`, `src/i18n/en.json`, `src/settings/settings.css`, `src/settings/pages/modules.test.ts` (move the add-page tests to catalog tests)

**Interfaces:**
- Consumes: `widgetPreview(w: CatalogWidget, lang)` from `./widget-preview`; `moduleIcon`, `UNINSTALL_CONFIRM_MS` from `./modules`; `button`, `el`, `head`, `note` from `../controls`; `ctx.save`, `ctx.bridge.reinstallModule/uninstallModule`.
- Produces: `export const CORE_PACKAGE = 'home'` and `export const inCatalog = (m: ModuleInfo): boolean` (`m.id !== CORE_PACKAGE && (isModule(m) || m.widgets.length > 0)`) in `src/modules/types.ts`; `export const catalogPage: PageRender` in `catalog.ts`; strings under `settings.catalog` = `{ title, sub, all, modules, widgets, kindModule, kindWidgets, widgetCount, needs, noPermission, versionSize, install, installed, uninstall, uninstallConfirm, more }`; `settings.modules.catalog` replaces `modules.add`; `modules.addTitle/addSub/addOne/addNone` removed.
- DOM contract: each card `div.cat-card` with `data-row="catalog.<id>"`, `data-kind="module"|"widgets"`; buttons `data-key="catalog.<id>.install"` / `catalog.<id>.uninstall`; chips `data-key="catalog.filter.all|module|widgets"` with `aria-pressed`; grid `div.cat-grid`.

- [ ] **Step 1: Failing tests in `catalog.test.ts`** (mount like `modules.test.ts`):
  - lists modules then packs in state order, never `home`; titles `Katalog`, sub text exact.
  - a module card shows `Butuh izin: Kamera` for `permissions: ['camera']` and `Tanpa izin sistem` for none; permission names come from `settings.permissions` (`accessibility`, `camera`, `screen-recording`→`screenRecording`, `full-disk-access`→`fullDiskAccess`, `location`→ `general`'s location label or literal "Lokasi"/"Location").
  - a pack card shows one `.cat-peek > *` per widget up to 3 and `2 widget`.
  - `Pasang` on an uninstalled card calls `reinstallModule(id)`; route stays `catalog`.
  - `Copot` first click → text `Yakin? Klik lagi`, no call; after 4000 ms it resets; two clicks call `uninstallModule(id)`; route stays `catalog`.
  - a rejected `reinstallModule` leaves the button enabled and shows the save error (`.err`).
  - chips: `Modul` shows only `data-kind="module"` cards, `Widget` only packs, pressed state follows.
  - after `emitState` with `lang: 'en'` the title is `Catalog` and buttons say `Install`.
- [ ] **Step 2:** `npx vitest run src/settings/pages/catalog.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `catalogPage` with a module-level `filter: 'all' | 'module' | 'widgets'` like the page editor's; back button to Modul (reuse the `back` pattern from `modules.ts`, export it); confirm uses `ctx.env.setTimer` and `ctx.onCleanup`. Strings in both JSON files. CSS: `.cat-grid` 2 columns, 1 under 560 px pane width; `.cat-card` uses the existing card tokens; `.cat-peek` shrinks previews like `.ed-widget` does.
- [ ] **Step 4:** `npm test` → all PASS (fix the moved add-page tests and `i18n.test.ts` parity).
- [ ] **Step 5: Commit** `feat(settings): Katalog, every built-in module and widget package with Pasang and Copot`

### Task 3: Ways in — search and the page editor

**Files:**
- Modify: `src/settings/search.ts`, `src/settings/search.test.ts`, `src/settings/pages/page-editor.ts`, `src/settings/pages/page-editor.test.ts`

**Interfaces:**
- Consumes: `inCatalog` (Task 2), `settings.catalog.more`.
- Produces: search entries for modules section: installed modules → key `module.<id>`, route `{ page: 'module', id }` (unchanged); uninstalled modules and every pack in catalog → key `catalog.<id>`, route `{ page: 'catalog' }`, label = name, extra = description.

- [ ] **Step 1: Failing tests**
  - search: an uninstalled module gives `{ key: 'catalog.<id>', route: { page: 'catalog' } }`; a pack `waktu` is found by its name with the same shape; `home` is not an entry.
  - shell: clicking that result shows the catalog with `[data-row="catalog.<id>"].found`.
  - page editor: with an uninstalled pack in state, the widget list ends with a button `data-key="pageEdit.catalog"` text `Widget lain ada di Katalog` that goes to `{ page: 'catalog' }`; with all packs installed it is absent.
- [ ] **Step 2:** `npx vitest run src/settings` → new tests FAIL.
- [ ] **Step 3: Implement** in `search.ts` and in `pageEditor` after `widgetList(...)`.
- [ ] **Step 4:** `npm test` → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(settings): search and the page editor lead to the Katalog`

### Task 4: Browser bridge and spec bookkeeping

**Files:**
- Modify: `src/settings/bridge-browser.ts` (only if packs misbehave in `npm run dev`), `docs/superpowers/specs/2026-10-27-notch-design.md` §6 (one line: catalog of built-ins done 4 Nov, see the new spec), `docs/superpowers/specs/2026-10-30-halaman-widget-design.md` §11 (same).

- [ ] **Step 1:** Run the Settings page in the browser dev server, open Katalog, Pasang/Copot a pack and a module; the cards follow.
- [ ] **Step 2: Commit** `docs: the module catalog in the stage plan`

### Task 5: Verify in the app

**Files:**
- Create: `docs/superpowers/verification/2026-11-04-katalog-modul.md` (follow the folder/format of earlier verification documents)

- [ ] **Step 1:** `npm test`, `cd src-tauri && cargo test`, `npm run build` → all green; record counts.
- [ ] **Step 2:** Build and run the app (debug), open Settings › Modul › Katalog. Copot Musik: `uninstalledModules` in the settings file contains `musik`, `modules/musik` is gone from the active folder, no `perl` helper process, a page holding a Musik widget shows an empty slot. Pasang Musik: all back. Copot and Pasang Cermin. Record each with the file/log evidence.
- [ ] **Step 3:** Screenshot the catalog (id and en) into the verification folder.
- [ ] **Step 4: Commit** `docs: verifikasi katalog modul`
