# Verifikasi: halaman dan widget (rencana 5)

Rencana ini dicek dua tahap, seperti rencana 4: bagian A (halaman di notch) dulu, lalu bagian B (editor halaman dan status di samping notch).

## A. Halaman di notch

Tanggal: 30–31 Oktober 2026
Perangkat: MacBook Air M4 (layar bawaan ber-notch). Monitor eksternal tidak tersambung saat cek ini (lihat cek 7).
Cara cek: checklist dicoba pemilik di build dev (`npm run tauri dev`) dari worktree `.claude/worktrees/halaman`, cabang `feat/halaman`. Build rilis dibuka dari `src-tauri/target/release/bundle/macos/Notching.app` di worktree itu dan tidak disalin ke `/Applications`.

### Test otomatis

- `npx tsc --noEmit`: lulus.
- `npm test`: 285 lulus (228 di awal rencana).
- `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml`: 149 lulus, 1 diabaikan (122 di awal rencana). Yang diabaikan masih `live_search_and_forecast_through_macos_tls`, yang memanggil Open-Meteo sungguhan.

### Pindahan pengaturan

Salinan data asli disimpan di `~/Library/Application Support/id.web.notching/before-plan-5/` sebelum app baru jalan. Notching lama sempat dipakai lagi setelah salinan itu dibuat, jadi `lastCard` berubah dari `"home"` ke `"system-stat"`. Karena itu file tepat sebelum app baru jalan juga disalin (`settings-just-before-run.json`, `reminders-just-before-run.json`), dan pindahan dicocokkan dengan salinan itu.

- **Sebelum** (`version: 1`): bahasa `auto`, layar `null`, `lastCard: "system-stat"`, tidak ada modul yang mati atau dicopot, slider 100/200/9/4, kota Pekanbaru (Riau), `prayerMethod: "kemenag"`, `showClock: true`, saluran `home.prayer` dan `home.reminder` sama-sama tampil dan bersuara.
- **Sesudah** (`version: 2`):
  - Bahasa, layar, modul, slider, kota, metode, glow, lama tampil, dan kedua saluran sama persis.
  - `showClock` dan `lastCard` hilang.
  - `pages` berisi Beranda saja: `home/date` kolom 0, `home/weather` kolom 1, dan `home/reminders` kolom 2 selebar 2.
  - `lastPage: "module:system-stat"`, terjemahan dari `lastCard` lama.
- `settings.json.v1` sama persis dengan `settings-just-before-run.json` (`diff` kosong).
- `reminders.json` sama persis dengan salinannya (10 reminder, `nextId: 13`) sampai pemilik menambah reminder di cek 2.

### Jaringan

- `dig`: `api.open-meteo.com` → 188.40.99.226 dan 167.114.211.86. `geocoding-api.open-meteo.com` → 202.61.206.6.
- **Build dev tanpa cache cuaca.** `weather.json` dipindahkan dulu, lalu app dijalankan ulang. `lsof -nP -a -iTCP -iUDP` atas `notching` dan WebKit Networking dicatat tiap sekitar 2 detik, dengan localhost tidak dihitung, dari 22.21 sampai 08.11 keesokan paginya.
  - Sebelum Beranda dibuka, tidak ada koneksi keluar sama sekali.
  - Satu-satunya koneksi: `notching` → 188.40.99.226:443 (Open-Meteo), pukul 08.09.21, saat pemilik membuka Beranda.
  - `weather.json` baru tertulis pukul 08.09.22.

### CPU (build dev, sampel tiap sekitar 2 detik)

| Keadaan | `notching` | WebContent notch |
|---|---|---|
| Panel tertutup, Mac tidak dipakai semalam (877 sampel) | paling tinggi 0,2 | paling tinggi 0,1 |
| Panel dibuka, pindah ke Beranda, cuaca diambil (sekitar 20 detik) | 0,8–13,5 | 0,1–15,2 |
| Beranda terbuka dan diam, lalu panel ditutup dan diam (52 sampel, 08.09.23–08.11.15) | 0,0, satu sampel 0,1 | 0,0, paling tinggi 0,3 |

Semua keadaan diam ada di bawah 1,0. Lonjakan hanya terjadi saat panel bergerak dan cuaca dimuat.

### Ukuran

- `Notching.app`: 4,9 MB (4,89 MiB menurut Tauri) (rencana 4: 4,9 MB).
- `dist/assets`: 220 KB (rencana 4: 212 KB).

### Checklist

