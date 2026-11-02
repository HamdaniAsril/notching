# Volt Everywhere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every remaining part of Notching the Volt look. That covers the notch chrome, module pages, Titipan, Screenshot, Cleaner, the small windows and Settings. Behaviour stays the same.

**Architecture:**
- One shared token file, `src/kit/volt-tokens.css`, holds the fonts and `--v-*` variables. Every surface imports it.
- Each surface's CSS (and its DOM only where dot-matrix or dotted helpers are used) moves to Volt cards, Inter and Barlow, and the lime accent.

**Tech Stack:** Tauri 2, vanilla TS, vitest (jsdom), Vite, `@fontsource`.

**Spec:** `docs/superpowers/specs/2026-11-03-volt-seluruh-app-design.md`. Base language: `docs/superpowers/specs/2026-11-02-gaya-volt-design.md` §3–§4 and the widget code already restyled (e.g. `modules/waktu/widgets/clockdate.ts`, `src/kit/volt.css`).

## Global Constraints

**Fonts**
- Inter 500/600 for text, Barlow Condensed 600/700 for big numbers and titles, via `@fontsource`.
- No Space Grotesk or Space Mono, no uppercase labels, no wide letter-spacing.

**Colours**
- Accent `#C8F04A`, which is `#4C6B12` on light Settings surfaces. Danger `#E5484D`, only for destructive actions and failures.
- ink `#F3F5F0`, ink-2 `#C4C8BF`, muted `#8C9187`, faint `#454941`, track `#23251F`, accent-soft `#1D260B`, on-accent `#0F1404`.

**Shapes**
- Notch card: `#000`, `box-shadow: 0 0 0 1px #FFFFFF14`, radius 17, 16 px gaps.
- Small tiles: radius 12–14 with the same ring.
- No dotted lines anywhere (`.vdots`, `.hdots`, radial-gradient dot rules). Use separate cards or 1 px `#FFFFFF14` lines.
- No dot-matrix (`dotText`, `dotBar`).

**Text size**
- Text ≥ 9 px in the notch and ≥ 11 px in windows.

**Behaviour**
- No change to behaviour, Rust, shortcuts or flows.
- Panel sizes in `src/pages/route.ts` change only if a card layout needs it, with tests updated.
- Never close the nspanel window in any code path.

**Fit**
- Nothing overflows its box at real size. Check the longest realistic texts in both `id` and `en`.

**Process**
- Commit only your files on `feat/paket-widget`. Never push, merge, stash, reset or switch branches.
- Run `npx tsc --noEmit`, `npm test` and `npm run build:modules` before committing.

## Review Focus

1. **Leaks.** Settings light mode must stay readable, with the accent deep lime on white. Cermin's white lamp panel must keep dark text.
2. **Hover, selected, disabled and focus states.** These are often missed when colours are swapped. Every interactive control needs a visible focus ring.
3. **Long texts.** Module names in the Modul tiles, Cleaner app names and folder paths, and screenshot notices.
4. **Fonts in every window bundle:** `index.html`, `settings.html`, `editor.html`, `pick.html` and `clean.html`.
5. **No remaining imports** of removed helpers or fonts after cleanup. tsc and the build prove this.

---

The steps below are shared by Tasks 1–6.

**Shared steps:**
- [ ] **Step 1:** Read the spec, Global Constraints, the surface's current code, CSS and tests, and the already-Volt widget code for reference.
- [ ] **Step 2: Tests first.** Update or add tests for any DOM change: removed dot-matrix elements, new classes, accent state classes. CSS-only changes need no new test. Run them. Expected: FAIL where the DOM changes.
- [ ] **Step 3: Restyle.** Remove old-style rules rather than overriding them.
- [ ] **Step 4: Look at the surface** in the browser preview (`npm run dev`, port 1420, may already be running).
  - Pages: `/?notch=1&page=modules` for the notch, then click into modules. `/settings.html`, `/editor.html`, `/pick.html`, `/clean.html`.
  - Check id and en, light and dark where relevant (`resize_window` colorScheme is not available to you; use `matchMedia` overrides or CSS inspection).
  - Report what you looked at.
