# Cleaner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A bundled Cleaner module. It opens in the notch on a coloured disk bar with two tiles, Deep clean and Clean uninstall. Each tile lists what would go, with ticks. A confirmation comes before anything is removed. The bar opens a read-only breakdown of the biggest folders and files. A test mode confines everything to `~/cleaner-cek`.

**Architecture:**
- **Rust core** does all the disk work.
  - `cleaner_rules.rs` is pure: roots, the one safety gate, classification, the matchers, and the exclusion and log formats.
  - `cleaner_scan.rs` and `cleaner_apps.rs` walk real folders (`std::fs`) and are tested on temp dirs.
  - `cleaner_run.rs` removes things. It runs the recheck, the Trash or permanent removal, and the log, behind a `Trash` trait so tests never touch the real Trash.
  - `cleaner_service.rs` is the macOS shell: running apps, Launch Services, Full Disk Access, the volume size, Trash, the events, the status, and the commands.
- **Pages:** the notch draws Cleaner itself (no iframe), like Titipan and Screenshot. The bundled `cleaner` package gives the Modul tile, the icon and the permission row.
- **The page never sends a path to remove.** It sends `(scan id, item ids)`, and the core looks the paths up in its own scan store.

**Tech Stack:** Tauri 2, tauri-nspanel 2.1, objc2 0.6 / objc2-foundation / objc2-app-kit 0.3, the `plist` crate (new, MIT); TypeScript, vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-01-cleaner-design.md` (§ numbers below refer to it).

## Global Constraints

- Never close an nspanel panel (`NSRangeException`). Cleaner adds no window or panel. Everything is in the overlay's notch page.
- Module id `cleaner`. Name "Cleaner" in both languages. Capability `"cleaner"`, tile action `{ "capability": "cleaner", "method": "open" }`, new permission `"full-disk-access"`, plus `"status"`. Catalog order: last, directly after `screenshot`. `src/clean/` is Keyboard Cleaning Mode: Cleaner's TS lives in `src/cleaner/`.
- Mole is GPL-3.0. Copy none of its code or path lists. Every location in this plan comes from standard macOS folders or each tool's own docs (§3).
- **Every removal goes through `cleaner_rules::check`**, called again just before the removal (§7). No other code path may call `remove_*` or trash under the user's home.
- Unknown means keep. A timeout, an unreadable plist, a failed Launch Services lookup, or an unreadable exclusion file never authorizes a removal.
- Permanent: cache, log, dev cache, build folder, and emptying the Trash. Trash: orphan leftovers, installers, iPhone backups, apps, and app leftovers (§5.1, §5.2). For a cache or log **folder**, its contents go and the folder stays. A file goes whole.
- Without Full Disk Access, never open Desktop, Documents, Downloads, Pictures, Movies, Music, `~/Library/Containers`, `~/Library/Group Containers`, `~/.Trash`, or `~/Library/Application Support/MobileSync`. No macOS prompt may ever appear (§4).
- Test mode: `NOTCHING_CLEANER_ROOT` set to a folder `R` means home = `R/home` and apps = `R/Applications`. It only narrows. It cannot be turned on from the UI. Full Disk Access counts as granted inside `R`. The panel shows **MODE COBA** / **TEST MODE**.
- Scan results live 10 minutes (`SCAN_TTL_MS = 600_000`). The page's place (view, ticks, folder) also lasts 10 minutes from the last time the panel showed it.
- Panel width 520. Heights stay within the panel maximum of 560.
- Bar colours (pilihan 1, `cleaner-warna.html`): App `#2f7cf6`, Dokumen `#f5a623`, Foto `#f8d03a`, Bisa dibersihkan `#e8262e`, Lainnya `#9b9b9b`, free `#1a1a1a`. This is the only colour in Cleaner.
- Copy, exactly (id / en). Builders choose wording only for strings not listed here:
  - "Sisa {size}" / "{size} free"; "terpakai dari {size}" / "used of {size}"
  - Parts: "App" "Dokumen" "Foto" "Bisa dibersihkan" "Lainnya" / "Apps" "Documents" "Photos" "Cleanable" "Other"
  - Tiles: "Deep clean" · "Cache, log, sisa app · {size}" / "Caches, logs, leftovers · {size}"; "Clean uninstall" · "Hapus app beserta sisanya · {n} app" / "Remove apps and leftovers · {n} apps"
  - "Menghitung…" / "Measuring…"; "Bersihkan {size}" / "Clean {size}"; "Hapus {app} · {size}" / "Remove {app} · {size}"
  - Confirm: "{size} dihapus permanen" / "{size} removed for good", "{size} dipindah ke Tempat Sampah" / "{size} moved to the Trash", "Ya, bersihkan" / "Yes, clean", "Ya, hapus" / "Yes, remove", "Batal" / "Cancel"
  - "sedang dipakai" / "in use"; "mungkin · nama mirip" / "maybe · similar name"; "Data pribadi" / "Personal data"; "Tutup {app} dulu" / "Quit {app} first"; "Pakai uninstaller bawaan app ini" / "Use this app's own uninstaller"
  - "Jangan pernah bersihkan" / "Never clean"; "Tampilkan di Finder" / "Show in Finder"; "tidak bisa dibaca" / "can't be read"; "butuh Full Disk Access" / "needs Full Disk Access"
  - "Sebagian folder dilewati. Beri izin Full Disk Access" / "Some folders were skipped. Allow Full Disk Access"
  - Skip reasons: "sedang dipakai" "dilindungi" "berubah sejak dipindai" "gagal" "dikecualikan" "dihentikan" / "in use" "protected" "changed since the scan" "failed" "never clean" "stopped"
  - "Berhenti" / "Stop"; "MODE COBA" / "TEST MODE"; "Daftar pengecualian tidak bisa dibaca" / "The never-clean list can't be read"
- Sizes use decimal units (1 GB = 10⁹ B), as Finder does. Indonesian uses a comma ("25,9 GB"), English a point. The status text drops the space ("25,9GB").
- Styles go through CSSOM only. Never use `style=""` markup (CSP). Text goes in as text, never markup.
- `npm run build:modules` must run once before `cargo` in a fresh worktree.
- Commit only files you changed. Never push.

## Review Focus