| # | Cek | Hasil | Catatan |
|---|---|---|---|
| 1 | Beranda berisi Tanggal, Cuaca, dan Reminder, tanpa baris bawah dan jam kecil. Kota, cuaca, dan reminder lama masih ada. | Lulus | Dilaporkan pemilik. Isi `pages` dan kota di `settings.json` cocok (lihat Pindahan). |
| 2 | Klik Reminder membuka daftar lengkap. Tambah reminder sambil TextEdit terbuka. "Kembali" ke Beranda, Esc menutup panel. | Lulus setelah perubahan | Pemilik meminta daftar lengkap menampilkan 6 baris, bukan 2 (lihat Temuan). Setelah itu dilaporkan lulus. Reminder baru "tes panjang" (id 13) tercatat di `reminders.json`. |
| 3 | Pil berisi Beranda, Modul, dan ⋯. Kotak System stat membuka kartunya dengan "‹ Modul", dan "‹ Modul" kembali. Panel berubah ukuran dengan pegas yang sama. | Lulus | Dilaporkan pemilik. `lastPage` sempat tercatat `"modules"`. |
| 4 | Tutup panel di System stat, Cmd+Q, jalankan lagi → panel terbuka di System stat. | Lulus | Laporan pertama "oke semua" ternyata belum mencakup cek ini: app masih proses yang sama dan `lastPage` masih `"modules"`. Setelah diulang, app keluar tanpa galat dengan `lastPage: "module:system-stat"`, dijalankan ulang, dan pemilik melihat System stat. |
| 5 | Notifikasi reminder. Mac diam 2 menit sebelum jamnya → titik merah di notch dan titik putih di ikon Beranda. Klik notifikasi membuka Beranda. | Lulus setelah diulang | Percobaan pertama ("Tesuuu", 22.09) terkirim (`notified: true`) tanpa titik, karena Mac belum diam 2 menit. Petunjuk awal kurang jelas soal ini. Titik juga dicek di browser dengan `?missed=home.reminder`: titik merah dan kelas `missed` di ikon Beranda muncul. Percobaan kedua ("reminder baru", 22.14) memunculkan kedua titik menurut pemilik. "uuu" (22.16) juga terkirim. |
| 6 | Pengaturan: tujuh bagian, Halaman berisi kota dan metode sholat, Beranda tidak ada di Modul, English mengubah nama widget dan "Home". | Lulus | Dilaporkan pemilik. `settings.json` berisi `language: "en"` pukul 22.18, jadi bahasa memang diganti. Pemilik belum mengembalikannya. |
| 7 | Monitor eksternal. | Dilewati | Saat dicek, `system_profiler` hanya menemukan layar bawaan. Pemilik memilih melewatinya. Dicoba lagi di bagian B. |
| 8 | Klik di luar menutup panel, dan menu bar dekat tengah bisa diklik. | Lulus | Dilaporkan pemilik. |
| — | Build rilis: Beranda tampil. | Lulus | Dilaporkan pemilik. Program di `Notching.app` dibuat 08.13.27 dan dibuka 08.18.34 (waktu akses file). `lastPage` sudah `"home"`, jadi `settings.json` tidak berubah. |

### Temuan dan catatan

- **Daftar Reminder lengkap terlalu pendek.** Di halaman 104 px hanya 2 reminder yang terlihat. Atas permintaan pemilik, widget sekarang meminta tinggi saat membuka tampilan penuh. `notching:expand` membawa `height` (opsional). Reminder meminta 193 px: kepala dan isian 53 px, ditambah 6 baris 20 px dengan jarak 4 px. Host membatasinya antara 104 dan 240 px (`FULL_PAGE_MAX`). Panel kembali ke 104 px saat "Kembali", saat pindah halaman, atau saat ditutup. Dibuat di `789065a` dengan test.
- **Widget Reminder di Beranda menampilkan 3 reminder, bukan 2.** Pemilik melihat ruang kosong di bawah dua baris. Tiga baris muat di halaman 104 px (baris ketiga berakhir di 86 px). Spec bagian 3 ikut diubah.
- **Tombol kembali tidak seragam.** Di daftar Reminder lengkap "KEMBALI" ada di kanan, sedangkan di halaman modul "‹ MODUL" ada di kiri. Atas masukan pemilik, Reminder sekarang memakai susunan yang sama: "‹ KEMBALI" di kiri dan nama di kanan.
- **Kedua perubahan di atas dicoba pemilik di build rilis baru** (dibuat 08.42.49, dibuka 08.52.03) dan dinyatakan "sudah pas".
- **Font tidak termuat di build dev worktree.** `node_modules` worktree semula berupa tautan ke folder utama, sehingga Vite menolak file font di luar daftar izinnya. Tautan diganti dengan `npm ci` di worktree. Ini hanya terjadi di build dev worktree; build rilis membawa fontnya sendiri.
- **Notching lama sempat dipakai setelah salinan data dibuat.** Tidak ada yang hilang. Pindahan dicocokkan dengan file tepat sebelum app baru jalan.
- **Bahasa masih English** setelah cek 6.