- [ ] **Step 5: Verify.** Run `npx tsc --noEmit`, `npm test` and `npm run build:modules`. Expected: pass.
- [ ] **Step 6:** Commit `feat(<area>): Volt look for <surface>`.

### Task 1: Tokens and notch chrome

**Files:**
- Create: `src/kit/volt-tokens.css`.
- Modify:
  - `src/kit/volt.css`: import the tokens and drop its duplicate variables and font imports.
  - `src/styles.css` and `src/notch/notch.css`: pill and notice ears.
  - `src/notch/pages.css`: the Modul grid, the back bar and the head, which should use the tokens.
  - `src/notch/view.ts` and `src/notch/page-view.ts`: only if DOM classes need changes.
  - `src/kit/kit.css`: switch the host body font to Inter. Keep `.lab` only if anything still uses it, otherwise remove it in Task 6.
- Produces: `src/kit/volt-tokens.css`, with the fonts (Inter 500/600, Barlow Condensed 500/600/700) and `--v-ink`, `--v-ink2`, `--v-muted`, `--v-dim`, `--v-faint`, `--v-track`, `--v-acc`, `--v-acc-soft`, `--v-on-acc`, `--v-ring` (`#FFFFFF14`) and `--v-danger` (`#E5484D`) on `:root`, with no element rules. Later tasks import it.

### Task 2: Module pages in iframes

**Files:** `modules/system-stat/*` (`card.ts` uses `dotBar`/`dotText`, so replace them with Volt `num`/`segs`/`bar`), `modules/keep-awake/*`, `modules/mirror/*` and the Timer page (`modules/timer/view.ts` and the `.tm-page` part of `modules/timer/style.css`, with its `html:has(.tm-page)` font restore removed).

**Rules:**
- Each page's content sits on black Volt cards inside the module frame.
- Each package already imports `kit.css`; also import `src/kit/volt.css` where not already. The widget kit's `.v-card` is for widgets, so module pages may use their own card class built from the tokens.

### Task 3: Titipan and Screenshot

**Files:** `src/shelf/view.ts`, `src/shot/*.ts`, and the "Titipan's shelf" and "Screenshot" sections of `src/notch/pages.css`.

### Task 4: Cleaner

**Files:** `src/cleaner/*.ts` (`home.ts` uses `dotText`, so replace it), and the Cleaner sections of `src/notch/pages.css`, from "Cleaner (design 1 Nov §4" to the end of the "breakdown" block.
- Ticked rows use the accent (was red).
- Destructive confirm buttons use `--v-danger`.

### Task 5: Small windows

**Files:** `src/editor/editor.css` (and its DOM only if needed), `src/pick/pick.css`, `src/clean/clean.css` and `src/clean/view.ts`. Each imports `src/kit/volt-tokens.css`.

### Task 6: Settings window and cleanup

**Files:**
- `src/settings/settings.css`: everything except the notch preview and the widget-sample blocks. Their copied `--v-*` variables and font imports get replaced by the tokens import.
- `src/settings/*.ts` and `src/settings/pages/*.ts`: only where DOM classes for dotted lines or uppercase labels must change.
- Cleanup:
  - Remove `src/kit/dots.ts` and its test if unused.
  - Remove `.lab`, `.vdots`, `.hdots` and `.rd` from `kit.css` if unused.
  - Remove `@fontsource/space-grotesk` and `@fontsource/space-mono` from `package.json` if unused.

**Rules:**
- Light and dark follow macOS, as today, using the light and dark values in the spec §4. Keep the vibrancy.
- Settings groups become rounded cards, with 1 px row lines and Inter text.
- Page titles are Barlow 600. Switches, segmented choices, the active sidebar item and primary buttons use the accent.

### Task 7: Check (controller)

- [ ] Look at every surface in the browser preview in id and en: notch pages, module pages, Titipan, Screenshot, Cleaner, Settings (light and dark), editor, pick and clean. Fix or route any overflow or leftover old style.
- [ ] Add a verification note listing the writer's calls, then commit it. Build the test app.