1. **A symlink or a hard-to-see path inside a cleanable folder.** Examples: `~/Library/Caches/x/link → ~/Documents`, a name with `..`, or an empty root that collapses to `/`. The link itself is removed and nothing behind it is touched (Task 1 `symlink_into_documents_is_never_followed`, Task 3 `remove_contents_keeps_link_target`).
2. **The disk changed between scan and confirm.** A folder is replaced (new inode), a Trash-route file is rewritten, an app is reopened, or a scan is older than 10 minutes. Each such item is skipped with its reason. Nothing else is affected (Task 3 `replaced_item_is_skipped`, Task 5 `stale_scan_is_refused`).
3. **The never-clean list is corrupt or unreadable.** Nothing is cleaned, and the page says why. A missing file is an empty list (Task 1 `corrupt_exclusions_refuse_everything`).
4. **Uninstalling an app whose data is shared.** A second copy of the same bundle id exists, or another installed app has the same Team ID (Microsoft Office's shared Group Container). Then no leftover is offered, or only the unshared ones (Task 4 `second_copy_offers_no_leftovers`, `team_group_container_shared_is_not_offered`).
5. **Notching quits, or the module is switched off, mid-clean.** Cleaning stops after the current item, every finished item is in the log, and the status clears (Task 5 `quit_stops_after_current_item`).

---

## File Structure

| File | Responsibility |
|---|---|
| `src-tauri/src/cleaner_rules.rs` (create, pure) | `Roots`, `Purpose`, `check`, `Skip`, path sanity, `classify_cache`, `is_bundle_id`, `name_key`, `GENERIC`, orphan test, leftover match, exclusions parse, log line, size text |
| `src-tauri/src/cleaner_scan.rs` (create) | `du` walk, deep clean scan, build folders, installers, backups, home breakdown tree |
| `src-tauri/src/cleaner_apps.rs` (create) | App list from bundles, Info.plist, Team ID, official-uninstaller test, leftover search |
| `src-tauri/src/cleaner_run.rs` (create) | Recheck, permanent and Trash removal, `Trash` trait, the run loop, log writing |
| `src-tauri/src/cleaner_service.rs` (create, macOS) | State, store, commands, events, status, FDA, volume, NSWorkspace, Launch Services, reveal |
| `src-tauri/src/modules/{manifest,gate}.rs`, `module_commands.rs`, `settings_window.rs`, `lib.rs`, `Cargo.toml` (modify) | `Capability::Cleaner`, `Permission::FullDiskAccess`, `Call::CleanerOpen`, `full_disk_access` in the DTO, commands, `plist = "1"` |
| `modules/cleaner/*` (create), `modules/index.json`, `modules/screenshot/package.test.ts` (modify) | Package |
| `src/cleaner/{format,home,clean,uninstall,disk,run,view}.ts` (create) | The notch pages |
| `src/pages/route.ts`, `src/notch/page-view.ts`, `src/app.ts`, `src/bridge.ts`, `src/bridge-browser.ts`, `src/i18n/*`, `src/styles.css` (modify) | Page kind, sizes, calls, strings |
| `src/settings/pages/{info,modules}.ts`, `src/settings/bridge-*.ts`, `src/settings/types.ts` (modify) | Izin row, never-clean list, open log |
| `scripts/cleaner-cek.sh` (create) | Builds the sample folder `~/cleaner-cek` with baits and checksums |

---

### Task 1: Rules (pure Rust)

**Files:**
- Create: `src-tauri/src/cleaner_rules.rs` (add `mod cleaner_rules;` in `lib.rs`, not macOS-gated)
- Test: in-file `#[cfg(test)]`, on paths only (no disk)

**Interfaces:**
- Produces:
  ```rust
  pub struct Roots { pub home: PathBuf, pub apps: Vec<PathBuf> /* [/Applications, home/Applications] or [R/Applications] */, pub test_mode: bool }
  impl Roots { pub fn real(home: PathBuf) -> Roots; pub fn test(root: &Path) -> Roots; pub fn from_env(home: PathBuf, var: Option<OsString>) -> Roots; }
  #[derive(Clone, Copy, PartialEq, Debug, Serialize)] #[serde(rename_all = "camelCase")]
  pub enum Category { AppCache, BrowserCache, DevCache, Log, Orphan, Trash, Build, Installer, Backup, App, Leftover, Personal }
  #[derive(Clone, Copy, PartialEq, Debug, Serialize)] #[serde(rename_all = "lowercase")]
  pub enum Method { Permanent, Trash }
  pub fn method(c: Category) -> Method;            // per Global Constraints
  pub fn ticked_by_default(c: Category) -> bool;   // AppCache, BrowserCache, DevCache, Log, App; a Leftover's tick comes from its confidence (Task 4)
  pub enum Purpose<'a> { Clean, Uninstall { bundle_id: &'a str, app: &'a Path } }
  #[derive(Clone, Copy, PartialEq, Debug, Serialize)] #[serde(rename_all = "camelCase")]
  pub enum Skip { InUse, Protected, Changed, Failed, Excluded, Stopped }
  pub fn check(path: &Path, cat: Category, purpose: &Purpose, roots: &Roots, excluded: &Exclusions) -> Result<(), Skip>;
  pub fn allowed_parent(cat: Category, roots: &Roots) -> Vec<PathBuf>;  // where an item of `cat` may live
  pub fn classify_cache(name: &str) -> Category;   // a child of ~/Library/Caches: BrowserCache | DevCache | AppCache
  pub fn is_bundle_id(name: &str) -> bool;         // ≥ 3 dot-separated parts, [A-Za-z0-9-] each, first part a-z
  pub fn name_key(s: &str) -> String;              // lowercase, drop spaces, '-', '_', '.'
  pub const GENERIC: &[&str];                      // "helper","update","updater","data","cache","caches","logs","support","app","service","agent","plugin","plugins","settings","config","default","shared","common","tmp"
  pub enum Confidence { Sure, Maybe }
  pub fn leftover_match(entry: &str, bundle_id: &str, app_name: &str, vendor_path: Option<(&str, &str)>) -> Option<Confidence>;
  pub fn orphan_ok(name: &str, newest_mtime_ms: i64, now_ms: i64, installed: impl Fn(&str) -> Option<bool>) -> bool; // installed: Some(true/false) or None = unknown
  pub struct Exclusions { pub paths: Vec<PathBuf> }
  pub fn parse_exclusions(text: Option<&str>) -> Result<Exclusions, ()>;  // None (no file) → empty; bad JSON → Err
  pub fn exclusions_json(e: &Exclusions) -> String;  // {"v":1,"paths":[...]}
  pub fn log_line(at: &str, test_mode: bool, cat: Category, m: Method, outcome: Result<(), Skip>, bytes: u64, path: &Path) -> String;
  pub fn size_text(bytes: u64, lang: &str, spaced: bool) -> String; // 25_900_000_000 → "25,9 GB" (id) / "25.9 GB" (en); spaced=false → "25,9GB"
  ```
- `check`'s rules, in order. The first failure wins:
  1. **Path sanity:** the path is absolute, has no `..` or `.` component, no control character, and no empty part. Otherwise `Protected`.
  2. **Exclusions:** the path is, or is under, an excluded path. Then `Excluded`.
  3. **Roots:** the path is not equal to the home, `home/Library`, `home/Library/{Caches,Logs,Application Support,Containers,Group Containers,Preferences}`, `home/Applications`, any of `roots.apps`, or `/`. Otherwise `Protected`.
  4. **Location:** the path is strictly under one of `allowed_parent(cat, roots)`. For `App`, its parent is one of `roots.apps` (or a subfolder of one) and the name ends in `.app`. Otherwise `Protected`.
  5. **The protected list (§7):**
     - any component under home starting with `.`, except `home/.Trash/…`, `home/.npm/_cacache/…` and `home/.cargo/registry/cache/…`;
     - `home/{Desktop,Documents,Downloads,Pictures,Movies,Music,Public}/…`, except `Installer` items directly in `home/Downloads`;
     - `home/Library/{Mobile Documents,Mail,Keychains,Safari,Cookies,Accounts,Messages,Calendars,Photos,PersonalizationPortrait}/…`;
     - Notching's own `id.web.notching` anywhere;
     - names containing a `PROTECTED_VENDORS` key (`1password`, `agilebits`, `bitwarden`, `keepass`, `lastpass`, `dashlane`, `vpn`, `wireguard`, `tunnelblick`, `docker`, `utm`, `parallels`, `vmware`, `virtualbox`, `orbstack`, `claude`, `anthropic`, `openai`, `cursor`, `ollama`).

     **The one exception:** `Purpose::Uninstall` with category `Personal` lifts this step only. It never lifts the hidden-folder rule.
- `classify_cache`:
  - `BrowserCache` for `com.apple.Safari`, `Google`, `Firefox`, `Mozilla`, `Microsoft Edge`, `BraveSoftware`, `company.thebrowser.Browser`, `com.operasoftware.Opera`, `com.vivaldi.Vivaldi`;
  - `DevCache` for `Homebrew`, `pip`, `Yarn`, `go-build`, `com.apple.dt.Xcode`, `node-gyp`, `ms-playwright`;
  - otherwise `AppCache`.
- `leftover_match`:
  - `Sure` when `entry` equals the bundle id, starts with `bundle_id + "."`, or equals `"group." + bundle_id`, or when `vendor_path` is `(vendor, name)` with `vendor` equal to the bundle id's second part (case-insensitive) and `name_key(name) == name_key(app_name)`.
  - `Maybe` when `name_key(entry) == name_key(app_name)`, with `name_key(app_name).len() >= 4` and the name not in `GENERIC`.
  - Otherwise `None`.
- `orphan_ok`: true only if `is_bundle_id(name)`, the item is untouched for at least 30 days (`2_592_000_000` ms), and `installed(name) == Some(false)`.

- [ ] **Step 1: Write the failing tests:**
  - `check_refuses_roots_and_odd_paths`: home, `home/Library/Caches`, `/`, a relative path, `a/../b`, and a name with `\n` all give `Protected`.
  - `cache_child_is_allowed_cache_root_is_not`.
  - `hidden_folders_are_protected_but_npm_cargo_trash`: `.claude/x`, `.config/x` and `.ssh/x` are `Protected`. `.npm/_cacache/x`, `.cargo/registry/cache/x` and `.Trash/x` are allowed in their categories.
  - `personal_folders_are_protected_except_installers_in_downloads`: `Downloads/a.dmg` is allowed only as `Installer`. `Downloads/sub/a.dmg` and `Documents/x/node_modules` are `Protected`.
  - `protected_vendors_lifted_only_for_personal_uninstall`: `Containers/com.docker.docker` is `Protected` for `Clean`, and also for `Leftover` under `Uninstall`. It is allowed as `Personal` under `Uninstall { bundle_id: "com.docker.docker" }`.
  - `symlink_into_documents_is_never_followed`: `check` judges the given path and never canonicalizes it. A link inside Caches is allowed (it is removed as a link), and its target path in Documents is `Protected`.
  - `exclusion_covers_children`.
  - `corrupt_exclusions_refuse_everything`: `parse_exclusions(Some("{"))` is `Err`. `None` gives empty. A round trip through `exclusions_json` keeps the paths.
  - `classify_cache_buckets`.
  - `leftover_match_sure_maybe_none`, using `com.spotify.client` / "Spotify":
    - `com.spotify.client.savedState` is Sure;
    - `Spotify` is Maybe;
    - `spot` is None;
    - an app named "Data" never gives Maybe;
    - `("google","Chrome")` for `com.google.Chrome` is Sure.
  - `orphan_needs_bundle_id_age_and_known_absence`: unknown (`None`) is false, 29 days is false, and `Some(true)` is false.
  - `log_line_has_every_field`: tab-separated, in the order `at`, `asli|coba`, the category, `permanent|trash`, `ok|skip:<reason>`, the bytes, then the path.
  - `size_text_by_language`.
- [ ] **Step 2: Run them.** Run `cd src-tauri && cargo test cleaner_rules`. Expected: FAIL (does not compile).
- [ ] **Step 3: Implement** `cleaner_rules.rs`. `Roots::from_env` gives `test(R)` when the variable is a non-empty absolute path, otherwise `real`.
- [ ] **Step 4: Run them.** Run `cargo test cleaner_rules`. Expected: all pass.
- [ ] **Step 5: Commit.** Message: `feat(cleaner): safety rules, matchers and formats`.

### Task 2: Deep clean scan and the breakdown (Rust, on disk)

**Files:**
- Create: `src-tauri/src/cleaner_scan.rs`. Add `plist = "1"` to `[dependencies]`.
- Test: in-file tests on `std::env::temp_dir()` trees that mirror `home/Library/...`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  ```rust
  pub struct Ident { pub dev: u64, pub ino: u64, pub mtime_ms: i64 }
  pub fn ident(p: &Path) -> Option<Ident>;          // symlink_metadata
  pub fn du(p: &Path, cancel: &AtomicBool) -> u64;  // allocated bytes (blocks × 512); never follows links; stays on p's device; unreadable → counted 0
  pub fn newest_mtime(p: &Path, cancel: &AtomicBool) -> i64;
  #[derive(Clone, Serialize)] #[serde(rename_all = "camelCase")]
  pub struct Item { pub id: u64, pub category: Category, pub label: String, pub detail: Option<String>, pub path: PathBuf /* never sent to the page; skip in serde */,
                    pub bytes: u64, pub method: Method, pub ticked: bool, pub in_use: bool, pub confidence: Option<&'static str> /* "sure"|"maybe" */, #[serde(skip)] pub ident: Option<Ident> }
  pub struct Env<'a> { pub roots: &'a Roots, pub fda: bool, pub running: &'a dyn Fn(&str) -> bool /* by bundle id or name */,
                       pub installed: &'a dyn Fn(&str) -> Option<bool>, pub mounted: &'a dyn Fn(&Path) -> bool, pub busy_tool: &'a dyn Fn(&str) -> bool,
                       pub excluded: &'a Exclusions, pub now_ms: i64, pub cancel: &'a AtomicBool }
  pub fn quick_cleanable(env: &Env) -> u64;         // ticked-by-default categories only, minus in_use and excluded (§4 "Bisa dibersihkan")
  pub fn deep_scan(env: &Env, next_id: &mut u64) -> Vec<Item>;
  pub fn readable_roots(roots: &Roots, fda: bool) -> Vec<PathBuf>;  // what may be opened at all
  pub struct Parts { pub apps: Option<u64>, pub documents: Option<u64>, pub photos: Option<u64> } // None = not readable without FDA
  pub fn parts(env: &Env) -> Parts;
  #[derive(Clone, Serialize)] #[serde(rename_all = "camelCase")]
  pub struct Node { pub name: String, pub bytes: u64, pub dir: bool, pub readable: bool, pub children: Vec<Node> /* kept ≥ NODE_MIN, sorted desc; the rest summed into one "rest" node */ }
  pub const NODE_MIN: u64 = 50_000_000;
  pub fn breakdown(env: &Env) -> Node;              // root = home, plus a top "App" node for roots.apps
  ```
- The deep scan, item by item (§5.1). Each candidate passes `check` before it becomes an `Item`. Excluded candidates are dropped.
  - **Caches:** each child of `home/Library/Caches`, classified by `classify_cache`. A bundle-id name that passes `orphan_ok` becomes `Orphan` instead.
  - **Containers caches** (FDA only): `home/Library/Containers/*/Data/Library/Caches/*`, as `AppCache`. The container's bundle id is used for `in_use`.
  - **Dev:** `home/Library/Developer/Xcode/DerivedData/*`, `home/Library/Developer/CoreSimulator/Caches/*`, `home/.npm/_cacache`, `home/.cargo/registry/cache`. `busy_tool("xcodebuild"|"Xcode"|"npm"|"cargo"|"brew")` sets `in_use` for its own items.
  - **Logs:** each child of `home/Library/Logs`, plus `DiagnosticReports`. Orphan logic is as for Caches.
  - **Saved Application State:** only children whose name minus `.savedState` passes `orphan_ok`, as `Orphan`.
  - **Trash** (FDA only): one item, `home/.Trash`. Its contents go, and the folder stays.
  - **Build:** walk `home` to depth `BUILD_DEPTH = 6`. Skip `Library`, hidden folders, and everything `check` protects. Take `node_modules` beside a `package.json`, and `target` beside a `Cargo.toml`. One item per folder, with the project folder name as its label. Do not descend into what was found.
  - **Installer** (FDA only): files directly in `home/Downloads` ending `.dmg`, `.pkg` or `.xip`. `mounted(path)` sets `in_use`.
  - **Backup** (FDA only): each child of `home/Library/Application Support/MobileSync/Backup`. The label is `Device Name` from its `Info.plist`, and the detail is `Last Backup Date` as a date.
  - `in_use` for a cache, log or orphan comes from `running(name)` on its bundle id or folder name. A browser cache uses the browser's bundle id from a fixed map. In-use items are never ticked.
- `parts`:
  - **apps:** `du` over `roots.apps`;
  - **documents:** Desktop, Documents and Downloads;
  - **photos:** Pictures;
  - each part is `None` without FDA (`readable_roots`).

- [ ] **Step 1: Write the failing tests:**
  - `deep_scan_finds_each_category` on a temp home with one sample of each kind and `fda = true`.
  - `no_fda_never_opens_protected_roots`: with `fda = false`, `readable_roots` excludes Desktop, Documents, Downloads, Pictures, Movies, Music, Containers, Group Containers, `.Trash` and MobileSync, and `deep_scan` returns no Trash, Installer or Backup items and no container caches.
  - `orphan_needs_30_days_and_absence`: a 31-day-old `com.gone.app` cache becomes Orphan, and a 2-day-old one stays AppCache.
  - `in_use_is_unticked`.
  - `excluded_items_vanish`.
  - `build_folders_need_their_manifest_and_skip_documents`: `~/dev/p/node_modules` with `package.json` is found. Without it, nothing is found. `Documents/p/node_modules` is not found.
  - `installers_only_top_level_downloads`.
  - `du_does_not_follow_links`: a link to a 10 MB file counts as about 0.
  - `quick_cleanable_sums_ticked_only`.
  - `breakdown_keeps_big_nodes_and_sums_the_rest`, with `NODE_MIN` lowered through a test-only parameter.
- [ ] **Step 2: Run them.** Run `cargo test cleaner_scan`. Expected: FAIL.
- [ ] **Step 3: Implement** `cleaner_scan.rs`. Dates use `chrono`. Check `cancel` between entries.
- [ ] **Step 4: Run them.** Run `cargo test cleaner_scan`. Expected: all pass.
- [ ] **Step 5: Commit.** Message: `feat(cleaner): deep clean scan, disk parts and breakdown`.

### Task 3: Removing (Rust)

**Files:**
- Create: `src-tauri/src/cleaner_run.rs`
- Test: in-file tests on temp dirs, with a fake `Trash`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces:
  ```rust
  pub trait Trash { fn trash(&self, p: &Path) -> Result<(), String>; }
  pub struct Outcome { pub id: u64, pub result: Result<u64 /* bytes freed */, Skip>, pub detail: Option<String> }
  pub fn recheck(item: &Item, purpose: &Purpose, roots: &Roots, excluded: &Exclusions, running: &dyn Fn(&str) -> bool) -> Result<(), Skip>;
  pub fn remove_one(item: &Item, trash: &dyn Trash) -> Result<u64, Skip>;    // permanent: contents of a dir, or the file/link; trash: the whole item
  pub fn run(items: &[Item], purpose: &Purpose, ctx: RunCtx, mut on_each: impl FnMut(usize, &Outcome)) -> Vec<Outcome>;
  pub struct RunCtx<'a> { pub roots: &'a Roots, pub excluded: &'a Exclusions, pub running: &'a dyn Fn(&str) -> bool,
                          pub trash: &'a dyn Trash, pub other_copy: &'a dyn Fn() -> bool, pub stop: &'a AtomicBool, pub log: &'a mut dyn FnMut(String), pub now: &'a dyn Fn() -> String }
  ```
- `recheck` uses `check` again. `ident` must match on `dev` and `ino`, and also on `mtime_ms` for Trash-route items. A mismatch gives `Changed`, and so does a missing path. `in_use` is checked again: an app being uninstalled must not be running.
- Permanent removal of a folder removes each child with `std::fs::remove_dir_all` (symlink-safe since Rust 1.58) or `remove_file`. The folder itself stays. Bytes freed are `du` before minus `du` after.
- `run`:
  - it stops before the next item once `stop` is set;
  - it writes one `log_line` per item, success or skip;
  - for `Purpose::Uninstall`, it trashes the `App` item first, then calls `other_copy()`: if another copy now shows up, every remaining leftover is skipped as `Protected`. Otherwise it does the rest.
  - A failed Trash leaves the item where it is. It is never removed permanently.

- [ ] **Step 1: Write the failing tests:**
  - `permanent_dir_keeps_folder_empties_contents`.
  - `remove_contents_keeps_link_target`: a cache folder holds a link to a temp "Documents" file, and after the run the target still exists.
  - `replaced_item_is_skipped`: recreate the folder between scan and run, giving a new inode, and the result is `Changed`, with the new contents untouched.
  - `trash_route_uses_trash_and_failure_keeps_item`.
  - `stop_flag_halts_after_current`.
  - `every_item_is_logged`.
  - `excluded_after_scan_is_skipped`.
- [ ] **Step 2: Run them.** Run `cargo test cleaner_run`. Expected: FAIL.
- [ ] **Step 3: Implement** `cleaner_run.rs`.
- [ ] **Step 4: Run them.** Run `cargo test cleaner_run`. Expected: all pass.
- [ ] **Step 5: Commit.** Message: `feat(cleaner): rechecked removal to Trash or for good, with a log`.

### Task 4: Apps and leftovers (Rust, on disk)

**Files:**
- Create: `src-tauri/src/cleaner_apps.rs`
- Test: in-file tests with fake `.app` bundles (`Contents/Info.plist` written by `plist`) in temp dirs

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces:
  ```rust
  #[derive(Clone, Serialize)] #[serde(rename_all = "camelCase")]
  pub struct AppInfo { pub id: u64, pub name: String, pub bundle_id: String, #[serde(skip)] pub path: PathBuf, pub bytes: u64,
                       pub refused: bool /* official uninstaller */, pub running: bool, #[serde(skip)] pub team: Option<String> }
  pub fn list_apps(roots: &Roots, cancel: &AtomicBool, next_id: &mut u64) -> Vec<AppInfo>;  // sorted by bytes desc; skips /System/Applications; recurses one folder level
  pub fn read_info(app: &Path) -> Option<(String /*bundle id*/, String /*name*/)>;          // CFBundleIdentifier, CFBundleName or file stem
  pub fn official_uninstaller(app: &Path, bundle_id: &str) -> bool;                          // Contents/Library/SystemExtensions non-empty, any PlugIns/*.appex with NSExtensionPointIdentifier starting "com.apple.networkextension", or REFUSED_PREFIXES; unreadable → true
  pub const REFUSED_PREFIXES: &[&str];   // "com.crowdstrike","com.paloaltonetworks","com.cisco","com.jamf","com.kandji","com.microsoft.wdav","com.sentinelone","com.sophos","com.eset","com.malwarebytes","com.mosyle","com.addigy","com.zscaler","com.netskope"
  pub fn leftovers(app: &AppInfo, roots: &Roots, fda: bool, other_copy: bool, team_shared: impl Fn(&str) -> bool, excluded: &Exclusions, next_id: &mut u64) -> Vec<Item>;
  ```
- Where `leftovers` looks, under `home/Library`:
  - `Application Support`, `Caches`, `Preferences` (also `Preferences/ByHost`), `Saved Application State`, `HTTPStorages`, `WebKit`, `Cookies`, `Logs`, `LaunchAgents` and `Application Scripts`, matched with `leftover_match`;
  - with FDA, also `Containers` and `Group Containers`;
  - **vendor paths:** `Application Support/<Vendor>/<Name>` and `Caches/<Vendor>/<Name>` are passed as `vendor_path`.
- **Group Containers:**
  - `Sure` for `group.<bid>`, or `<TEAM>.<…>` when the app's Team ID is `TEAM`.
  - If `team_shared(team)` (another installed app has that Team ID), a `<TEAM>.` container is not offered.
- **LaunchAgents:** `Sure` when the plist's `Label` starts with the bundle id, or when `Program` or `ProgramArguments[0]` is inside the app path. Otherwise it is not offered (no name guess).
- **What becomes what:**
  - `other_copy` means no leftovers at all, only the `App` item.
  - Each match passes `check` with `Purpose::Uninstall`. A protected `Sure` match becomes `Personal`, unticked. A protected `Maybe` match is dropped.
  - `Sure` gives a ticked `Leftover`. `Maybe` gives an unticked `Leftover` with `confidence: "maybe"`.
- The Team ID is read with `/usr/bin/codesign -dv --verbose=2 <app>`, parsing `TeamIdentifier=`. An error or `not set` gives `None`.

- [ ] **Step 1: Write the failing tests:**
  - `lists_apps_by_size_and_skips_system`.
  - `leftovers_sure_and_maybe` for a fake "Spotify" (`com.spotify.client`): its `Preferences/com.spotify.client.plist` is ticked, and its `Application Support/Spotify` is a maybe.
  - `second_copy_offers_no_leftovers`.
  - `team_group_container_shared_is_not_offered`.
  - `personal_data_only_when_sure`: a Docker container is offered as `Personal` and unticked, and `Application Support/Docker Desktop` (a maybe that is protected) is dropped.
  - `launch_agent_by_program_path`.
  - `official_uninstaller_detection`: a SystemExtensions folder gives true, a prefix gives true, and an unreadable Info.plist gives true.
  - `hidden_dot_folders_never_offered`: `home/.spotify` is not in the results.
- [ ] **Step 2: Run them.** Run `cargo test cleaner_apps`. Expected: FAIL.
- [ ] **Step 3: Implement** `cleaner_apps.rs`.
- [ ] **Step 4: Run them.** Run `cargo test cleaner_apps`. Expected: all pass.
- [ ] **Step 5: Commit.** Message: `feat(cleaner): app list, official-uninstaller check and leftover search`.

### Task 5: Package, permission and the service (macOS)

**Files:**
- Create: `src-tauri/src/cleaner_service.rs`; `modules/cleaner/{manifest.json,icon.svg,locales/id.json,locales/en.json,package.test.ts}`
- Modify: `src-tauri/src/modules/manifest.rs`, `gate.rs`, `module_commands.rs` (an `Ok(Null)` arm, and `module_gone("cleaner")` sets the stop flag and clears the status), `settings_window.rs` (`SettingsDto.full_disk_access: bool`), `lib.rs` (manage the state, register the commands, read `Roots::from_env` once in setup), `modules/index.json`, `modules/screenshot/package.test.ts`, `src/bridge-browser.ts` (a `cleaner` branch)
- Test: `manifest.rs` / `gate.rs` tests, the package test, in-file tests for the store

**Interfaces:**
- Manifest:
  ```json
  { "id": "cleaner", "version": "1.0.0", "icon": "icon.svg",
    "permissions": ["full-disk-access"], "capabilities": ["cleaner", "status"],
    "action": { "capability": "cleaner", "method": "open" } }
  ```
  Locale descriptions: "Bersihkan cache dan hapus app sampai bersih" / "Clean caches and remove apps completely". The icon is a broom, `viewBox="0 0 24 24"`, stroked, like the mockup's.
- Produces in Rust:
  ```rust
  pub struct CleanerState { store: Mutex<Store>, stop: AtomicBool, cancel: AtomicBool, running_job: AtomicBool, roots: Roots }
  pub struct Store { scan_id: u64, made_ms: i64, items: HashMap<u64, Item>, apps: HashMap<u64, AppInfo>, next_id: u64 }
  impl Store { pub fn fresh(&self, now_ms: i64) -> bool; /* now - made < SCAN_TTL_MS */ pub fn take(&self, scan_id: u64, ids: &[u64], now_ms: i64) -> Result<Vec<Item>, &'static str /* "stale" | "unknown" */>; }
  #[derive(Serialize)] #[serde(rename_all = "camelCase")]
  pub struct Overview { pub test_mode: bool, pub fda: bool, pub volume: String, pub total: u64, pub free: u64,
                        pub parts: PartsDto /* apps, documents, photos: Option<u64>; cleanable: Option<u64> */, pub app_count: Option<usize> }
  #[tauri::command] async fn cleaner_overview(..) -> Overview;              // volume + total/free first, no walking
  #[tauri::command] async fn cleaner_parts(..) -> PartsDto;                 // apps/documents/photos + quick_cleanable + app_count
  #[tauri::command] async fn cleaner_deep_scan(..) -> ScanDto;              // { scanId, items: Item[] } and stores them
  #[tauri::command] async fn cleaner_apps(..) -> ScanDto<AppInfo>;
  #[tauri::command] async fn cleaner_app_detail(app_id: u64, scan_id: u64) -> Result<ScanDto, String>; // App item + leftovers
  #[tauri::command] async fn cleaner_breakdown(..) -> Node;
  #[tauri::command] fn cleaner_run(scan_id: u64, ids: Vec<u64>, uninstall: Option<u64>) -> Result<(), String>; // "stale" | "busy" | "exclusions"
  #[tauri::command] fn cleaner_stop();  #[tauri::command] fn cleaner_cancel_scans();
  #[tauri::command] fn cleaner_running(scan_id: u64) -> Vec<u64>;          // ids whose app is running now (re-checked when the panel opens)
  #[tauri::command] fn cleaner_reveal(scan_id: u64, id: u64) -> Result<(), String>;         // an item or app from a scan
  #[tauri::command] fn cleaner_reveal_path(names: Vec<String>) -> Result<(), String>;       // a breakdown node: names from home (or ["App", …]); each name has no '/' and is not '..'
  #[tauri::command] fn cleaner_exclude(scan_id: u64, id: u64) -> Result<(), String>;
  #[tauri::command] fn cleaner_exclusions() -> Result<Vec<String>, String>; #[tauri::command] fn cleaner_unexclude(path: String) -> Result<(), String>;
  #[tauri::command] fn cleaner_seen();                                     // clears the result status
  #[tauri::command] fn cleaner_open_log(); #[tauri::command] fn open_full_disk_access_settings();
  pub fn fda(roots: &Roots) -> bool;
  ```
- Events: `notching://cleaner` goes to every overlay:
  - `{ phase: "progress", done, total }`;
  - `{ phase: "done", freed, outcomes: [{ id, skip?: Skip }] }`.
- **macOS parts:**
  - **Full Disk Access:** `fda()` is true in test mode. Otherwise it is true when `std::fs::read_dir(home/Library/Application Support/com.apple.TCC)` succeeds (this never prompts; it fails with EPERM without access).
  - **Volume:** `NSURL` resource values `NSURLVolumeTotalCapacityKey`, `NSURLVolumeAvailableCapacityForImportantUsageKey` and `NSURLVolumeLocalizedNameKey` on `/`.
  - **Running:** `NSWorkspace.runningApplications`, by bundle id, plus a `bundleURL` inside an app path.
  - **Installed:**
    - `NSWorkspace.URLsForApplicationsWithBundleIdentifier`;
    - an error gives `None`;
    - an empty list gives `Some(false)`, but only if `list_apps` also lacks the bundle id;
    - URLs inside `~/.Trash` don't count.
  - **Busy tools:** `sysinfo` process names.
  - **Mounted:** `hdiutil info -plist` `image-path`s, read once per scan.
  - **Trash:** `NSFileManager.trashItemAtURL_resultingItemURL_error`.
    - When that fails for an `App` (admin-owned), the outcome is `Failed` with the detail "admin". The page offers Show in Finder, and Finder asks for the password itself (§7). Notching never asks.
  - **Reveal:** `NSWorkspace.activateFileViewerSelectingURLs`.
  - **The FDA pane:** `x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles`.
  - **The log** goes to `<app_log_dir>/cleaner.log`, appended.
  - **Exclusions** live in `<app_data_dir>/cleaner-exclude.json`.
- **Runs:**
  - `cleaner_run` refuses while another run is going, when the scan is stale, or when the exclusions can't be read.
  - It spawns a thread. It sets the status to `Activity::Running` with "{n}%", throttled to whole percents.
  - At the end, the status becomes `Activity::On` with `size_text(freed, lang, false)`, cleared by `cleaner_seen` or after `RESULT_STATUS_MS = 600_000`.
  - Before quitting, the app sets `stop` and joins the run thread for at most 2 s.

- [ ] **Step 1: Write the failing tests:**
  - `gate.rs`: `cleaner_open_is_allowed_when_declared`.
  - `manifest.rs`: `full_disk_access_permission_parses`, plus `repo_modules_are_valid`.
  - `modules/cleaner/package.test.ts`: Cleaner is last, directly after screenshot; `entry` and `card` are null; the action matches; `permissions` is `['full-disk-access']`; the names match; the icon is stroked. In `modules/screenshot/package.test.ts`, change "comes last" to "directly after shelf".
  - Store tests:
    - `stale_scan_is_refused`: with `now = made + 600_001`, `take` gives `Err("stale")`;
    - `unknown_ids_are_refused`: an id from another scan gives `Err("unknown")`.
  - `quit_stops_after_current_item`, through `run` with `stop` set by `on_each` after item 1: only item 1 is removed, and both items are logged (item 2 as `skip:stopped`).
- [ ] **Step 2: Run them.** Run `npx vitest run modules && (cd src-tauri && cargo test)`. Expected: FAIL.
- [ ] **Step 3: Implement.** Declare by hand any objc2 selectors missing from the enabled features, as `shot_service` does. Add `"NSURL"` resource keys and the `NSFileManager` trash method to the feature lists if needed.
- [ ] **Step 4: Run them.** Run `npm run build:modules && npm test && (cd src-tauri && cargo test && cargo build)`. Expected: all pass, and it builds.
- [ ] **Step 5: Commit.** Message: `feat(cleaner): module package, Full Disk Access and the core service`.

### Task 6: The start view in the notch (TS)

**Files:**
- Create: `src/cleaner/format.ts`, `src/cleaner/home.ts`, `src/cleaner/view.ts` (screen router with only `home` for now)
- Modify: `src/pages/route.ts` (`CLEANER_KEY`, `CLEANER` sizes, the `PageView` kind, `viewSize`), `src/notch/page-view.ts`, `src/app.ts` (the tile opens Cleaner; `onCleaner` events; the panel-open hook calls `view.shown()`), `src/bridge.ts`, `src/bridge-browser.ts` (fake data for the dev browser), `src/i18n/{index.ts,id.json,en.json}` (a `cleaner` section with the Global Constraints copy), `src/styles.css`
- Test: `src/cleaner/format.test.ts`, `src/cleaner/home.test.ts`, `src/pages/route.test.ts`, `src/app.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const CLEANER_KEY = 'cleaner';
  export const CLEANER = { width: 520, home: 228, homeNote: 24, list: 440 } as const;   // list views: 440 high, scrolling inside
  // PageView gains: { kind: 'cleaner'; key: typeof CLEANER_KEY; screen: 'home' | 'list'; note: boolean }
  export function sizeText(bytes: number, lang: 'id' | 'en', spaced = true): string;   // same rule as Rust size_text
  export const BAR_COLORS = { apps: '#2f7cf6', documents: '#f5a623', photos: '#f8d03a', cleanable: '#e8262e', other: '#9b9b9b', free: '#1a1a1a' };
  export function barParts(o: Overview, p: Parts | null): { key: keyof typeof BAR_COLORS; bytes: number; known: boolean }[]; // other = used − known parts, never < 0; unknown parts fold into other with known=false
  export interface CleanerView { shown(): void; hidden(): void; destroy(): void }
  export function mountCleaner(el: HTMLElement, deps: CleanerDeps): CleanerView;
  interface CleanerDeps { bridge: CleanerBridge; lang: 'id' | 'en'; now(): number; resize(screen: 'home' | 'list', note: boolean): void; close(): Promise<void>; openPermissions(): void }
  ```
  - `Bridge` gains these calls, each mapped to Task 5's commands: `cleanerOverview`, `cleanerParts`, `cleanerDeepScan`, `cleanerApps`, `cleanerAppDetail`, `cleanerBreakdown`, `cleanerRun`, `cleanerStop`, `cleanerCancelScans`, `cleanerRunning`, `cleanerReveal`, `cleanerRevealPath`, `cleanerExclude`, `cleanerSeen`, `openFullDiskAccessSettings`, and `onCleaner(cb)`. `CleanerBridge` is that subset.
- **Behaviour (§4):**
  - `cleanerOverview` and `cleanerParts` start together, and each fills its part as it arrives. "Menghitung…" shows until `parts` lands.
  - The bar has one segment per part plus free, in the order App, Dokumen, Foto, Bisa dibersihkan, Lainnya.
  - The legend shows "{name} {size}". An unknown part shows "?" and is folded into Lainnya.
  - A click on the bar goes to the breakdown (Task 9; a no-op until then).
  - The two tiles show their summaries.
  - Without FDA there is a note line and a button that calls `openPermissions`, which opens Settings → Izin.
  - In test mode a **MODE COBA** label sits top right.
- **`view.ts` keeps the place (§4):**
  - `hidden()` stamps the time and calls `cleanerCancelScans` unless a run is going.
  - `shown()` within 10 minutes keeps the screen and re-asks `cleanerRunning`. After that, it goes back home with a fresh count, and it calls `cleanerSeen`.

- [ ] **Step 1: Write the failing tests:**
  - `format.test.ts`:
    - `sizeText` gives "25,9 GB" / "25.9 GB", and "980 MB" below 1 GB;
    - `barParts` never makes Lainnya negative, and folds unknown parts in.
  - `home.test.ts`:
    - the bar has 6 segments with the exact colours;
    - the legend text;
    - "Menghitung…" shows until parts arrive;
    - the tile summaries;
    - the FDA note and its button;
    - the MODE COBA label only in test mode.
  - `route.test.ts`: `viewSize` is 520 × 228, plus 24 with the note, and 520 × 440 for `list`.
  - `app.test.ts`:
    - the Cleaner tile opens the cleaner page without a core call;
    - Cleaner is never saved as `lastPage`;
    - a closed then reopened panel within 10 minutes keeps the screen (fake `now`).
- [ ] **Step 2: Run them.** Run `npx vitest run src/cleaner src/pages src/app.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Follow `cleaner-tempat.html` A, moment 1, and `cleaner-warna.html` 1. The big number uses the dot font, like the other big numbers.
- [ ] **Step 4: Run them.** Run `npx tsc --noEmit && npm test`. Expected: all pass.
- [ ] **Step 5: Commit.** Message: `feat(cleaner): the start view with the disk bar and the two tiles`.

### Task 7: Deep clean list, confirmation, progress and result (TS)

**Files:**
- Create: `src/cleaner/clean.ts`, `src/cleaner/run.ts`
- Modify: `src/cleaner/view.ts`, `src/i18n/*`, `src/styles.css`
- Test: `src/cleaner/clean.test.ts`, `src/cleaner/run.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const CATEGORY_ORDER = ['appCache','browserCache','devCache','log','orphan','trash','build','installer','backup'] as const;
  export function groupItems(items: Item[]): { category: Category; items: Item[]; bytes: number }[];  // CATEGORY_ORDER, empty groups dropped
  export function selection(items: Item[], ticked: Set<number>): { permanent: number; trash: number; count: number };
  export function mountRun(el: HTMLElement, deps: RunDeps): { confirm(plan: { permanent: number; trash: number; count: number }, kind: 'clean' | 'uninstall', name?: string): Promise<boolean>; progress(done: number, total: number): void; result(freed: number, skipped: { label: string; reason: Skip }[]): void };
  ```
- **The list (§5.1):**
  - Each category is a row with a tick, its label and its size. A click opens its items, and each item has its own tick.
  - A category tick sets every item in it that is not `in_use`.
  - `in_use` items show "sedang dipakai" and cannot be ticked.
  - On hover, an item shows "Jangan pernah bersihkan". It calls `cleanerExclude`, and the item leaves the list.
  - FDA-only categories without FDA show as a muted row, "butuh Full Disk Access".
  - The footer shows "Dipilih {size}" and the button **Bersihkan {size}**, which is disabled at 0.
- **Confirm (§5.3):**
  - It shows the two lines, with a line left out when it is 0, and the count, plus **Ya, bersihkan** and **Batal**. Esc means Batal.
  - Yes calls `cleanerRun(scanId, ids, null)`.
  - `stale` rescans and shows the list again. `exclusions` shows "Daftar pengecualian tidak bisa dibaca".
- **Progress:** a bar and "{done} dari {total}" / "{done} of {total}", with **Berhenti**. **Result:** "+{size}" and the skipped items with their reasons.

- [ ] **Step 1: Write the failing tests:**
  - `clean.test.ts`:
    - the groups come in order;
    - the default ticks follow `item.ticked`;
    - an in-use item cannot be ticked;
    - a category tick skips in-use items;
    - the footer total updates;
    - Never clean calls `cleanerExclude` and removes the row;
    - a no-FDA category is muted.
  - `run.test.ts`:
    - confirm shows the permanent and trash lines;
    - Batal and Esc resolve false and call nothing;
    - Yes resolves true;
    - progress text;
    - the result lists skips with their reason strings;
    - `stale` triggers a rescan.
- [ ] **Step 2: Run them.** Run `npx vitest run src/cleaner`. Expected: FAIL.
- [ ] **Step 3: Implement.** Follow `cleaner-tempat.html` A, moment 2.
- [ ] **Step 4: Run them.** Run `npx tsc --noEmit && npm test`. Expected: all pass.
- [ ] **Step 5: Commit.** Message: `feat(cleaner): deep clean list, confirmation and progress`.

### Task 8: Clean uninstall (TS)

**Files:**
- Create: `src/cleaner/uninstall.ts`
- Modify: `src/cleaner/view.ts`, `src/i18n/*`, `src/styles.css`
- Test: `src/cleaner/uninstall.test.ts`

**Behaviour (§5.2):**
- **Step 1, the app list:**
  - a search box (focused on open), then app rows with an icon, name and size, biggest first;
  - the search matches the name or bundle id, case-insensitive;
  - icons come from the existing `notchmod`/thumbnail path if there is one, or are left to the builder (a generic app glyph is acceptable).
- **Step 2, the app and its leftovers:**
  - `cleanerAppDetail` gives the `App` item (always ticked, cannot be unticked), then groups for settings, cache, data, container and background program, then **Data pribadi** last;
  - maybe items show "mungkin · nama mirip" and start unticked;
  - Personal items show their contents line and start unticked.
- **A running app:** "Tutup {app} dulu" shows, and the button is disabled. `onCleaner`'s next `shown()` re-asks `cleanerRunning`, and the button comes back once the app has quit. Cleaner never quits apps.
- **A refused app:** "Pakai uninstaller bawaan app ini", with no button.
- **The button:** **Hapus {app} · {size}** → confirm ("Ya, hapus") → `cleanerRun(scanId, ids, appId)`.
- **The admin case:** a result whose skip detail is `admin` shows "Tampilkan di Finder" for the app.

- [ ] **Step 1: Write the failing tests:**
  - search filters;
  - the list is sorted;
  - the app item is locked ticked;
  - maybe and personal items are unticked with their labels;
  - a running app disables the button and shows the line, then `cleanerRunning` returning [] enables it;
  - a refused app has no button;
  - Hapus goes through confirm with "Ya, hapus";
  - an admin failure offers Show in Finder.
- [ ] **Step 2: Run them.** Run `npx vitest run src/cleaner/uninstall.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Run `npx tsc --noEmit && npm test`. Expected: all pass.
- [ ] **Step 5: Commit.** Message: `feat(cleaner): clean uninstall with sure, maybe and personal leftovers`.

### Task 9: Disk breakdown (TS)

**Files:**
- Create: `src/cleaner/disk.ts`
- Modify: `src/cleaner/view.ts`, `src/cleaner/home.ts` (the bar click), `src/i18n/*`, `src/styles.css`
- Test: `src/cleaner/disk.test.ts`

**Behaviour (§6):**
- `cleanerBreakdown` runs once per open, with "Menghitung…" until it lands.
- The rows are the biggest first, each with a thin size bar. A folder row enters on click, and "‹" goes back a level, then back to the start view.
- Every row has **Tampilkan di Finder**, which calls `cleanerRevealPath(names from home)`. The panel closes as Finder takes focus, and reopening within 10 minutes returns to the same folder.
- An unreadable node shows "tidak bisa dibaca".
- The summed rest shows as "{n} item lain" / "{n} other items" and cannot be entered.
- There is no remove control anywhere.

- [ ] **Step 1: Write the failing tests:**
  - rows are sorted;
  - entering and going back;
  - reveal passes the name path;
  - unreadable nodes;
  - the rest row is inert;
  - no button other than reveal and back exists (`querySelectorAll('button')` labels).
- [ ] **Step 2: Run them.** Run `npx vitest run src/cleaner/disk.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Run `npx tsc --noEmit && npm test`. Expected: all pass.
- [ ] **Step 5: Commit.** Message: `feat(cleaner): read-only disk breakdown`.

### Task 10: Settings — Izin row, never-clean list, log

**Files:**
- Modify: `src/settings/pages/info.ts` (a `full-disk-access` entry in `PERMISSIONS`, `granted: i => i.fullDiskAccess`, `open: b => b.openFullDiskAccessSettings()`), `src/settings/pages/modules.ts` (`MODULE_SETTINGS.cleaner`), `src/settings/types.ts`, `src/settings/bridge-{tauri,browser}.ts`, `src/i18n/*`
- Test: `src/settings/pages/info.test.ts`, `src/settings/pages/modules.test.ts`

**Behaviour (§9):**
- The Izin row reads "Cleaner · Full Disk Access", with a hint saying what it is for: "Untuk membaca cache, Tempat Sampah, dan cadangan iPhone" / "To read caches, the Trash and iPhone backups".
- The Cleaner module page lists the never-clean paths from `cleanerExclusions`, shown relative to home with `~`. Each has a remove button calling `cleanerUnexclude`. An empty list shows a note. An `Err` shows "Daftar pengecualian tidak bisa dibaca".
- The page has a "Buka log" / "Open log" button calling `cleanerOpenLog`.
- The status switch comes from the existing `status` capability logic.

- [ ] **Step 1: Write the failing tests:**
  - `full disk access row shows for cleaner and its state`;
  - `cleaner page lists exclusions and removes one`;
  - `cleaner page shows the unreadable-list line`;
  - `open log button`.
- [ ] **Step 2: Run them.** Run `npx vitest run src/settings`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Run `npx tsc --noEmit && npm test && (cd src-tauri && cargo test)`. Expected: all pass.
- [ ] **Step 5: Commit.** Message: `feat(cleaner): Full Disk Access on the Izin page and the never-clean list`.

### Task 11: The sample folder and the bait test

**Files:**
- Create: `scripts/cleaner-cek.sh`, `src-tauri/tests/cleaner_sample.rs` (macOS-only integration test)
- Test: `cleaner_sample.rs`

**Behaviour (§11):**
- `scripts/cleaner-cek.sh [ROOT]` (default `~/cleaner-cek`) refuses to run if `ROOT` exists and is not a previous sample, which it knows by a `.cleaner-cek` marker. Otherwise it rebuilds `ROOT`:
  - `home/Library/Caches/{com.contoh.editor,Google/Chrome/Default/Cache,Homebrew}` with a few MB of random files;
  - `home/Library/Logs/com.contoh.editor/a.log`;
  - `home/Library/Caches/id.web.notching.coba.yatim` and `home/Library/Saved Application State/id.web.notching.coba.yatim.savedState`, `touch -t` 40 days ago, plus `id.web.notching.coba.baru` dated today;
  - `home/dev/proyek/{package.json,node_modules/x/index.js}` and `home/dev/rust/{Cargo.toml,target/debug/a}`;
  - `home/Downloads/Installer Contoh.dmg` (random bytes);
  - `home/Library/Application Support/MobileSync/Backup/0000-COBA/Info.plist` (Device Name "iPhone Coba");
  - `home/.Trash/sampah.txt`.
- The script also builds the app and its leftovers:
  - `Applications/Coba Cleaner.app`, built with `osacompile` from `display dialog "Coba Cleaner sedang berjalan" buttons {"Tutup"} default button 1`, then `CFBundleIdentifier` set to `id.web.notching.coba-cleaner` with `PlistBuddy`;
  - its leftovers: `Preferences/id.web.notching.coba-cleaner.plist` (sure), `Application Support/Coba Cleaner` (maybe), and `Containers/id.web.notching.coba-cleaner`.
- **Baits:**
  - `home/.claude/memory.md`;
  - `home/Documents/penting.txt`;
  - `home/Documents/proyek/node_modules/x.js`;
  - `home/Library/Cookies/Cookies.binarycookies`;
  - `home/Library/Caches/com.contoh.editor/tautan` → `../../../Documents/penting.txt` (a symlink);
  - `home/Library/Application Support/Coba` (too short and generic-adjacent; it must not match).
- At the end, it writes `ROOT/checksums-before.txt` with `shasum` of every regular file, and prints how to start Notching in test mode:
  ```bash
  open -n /path/to/Notching.app --env NOTCHING_CLEANER_ROOT="$HOME/cleaner-cek"
  ```
- The integration test runs the script into a temp root (skipped when `osacompile` is missing). It builds `Roots::test`, ticks **every** item from `deep_scan` and from `leftovers` (personal included), and runs `run` with a fake `Trash` that moves into `ROOT/fake-trash`. Then it asserts:
  - every bait's checksum is unchanged;
  - `id.web.notching.coba.baru` is still there;
  - `Application Support/Coba` is still there.

- [ ] **Step 1: Write the failing test** `sample_baits_survive_ticking_everything`.
- [ ] **Step 2: Run it.** Run `cd src-tauri && cargo test --test cleaner_sample`. Expected: FAIL (no script).
- [ ] **Step 3: Implement** the script. `chmod +x`.
- [ ] **Step 4: Run it.** Run `cargo test --test cleaner_sample`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `test(cleaner): sample folder with baits, and a test that ticks everything`.

---

## After the tasks

- Run a whole-branch review, then fix what it finds. Pay extra attention to every call site that removes or trashes something: each must go through `cleaner_run::run`.
- Build a release (`npm run tauri build`). The owner tries it on the Mac **in test mode only**, through `scripts/cleaner-cek.sh` and `open -n … --env NOTCHING_CLEANER_ROOT=…`:
  - Deep clean with the defaults;
  - then the optional rows;
  - Never clean;
  - Clean uninstall of "Coba Cleaner" while it is open ("Tutup … dulu"), then after closing it;
  - the breakdown with Show in Finder;
  - closing and reopening mid-way.
- Every owner report is matched against:
  - `<app_log_dir>/cleaner.log` (lines tagged `coba`);
  - `shasum -c ~/cleaner-cek/checksums-before.txt` for the baits;
  - `ls ~/.Trash` for Trash-route items;
  - the status text.
- **The second stage** is on the real Mac without test mode, with the owner's agreement. Open Cleaner, look at the bar, the breakdown and both lists, and press **Batal** at the confirmation. Check that the log has no non-`coba` removal lines unless the owner chose to clean.
- Full Disk Access must be granted again after each unsigned rebuild (remove and re-add the entry).
- Record everything in `docs/superpowers/verification/2026-11-01-notching-12-cleaner.md`, then merge to `main` on the owner's word. Do not push.