## B. Editor halaman dan status samping notch

Tanggal: 31 Oktober 2026
Perangkat: MacBook Air M4 (layar bawaan ber-notch). Monitor eksternal tidak tersambung; pemilik memilih mengecek tanpa monitor dulu (lihat cek 6).
Cara cek: editor dicoba pemilik di pratinjau browser (`npm run dev`, `settings.html`) selama dibangun, lalu checklist di build dev (`npm run tauri dev`) dari worktree `feat/halaman`. Salinan data sebelum bagian B ada di `before-plan-5-b/`.

### Test otomatis

- `npx tsc --noEmit`: lulus.
- `npm test`: 333 lulus (285 di akhir bagian A).
- `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml`: 170 lulus, 1 diabaikan (149 di akhir bagian A).

### CPU (build dev, sampel tiap sekitar 2 detik)

| Keadaan | `notching` | WebContent notch |
|---|---|---|
| Panel tertutup, contoh status "18:42" menyala, Mac tidak disentuh (26 sampel, 10.54.12–10.55.05) | 0,0 di semua sampel | paling tinggi 0,2 |
| Halaman Kerja terbuka dan diam (22 sampel, 10.55.15–10.55.59) | 0,0 di semua sampel | paling tinggi 0,1 |
| Pengaturan terbuka, saklar dicoba (10.53–10.54) | 0,0–9,4 | 0,0–8,9 |

Status yang diam tidak menjalankan loop frame. Selama rekaman tidak ada koneksi keluar.

### Ukuran

- `Notching.app`: 4,9 MB (4,93 MiB menurut Tauri; bagian A: 4,89 MiB).
- `dist/assets`: 248 KB (bagian A: 220 KB). Tambahannya editor halaman dan gambar contoh widget.

### Checklist

| # | Cek | Hasil | Catatan |
|---|---|---|---|
| 1 | Halaman "Kerja" dengan ikon tas, berisi Jam, Waktu sholat, dan Reminder; pil Beranda, Kerja, Modul, ⋯; ukuran panel sama dengan Beranda. | Lulus | `settings.json`: `p2` "Kerja", `briefcase`. Laporan pertama "semua sesuai" belum cocok dengan file (ikon masih bintang); setelah diulang, ikon tas tercatat. Ukuran panel dilaporkan pemilik. |
| 2 | Reminder yang ditambah di Kerja juga muncul di Beranda. | Lulus | Reminder "haha" (id 17) tercatat di `reminders.json`; Reminder di semua halaman membaca file yang sama. Dilaporkan pemilik. |
| 3 | Seret Jam ke kolom 4, lepas Waktu sholat, ganti nama dan ikon, urutkan, hapus halaman uji; Beranda tidak bisa dihapus. | Lulus | `settings.json` akhir: Kerja berisi `reminders@0` dan `clock@3`, halaman "Tes" (`p1`) terhapus. Beranda tanpa tombol hapus (test `Beranda has no name field, icon picker or delete button`). Urutan halaman dicoba saat "Tes" masih ada; setelah dihapus tinggal satu halaman custom. |
| 4 | Cmd+Q lalu jalankan lagi → halaman, urutan, dan isi tetap ada. | Lulus | Laporan pertama belum mencakup cek ini (proses masih sama sejak 09.58). Setelah pemilik keluar pukul 10.49 tanpa galat, app dijalankan ulang; `pages` sama persis. |
| 5 | Contoh status "18:42" di kanan notch; titik terlewat tetap di kiri; status hilang saat notifikasi lalu kembali. | Lulus | Dilaporkan pemilik. Status contoh tidak disimpan, jadi tidak ada bukti di file. Bentuknya diperiksa dari SVG yang digambar notch di browser (`?notch=1&status=18:42&missed=home.reminder`): tab kanan 56 px, teks rata kanan di x 130, tab kiri dan titik merah tetap. Sembunyi saat notifikasi dan panel terbuka ditutup test `the status hides while a notice or the panel shows`. |
| 6 | Monitor eksternal: status pindah ke lensa sebagai pil kecil, titik merah di dalam pil. | Belum | Monitor tidak tersambung. Bentuk pil diperiksa dari SVG di browser (`?status=18:42&missed=home.reminder`): pil 73 px, titik di x −21,5, teks di tengah sisa ruang. Perlu dicoba di perangkat. |
| 7 | Reminder jatuh tempo membuka halaman pertama yang memasang Reminder. | Lulus | "haha" 10.49 tercatat `notified: true`; `lastPage` menjadi `home`. Dilaporkan pemilik. |
| 8 | Klik di luar menutup panel, menu bar bisa diklik, System stat jalan. | Lulus | Dilaporkan pemilik. |

