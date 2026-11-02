# Widget Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sixteen new widgets drawn from the owner's `widget.pego`. They ship in four new widget packages (`waktu`, `fokus`, `rencana`, `sekitar`) plus a 1-column Timer widget. Three pieces of new core data come with them: sun times, hourly forecast, and air quality. There is also a `prefs` capability that holds a package's own settings.

**Architecture:**
- **Packages and pages.** Each package is a widget-only package with no module page, like `home`. Its one `index.html` + `main.ts` switches on `kit.widget`. Every widget is a `render<Name>(root, strings, lang, …)` that returns `{ update(…) }`. The function builds DOM with the shared helpers, and `main.ts` feeds it on a clock or from `home.data`.
- **Code layout.** Pure date, moon and breath math lives in small `.ts` files next to the widgets and is unit-tested without DOM. Rust adds the new fields to `HomeSnapshot` and a `prefs` store, and the gate maps the new calls.

**Tech Stack:** Tauri 2, Rust (chrono, ureq, serde), TypeScript vanilla, vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-02-paket-widget-design.md` (§ numbers refer to it). The pego source is `/Users/hamdaniasril/dev/notch/desain widget/widget.pego`, untracked in the main checkout. A condensed dump of every widget's tree is at `/private/tmp/claude-501/-Users-hamdaniasril-dev-notch/fd078dbb-a6ba-4a55-a244-4875e774b0e2/scratchpad/pego-widgets.txt`.

## Global Constraints

**Sizes and drawing**
- Frame sizes in the notch: 1 col 109×104, 2 col 234×104, strip 484×40 (spec §3). Nothing may overflow them. The panel never resizes for a widget, except a full view through `kit.expand(height ≤ 240)`.
- The widget frame is transparent on the black panel. Use the kit.css tokens: `--w`, `--g1`, `--g2`, `--g3`, `--red`. Labels use `.lab` (Space Mono 10px uppercase). Pego's red or paper tiles become black, with red on one element only (spec §3).
- Big numbers are `dotText` at `BIG_PITCH` 6 (42 px), one dot smaller via `fitPitch` when too wide. Small numbers use `dotText` at pitch 3 (21 px) or 2 (14 px). The dot font has only digits and `° % - :`, so words go in Space Mono, never `dotText`.

**Packages**
- Ids: `waktu`, `fokus`, `rencana`, `sekitar`. Append them in this order to `modules/index.json`, after `cleaner`.
- At most 8 widgets per package (`WIDGETS_MAX`).
- Every widget id has a name in both `locales/id.json` and `locales/en.json` under `widgets`, or `repo_modules_are_valid` fails.
- Kinds: `time`, `weather`, `work`, as in spec §4.

**Dependencies and network**
- No new npm or cargo dependencies.
- Lucide icons are copied as inline SVG strings into `src/kit/icons.ts` with an ISC notice comment.
- The only network hosts are `api.open-meteo.com`, `geocoding-api.open-meteo.com` and the new `air-quality-api.open-meteo.com`.

**Language and conventions**
- Copy is in Indonesian and English. No negative numbers on screen: "Selesai"/"Done", "Libur"/"Day off".
- Code comments in English, terse, matching the surrounding files.
- Never close an nspanel panel. This plan adds none.

## Review Focus

1. **No city chosen.** Every `sekitar` widget shows `noPlace` ("Isi kota di Pengaturan"), with no throw and no empty dots. The tests live in Tasks 4, 8, 9 and 10.
2. **Widest values in a column.** Each must fit in 109 px: Hari ke- "366", Bulan "100" + "%", Udara "500", Timer "60", and a temperature "-12°". Covered by Task 3 and Task 4 tests asserting the svg width ≤ 109.
3. **Day boundaries.** These views must be right at the edges of the day and the work hours:
   - **Matahari at night:** after sunset the arc is full and the line counts to the *next* sunrise. Before sunrise it also counts to sunrise.
   - **Jam kerja exactly at the end minute:** shows "Selesai".
   - **Pekan ini on a Sunday:** the week is Monday to Sunday and still includes today.

   Covered by Task 8, Task 12 and Task 5 tests.
4. **An old `weather.json` without `hourly`.** It still loads, and Cuaca per jam waits for the next fetch. Covered by a Task 9 Rust test.
5. **Damaged or oversized prefs.** A broken file reads as `{}`, so the widget uses its defaults. A write over 16 KB is refused. Covered by Task 11 and Task 12 tests.

---

## Bagian A: widgets on data that exists

### Task 1: Shared widget kit

**Files:**
- Create: `src/kit/widget.ts`, `src/kit/widget.test.ts`, `src/kit/icons.ts`, `src/kit/dates.ts`, `src/kit/dates.test.ts`
- Modify: `modules/home/widgets/shared.ts` (re-export `el`, `svgBox`, `big`, `COLUMN_PX` from `src/kit/widget.ts`; keep `HomeStrings` there)

**Interfaces:**
- Produces in `src/kit/widget.ts`:
  - `el(tag, cls?, text?)`, `svgBox(cls, svg)`, `big(root, text, cls?)` and `COLUMN_PX = 109`, moved as they are.
  - New `small(text: string, pitch: 2 | 3, cls = 'wd-small'): HTMLDivElement`, a `dotText` box.
  - New `dotRow(count: number, lit: number, now: number | null, cls = 'wd-row'): HTMLDivElement`. It returns `count` 5px dots spread across the width. Index `< lit` is `--w`, `now` is a 7px `--red` dot, and the rest are `--g3`.
- Produces in `src/kit/icons.ts`:
  - `ICONS: Record<IconName, string>`, where `IconName = 'sun' | 'moon' | 'cloud' | 'cloud-sun' | 'cloud-moon' | 'cloud-rain' | 'cloud-drizzle' | 'cloud-snow' | 'cloud-lightning' | 'cloud-fog' | 'wind' | 'timer'`.
  - Each value is a 24×24 Lucide `<svg>` with `stroke="currentColor"`.
  - `icon(name: IconName, size = 16): HTMLElement` returns `<i class="ic">` holding the SVG at that size.
  - `weatherIcon(code: number, night: boolean): IconName` maps WMO codes the same way `weatherKey` groups them (modules/home/format.ts). Clear and mostly-clear use the night variant at night.
- Produces in `src/kit/dates.ts` (local time, Monday-first):
  - `dayOfYear(d: Date): number` (1-based)
  - `daysInYear(y: number): number`
  - `isoWeek(d: Date): number`
  - `weekOf(d: Date): Date[]`: the 7 dates Mon to Sun containing `d`
  - `monthGrid(d: Date): (number | null)[][]`: rows of 7, Monday first, nulls before day 1 and after the last day
  - `shortDay(d: Date, lang: Lang): string`: "SEN"/"MON", uppercase, 3 letters from Intl `weekday:'short'` with the dot stripped
  - `zoneLabel(lang: Lang, d: Date, timeZone?: string): string`: Intl `timeZoneName:'short'`, e.g. "WIB" in id; "GMT+7" when that is all Intl gives

- [ ] **Step 1: Write the failing tests.**
  - `dates.test.ts`:
    - `dayOfYear(new Date(2026,9,31)) === 304`, `daysInYear(2026) === 365`, `daysInYear(2028) === 366`.
    - `isoWeek(new Date(2026,10,2)) === 45`, `isoWeek(new Date(2027,0,1)) === 53`.
    - `weekOf(new Date(2026,10,8))[0]` is Mon 2 Nov 2026 and `[6]` is Sun 8 Nov.
    - `monthGrid(new Date(2026,9,15))[0]` equals `[null,null,null,1,2,3,4]` (1 Oct 2026 is a Thursday), and the last row ends with `31` and then nulls.
    - `shortDay(new Date(2026,10,2),'id') === 'SEN'` and `shortDay(…,'en') === 'MON'`.
  - `widget.test.ts` (jsdom):
    - `dotRow(24, 9, 9)` has 24 circles/dots, exactly one `.now`, and 9 `.lit`.
    - `small('09:41',3)` holds an `svg.dm` whose height is `21`.
- [ ] **Step 2: Run `npx vitest run src/kit` and expect FAIL** (modules not found).
- [ ] **Step 3: Implement the three files and re-export from `shared.ts`.** `home` widgets keep importing from `./shared`. Add `.wd-row`, `.wd-small` and `.ic` styles to `src/kit/kit.css`.
- [ ] **Step 4: Run `npx vitest run src/kit modules/home`** and expect PASS. `home` tests must pass unchanged.
- [ ] **Step 5: Commit** with `feat(kit): shared widget helpers, Lucide icons and date math`.

### Task 2: Package `waktu`, with Jam + tanggal and Jam analog

**Files:**
- Create: `modules/waktu/{manifest.json,icon.svg,index.html,main.ts,style.css}`, `modules/waktu/locales/{id,en}.json`, `modules/waktu/widgets/{clockdate,analog}.ts` + `.test.ts`, `modules/waktu/widgets/fixtures.ts`
- Modify: `modules/index.json`, `src/settings/pages/widget-preview.ts` (default branch calls `packSample`)
- Create: `src/settings/pages/widget-samples.ts` + `.test.ts`, the editor samples for all new widgets (later tasks add cases here)

**Interfaces:**
- **Manifest:** `{"id":"waktu","version":"1.0.0","icon":"icon.svg","permissions":[],"capabilities":["home.data"],"widgets":[{"id":"clockdate","entry":"index.html","width":2,"kind":"time"},{"id":"analog","entry":"index.html","width":1,"kind":"time"}]}`. `home.data` is there for the city name. Task 3 and Task 13 append widgets.
- **Locale keys:**
  - `name` "Waktu"/"Time", `description`
  - `widgets.clockdate` "Jam + tanggal"/"Clock + date", `widgets.analog` "Jam analog"/"Analog clock"
- `renderClockDate(root, lang): { update(now: Date, city: string | null): void }`
  - Top line: left `.lab` is `"<CITY> · <zone>"`, or the zone alone when city is null. Right `.lab` is `"<shortDay> <dd>.<mm>"`.
  - Middle: `big(root, "HH:MM")`, which fits the 234 px frame at pitch 6.
  - Bottom: `dotRow(24, hour, hour)`.
- `renderAnalog(root, lang): { update(now: Date): void }`
  - An SVG 96×96 face: 12 tick dots (4 bigger), hour hand width 5, minute hand width 2.5, a red second hand of width 1.2, a red pin r=3.5, and the zone label under 12.
  - Hand angles: `hourDeg = (h%12)*30 + m*0.5`, `minDeg = m*6 + s*0.1`, `secDeg = s*6`. Exported as `handAngles(now: Date): { hour: number; minute: number; second: number }` for tests.
- `packSample(w: CatalogWidget, lang: Lang): HTMLElement[] | null` in `widget-samples.ts` returns the sample for `waktu/*`, `fokus/*`, `rencana/*`, `sekitar/*` and `timer/tile`, else null. `widgetSample`'s `default:` returns `packSample(w, lang) ?? [el('div','ed-plain',w.name)]`. Samples are static, drawn at 30 Oct 2026 09:32 like the existing ones.
- **Clock wiring in `main.ts`:**
  - `clockdate` updates on `everyMinute` (import from `modules/home/ticks.ts`) and reads `home.data` once a minute for `place?.name`.
  - `analog` updates every second via `setTimeout` aligned to the second.

- [ ] **Step 1: Write the failing tests.**
  - `clockdate.test.ts`: at 31 Oct 2026 09:41 with city "Jakarta":
    - the top text contains "JAKARTA" and "SAB 31.10" (id),
    - there is one `svg.dm` in `.wd-big`,
    - the dot row has 9 `.lit` and `.now` at index 9.
    - With city null, the left label has no "·".
  - `analog.test.ts`:
    - `handAngles(new Date(2026,9,31,9,41,30))` returns `{hour: 290.5, minute: 249, second: 180}`.
    - The rendered SVG has 12 tick circles and one `.sec` line.
  - `widget-samples.test.ts`: `packSample` returns non-null for `waktu/clockdate` and `waktu/analog`, and null for `home/date`.
- [ ] **Step 2: Run `npx vitest run modules/waktu src/settings/pages/widget-samples.test.ts`** and expect FAIL.
- [ ] **Step 3: Implement the package, the widgets and the samples.** Add `"waktu"` to `modules/index.json`. Icon: a line clock 24×24, like the other packages' icons.
- [ ] **Step 4: Run `npx vitest run modules/waktu src/settings && (cd src-tauri && cargo test repo_modules_are_valid)`** and expect PASS.
- [ ] **Step 5: Commit** with `feat(waktu): widget package with Jam + tanggal and Jam analog`.

### Task 3: Kalender, Hari ke- and Minggu ini (strip)

**Files:**
- Create: `modules/waktu/widgets/{calendar,yearday,weekstrip}.ts` + `.test.ts`
- Modify: `modules/waktu/manifest.json`, `modules/waktu/locales/*.json`, `modules/waktu/main.ts`, `modules/waktu/style.css`, `src/settings/pages/widget-samples.ts`

**Interfaces:**
- **Consumes:** `monthGrid`, `dayOfYear`, `daysInYear`, `weekOf`, `isoWeek`, `shortDay`, `big`, `small`, `el` from Task 1.
- **Widgets added to the manifest:**
  - `calendar` (2, time): "Kalender"/"Calendar"
  - `yearday` (1, time): "Hari ke-"/"Day of year"
  - `weekstrip` (4, time): "Minggu ini"/"This week"
- `renderCalendar(root, lang): { update(now: Date): void }`
  - **Left column:** `.lab` "KALENDER", the month short name (Space Mono 22px/500, uppercase), and the year `.lab`.
  - **Right side:** a 7-column grid. The header row has single-letter weekdays from Intl `narrow`. Day cells are 9px Space Mono, line-height 12px, so 6 rows + header fit 104 px.
  - **Marks:** today is `.today` (red pill). Saturday and Sunday columns are `--g2`.
- `renderYearDay(root, lang, strings): { update(now: Date): void }`
  - Shows `.lab` "HARI KE" with the year, then `big(root, String(dayOfYear))` in `--red`, a 12-segment month bar, and `.lab` "SISA {n} HARI".
  - Month bar: months before now are `--w`, the current month is `--red`, and later months are `--g3`.
- `renderWeekStrip(root, lang): { update(now: Date): void }`
  - **Left:** `.lab` with the weekday long name, then `small("31", 2)` + month short text.
  - **Middle:** 7 cells, each `.lab`-sized day name over `small(dd, 2)`. Today is `--w` with a 4px red dot after the day name. Past days are `--g2`, future days `--g1`.
  - **Right:** `.lab` "MGG" over `small(isoWeek, 2)`.
  - Everything sits in 40 px: two lines, 12 + 14 px plus a 4 px gap.
- **Clock:** all three update on `everyMinute`.

- [ ] **Step 1: Write the failing tests.**
  - `calendar.test.ts`:
    - On 31 Oct 2026 there is exactly one `.today` and its text is `31`.
    - The grid has 31 day cells.
    - The month label is "OKT" (id) and "OCT" (en).
  - `yearday.test.ts`:
    - On 31 Oct 2026 the big number's `svg.dm` width equals `dotWidth('304',6)`.
    - The label reads "SISA 61 HARI".
    - The bar has 9 `.lit`, 1 `.now` and 2 dim segments.
    - On 31 Dec 2028 it reads "366" and "SISA 0 HARI", and the svg width is ≤ 109.
  - `weekstrip.test.ts`:
    - On Sunday 8 Nov 2026 there are 7 cells, the first reads "SEN" and the last "MIN".
    - The last cell is `.today`, and the right side shows week `45`.
- [ ] **Step 2: Run `npx vitest run modules/waktu`** and expect FAIL.
- [ ] **Step 3: Implement the three widgets, the wiring and the samples.**
- [ ] **Step 4: Run `npx vitest run modules/waktu src/settings`** and expect PASS.
- [ ] **Step 5: Commit** with `feat(waktu): Kalender, Hari ke- and the Minggu ini strip`.

### Task 4: Package `sekitar`, with Cuaca besar and Bulan

**Files:**
- Create: `modules/sekitar/{manifest.json,icon.svg,index.html,main.ts,style.css}`, `modules/sekitar/locales/{id,en}.json`, `modules/sekitar/moon.ts` + `.test.ts`, `modules/sekitar/widgets/{bigweather,moon}.ts` + `.test.ts`
- Modify: `modules/index.json`, `src/settings/pages/widget-samples.ts`

**Interfaces:**
- **Manifest:** `capabilities: ["home.data"]`, with widgets `bigweather` (2, weather) "Cuaca besar"/"Weather, large" and `moon` (1, weather) "Bulan"/"Moon".
- **Locales:**
  - `noPlace` "Isi kota di Pengaturan"/"Set a city in Settings"
  - `weatherKinds` copied from `modules/home/locales`
  - `moonPhases`:
    - new "BARU"/"NEW", crescent "SABIT"/"CRESCENT", quarter "SEPARUH"/"HALF", gibbous "CEMBUNG"/"GIBBOUS", full "PURNAMA"/"FULL"
  - `fullIn` "Purnama {n} hari"/"Full in {n} days", `newIn` "Bulan baru {n} hari"/"New in {n} days", `today` "Hari ini"/"Today"
  - `high` "T"/"H", `low` "R"/"L"
- `moon.ts`:
  - `moonAge(ms: number): number` gives days since new moon, in [0, 29.530588853). Reference new moon: 2000-01-06 18:14 UTC (`947182440000`).
  - `moonInfo(ms): { age: number; lit: number; waxing: boolean; phase: 'new'|'crescent'|'quarter'|'gibbous'|'full'; toFull: number; toNew: number }`.
    - `lit` is a whole percent: `round((1 - cos(2π·age/P))/2·100)`.
    - Phase bands by `lit`: <3 new, <40 crescent, ≤60 quarter, <97 gibbous, else full.
    - `toFull` and `toNew` are whole days, ceil, 0 when within the band.
- `renderBigWeather(root, strings, lang): { update(s: HomeSnapshot, now: Date): void }`
  - **Left:** `.lab` city, `big(root, degrees(temp))`, condition text 12px.
  - **Right:** `icon(weatherIcon(code, night), 28)` and two `.lab` lines, "T 27°" and "R 18°".
  - `night` means now is before 06:00 or from 18:00. Task 8 replaces this with sun times.
  - No city: one `.lab` `noPlace`. No weather: "—".
- `renderMoon(root, strings, lang): { update(now: Date): void }`
  - Shows the `.lab` "BULAN · <phase>", then a 34 px moon SVG and `big(root, String(lit))` + `.lab` "%", then a red dot + `.lab` with `fullIn`/`newIn`, whichever is sooner.
  - The moon is a white disk with a `--g3` shadow path, mirrored when waning.
  - The percent uses `fitPitch` against `root.clientWidth - 40`.

- [ ] **Step 1: Write the failing tests.**
  - `moon.test.ts`:
    - At `Date.UTC(2026,10,24,14,53)` (full moon 24 Nov 2026) the phase is `full` and `lit` ≥ 99.
    - At `Date.UTC(2026,10,9,7,2)` (new moon 9 Nov 2026) the phase is `new`.
    - At 2 Nov 2026 12:00 UTC it is waning, the phase is `gibbous`, and `toNew` is 7.
  - `bigweather.test.ts` with SNAP-like data:
    - the temperature svg width equals `dotWidth('31°',6)`,
    - the text contains "T 33°" and "R 25°",
    - with `place: null` the text equals `noPlace` and there is no `svg.dm`.
  - `moon.test.ts` render:
    - at full moon the number svg is `dotWidth('100',…)` ≤ 109 − 40,
    - the label says "PURNAMA".
- [ ] **Step 2: Run `npx vitest run modules/sekitar`** and expect FAIL.
- [ ] **Step 3: Implement it.**
  - `main.ts` for `bigweather` uses `startTicks(kit, …, { weather: true })` from `modules/home/ticks.ts`.
  - `moon` uses `everyMinute`.
  - Add `"sekitar"` to `modules/index.json`.
- [ ] **Step 4: Run `npx vitest run modules/sekitar src/settings && (cd src-tauri && cargo test repo_modules_are_valid)`** and expect PASS.
- [ ] **Step 5: Commit** with `feat(sekitar): widget package with Cuaca besar and Bulan`.

### Task 5: Package `rencana`, with Pekan ini and Berikutnya

**Files:**
- Create: `modules/rencana/{manifest.json,icon.svg,index.html,main.ts,style.css}`, `modules/rencana/locales/{id,en}.json`, `modules/rencana/plan.ts` + `.test.ts`, `modules/rencana/widgets/{week,next}.ts` + `.test.ts`
- Modify: `modules/index.json`, `src/settings/pages/widget-samples.ts`

**Interfaces:**
- **Manifest:** `capabilities: ["home.data"]` (read only; no reminders writes). Widgets:
  - `week` (2, work): "Pekan ini"/"This week"
  - `next` (2, work): "Berikutnya"/"Up next"
- `plan.ts`:
  - `openReminders(rs: Reminder[]): Reminder[]` returns the not-done reminders, sorted by `day`, then `at` (null last), then `id`.
  - `nextTimed(rs, now: Date): Reminder | null` returns the first open reminder with `at > now`.
  - `nextThisWeek(rs, now): Reminder | null` returns the first open reminder whose day is in `weekOf(now)` and that is not past. A past one has `day < today`, or `at !== null && at <= now`.
  - `daysWithOpen(rs, now): Set<string>` returns the day keys of `weekOf(now)` that have an open reminder.
  - `untilText(ms: number, lang): string`:
    - under 60 min: "18 MNT"/"18 MIN",
    - under 24 h: "2 J"/"2 H" (floor hours),
    - else "3 HARI"/"3 DAYS".
- `renderWeek(root, strings, lang): { update(s: HomeSnapshot, now: Date): void }`
  - **Top:** `.lab` with the month name and "MGG 45".
  - **Middle:** 7 day columns: a narrow weekday letter `.lab`, then `small(dd, 2)` in a 22 px circle. Today's circle is filled `--w` with black dots. A day in `daysWithOpen` gets a 3 px dot under it.
  - **Bottom:** `.lab` with the time (`clock(at, lang)` or nothing), then the title in 12px `--w`, ellipsised. Empty: `weekEmpty` "Pekan ini kosong"/"Nothing this week".
- `renderNext(root, strings, lang): { update(s, now): void }`
  - **Top:** `.lab` "BERIKUTNYA" left, `untilText` right.
  - **Middle:** the title at 15px/500, max two lines, then ellipsis.
  - **Bottom:** `.lab` with the day ("Hari ini"/"Besok"/weekday) left, `small(clock(at), 3)` right.
  - Empty: `nextEmpty` "Tidak ada yang dijadwalkan"/"Nothing scheduled".
- **Wiring:** both use `startTicks(kit, …, { weather: false })`.
- **No click.** This drops spec §5's "Klik membuka daftar reminder": the full list stays in the Reminder widget. Record this as a writer's call in the verification doc.

- [ ] **Step 1: Write the failing tests** (fixture `NOW` = Tue 27 Oct 2026 10:18 from `modules/home/widgets/fixtures.ts`).
  - `plan.test.ts`:
    - `nextTimed(SNAP.reminders, NOW)?.title === 'Kirim invoice'`.
    - A reminder at 10:00 today is not next.
    - `nextThisWeek` on Sunday 1 Nov 2026 23:00 finds a reminder dated 1 Nov with `at: null`, and does not find one dated 26 Oct.
    - `daysWithOpen` contains `2026-10-27` and not a done-only day.
    - `untilText(18*60000,'id') === '18 MNT'`, `untilText(2.5*3600000,'id') === '2 J'`.
  - `week.test.ts`:
    - 7 columns, one `.today`,
    - a `.has` dot on the 27th,
    - the bottom text contains "Bayar listrik" or "Kirim invoice" (the first open one, by order).
  - `next.test.ts`:
    - the text contains "Kirim invoice" and "3 J" (14:00 − 10:18 = 3 h 42 m, floored),
    - with no timed open reminder it shows `nextEmpty`.
- [ ] **Step 2: Run `npx vitest run modules/rencana`** and expect FAIL.
- [ ] **Step 3: Implement it.** Add `"rencana"` to `modules/index.json`.
- [ ] **Step 4: Run `npx vitest run modules/rencana src/settings && (cd src-tauri && cargo test repo_modules_are_valid)`** and expect PASS.
- [ ] **Step 5: Commit** with `feat(rencana): Pekan ini and Berikutnya from reminders`.

### Task 6: Package `fokus`, with Napas

**Files:**
- Create: `modules/fokus/{manifest.json,icon.svg,index.html,main.ts,style.css}`, `modules/fokus/locales/{id,en}.json`, `modules/fokus/breath.ts` + `.test.ts`, `modules/fokus/widgets/breath.ts` + `.test.ts`
- Modify: `modules/index.json`, `src/settings/pages/widget-samples.ts`

**Interfaces:**
- **Manifest:** `capabilities: []`, widget `breath` (1, work) "Napas"/"Breathe". Task 12 adds `workday` and `prefs`.
- **Locales:**
  - `phases`: in "TARIK"/"IN", hold "TAHAN"/"HOLD", out "BUANG"/"OUT"
  - `tap` "Klik untuk mulai"/"Click to start", `sec` "dtk"/"s", `done` "Selesai"/"Done"
- `breath.ts`:
  - Constants: `PHASE_S = 4`, `CYCLES = 5`, and the order `['in','hold','out','hold']`, so 16 s a cycle and 80 s in all.
  - `breathAt(elapsedMs: number): { phase: 'in'|'hold'|'out'; left: number; cycle: number; scale: number } | null`
    - `left` is the whole seconds left in the phase (ceil, 1–4).
    - `cycle` is 1-based.
    - `scale` is in 0..1: in → rising, hold after in → 1, out → falling, hold after out → 0.
    - Returns null when `elapsedMs >= 80000`.
- `renderBreath(root, strings): { start(nowMs): void; stop(): void; tick(nowMs): void; running(): boolean }`
  - **Idle:** `.lab` "NAPAS", the three rings (outer 56, middle 38, core 20 px; core `--w`, a red dot on the outer ring), and the `.lab` `tap`.
  - **Running:** `.lab` "NAPAS" + "3/5". The core diameter is `20 + 30*scale` px. Below, the phase name + `small(left, 3)` + "dtk".
  - A click toggles start/stop. After the last cycle it shows `done` for 3 s, then goes idle.
- **Wiring:** `main.ts` drives `tick` with `requestAnimationFrame` only while running.

- [ ] **Step 1: Write the failing tests.**
  - `breath.test.ts`:
    - `breathAt(0)` → `{phase:'in', left:4, cycle:1, scale:0}`
    - `breathAt(4000).phase === 'hold'`, scale 1
    - `breathAt(9000)` → out, left 3
    - `breathAt(16000).cycle === 2`
    - `breathAt(80000) === null`
  - `widgets/breath.test.ts`:
    - idle text contains "Klik untuk mulai",
    - after `start(0)` and `tick(5000)` the text contains "TAHAN" and "1/5",
    - `tick(80000)` shows "Selesai", and `running()` is false.
- [ ] **Step 2: Run `npx vitest run modules/fokus`** and expect FAIL.
- [ ] **Step 3: Implement it.** Add `"fokus"` to `modules/index.json`.
- [ ] **Step 4: Run `npx vitest run modules/fokus src/settings && (cd src-tauri && cargo test repo_modules_are_valid)`** and expect PASS.
- [ ] **Step 5: Commit** with `feat(fokus): widget package with Napas`.

### Task 7: Timer kecil (1 column)

**Files:**
- Create: `modules/timer/tile.ts` + `.test.ts`
- Modify: `modules/timer/manifest.json` (add `{"id":"tile","entry":"index.html","width":1,"kind":"work"}`), `modules/timer/locales/*.json` (`widgets.tile` "Timer kecil"/"Timer, small"; `start` "Klik untuk mulai"/"Click to start"), `modules/timer/main.ts`, `modules/timer/style.css`, `src/settings/pages/widget-samples.ts`

**Interfaces:**
- **Consumes:** `TimerView`, `Actions` from `modules/timer/view.ts`, and `dragMinutes`, `formatLeft`, `DRAG_PX`, `MIN_MINUTES`, `MAX_MINUTES` from `ruler.ts`.
- `renderTile(root, s: Strings, act: Actions): { update(v: TimerView): void; tick(now: number): void }`
  - **Idle:** `.lab` "TIMER" + a timer icon. Then `big(root, String(minutes))` with `.lab` "MENIT", and a 4 px-tick mini ruler of the minutes around the chosen one (5 ticks visible, the middle one `--w`).
    - Dragging horizontally on the tile changes the minutes, as `dragMinutes(start, dx, 6)` does.
    - A wheel event changes them by ±1.
    - A click (movement < `DRAG_PX`) calls `act.start(minutes)`.
  - **Running:** a red dot + `.lab` "TIMER". Then `big(root, mm)` over `small(':ss', 3)`, where `mm`/`ss` come from `formatLeft(until − now)` split at ":". A click calls `act.pause()`.
  - **Paused:** the same as running, but `--g1` with the `.lab` "JEDA". A click calls `act.resume()`.
- **Wiring:** `main.ts` uses `renderTile` when `kit.widget === 'tile'`, with the same 1 s poll and rAF loop as the strip.

- [ ] **Step 1: Write the failing tests** in `tile.test.ts` (jsdom; `act` is spies).
  - Idle with minutes 25: the big svg width is `dotWidth('25',6)`. A click with no move calls `start(25)`.
  - Running with until = now + 6:42: the text holds `:42`. A click calls `pause`.
  - Paused: a click calls `resume`.
  - A pointer drag of −24 px from 25 then a click → `start(29)`. The drag must not start anything by itself.
- [ ] **Step 2: Run `npx vitest run modules/timer`** and expect FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run `npx vitest run modules/timer src/settings && (cd src-tauri && cargo test repo_modules_are_valid)`** and expect PASS.
- [ ] **Step 5: Commit** with `feat(timer): a one-column Timer widget`.

## Bagian B: new data and prefs

### Task 8: Sun times in the snapshot, and Matahari

**Files:**
- Modify: `src-tauri/src/home/prayer.rs` (add `SunDay`, `sun_day`), `src-tauri/src/home/mod.rs` (`HomeSnapshot.sun`), `modules/home/types.ts`, `src/bridge-browser-home.ts`
- Create: `modules/sekitar/widgets/sun.ts` + `.test.ts`, `modules/sekitar/sun.ts` + `.test.ts`
- Modify: `modules/sekitar/manifest.json`, locales, `main.ts`, `widgets/bigweather.ts` (night from `sun`), `src/settings/pages/widget-samples.ts`

**Interfaces:**
- **Rust:**
  - `#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)] #[serde(rename_all="camelCase")] pub struct SunDay { pub rise: i64, pub set: i64, pub next_rise: i64 }`, all in ms.
  - `pub fn sun_day(today: NaiveDate, place: &Place) -> Option<SunDay>` uses `SolarTime` for today and tomorrow. It returns None when not finite.
  - `HomeSnapshot` gains `pub sun: Option<SunDay>`, filled when a place is set.
- **TS:** `HomeSnapshot.sun: { rise: number; set: number; nextRise: number } | null`.
- **Browser fake:** `fakeHome` returns Jakarta-like values (06:30, 17:48, 05:31 the next day).
- `sun.ts`: `sunState(sun, nowMs): { day: boolean; progress: number; untilMs: number }`
  - Day is `rise ≤ now < set`, with progress `(now−rise)/(set−rise)` and until `set − now`.
  - After sunset: `day:false`, progress 1, until `nextRise − now`.
  - Before rise: `day:false`, progress 0, until `rise − now`.
- **Matahari widget:** `sun` (2, weather) "Matahari"/"Sun".
  - `renderSun(root, strings, lang): { update(s, now): void }`.
  - **Top:** `.lab` "MATAHARI", and on the right `remainingShort(untilMs)` ("8J 22M"; the hour part is dropped under an hour) + `toSet` "LAGI"/"LEFT" or `toRise` "SAMPAI TERBIT"/"TO SUNRISE".
  - **Middle:** a 200×40 SVG arc with a horizon line. The arc is drawn as passed (`--w`) up to `progress` and `--g3` after it, with a red sun dot at the progress point. The arc is a quadratic Bézier from (4,38) to (196,38), control (100,−18). The point at t is the Bézier point.
  - **Bottom:** `small(clock(rise),3)` + `.lab` "terbit"/"rise" left, `.lab` "terbenam"/"set" + `small(clock(set),3)` right.
  - No place: `noPlace`.
- **Cuaca besar:** `night = !sunState(sun, now).day` when `sun` is set.

- [ ] **Step 1: Write the failing tests.**
  - **Rust** `prayer.rs`, `sun_day_for_jakarta`:
    - For Jakarta on 2026-10-27, `rise` is within ±2 min of 05:31 WIB and `set` within ±2 min of 17:48 WIB.
    - `next_rise − rise` is within 24 h ± 2 min.
  - **Rust** `mod.rs`: `a_snapshot_without_a_city_has_no_weather_or_prayer` also asserts `sun == None`.
  - `sun.test.ts` (pure):
    - noon → day, progress ≈ 0.5,
    - 20:00 → night, progress 1, until = nextRise − now,
    - 04:00 → night, progress 0.
  - `widgets/sun.test.ts`:
    - at 09:32 the text contains "LAGI" and both clock svgs exist,
    - at 20:00 it contains "SAMPAI TERBIT",
    - with `place: null` it shows `noPlace`.
- [ ] **Step 2: Run `(cd src-tauri && cargo test home::) ; npx vitest run modules/sekitar`** and expect FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run `(cd src-tauri && cargo test home::) && npx vitest run modules src`** and expect PASS.
- [ ] **Step 5: Commit** with `feat(sekitar): Matahari from sun times in the home snapshot`.

### Task 9: Hourly forecast, and Cuaca per jam (strip)

**Files:**
- Modify: `src-tauri/src/home/weather.rs`, `modules/home/types.ts`, `src/bridge-browser-home.ts`
- Create: `modules/sekitar/widgets/hourly.ts` + `.test.ts`
- Modify: `modules/sekitar/manifest.json`, locales, `main.ts`, `src/settings/pages/widget-samples.ts`

**Interfaces:**
- **Rust, `forecast_query`:**
  - Add `("hourly","temperature_2m,weather_code,precipitation_probability")` and `("timeformat","unixtime")`.
  - `forecast_days` becomes `"2"`.
  - The test `the_forecast_gets_rounded_coordinates_and_nothing_else` is updated to the new exact list.
- **Rust types:**
  - `#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)] #[serde(rename_all="camelCase")] pub struct Hour { pub at: i64, pub temp: f64, pub code: u32, pub rain: u32 }`. `at` is in ms, and `rain` is the 0–100 percentage.
  - `Weather` gains `#[serde(default)] pub hourly: Vec<Hour>`.
- **Rust parsing:**
  - `parse_forecast` reads `hourly.time[i]` (unix s) × 1000 together with the other three arrays.
  - It skips an index where any value is missing.
  - It keeps at most 48 entries.
- **TS:** `Weather.hourly?: { at: number; temp: number; code: number; rain: number }[]`.
- **Pure helper** in `modules/sekitar/hourly.ts`:
  - `upcoming(hours, nowMs, n = 8)` returns the entries from the current hour (`at ≥ nowMs − 3600000`, first one ≤ now) onward, n of them.
  - `rainAt(hours, nowMs): number | null` returns the first `at` within 12 h after now with `rain ≥ 50`.
- **Strip widget:** `hourly` (4, weather) "Cuaca per jam"/"Hourly weather".
  - `renderHourly(root, strings, lang): { update(s, now): void }`.
  - **Left:** `.lab` "PER JAM" over `small(degrees(temp), 2)`.
  - **Middle:** 8 cells. Each cell is a row of `icon(…,12)` + `.lab` temp, over a `.lab` hour "10". The current hour is `--w` with a red icon; the others are `--g1`.
  - **Right:** `rain` "HUJAN 16.00"/"RAIN 4 PM" or `clear` "CERAH"/"DRY", in `.lab`.
  - Empty `hourly`: the left part only, plus a `.lab` "—".

- [ ] **Step 1: Write the failing tests.**
  - **Rust:**
    - `a_forecast_with_hours`: a JSON fixture with 3 hourly entries parses to 3 `Hour`s with ms times.
    - `an_old_cache_without_hours_still_loads`: `{"temp":…,"fetchedAt":…}` without `hourly` → `hourly` is empty.
    - Update the exact-query test.
  - `hourly.test.ts`:
    - `upcoming` at 10:18 starts with the 10:00 entry,
    - `rainAt` finds 16:00 when rain is 60 there,
    - the render has 8 cells and contains "HUJAN 16.00",
    - with `hourly: []` it shows "—".
- [ ] **Step 2: Run `(cd src-tauri && cargo test home::weather) ; npx vitest run modules/sekitar`** and expect FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run both** and expect PASS.
- [ ] **Step 5: Commit** with `feat(sekitar): hourly forecast and the Cuaca per jam strip`.

### Task 10: Air quality, and Udara

**Files:**
- Modify: `src-tauri/src/home/weather.rs` (`Endpoint::Air`, `air_query`, `parse_air`, `Air`), `src-tauri/src/home/mod.rs` (`Home.air`, `HomeSnapshot.air`, fetch in `refresh_weather`, cache `air.json`), `modules/home/types.ts`, `src/bridge-browser-home.ts`
- Create: `modules/sekitar/widgets/air.ts` + `.test.ts`
- Modify: `modules/sekitar/manifest.json`, locales, `main.ts`, `src/settings/pages/widget-samples.ts`

**Interfaces:**
- **Rust endpoint and query:**
  - `Endpoint::Air` → `"https://air-quality-api.open-meteo.com/v1/air-quality"`.
  - `air_query(place) -> Vec<(&str,String)>` sends `latitude`, `longitude` (2 decimals) and `("current","us_aqi")`.
- **Rust types and parsing:**
  - `#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)] #[serde(rename_all="camelCase")] pub struct Air { pub aqi: u32, pub fetched_at: i64, pub latitude: f64, pub longitude: f64 }`.
  - `parse_air(json, place, now) -> Result<Air,String>`.
- **Rust fetching:**
  - In `refresh_weather`, after the forecast succeeds, fetch the air.
  - An air failure is logged with `eprintln!`, the forecast result still returns `Ok`, and the old air is kept.
  - The air is cached at `cache_dir/air.json` with `write_atomic`.
- **Rust snapshot:** `HomeSnapshot.air: Option<Air>`, only when it is for the same place. Reuse the `same_place` logic with a small helper over lat/lon.
- **Update the test** `only_the_two_open_meteo_urls` and rename it `only_open_meteo_urls`. It asserts all three URLs start with `https://` and contain `open-meteo.com/`.
- **TS:** `HomeSnapshot.air: { aqi: number; fetchedAt: number } | null`.
- `aqiBand(aqi): 0..5` follows US AQI bands: ≤50 → 0, ≤100 → 1, ≤150 → 2, ≤200 → 3, ≤300 → 4, else 5. Labels `airBands`:
  - ["Baik","Sedang","Tidak sehat bagi sebagian","Tidak sehat","Sangat tidak sehat","Berbahaya"]
  - ["Good","Moderate","Unhealthy for some","Unhealthy","Very unhealthy","Hazardous"]
- **Udara widget:** `air` (1, weather) "Udara"/"Air".
  - **Top:** `.lab` "UDARA" + a wind icon.
  - **Middle:** `big(root, String(aqi))` + `.lab` "AQI", then the band label `.lab` (wrapping allowed, two lines max).
  - **Bottom:** 6 dots with the band's dot red and lower ones `--w`.
  - No place: `noPlace`. No air: "—".

- [ ] **Step 1: Write the failing tests.**
  - **Rust:**
    - `air_quality_from_open_meteo` parses `{"current":{"us_aqi":42}}` to aqi 42.
    - `an_air_error_is_an_error` covers `{"error":true,"reason":"x"}`.
    - `a_snapshot_shows_air_only_for_the_current_city` is in `mod.rs`.
  - `air.test.ts`:
    - `aqiBand(42)===0`, `aqiBand(151)===3`.
    - The render of 42 shows "Baik", and its svg width is `dotWidth('42',6)`.
    - 500 fits ≤ 109.
    - With no air it shows "—".
- [ ] **Step 2: Run `(cd src-tauri && cargo test home::) ; npx vitest run modules/sekitar`** and expect FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run both** and expect PASS.
- [ ] **Step 5: Commit** with `feat(sekitar): air quality from Open-Meteo and the Udara widget`.

### Task 11: The `prefs` capability

**Files:**
- Create: `src-tauri/src/prefs.rs`
- Modify: `src-tauri/src/lib.rs` (mod, state managed with `app_data_dir/widget-prefs`), `src-tauri/src/modules/manifest.rs` (`Capability::Prefs` = `"prefs"`), `src-tauri/src/modules/gate.rs` (`Call::PrefsRead`, `Call::PrefsWrite` + gate tests), `src-tauri/src/module_commands.rs`, `src/bridge-browser.ts` (an in-memory fake keyed by module id), `src/kit/prefs.ts` + `.test.ts`

**Interfaces:**
- **Rust store:**
  - `pub struct Prefs { dir: PathBuf }`, with `pub fn read(&self, module: &str) -> serde_json::Value`.
  - A missing, unreadable or non-object file gives `{}`.
  - `pub fn write(&self, module: &str, value: &serde_json::Value) -> Result<(), String>` takes objects only. Serialized size must be ≤ `PREFS_MAX = 16 * 1024`, else `Err("prefs too large")`. The file is `dir/<module>.json` via `crate::home::write_atomic`.
  - `module` is already a valid module id (`is_module_id`). Assert it, to refuse path tricks.
  - `PrefsState(pub Prefs)`.
- **Calls:**
  - `prefs.read` → `Value`.
  - `prefs.write` with args `{ value: object }` → `Null`.
  - Keyed by the calling `module_id`, never by args.
- **TS** `src/kit/prefs.ts`: `readPrefs<T>(kit: Pick<Kit,'call'>, defaults: T, check: (raw: unknown) => T): Promise<T>`. It calls `prefs.read` and passes the result through `check`, which fills in defaults. A failed call gives `defaults`. `writePrefs(kit, value: object): Promise<void>`.

- [ ] **Step 1: Write the failing tests.**
  - **Rust** `prefs.rs` on a tempdir:
    - `read_missing_is_empty_object`
    - `write_then_read`
    - `a_broken_file_reads_empty`
    - `too_large_is_refused` (17 KB string)
    - `a_non_object_is_refused`
  - **Rust** `gate.rs`:
    - `prefs_needs_the_capability`, where a module without `prefs` gets `NotDeclared`
    - `prefs_read_and_write_map`
  - **TS** `prefs.test.ts`:
    - `readPrefs` with a rejecting `call` returns the defaults,
    - with `{start:'08:00'}` and a check that fills `end` it returns both.
- [ ] **Step 2: Run `(cd src-tauri && cargo test prefs gate) ; npx vitest run src/kit/prefs.test.ts`** and expect FAIL.
- [ ] **Step 3: Implement it and register the state in `lib.rs`** next to the other services.
- [ ] **Step 4: Run both** and expect PASS.
- [ ] **Step 5: Commit** with `feat(core): a prefs capability, each package's own small settings`.

### Task 12: Jam kerja

**Files:**
- Create: `modules/fokus/work.ts` + `.test.ts`, `modules/fokus/widgets/workday.ts` + `.test.ts`
- Modify: `modules/fokus/manifest.json` (capabilities `["prefs"]`, widget `workday` (1, work) "Jam kerja"/"Work hours"), locales, `main.ts`, `style.css`, `src/settings/pages/widget-samples.ts`

**Interfaces:**
- **Settings** in `work.ts`:
  - `interface WorkPrefs { start: string; end: string; days: number[] }`. Times are "HH:MM"; `days` uses JS `getDay()` numbers.
  - `DEFAULT_WORK = { start:'09:00', end:'17:00', days:[1,2,3,4,5] }`.
  - `checkWork(raw: unknown): WorkPrefs` keeps valid fields only. Invalid means a bad time, `end ≤ start`, or an empty or out-of-range `days`, and falls back to the default.
- **State** in `work.ts`: `workState(p: WorkPrefs, now: Date): { kind: 'before' | 'working' | 'done' | 'off'; workedMs: number; leftMs: number; progress: number }`
  - `off`: today not in `days`.
  - `before`: now < start, with `leftMs = start − now`.
  - `working`: start ≤ now < end.
  - `done`: now ≥ end.
- **Text:** `hm(ms, lang)` gives "2 J 30 M"/"2 H 30 M", with the hour part dropped under an hour.
- `renderWorkday(root, strings, lang, act: { save(p: WorkPrefs): Promise<void>; expand(h: number): void; collapse(): void }): { update(p: WorkPrefs, now: Date): void; setFull(full: boolean): void }`
  - **Row view while working:**
    - `.lab` "JAM KERJA" + `.lab` "09–17"
    - the time worked as `.wd-next` text, e.g. "2 J 30 M"
    - a `dotRow(10, floor(progress*10), floor(progress*10))`
    - `.lab` "SISA 1 J 12 M"/"1 H 12 M LEFT"
  - **Row view in other states:**
    - before: "Mulai 09.00"/"Starts 9:00"
    - done: `done` "Selesai"/"Done"
    - off: `off` "Libur"/"Day off"
  - **Click** calls `act.expand(200)` and shows the full view:
    - two `<input type="time">` (Mulai, Selesai),
    - seven day toggles (S S R K J S M, Monday first),
    - Simpan/Save, and ‹ Kembali/Back.
  - **Saving:** Simpan calls `save(checkWork(form))` then `collapse()`. An invalid form keeps Simpan disabled.
- **Wiring:** `main.ts` reads prefs with `readPrefs(kit, DEFAULT_WORK, checkWork)` at start and after a save, updates every minute, and calls `kit.onView(setFull)`.

- [ ] **Step 1: Write the failing tests.**
  - `work.test.ts`:
    - Tue 10:18 with the default → working, worked 1:18, left 6:42.
    - 17:00 exactly → done.
    - 08:00 → before.
    - Saturday → off.
    - `checkWork({start:'18:00',end:'09:00'})` → default.
    - `checkWork({days:[9]})` → default days.
  - `workday.test.ts`:
    - the working row shows "1 J 18 M" and "SISA 6 J 42 M",
    - Saturday shows "Libur",
    - a click calls `expand(200)`,
    - setting the end before the start disables Simpan,
    - Simpan with 08:00–16:00 calls `save` with those values.
- [ ] **Step 2: Run `npx vitest run modules/fokus`** and expect FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run `npx vitest run modules/fokus src/settings && (cd src-tauri && cargo test repo_modules_are_valid)`** and expect PASS.
- [ ] **Step 5: Commit** with `feat(fokus): Jam kerja, set from its own full view`.

### Task 13: Zona waktu

**Files:**
- Create: `modules/waktu/zones.ts` + `.test.ts`, `modules/waktu/widgets/zones.ts` + `.test.ts`
- Modify: `modules/waktu/manifest.json` (capabilities add `"prefs"`, widget `zones` (2, time) "Zona waktu"/"World clock"), locales, `main.ts`, `style.css`, `src/settings/pages/widget-samples.ts`

**Interfaces:**
- **City list** in `zones.ts`:
  - `CITIES: { code: string; tz: string; id: string; en: string }[]`, about 40 entries, each with an IANA tz.
  - Must include: JKT Asia/Jakarta, MKS Asia/Makassar, JYP Asia/Jayapura, SIN, KUL, BKK, HKG, TYO, SEL, SYD, DXB, RUH, MKK (Asia/Riyadh, "Mekkah"), IST, CAI, LON, PAR, BER, AMS, NYC, CHI, LAX, SFO, TOR, SAO, DEL, KHI, MNL, TPE, SHA.
- **Settings** in `zones.ts`:
  - `ZonePrefs { cities: [string, string] }`, the codes.
  - Default `['TYO','LON']`. `checkZones(raw)` falls back per slot when a code is unknown.
- **Time math** in `zones.ts`:
  - `zoneTime(tz, now): { h: number; m: number; offsetMin: number }`. The offset is from Intl `timeZoneName:'longOffset'` parsed as "GMT+09:00".
  - `diffLabel(a, b): string` is the hours difference from local, e.g. "+2", "−7", "+5,5". It uses the Unicode minus "−" and an Indonesian comma for halves.
- `renderZones(root, strings, lang, act: { save(p: ZonePrefs): Promise<void>; expand(h: number): void; collapse(): void }): { update(p: ZonePrefs, now: Date): void; setFull(full: boolean): void }`
  - **Row:** `.lab` "ZONA WAKTU"/"WORLD CLOCK" + "3 KOTA"/"3 CITIES". Then three columns. Each column has the code `.lab` + the diff `.lab`, `small("HH:MM", 2)`, and a 2px marker: local is `--w`, the others `--g3`.
    - The first column is local (`code` from the Intl zone label, e.g. "WIB").
    - A city where it is night (22:00–05:59) shows its time `--g2`.
  - **Full view** (`expand(220)`): two `<select>` lists of `CITIES` names in the person's language, Simpan, and ‹ Kembali.

- [ ] **Step 1: Write the failing tests.**
  - `zones.test.ts`:
    - At `Date.UTC(2026,9,31,2,41)`, `zoneTime('Asia/Tokyo')` gives 11:41 and `zoneTime('Europe/London')` gives 02:41.
    - `diffLabel` between Jakarta (+420) and London (+0) is "−7", and between Jakarta and Delhi (+330) is "−1,5".
    - `checkZones({cities:['XXX','NYC']})` gives `['TYO','NYC']`.
    - `CITIES` codes are unique and every tz is accepted by `Intl.DateTimeFormat`.
  - `widgets/zones.test.ts`:
    - the row has 3 columns with "TYO" and "LON",
    - a click calls `expand(220)`,
    - Simpan with NYC/SYD calls `save({cities:['NYC','SYD']})`.
- [ ] **Step 2: Run `npx vitest run modules/waktu`** and expect FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run `npx vitest run modules/waktu src/settings && (cd src-tauri && cargo test repo_modules_are_valid)`** and expect PASS.
- [ ] **Step 5: Commit** with `feat(waktu): Zona waktu with chosen cities`.

### Task 14: Whole-branch gate and the owner's check

**Files:**
- Create: `docs/superpowers/verification/2026-11-02-notching-13-paket-widget.md`
- Modify: `docs/superpowers/specs/2026-10-30-halaman-widget-design.md` §5 table. Add one line pointing at the new spec. Do not rewrite it.

- [ ] **Step 1: Run the full gate** `npx tsc --noEmit && npm test && npm run build:modules && (cd src-tauri && cargo test)`. Expected: all pass, and `dist-modules/` holds `waktu`, `fokus`, `rencana` and `sekitar`.
- [ ] **Step 2: Check in the browser preview.**
  - Run `npm run dev` through `.claude/launch.json`.
  - Open `settings.html` → Halaman, and confirm every new widget shows a sample card.
  - Add a page with each widget and look at it in `index.html`, at 520 px, with no overflow.
  - Screenshot each row.
- [ ] **Step 3: Write the verification doc.** It holds:
  - a checklist for the owner (each widget on a page, Jam kerja and Zona waktu settings, Udara and Cuaca per jam after 30 min),
  - the writer's calls listed in spec §3, §4, §6 and Task 5,
  - the Bagian C question.
- [ ] **Step 4: Commit** with `docs: verification plan for the widget pack`.