### Diubah atas permintaan pemilik selama cek

Setiap perubahan punya test yang gagal dulu, lalu lulus.

- Nama halaman diketik langsung di judul, dan halaman baru langsung siap diketik namanya. Baris "Nama" dihapus (`5613000`).
- Ikon bertanda pensil, dan diklik membuka popup 24 ikon. Baris "Ikon" dihapus (`5613000`).
- Daftar widget menjadi grid gambar contoh dengan nama di bawah (`77f63f4`). Kartu digambar seukuran widget di notch lalu diperkecil tetap, supaya widget 1 kolom tidak melebar mengikuti jendela (`76a59bc`).
- Pratinjau berbentuk notch dan menampilkan widgetnya dalam ukuran asli, diperkecil agar muat (`c07051f`).
- Animasi seret: salinan widget terangkat dan mengikuti pointer (`ed05c25`). Di pratinjau salinan itu sempat jatuh ke bawah halaman, karena `position: relative` milik `.ed-slot` mengalahkan `position: fixed`; diperbaiki, dan baris halaman ikut terangkat (`312e66b`).
- Lepas di atas widget lain menukar tempat; widget dari daftar menggantikan widget yang ditimpa; kartu "Penuh, seret untuk mengganti" (`ed05c25`). Lepas di separuh mana pun dari widget 2 kolom menukar seluruhnya (`936f476`).

### Temuan dan catatan

- **Peringatan "ResizeObserver loop" di log dev.** Pratinjau menyesuaikan ukuran ulang karena margin yang dipasangnya sendiri. Sekarang hanya menyesuaikan saat lebarnya berubah (`75d01a7`). Commit itu sempat masuk dengan test yang salah (nilai CSS tidak sah sebagai penanda); `e7f28e4` membetulkan test-nya, yang gagal tanpa perbaikan dan lulus dengan perbaikan.
- **Laporan "semua sesuai" dua kali belum cocok dengan file.** Keduanya diulang sampai file menunjukkan hasilnya.
- **Lingkup:** tidak ada yang dibangun di luar Langkah 1. Paket di `modules/` tetap `home` dan `system-stat`; satu baris per halaman; di samping notch paling banyak satu status dan satu titik.
- **Bahasa** pemilik masih English sejak cek A.

## Pemeriksaan akhir

Seluruh cabang (9a9ff67..0d541ea, bagian A dan B) ditinjau oleh pemeriksa terpisah. Hasilnya: tidak ada temuan kritis, dan tiga temuan penting. Ketiganya, ditambah satu temuan kecil yang dinaikkan karena kena alur utama, diperbaiki dengan test yang gagal dulu.

- fixed one malformed page wiped every custom page (lenient_pages fell back to Beranda alone) — one_broken_page_does_not_take_the_others_with_it, one_broken_widget_does_not_take_its_page_with_it RED→GREEN, cargo 174/174
- fixed a v2 file with a missing or string version was migrated again, losing its pages — a_file_with_pages_is_never_moved_again RED→GREEN
- fixed u8 overflow in fits (col 255 panicked in debug, passed in release) — fits_follows_the_four_columns RED (panic) →GREEN
- fixed an unknown icon survived repair and blocked every save of its page — an_icon_not_in_the_list_becomes_the_dot RED→GREEN
- re-graded reviewer Minor 2 to Important — the main flow (type a new page's name, then click its icon) could lose the first click to the echo's rebuild and an icon pick could revert the rename; fixed with one shared page copy and isOwnEcho in the shell — 'a rename and then an icon change keep both', 'the echo of its own save leaves the editor as it is' RED→GREEN, suite 335/335

Test akhir: `npm test` 335 lulus; `cargo test` 174 lulus, 1 diabaikan.

### Temuan kecil yang ditunda

- a full view's taller panel stays tall if its page is rebuilt while open (app.ts onModuleState)
- typing in the name field is lost if an unrelated broadcast (missed notice, other page) rebuilds the editor
- clearing the name and leaving the field shows an empty title until the next rebuild
- name maxLength 24 counts UTF-16 units, so only 12 emoji fit while Rust accepts 24 chars
- someone who had Beranda switched off in v1 now gets reminder and prayer notices after migration (owner not affected)
- the status is not recomputed when a module is switched off or uninstalled, or for a new overlay (latent until modules report status)
- add_page, delete_page, move_page, set_status_shown change memory before saving, as the older setters do
- no keyboard way to move widgets in the preview (pages have Alt+arrows)

### Keputusan pembuat

Semua keputusan yang diambil pelaksana atas nama pemilik, berurutan, masing-masing dengan akibatnya kalau keliru (dalam bahasa Inggris, seperti di catatan kerja).

- Setup: Ruling: worktree .claude/worktrees/halaman on branch feat/halaman instead of `git switch -c` in the shared checkout — the folder is shared with other sessions and must not change branch — cost if wrong: device check runs from the worktree path (fresh cargo target, node_modules symlinked).
- Task 4: Ruling: Cuaca keeps --g2 for its big number (plan said --g1) — spec 27 Oct §7 says weather is the same size but dimmer than the date, and N2 used --g2 — cost if wrong: one CSS value. Ruling: frame.ts and bridge-browser-home.ts got minimal type fixes in Task 4 so tsc stays green — both are replaced in Tasks 5–6.
- Task 5: Ruling: PageView's modules variant carries `modules: ModuleInfo[]` (plan had only key) — viewSize needs the count — cost if wrong: none.
- Task 5: Ruling: the page view rebuilds only when page, language or slots change (signature); otherwise frames and a full view stay — re-parenting an iframe reloads it — cost if wrong: a stale view until the next change.
- Task 5: Ruling: strings.loadFailed becomes "Gagal dimuat." / "Didn't load." (shorter, fits a 109 px slot) — cost if wrong: one string.
- Task 6: Ruling: Cuaca shows the sky and the range on two lines ("Berawan", "25°/33°") instead of "Berawan · 25°/33°" — seen cut off in the browser at 109 px — cost if wrong: one more line in the widget.
- Task 6: Ruling: the notch view's `.notch-pill .glyph` rules were removed (the pill now draws fixed SVG icons).
- Setup: Ruling: the preview tool reads /Users/hamdaniasril/dev/notch/.claude/launch.json; added an untracked "halaman-web" entry there (npm --prefix worktree, port 1440) — it is local, never committed.
- Task 7: Ruling: Beranda's name in Settings comes from a new settingsWindow.home.homeName string (the host's 'home' string lives outside settingsWindow) — cost if wrong: one string. Ruling: the old search test 'finds a module by description' now searches 'tanggal' — 'cuaca' is also the city's keyword, which moved ahead of the modules section.
- Task 8: Ruling: owner asked for the full Reminder view to show 6 rows (it showed 2) — notching:expand carries an optional height; the reminder widget asks 193 px (53 + 6×20 + 5×4), the host clamps to 104..240 (FULL_PAGE_MAX) and springs back on collapse, page change or close — cost if wrong: one constant in reminders.ts
- Task 8: Ruling: owner asked the compact Reminder widget to show 3 reminders instead of 2 (spec said two) — nearest(…, 3); fits the 104 px page (third row ends at 86 px); spec table updated — cost if wrong: one number
- Task 8: Ruling: owner found the two back buttons uneven (Reminder right, module page left) — Reminder's full view now puts '‹ Kembali' first and its name on the right, like .pg-back — cost if wrong: swap two children
- Task 9: Ruling: the fake bundle's module b gains a 2-column widget 'big' (store.rs, not in the brief's file list) — the switched-off-widget test needs a switchable module that has a widget, and w cannot be switched off — cost if wrong: test fixture only
- Task 9: Ruling: brief's 'a@3 width 2 → BadLayout' cannot fail when the catalog says a is 1 wide (the catalog width wins, per the rules); the overlap case uses two widgets in column 0 instead — cost if wrong: none
- Task 10: Ruling: a page just added may reach the editor before its state broadcast; pages.ts remembers that id (waitingFor/arrived) so the shell does not bounce back to the list — the brief only covered "deleted elsewhere" — cost if wrong: one module variable
- Task 10: Ruling: browser stand-ins share page edits over BroadcastChannel 'notching-pages' (src/bridge-browser.ts touched, outside the brief's file list) — step 5 needs the notch tab to follow the settings tab — cost if wrong: dev-only code
- Task 10: Ruling: extra strings pages.widgetList ("Widget") and pages.move ("Seret untuk mengurutkan") for the list heading and the grip's tooltip — cost if wrong: two strings
- Task 10: Ruling: owner asked for the name to be typed in the title and the icon to open a popup (pencil mark) instead of the Nama and Ikon rows; a new page opens with its name selected — cost if wrong: layout of the editor head
- Task 10: Ruling: owner asked for widget previews in a grid with the name below; previews are fixed sample pictures drawn in settings (widget-preview.ts) for the built-in widgets, a plain name tile for others — live iframes would need module calls in the settings window — cost if wrong: a new widget package shows a plain tile until it gets a sample
- Task 10: Ruling: owner asked for the preview to take the notch's shape and show the widgets; it is drawn at the notch's real size (520 px row, 104 px tall, same dot sizes) inside a notch-shaped panel and shrunk with CSS zoom to the window — cost if wrong: zoom is WebKit/Chromium only, fine for Tauri on macOS
- Task 11: Ruling: the "declares status" check lives in AppCore::set_status (status::set calls it), so it is unit-tested without an AppHandle — cost if wrong: none
- Task 11: Ruling: a status from a module that is switched off or uninstalled is not shown either, not only one in status_off — a module that is off should not speak — cost if wrong: a stale status hides until the module is back on
- Task 11: Ruling: module_commands.rs needed no change (the status commands live in status.rs); notify.rs gets cursor_screen() shared with deliver — cost if wrong: none
- Task 11: Ruling: a module page with a status switch no longer says "no settings" — cost if wrong: one note
- Task 12: Ruling: the brief says the status shows "idle or hover, like the missed dot", but the dot shows only while idle; the status shows idle or hover beside a notch, idle only on a lens (the lens grows under the pointer where the pill hangs) — cost if wrong: one condition in statusShown()
- Task 12: Ruling: notch.css untouched — every status attribute is set on the SVG nodes, as the missed dot does — cost if wrong: none
- Task 13: Ruling: owner asked for a drag animation and for drops on a full row; dragging now lifts a copy that follows the pointer (liftGhost), a preview slot dropped on another swaps with it (swapInto), a listed widget dropped on one replaces it (replaceAt); 'Tidak muat' became 'Penuh, seret untuk mengganti' — cost if wrong: a swap that cannot fit back does nothing
- Task 13: Ruling: owner saw 1-column cards stretch to look 2 columns wide as the window grew; cards now draw the widget at its notch size (109/234 × 104, same dots as the preview) shrunk to 0.75 in fixed 97 px cells — cost if wrong: cards do not grow with a large window
- Task 13: Ruling: owner saw no lift when reordering in the preview; cause: .ed-slot's later position: relative beat .ed-ghost's position: fixed, so the ghost of a slot fell to the bottom of the page — fixed with body > .ed-ghost; the preview now scales with transform (not zoom) and the ghost scales itself (--s) around the grab point; page rows lift too — measured in the browser: ghost under the pointer for slot and card
- Task 13: Ruling: owner found a 1-column widget dropped on the right half of a 2-column one did nothing; drops on a widget now trade places as blocks (widgets and gaps between move along), new widgets replace from the target's first column, and the whole target is outlined — cost if wrong: a swap of non-neighbours shifts what lies between
- Final: Ruling: status stays on the screen where it was computed when the cursor moves away — spec §8 names the cursor's screen at the moment it changes; tracking live is for step 3 when real modules report — cost if wrong: the status shows on the screen the cursor left until it changes
- Final: Ruling: a package update that changes a widget's width may leave a stored placement that no longer fits — all widgets are built in today — cost if wrong: an editor drop refused until the page is edited
- Final: Ruling: each Beranda widget reads home data once a minute in its own frame — the spec chose one frame per widget; CPU idle measured 0.0–0.2 — cost if wrong: three small reads a minute
- Final: Ruling: any window can call the page commands — Tauri has no per-window split here, and it predates this branch — cost if wrong: same as every other settings command
- Final: Ruling: a notice whose widget no page shows opens Beranda — spec §10 says so — cost if wrong: none
- Final: Ruling: editor widget pictures are fixed samples — owner asked for them — cost if wrong: none
