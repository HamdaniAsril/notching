# Notching 4: Beranda N2 dan Notifikasi — Rencana Kerja

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Beranda jadi kartu sungguhan, dan notch bisa memberi notifikasi dari modul Notching sendiri.
- **Bagian A, Beranda N2:**
  - Tiga kolom dipisah garis titik-titik: hari ini, cuaca, berikutnya.
  - Angka titik-titik 5×7, satu titik merah, baris status mini, dan jam kecil di kanan bawah.
  - Cuaca dari Open-Meteo, untuk kota yang diketik sekali di pengaturan Beranda.
  - Waktu sholat dihitung di perangkat. Bawaannya metode Kemenag RI.
  - Reminder disimpan lokal. Klik kolom "Berikutnya" untuk daftar lengkap, isian baru, dan tanda selesai.
  - Halaman Beranda di pengaturan: kota, metode hitung sholat, dan tampilkan jam.
- **Bagian B, Notifikasi:**
  - Di Mac dengan notch, notch melebar menjadi "telinga" setinggi notch, sekitar 3,5 detik. Di layar tanpa notch, lensa membuka menjadi pil kecil.
  - Muncul di layar yang ada kursornya. Cahaya pelangi G2 bisa dinyalakan atau dimatikan, dan ada suara pendek.
  - Titik putih untuk notifikasi yang mungkin terlewat.
  - Notifikasi versi pertama: reminder jatuh tempo dan masuk waktu sholat. API-nya juga siap untuk modul rencana 5 (timer).
  - Halaman Notifikasi di pengaturan terisi.

**Architecture:**
- **Bagian Rust baru, `src-tauri/src/home/`:** memegang data Beranda, karena kartu modul hidup di iframe sandbox yang tidak bisa menyimpan apa pun, tidak punya jaringan, dan hanya ada selama panel terbuka.
  - `prayer.rs`: waktu sholat, dengan rumus adhan-js yang diterjemahkan ke Rust.
  - `weather.rs`: cuaca dan pencarian kota ke Open-Meteo lewat `ureq`.
  - `reminders.rs`: `reminders.json`.
  - `schedule.rs` (Bagian B): satu thread yang tidur sampai reminder atau waktu sholat berikutnya, lalu mengirim notifikasi.
- **Kartu Beranda** (`modules/home/`) tetap paket web biasa. Ia hanya meminta data lewat dua kemampuan baru yang dideklarasikan di manifest: `home.data` dan `reminders`. Kartu memperbarui dirinya sekali per menit selama terbuka.
- **Pengaturan Beranda** disimpan di `settings.json` bagian `home`. Halaman modul di pengaturan mendapat daftar `MODULE_SETTINGS`: modul yang punya pengaturan menaruh bagiannya di sana, modul lain tetap menampilkan "Modul ini belum punya pengaturan." Rencana 5 menambah bagian untuk modulnya sendiri dengan cara yang sama.
- **Notifikasi (Bagian B):**
  - Setiap modul mendeklarasikan jenis notifikasinya ("saluran") di manifest, misalnya Beranda punya `reminder` dan `prayer`. Pilihan tampil dan suara per saluran disimpan di `settings.json` bagian `notifications`.
  - `notify::post` di Rust memeriksa saluran, memilih overlay di layar yang ada kursornya, memutar suara, menandai "terlewat" kalau perlu, lalu mengirim `notching://notice` ke overlay itu. Modul memanggilnya lewat kemampuan `notify`, dan penjadwal Beranda memanggilnya langsung.
  - Overlay menampilkan notifikasi lewat fase baru `notify` di `NotchController`. Fase ini memakai pegas panel (`pw`, `ph`) dan `panelPath` yang sama. Antrean ada di `app.ts`, jadi notifikasi tampil bergantian dan menunggu kalau panel sedang terbuka.

**Tech Stack:**
- Sama dengan rencana 3: Tauri 2, `tauri-nspanel` 2.1, objc2 0.6 / objc2-app-kit 0.3, Vite 8, TypeScript, Vitest + jsdom.
- Tambahan Rust:
  - `chrono` 0.4 untuk tanggal lokal,
  - `ureq` 3 dengan native-tls saja, untuk HTTPS lewat TLS bawaan macOS,
  - Bagian B: `objc2-core-graphics` 0.3 (waktu diam dan daftar jendela), fitur `NSSound` di objc2-app-kit, dan fitur `NSDictionary`/`NSValue` di objc2-foundation.
- Tidak ada tambahan npm.

**Spec:** `docs/superpowers/specs/2026-10-27-notch-design.md`.
- Bagian 7 mengikat untuk Beranda: isi, layout N2, sumber data, dan cara menambah reminder.
- Bagian 4.4 mengikat untuk notifikasi. Bagian 4.5 menentukan layar tempat notifikasi muncul.
- Bagian 3 (privasi, hemat daya) dan bagian 5 (gaya visual, bahasa, format waktu) berlaku untuk semuanya.
- Bagian 8 mengatur halaman Notifikasi dan halaman modul Beranda.

Acuan visual di `docs/superpowers/specs/2026-10-27-notch-mockups/`:
- `beranda-nothing.html`, pilihan **N2**,
- `notif-v1.html` untuk telinga dan pil notifikasi,
- `glow-options.html`, pilihan **G2**.

Rencana sebelumnya: `docs/superpowers/plans/2026-10-28-notching-3-settings.md`. Jendela pengaturan, `SettingsDto`, `change`, dan siaran `notching://settings` berasal dari sana.

**Keputusan pemilik saat menyusun rencana ini (29 Oktober 2026)**, dimasukkan ke spec bersama commit rencana ini:
- Waktu sholat dihitung di bagian Rust dengan rumus adhan-js yang diterjemahkan ke Rust, bukan adhan-js di kartu. Alasannya, notifikasi sholat harus jalan walau kartu Beranda tertutup. Hasilnya sama sampai ke detik.
- Metode Kemenag RI: Subuh 20°, Isya 18°, Ashar mazhab Syafi'i, ihtiyat Subuh +2, Dzuhur +3, Ashar +2, Maghrib +3, Isya +2 menit, dibulatkan ke atas.
  - Dengan angka ini, hasilnya sama dengan jadwal resmi Kemenag (Bimas Islam) untuk Jakarta, 29 dan 30 Oktober 2026: 04.10, 11.40, 14.53, 17.49, 19.00.
  - Pemilik mencocokkan lagi dengan jadwal kotanya sendiri di Task 7.
- Lokasi perangkat (opsional di spec 7) dikerjakan di rencana 5, bersama halaman Izin.
- Notifikasi terlewat: notifikasi tetap tampil seperti biasa. Kalau pengguna sedang tidak memakai komputer (2 menit tanpa ketikan atau gerakan mouse), atau layar itu menampilkan app layar penuh, titik putih juga dipasang.
- Pengaturan notifikasi per jenis (saluran), masing-masing dengan saklar tampil dan suara:
  - Reminder: tampil dan bersuara.
  - Waktu sholat: mati, dan tanpa suara kalau dinyalakan.
- Reminder:
  - Jam boleh kosong. Reminder tanpa jam berlaku untuk hari dibuatnya.
  - Jam yang sudah lewat hari ini berarti besok.
  - Reminder yang selesai hilang mulai hari berikutnya.
- Dikerjakan dua tahap: 4a (Bagian A) dicek di perangkat dan di-merge dulu kalau pemilik memintanya, lalu 4b (Bagian B).

### Rangkaian rencana

Ini rencana 4 dari 5 untuk tahap "versi Mac untuk dipakai sendiri":

1. **Kerangka notch di Mac.** Selesai.
2. **Sistem modul dan kartu, dengan System stat.** Selesai.
3. **Jendela pengaturan S1.** Selesai, di `main` 2921bb0.
4. **Beranda dan notifikasi** (rencana ini).
5. **Lima modul tahap 1 lainnya** (Timer, Keep awake, Freeze keyboard, Kamera cermin, Catatan).
   - Halaman Izin dan lokasi perangkat untuk Beranda.
   - Timer memakai kemampuan `notify` dan mengisi `statuses` di status mini Beranda.

## Global Constraints

- **Repo dan git:**
  - Repo ada di `/Users/hamdaniasril/dev/notch` dan tidak punya remote. Folder ini dipakai bersama sesi lain.
  - Kerjakan di cabang `feat/beranda` dari `main` (2921bb0). Commit pertamanya adalah rencana ini bersama perubahan spec.
  - Commit hanya dengan path eksplisit. Jangan pernah `git add -A`, dan jangan pernah meng-commit `.claude/` atau `.superpowers/`.
  - Merge ke `main` hanya kalau pemilik memintanya.
  - Jangan memasang app ke `/Applications`. Setelah merge, sesi induk yang memasang ulang.
- **Identitas app:** nama produk `Notching`, bundle id `id.web.notching`, paket Cargo `notching`, nama proses `notching`.
- **Shell:** di shell non-interaktif, jalankan `export PATH="$HOME/.cargo/bin:$PATH"` dulu sebelum perintah `cargo`.
- **Perintah:**
  - `npm test` (153 lulus di awal), `npx tsc --noEmit`, dan `cargo test --manifest-path src-tauri/Cargo.toml` (70 lulus di awal).
  - Jalankan `npm run build:modules` sebelum perintah `cargo` apa pun.
- **Build rilis:** `npm run tauri build -- --bundles app`, hasilnya `src-tauri/target/release/bundle/macos/Notching.app`.
- **Panel tidak pernah ditutup.** Panel notch (`tauri-nspanel`) hanya disembunyikan, dipindah, atau dimuat ulang. Menutupnya membuat app abort karena `NSRangeException`. Jangan pakai `panel_event!`.
- **Gerak lama tidak berubah:**
  - Konstanta pegas, bentuk panel, jeda pil, dan keempat slider tetap.
  - Notifikasi memakai pegas `pw`/`ph` dan `panelPath` yang sama.
- **Satu lock pada satu waktu.** `CoreState`, `HomeState`, dan `StatsState` tidak pernah dipegang bersamaan. Ambil yang perlu, salin, lepaskan, baru ambil yang lain.
- **Jaringan (spec 3):**
  - Hanya bagian Rust yang terhubung ke internet, dan hanya ke dua alamat tetap:
    - `https://geocoding-api.open-meteo.com/v1/search`
    - `https://api.open-meteo.com/v1/forecast`
  - Kode jaringan tidak menerima URL lain.
  - Yang dikirim:
    - ke pencarian kota: nama kota yang diketik dan bahasa;
    - ke cuaca: lintang dan bujur kota yang dibulatkan ke 2 desimal (sekitar 1 km), plus parameter tetap.
  - Kota dicari hanya saat Enter atau tombol Cari ditekan, tidak sambil mengetik.
  - Cuaca diambil hanya saat kartu Beranda terbuka, paling sering sekali per 30 menit per kota. Kalau gagal, dicoba lagi paling cepat 5 menit kemudian.
  - Batas waktu setiap permintaan 8 detik. Tidak pernah di main thread.
  - TLS memakai native-tls (Security framework macOS). Tidak ada rustls.
  - CSP halaman notch, pengaturan, dan modul tidak berubah. Tidak ada webview yang punya akses jaringan.
- **Waktu sholat:**
  - Dihitung di Rust dengan terjemahan adhan-js 4.4.3 (MIT, hak cipta Batoul Apps dicantumkan di kepala file), mazhab Syafi'i, untuk tanggal lokal Mac.
  - Tabel metode:

    | Metode | Kunci JSON | Parameter |
    |---|---|---|
    | Kemenag RI (bawaan) | `kemenag` | `Configuration::new(20.0, 18.0)`, ihtiyat Subuh +2, Dzuhur +3, Ashar +2, Maghrib +3, Isya +2, `Rounding::Up` |
    | MUIS (Singapura) | `singapore` | `Method::Singapore.parameters()` |
    | Muslim World League | `muslimWorldLeague` | `Method::MuslimWorldLeague.parameters()` |
    | Mesir | `egyptian` | `Method::Egyptian.parameters()` |
    | Karachi | `karachi` | `Method::Karachi.parameters()` |
    | Umm al-Qura (Makkah) | `ummAlQura` | `Method::UmmAlQura.parameters()` |
    | ISNA (Amerika Utara) | `northAmerica` | `Method::NorthAmerica.parameters()` |

  - Semua metode memakai `madhab = Madhab::Shafi`.
- **Penyimpanan:**
  - `settings.json` (`~/Library/Application Support/id.web.notching/`) bertambah `home` (Bagian A) dan `notifications` (Bagian B). Aturan baca toleran dari rencana 3 berlaku: nilai salah tipe hanya mengembalikan field itu ke bawaan.
  - `reminders.json` di `app_data_dir`, folder yang sama.
  - `weather.json` di `app_cache_dir` (`~/Library/Caches/id.web.notching/`).
  - Semua file ditulis lewat file sementara lalu rename. File rusak disisihkan sebagai `.broken`.
- **Format waktu (spec 5):** 24 jam, dalam zona waktu Mac. Indonesia "10.25", Inggris "10:25".
- **Hemat daya:**
  - Kartu Beranda membaca data sekali saat dibuka, lalu sekali per menit di batas menit. Saat panel tertutup tidak ada yang berjalan.
  - Penjadwal notifikasi tidur sampai jadwal berikutnya, paling lama 60 detik sekali bangun.
  - Telinga dan cahaya G2 hanya meminta frame selama notifikasi tampil dan memudar. Saat diam, overlay tetap tanpa `requestAnimationFrame`.
- **Gaya visual (spec 5):**
  - Ukuran, jarak, dan warna kartu Beranda disalin dari N2 di `beranda-nothing.html`.
  - Merah #E8262E hanya untuk titik di depan nama hari di Beranda.
  - Cahaya G2 adalah satu-satunya warna lain: #ff6ec4, #7873f5, #4adede, #ffd166.
  - Ikon notifikasi putih di atas hitam. Titik notifikasi terlewat berwarna putih.
- **Teks:**
  - Teks notch dan jendela pengaturan ada di `src/i18n/id.json` dan `src/i18n/en.json`.
  - Teks kartu Beranda, nama saluran notifikasinya, dan teks notifikasi sholat ada di `modules/home/locales/{id,en}.json`, seperti modul lain sejak rencana 2.
  - Gaya DynamicNotch: kalimat pendek, menyapa "kamu", tanpa "kami".
  - Teks dari pengguna (judul reminder, nama kota) dan dari modul selalu masuk lewat `textContent`. `innerHTML` hanya untuk SVG tetap: huruf titik-titik, ikon garis, dan `icons.ts`.
- **Modul tetap terkunci:** kartu Beranda tidak menyimpan apa pun sendiri dan tidak mengakses jaringan. Semua lewat kemampuan yang dideklarasikan di manifest, dan diperiksa oleh `gate.rs`.
- **Jangan membangun:** lokasi perangkat dan halaman Izin (rencana 5), sinkron Apple Reminders atau Google (tahap 2), notifikasi dari app lain, rekaman adzan, dan modul tahap 1 lainnya.
- **Cek manual:** hasil cek manual hanya diisi dari laporan pemilik. Jangan pernah menandainya lulus berdasarkan dugaan.

## Review Focus

1. **Pergantian hari dan Mac yang tidur.**
   - Setelah Isya, "berikutnya" adalah Subuh besok. Sebelum Subuh, sholat sebelumnya adalah Isya kemarin.
   - Reminder "jam 9" yang diketik pukul 10.18 berarti besok.
   - Setelah Mac bangun dari tidur panjang, jadwal yang lewat lebih dari 10 menit tidak membanjiri notch dengan notifikasi.
   - Diuji di Task 1 (`prev_and_next_cross_midnight`), Task 5 (`a time already past today means tomorrow`), dan Task 10 (`events_older_than_ten_minutes_never_fire`).
2. **Internet mati, lambat, atau jawaban aneh.**
   - Kartu tetap tampil dengan cuaca terakhir. Tidak ada yang menunggu lebih dari 8 detik.
   - Pencarian kota bilang gagal. JSON yang kurang field menjadi galat biasa, bukan crash.
   - Diuji di Task 2 (`a_forecast_error_or_gap_is_an_error`, `fetches_when_stale_moved_or_missing_but_not_too_often`), Task 5 (`a failed call keeps the last snapshot`), dan Task 6 (`a failed search says so`). Dicek manual dengan Wi-Fi mati di Task 7.
3. **Teks pengguna yang panjang atau aneh.**
   - Judul reminder 80 karakter, emoji, atau `<img onerror>` tampil sebagai teks, dipotong dengan "…" di kartu dan di telinga notifikasi.
   - Nama kota beraksen tetap utuh.
   - Diuji di Task 3 (`titles_are_trimmed_and_limited`), Task 5 (`reminder titles are text, never markup`), Task 9 (`long_text_is_cut_with_an_ellipsis`), dan Task 11 (`the notice shows its icon, title and detail as text`).
4. **Notifikasi bertabrakan dengan pemakaian notch.**
   - Saat panel terbuka, notifikasi menunggu sampai panel tertutup.
   - Beberapa notifikasi sekaligus tampil bergantian.
   - Klik telinga membuka kartu modulnya.
   - Kursor di layar yang tidak punya notch pilihan membuat notifikasi muncul di layar pertama.
   - Diuji di Task 11 (`a notice waits while the panel is open`, `several notices take turns`, `clicking a notice opens its module card`) dan Task 9 (`a_cursor_off_every_screen_falls_back_to_the_first`).
5. **File lama atau hasil suntingan tangan.**
   - `settings.json` tanpa `home` atau `notifications` memakai bawaan.
   - Metode yang tidak dikenal menjadi Kemenag. Kota dengan lintang 200 dibuang. Lama tampil 100 detik dipotong menjadi 8.
   - `reminders.json` yang rusak disisihkan.
   - Diuji di Task 1 (`an_unknown_method_or_a_bad_place_falls_back`), Task 3 (`a_broken_file_is_kept_aside`), dan Task 8 (`notice_seconds_are_clamped`).

---

## Bagian A — Beranda

### Task 1: Pengaturan Beranda dan waktu sholat (Rust)

**Files:**
- Create: `src-tauri/src/home/mod.rs` (untuk sekarang hanya `pub mod prayer;`), `src-tauri/src/home/prayer.rs`
- Modify:
  - `src-tauri/Cargo.toml`: `chrono = "0.4"` di `[dependencies]`.
  - `src-tauri/src/settings.rs`, `src-tauri/src/app_core.rs`.
  - `src-tauri/src/lib.rs`: `mod home;`.
- Test: di dalam `prayer.rs`, `settings.rs`, dan `app_core.rs`

**Interfaces:**
- Consumes: `Settings`, `lenient`, `load_settings`, `AppCore`, `CoreError` (rencana 2 dan 3).
- Produces:
```rust
// settings.rs
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Place { pub name: String, pub region: String, pub country: String, pub latitude: f64, pub longitude: f64 }
impl Place { pub fn is_valid(&self) -> bool; }   // nama 1–100 karakter setelah trim; lintang −90..=90; bujur −180..=180; keduanya hingga

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PrayerMethod { Singapore, MuslimWorldLeague, Egyptian, Karachi, UmmAlQura, NorthAmerica,
                        #[default] #[serde(other)] Kemenag }   // nilai tak dikenal → Kemenag; serde ingin `other` terakhir

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct HomeSettings { pub place: Option<Place>, pub prayer_method: PrayerMethod, pub show_clock: bool }
impl Default for HomeSettings {}                 // None, Kemenag, true
pub struct Settings { /* field lama */ pub home: HomeSettings }   // lenient
// app_core.rs
pub enum CoreError { /* lama */ Invalid(String) }   // Display: "invalid value: {0}"
impl AppCore {
    pub fn home(&self) -> &HomeSettings;
    pub fn set_place(&mut self, place: Option<Place>) -> Result<(), CoreError>;     // tidak valid → Invalid, tidak disimpan
    pub fn set_prayer_method(&mut self, method: PrayerMethod) -> Result<(), CoreError>;
    pub fn set_show_clock(&mut self, on: bool) -> Result<(), CoreError>;
}
// home/prayer.rs
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)] #[serde(rename_all = "camelCase")]
pub enum PrayerName { Fajr, Dhuhr, Asr, Maghrib, Isha }
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)] #[serde(rename_all = "camelCase")]
pub struct PrayerTime { pub name: PrayerName, pub at: i64 }          // at: milidetik epoch
#[derive(Clone, Debug, PartialEq, serde::Serialize)] #[serde(rename_all = "camelCase")]
pub struct PrayerDay { pub today: Vec<PrayerTime>, pub prev: PrayerTime, pub next: PrayerTime }
pub struct Parameters { pub fajr_angle: f64, pub isha_angle: f64, pub isha_interval: f64, pub adjustments: [f64; 5], pub round_up: bool }
pub fn parameters(method: PrayerMethod) -> Parameters;
pub fn day_times(date: chrono::NaiveDate, place: &Place, method: PrayerMethod) -> Vec<PrayerTime>;   // lima, berurutan
pub fn prayer_day(now_ms: i64, today: chrono::NaiveDate, place: &Place, method: PrayerMethod) -> Option<PrayerDay>;   // None di dekat kutub
```

**Aturan:**
- **`HomeSettings`:**
  - `place` dan `prayer_method` memakai `lenient`.
  - `show_clock` memakai `lenient_or(d, true)` lewat helper baru `lenient_true`.
  - `load_settings` membuang `home.place` yang tidak `is_valid()`.
- **`parameters`** mengikuti tabel metode di Global Constraints.
- **`day_times`:** terjemahan baris demi baris `PrayerTimes` di adhan-js untuk kelima sholat, tanpa terbit, dengan aturan tengah malam untuk lintang tinggi. Kosong kalau matahari tidak terbit atau terbenam hari itu.
- **`prayer_day`:**
  - Hitung waktu kemarin, hari ini, dan besok.
  - `prev` adalah waktu terakhir yang `≤ now`, dan `next` adalah waktu pertama yang `> now`.
  - `today` diisi dari hari ini saja.
  - Pemanggil mengisi `today` dengan `chrono::Local::now().date_naive()`.

- [ ] **Step 1: Pastikan berada di cabang kerja**

Run: `git branch --show-current`
Expected: `feat/beranda`

- [ ] **Step 2: Tulis test yang gagal**

```rust
// prayer.rs
fn jakarta() -> Place { Place { name: "Jakarta".into(), region: "Jakarta".into(), country: "Indonesia".into(),
                                latitude: -6.21462, longitude: 106.84513 } }   // koordinat dari Open-Meteo
fn wib(ms: i64) -> String   // "HH:MM" di UTC+7, lewat chrono::FixedOffset
fn day(d: u32) -> NaiveDate { NaiveDate::from_ymd_opt(2026, 10, d).unwrap() }
#[test] fn kemenag_matches_the_published_jakarta_schedule() {
    // Jadwal Kemenag (Bimas Islam) untuk Jakarta, 29 Oktober 2026.
    let t = day_times(day(29), &jakarta(), PrayerMethod::Kemenag);
    assert_eq!(t.iter().map(|p| wib(p.at)).collect::<Vec<_>>(), ["04:10", "11:40", "14:53", "17:49", "19:00"]);
    assert_eq!(t.iter().map(|p| p.name).collect::<Vec<_>>(),
               [PrayerName::Fajr, PrayerName::Dhuhr, PrayerName::Asr, PrayerName::Maghrib, PrayerName::Isha]); }
#[test] fn other_methods_follow_adhan() {
    // Hasil adhan-js 4.4.3 untuk tempat dan tanggal yang sama.
    let t = day_times(day(29), &jakarta(), PrayerMethod::MuslimWorldLeague);
    assert_eq!(t.iter().map(|p| wib(p.at)).collect::<Vec<_>>(), ["04:16", "11:37", "14:51", "17:46", "18:53"]); }
#[test] fn prev_and_next_cross_midnight() {
    // now = 29 Okt 02.00 WIB → prev = Isya 28 Okt, next = Subuh 29 Okt ("04:10")
    // now = 29 Okt 21.00 WIB → prev = Isya 29 Okt ("19:00"), next = Subuh 30 Okt ("04:09")
    // now = tepat Dzuhur 29 Okt → prev Dzuhur, next Ashar; today berisi lima waktu 29 Okt
}
// settings.rs
#[test] fn home_defaults() {
    assert_eq!(Settings::default().home, HomeSettings { place: None, prayer_method: PrayerMethod::Kemenag, show_clock: true }); }
#[test] fn home_settings_survive_a_save_and_load()   // place Jakarta, Karachi, show_clock false → save → load sama
#[test] fn an_unknown_method_or_a_bad_place_falls_back() {
    // {"home":{"prayerMethod":"jafari","place":{"name":"X","region":"","country":"","latitude":200,"longitude":0},"showClock":"no"}}
    // → Kemenag, place None, show_clock true; tidak ada settings.json.broken
}
// app_core.rs
#[test] fn beranda_settings_are_saved()   // set_place(Some(jakarta)), set_prayer_method(Karachi), set_show_clock(false) → open lagi → home() sama
#[test] fn an_invalid_place_is_refused()  // latitude NaN → Err(CoreError::Invalid(_)); settings.json tidak dibuat
```
Badan test yang hanya berupa komentar ditulis dari komentar itu. Waktu yang diharapkan dihitung dengan `day_times` untuk hari yang disebut.

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml -- settings:: app_core:: home::` → FAIL (gagal kompilasi)

- [ ] **Step 4: Tambah dependensi, lalu implementasikan sesuai Interfaces dan aturan di atas**

Run: `(cd src-tauri && cargo tree -d | grep -E "chrono|objc2" || true)`
Expected: tidak ada dua versi `chrono`, `objc2`, `objc2-foundation`, atau `objc2-app-kit`.

Kalau `kemenag_matches_the_published_jakarta_schedule` meleset satu menit, periksa `Rounding::Up` dan urutan penyesuaian dulu. Angka pada test diambil dari jadwal resmi dan tidak boleh diubah.

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `cargo test --manifest-path src-tauri/Cargo.toml` → PASS (70 test lama + 8 test baru)

- [ ] **Step 6: Commit**

`git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/home src-tauri/src/settings.rs src-tauri/src/app_core.rs src-tauri/src/lib.rs && git commit -m "feat(native): Beranda settings and prayer times"`

---

### Task 2: Cuaca dan pencarian kota lewat Open-Meteo (Rust)

**Files:**
- Create: `src-tauri/src/home/weather.rs`
- Modify:
  - `src-tauri/Cargo.toml`: `ureq = { version = "3", default-features = false, features = ["native-tls-no-default"] }`.
  - `src-tauri/src/home/mod.rs`: `pub mod weather;`.
- Test: di dalam `weather.rs`

**Interfaces:**
- Consumes: `Place` (Task 1), `Lang` (`locale.rs`).
- Produces:
```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Endpoint { Geocode, Forecast }
impl Endpoint { pub fn url(self) -> &'static str; }
pub fn geocode_query(text: &str, lang: Lang) -> Option<Vec<(&'static str, String)>>;   // None: 2–60 karakter tidak terpenuhi
pub fn forecast_query(place: &Place) -> Vec<(&'static str, String)>;
pub fn parse_places(json: &str) -> Result<Vec<Place>, String>;
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)] #[serde(rename_all = "camelCase")]
pub struct Weather { pub temp: f64, pub code: u32, pub min: f64, pub max: f64, pub fetched_at: i64,
                     pub latitude: f64, pub longitude: f64 }        // koordinat yang dikirim (2 desimal)
pub fn parse_forecast(json: &str, place: &Place, now_ms: i64) -> Result<Weather, String>;
pub const FRESH_MS: i64 = 30 * 60_000;
pub const RETRY_MS: i64 = 5 * 60_000;
pub const WEATHER_FILE: &str = "weather.json";
pub fn same_place(w: &Weather, place: &Place) -> bool;
pub fn should_fetch(cached: Option<&Weather>, place: &Place, last_try: Option<i64>, now_ms: i64) -> bool;
pub fn fetch(endpoint: Endpoint, query: &[(&'static str, String)]) -> Result<String, String>;
pub fn load_cache(path: &std::path::Path) -> Option<Weather>;
pub fn save_cache(path: &std::path::Path, w: &Weather) -> std::io::Result<()>;
```

**Aturan:**
- **`Endpoint::url`:** dua URL di Global Constraints, tidak ada yang lain.
- **`geocode_query`:** `[("name", teks yang di-trim), ("count", "6"), ("language", "id"|"en"), ("format", "json")]`.
- **`forecast_query`:**
  - Urutannya: `latitude` dan `longitude` dengan format `{:.2}`, lalu `("current", "temperature_2m,weather_code")`, `("daily", "temperature_2m_max,temperature_2m_min")`, `("timezone", "auto")`, `("forecast_days", "1")`.
- **`parse_places`:**
  - Tidak ada `results` → `Ok(vec![])`.
  - Setiap hasil butuh `name`, `latitude`, dan `longitude`. `region` diambil dari `admin1`. Field lain yang tidak ada menjadi `""`.
  - Hasil yang tidak `is_valid()` dilewati. Paling banyak 6.
- **`parse_forecast`:**
  - `{"error": true, "reason": r}` → `Err(r)`.
  - Angka diambil dari `current.temperature_2m`, `current.weather_code`, `daily.temperature_2m_min[0]`, dan `daily.temperature_2m_max[0]`. Ada yang hilang → `Err("incomplete forecast")`.
  - `latitude`/`longitude` diisi koordinat tempat yang dibulatkan ke 2 desimal, bukan koordinat jawaban server.
- **`same_place`:** koordinat `Weather` sama dengan koordinat `place` setelah dibulatkan ke 2 desimal.
- **`should_fetch`:**
  - `(cached` kosong, atau tempatnya beda, atau umurnya `≥ FRESH_MS)`,
  - dan `(last_try` kosong, atau `now − last_try ≥ RETRY_MS)`.
- **`fetch`:**
  - Agent `ureq` dengan `TlsConfig` provider `NativeTls` dan root certs `PlatformVerifier`.
  - `timeout_global` 8 detik, `http_status_as_error(false)` supaya badan galat Open-Meteo terbaca, dan user agent `Notching`.
  - Badan dibaca paling banyak 64 KB.
  - Galat → `Err` berisi teksnya.
- **Cache:** ditulis lewat file sementara lalu rename. File tidak ada atau rusak → `None`.

- [ ] **Step 1: Tulis test yang gagal**

```rust
// JAKARTA_JSON dan FORECAST_JSON: salinan jawaban asli Open-Meteo (29 Okt 2026), ditaruh sebagai const di test:
// geocode: {"results":[{"id":1642911,"name":"Jakarta","latitude":-6.21462,"longitude":106.84513,"country":"Indonesia","admin1":"Jakarta",…},
//                      {"id":6754874,"name":"Jakarta Pusat","latitude":-6.1818,"longitude":106.8223,"country":"Indonesia","admin1":"Jakarta",…}],…}
// forecast: {"latitude":-6.221441,…,"current":{"time":"2026-10-29T07:15","interval":900,"temperature_2m":26.3,"weather_code":3},
//            "daily":{"time":["2026-10-29"],"temperature_2m_max":[31.4],"temperature_2m_min":[24.7]}}
#[test] fn only_the_two_open_meteo_urls() {
    assert_eq!(Endpoint::Geocode.url(), "https://geocoding-api.open-meteo.com/v1/search");
    assert_eq!(Endpoint::Forecast.url(), "https://api.open-meteo.com/v1/forecast"); }
#[test] fn the_forecast_gets_rounded_coordinates_and_nothing_else() {
    assert_eq!(forecast_query(&jakarta()), vec![("latitude", "-6.21".to_string()), ("longitude", "106.85".into()),
        ("current", "temperature_2m,weather_code".into()), ("daily", "temperature_2m_max,temperature_2m_min".into()),
        ("timezone", "auto".into()), ("forecast_days", "1".into())]); }
#[test] fn a_city_search_sends_only_the_typed_name() {
    // geocode_query("  Bandung ", Lang::Id) == Some([("name","Bandung"),("count","6"),("language","id"),("format","json")])
    // "a" → None; "x" × 61 → None
}
#[test] fn places_from_a_search() {
    // JAKARTA_JSON → [Place{"Jakarta","Jakarta","Indonesia",-6.21462,106.84513}, Place{"Jakarta Pusat",…}]
    // {"generationtime_ms":0.1} → []
}
#[test] fn a_forecast_from_open_meteo() {
    // parse_forecast(FORECAST_JSON, &jakarta(), 1000) == Weather { temp 26.3, code 3, min 24.7, max 31.4, fetched_at 1000,
    //                                                             latitude -6.21, longitude 106.85 }
}
#[test] fn a_forecast_error_or_gap_is_an_error() {
    // {"error":true,"reason":"Latitude must be in range of -90 to 90°."} → Err memuat "Latitude"; {"current":{}} → Err
}
#[test] fn fetches_when_stale_moved_or_missing_but_not_too_often() {
    // None → true; segar dan tempat sama → false; umur FRESH_MS → true; tempat lain → true;
    // last_try = now − 60_000 → false; last_try = now − RETRY_MS → true
}
#[test] fn the_cache_survives_a_save_and_load()   // + file berisi "{oops" → None
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml -- home::weather::` → FAIL

- [ ] **Step 3: Tambah dependensi, lalu implementasikan**

Run: `(cd src-tauri && cargo tree -e normal -i rustls 2>&1 | head -3)`
Expected: `nothing to print`. Tidak ada rustls di build macOS.

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cargo test --manifest-path src-tauri/Cargo.toml` → PASS (+8)

- [ ] **Step 5: Commit**

`git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/home && git commit -m "feat(native): weather and city search through Open-Meteo"`

---

### Task 3: Reminder di disk (Rust)

**Files:**
- Create: `src-tauri/src/home/reminders.rs`
- Modify: `src-tauri/src/home/mod.rs` (`pub mod reminders;`)
- Test: di dalam `reminders.rs`

**Interfaces:**
- Produces:
```rust
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)] #[serde(rename_all = "camelCase")]
pub struct Reminder { pub id: u64, pub title: String, pub day: String,   // "YYYY-MM-DD", hari lokal
                      pub at: Option<i64>,                               // milidetik epoch; None = tanpa jam
                      pub done: bool, #[serde(default)] pub notified: bool }
pub const REMINDERS_FILE: &str = "reminders.json";
pub const TITLE_MAX: usize = 80;
pub const OPEN_MAX: usize = 100;
pub struct Reminders { /* path, next_id, items */ }
impl Reminders {
    pub fn open(path: std::path::PathBuf) -> Reminders;
    pub fn items(&self) -> &[Reminder];
    pub fn add(&mut self, title: &str, day: &str, at: Option<i64>) -> Result<Reminder, String>;
    pub fn set_done(&mut self, id: u64, done: bool) -> Result<(), String>;
    pub fn mark_notified(&mut self, ids: &[u64]) -> Result<(), String>;
    pub fn purge(&mut self, today: &str) -> Result<(), String>;
}
```

**Aturan:**
- **Isi file:** `{ "version": 1, "nextId": n, "items": [...] }`. Setiap perubahan langsung disimpan lewat file sementara lalu rename.
- **Membuka file:** tidak ada → kosong. Rusak → disisihkan sebagai `reminders.json.broken`, lalu kosong.
- **`add`:**
  - Judul: baris baru dan tab diganti spasi, lalu di-trim. Panjangnya 1–`TITLE_MAX` karakter (dihitung per `char`).
  - `day` harus tanggal yang sah (`%Y-%m-%d`).
  - Kalau reminder yang belum selesai sudah `OPEN_MAX`, tolak.
  - `id` dari `next_id`, yang tidak pernah dipakai ulang.
- **`set_done`:** id yang tidak dikenal → `Err`.
- **`purge`:** buang yang `done` dengan `day < today`. Hanya disimpan kalau ada yang berubah.
- Galat dikembalikan sebagai kalimat pendek dalam bahasa Inggris, misalnya `"title must be 1–80 characters"`. Kartu tidak menampilkannya. Kartu memakai teksnya sendiri.

- [ ] **Step 1: Tulis test yang gagal**

```rust
#[test] fn add_keeps_reminders_across_a_restart() {
    // add("Kirim invoice", "2026-10-29", Some(1_000)) → id 1; add("Bayar listrik", "2026-10-29", None) → id 2;
    // open lagi → dua item sama; add berikutnya → id 3
}
#[test] fn titles_are_trimmed_and_limited() {
    // "  Beli <b>susu</b>\n " → "Beli <b>susu</b>"; "" dan "   " → Err; "é" × 81 → Err; "é" × 80 → Ok
}
#[test] fn a_bad_day_is_refused()           // "2026-13-01", "kemarin" → Err
#[test] fn done_ones_leave_the_day_after() {
    // selesai di day 28 → purge("2026-10-29") membuangnya; selesai di day 29 tetap; belum selesai di day 27 tetap
}
#[test] fn a_broken_file_is_kept_aside()    // "{oops" → items kosong, reminders.json.broken ada
#[test] fn there_is_a_limit_on_open_reminders()   // 100 terbuka → yang ke-101 Err; satu ditandai selesai → Ok
#[test] fn notified_marks_survive_a_restart()    // mark_notified(&[1]) → open lagi → item 1 notified
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml -- home::reminders::` → FAIL

- [ ] **Step 3: Implementasikan**

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cargo test --manifest-path src-tauri/Cargo.toml` → PASS (+7)

- [ ] **Step 5: Commit**

`git add src-tauri/src/home && git commit -m "feat(native): reminders stored on disk"`

---

### Task 4: Kemampuan Beranda dan perintah pengaturannya (Rust)

**Files:**
- Create: `src-tauri/src/home/commands.rs`
- Modify:
  - `src-tauri/src/modules/manifest.rs`: `Capability::HomeData` (`"home.data"`) dan `Capability::Reminders` (`"reminders"`).
  - `src-tauri/src/modules/gate.rs`, `src-tauri/src/module_commands.rs`.
  - `src-tauri/src/home/mod.rs`: `Home`, `HomeState`, `HomeSnapshot`, `snapshot`, dan `refresh_weather`.
  - `src-tauri/src/settings_window.rs`: `SettingsDto.home`.
  - `src-tauri/src/lib.rs`: `HomeState` dikelola dan perintah baru didaftarkan.
  - `modules/home/manifest.json`: `"card": { "width": 540, "height": 156 }` dan `"capabilities": ["home.data", "reminders"]`.
- Test: di dalam `gate.rs` dan `home/mod.rs`

**Interfaces:**
- Consumes: semua dari Task 1–3, `authorize`, `change`, dan `emit_settings`.
- Produces:
```rust
// gate.rs
pub enum Call { SystemStatsRead, HomeRead, HomeRefreshWeather, RemindersAdd, RemindersSetDone }
// home/mod.rs
pub struct Home { pub reminders: Reminders, pub weather: Option<Weather>, pub last_try: Option<i64>, /* weather_path */ }
impl Home { pub fn open(data_dir: &std::path::Path, cache_dir: &std::path::Path) -> Home; }
pub struct HomeState(pub std::sync::Mutex<Home>);
#[derive(Clone, Debug, PartialEq, serde::Serialize)] #[serde(rename_all = "camelCase")]
pub struct MiniStatus { pub module: String, pub label: String, pub value: String }   // rencana 5 mengisinya
#[derive(Clone, Debug, PartialEq, serde::Serialize)] #[serde(rename_all = "camelCase")]
pub struct HomeSnapshot { pub place: Option<Place>, pub weather: Option<Weather>, pub prayer: Option<PrayerDay>,
                          pub reminders: Vec<Reminder>, pub show_clock: bool, pub statuses: Vec<MiniStatus> }
pub fn snapshot(settings: &HomeSettings, home: &mut Home, now: chrono::DateTime<chrono::Local>) -> HomeSnapshot;
pub fn refresh_weather(app: &tauri::AppHandle) -> Result<(), String>;
// home/commands.rs
#[tauri::command] pub async fn search_places(app: AppHandle, query: String) -> Result<Vec<Place>, String>;
#[tauri::command] pub fn set_place(app: AppHandle, core: State<CoreState>, home: State<HomeState>, place: Option<Place>) -> Result<(), String>;
#[tauri::command] pub fn set_prayer_method(app: AppHandle, core: State<CoreState>, method: PrayerMethod) -> Result<(), String>;
#[tauri::command] pub fn set_show_clock(app: AppHandle, core: State<CoreState>, on: bool) -> Result<(), String>;
// settings_window.rs
pub struct SettingsDto { /* lama */ pub home: HomeSettings }   // JSON: home.place, home.prayerMethod, home.showClock
```

**Aturan:**
- **`authorize`:**

  | Kemampuan | Metode | `Call` |
  |---|---|---|
  | `home.data` | `read` | `HomeRead` |
  | `home.data` | `refreshWeather` | `HomeRefreshWeather` |
  | `reminders` | `add` | `RemindersAdd` |
  | `reminders` | `setDone` | `RemindersSetDone` |

- **`module_call`:**
  - `args` sekarang dipakai.
  - `RemindersAdd` membaca `{ title: String, day: String, at: Option<i64> }` dan mengembalikan `Reminder`.
  - `RemindersSetDone` membaca `{ id: u64, done: bool }` dan mengembalikan `null`.
  - Argumen yang tidak cocok → `"bad arguments for reminders.add"` (atau `.setDone`).
  - `HomeRead`: salin `core.home()`, lepaskan lock, ambil `HomeState`, lalu kembalikan `snapshot(.., Local::now())`.
  - `HomeRefreshWeather`: `spawn_blocking(refresh_weather)`, lalu kembalikan snapshot seperti `HomeRead`. Kalau refresh gagal, kembalikan galatnya. Kartu tetap memakai data lamanya.
- **`snapshot`:**
  - `purge(today)` dulu.
  - `weather` hanya kalau `same_place`. `prayer` hanya kalau ada kota: `prayer_day(now_ms, now.date_naive(), place, method)`.
  - `reminders` berisi semua item. `statuses` selalu kosong; rencana 5 mengisinya untuk timer dan keep awake.
- **`refresh_weather`:**
  1. Baca `place` dari core, lalu lepaskan. Tidak ada kota → `Ok`.
  2. Ambil `HomeState`. Kalau `should_fetch` salah → `Ok`. Kalau benar, isi `last_try = now`, lalu lepaskan.
  3. `fetch(Endpoint::Forecast, &forecast_query(&place))` tanpa lock.
  4. `parse_forecast`, lalu ambil `HomeState`: isi `weather` dan `save_cache`.
- **`Home::open`:** `reminders.json` dari `data_dir`, `weather.json` dari `cache_dir` lewat `load_cache`.
- **`search_places`:** bahasa dari core. `geocode_query` `None` → `Ok(vec![])` tanpa jaringan. Selain itu, `spawn_blocking` `fetch` + `parse_places`.
- **`set_place`:** simpan lewat `change`, kosongkan `home.last_try` supaya kota baru langsung diambil, lalu `emit_settings`.
- **`set_prayer_method` dan `set_show_clock`:** simpan lewat `change`, lalu `emit_settings`.
- **`lib.rs`:** `HomeState(Home::open(app_data_dir, app_cache_dir))` dikelola sebelum overlay dibangun. Daftarkan keempat perintah.

- [ ] **Step 1: Tulis test yang gagal**

```rust
// gate.rs
#[test] fn beranda_capabilities() {
    let home = entry("home", &[Capability::HomeData, Capability::Reminders], true);
    assert_eq!(authorize(Some(&home), "home", "home.data", "read"), Ok(Call::HomeRead));
    assert_eq!(authorize(Some(&home), "home", "home.data", "refreshWeather"), Ok(Call::HomeRefreshWeather));
    assert_eq!(authorize(Some(&home), "home", "reminders", "add"), Ok(Call::RemindersAdd));
    assert_eq!(authorize(Some(&home), "home", "reminders", "setDone"), Ok(Call::RemindersSetDone));
    let stat = entry("system-stat", &[Capability::SystemStats], true);
    assert!(matches!(authorize(Some(&stat), "system-stat", "reminders", "add"), Err(CallError::NotDeclared { .. }))); }
// home/mod.rs — `now` dibuat dari 29 Okt 2026 10.18 waktu lokal
#[test] fn a_snapshot_without_a_city_has_no_weather_or_prayer()   // HomeSettings::default() → place/weather/prayer None, show_clock true
#[test] fn a_snapshot_shows_weather_only_for_the_current_city() {
    // home.weather untuk Jakarta, settings.place Bandung (-6.9175, 107.6191) → weather None; place Jakarta → Some
}
#[test] fn a_snapshot_has_the_next_prayer_and_drops_old_done_reminders() {
    // place Jakarta → prayer Some, prayer.today.len() == 5, prayer.prev.at <= now < prayer.next.at;
    // reminder selesai bertanggal 28 Okt hilang, yang bertanggal 29 Okt tetap; statuses kosong
}
```
`repo_modules_are_valid` (rencana 2) harus tetap lulus dengan manifest Beranda yang baru.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml -- gate:: home::` → FAIL

- [ ] **Step 3: Implementasikan sesuai Interfaces dan aturan di atas**

- [ ] **Step 4: Jalankan semua test**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && npx tsc --noEmit && npm test` → PASS (+4 Rust)

- [ ] **Step 5: Commit**

`git add src-tauri/src modules/home/manifest.json && git commit -m "feat(native): Beranda data and reminder capabilities, and the Beranda settings commands"`

---

### Task 5: Kartu Beranda N2

**Files:**
- Create:
  - `modules/home/types.ts`, `modules/home/format.ts`, `modules/home/card.ts`, `modules/home/ticks.ts`
  - `src/bridge-browser-home.ts`
- Modify:
  - `modules/home/main.ts`, `modules/home/style.css`, `modules/home/locales/id.json`, `modules/home/locales/en.json`
  - `src/kit/dots.ts`: huruf `-`.
  - `src/bridge-browser.ts`: `moduleCall` meneruskan `home.data` dan `reminders` ke `fakeHomeCall`.
  - `src/notch/test-helpers.ts`: `MODULE_CARDS.home = { width: 540, height: 156 }`.
- Test: `modules/home/format.test.ts`, `modules/home/card.test.ts`, `modules/home/ticks.test.ts`, `src/kit/dots.test.ts`

**Interfaces:**
- Consumes: `connectKit`, `Kit`, `dotText`, `dotBar`, `Lang`, dan bentuk `HomeSnapshot` dari Task 4.
- Produces:
```ts
// modules/home/types.ts — bentuknya sama dengan HomeSnapshot di src-tauri/src/home/mod.rs
export interface Place { name: string; region: string; country: string; latitude: number; longitude: number }
export interface Weather { temp: number; code: number; min: number; max: number; fetchedAt: number; latitude: number; longitude: number }
export type PrayerName = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export interface PrayerTime { name: PrayerName; at: number }
export interface PrayerDay { today: PrayerTime[]; prev: PrayerTime; next: PrayerTime }
export interface Reminder { id: number; title: string; day: string; at: number | null; done: boolean; notified: boolean }
export interface MiniStatus { module: string; label: string; value: string }
export interface HomeSnapshot { place: Place | null; weather: Weather | null; prayer: PrayerDay | null;
  reminders: Reminder[]; showClock: boolean; statuses: MiniStatus[] }
// modules/home/format.ts
export function clock(ms: number, lang: Lang): string;                 // "10.25" / "10:25", waktu lokal
export function remaining(ms: number, lang: Lang): string;             // "1 j 22 m" / "1 h 22 m"; di bawah 1 jam "22 m"
export function progress(prev: number, next: number, now: number, count: number): number;
export type WeatherKey = 'clear' | 'mostlyClear' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'showers' | 'snow' | 'storm';
export function weatherKey(code: number): WeatherKey;
export function dayKey(d: Date): string;                               // "YYYY-MM-DD" lokal
export function parseTime(text: string): { h: number; m: number } | null;
export function dueAt(t: { h: number; m: number }, now: Date): { day: string; at: number };
export function reminderLabel(r: Reminder, now: Date, lang: Lang, s: { today: string; tomorrow: string }): string;
export function nearest(reminders: Reminder[], n: number): Reminder[];
export function degrees(v: number): string;                            // "31°", "-3°", tidak pernah "-0°"
// modules/home/card.ts
export type HomeStrings = typeof import('./locales/id.json');
export interface HomeActions { add(title: string, day: string, at: number | null): Promise<void>; setDone(id: number, done: boolean): Promise<void> }
export interface HomeCard { readonly view: 'main' | 'list'; update(s: HomeSnapshot, now: Date): void }
export function renderHome(root: HTMLElement, strings: HomeStrings, lang: Lang, actions: HomeActions): HomeCard;
// modules/home/ticks.ts
export const WEATHER_EVERY_MS = 30 * 60_000;
export function startTicks(kit: Pick<Kit, 'call'>, onSnapshot: (s: HomeSnapshot) => void,
  setTimer: (fn: () => void, ms: number) => void, now: () => Date): { refresh(): Promise<void> };
// src/bridge-browser-home.ts
export function fakeHomeCall(capability: string, method: string, args: unknown): Promise<unknown>;
```

**Teks kartu** (`modules/home/locales`; `name` dan `description` tetap):

| Kunci | `id.json` | `en.json` |
|---|---|---|
| `weather` | Cuaca | Weather |
| `next` | Berikutnya | Next |
| `noPlace` | Atur kota di Pengaturan | Set your city in Settings |
| `today` | Hari ini | Today |
| `tomorrow` | Besok | Tomorrow |
| `hours` | j | h |
| `minutes` | m | m |
| `reminders` | Reminder | Reminders |
| `noReminders` | Belum ada reminder. | No reminders yet. |
| `newReminder` | Reminder baru | New reminder |
| `time` | Jam | Time |
| `badTime` | Jam tidak dikenali | Unknown time |
| `addFailed` | Gagal menyimpan | Couldn't save |
| `back` | Kembali | Back |
| `markDone` | Tandai selesai | Mark done |
| `markOpen` | Tandai belum selesai | Mark not done |
| `prayers.fajr` … `prayers.isha` | Subuh, Dzuhur, Ashar, Maghrib, Isya | Fajr, Dhuhr, Asr, Maghrib, Isha |
| `weatherKinds.clear` … `.storm` | Cerah, Cerah berawan, Berawan, Berkabut, Gerimis, Hujan, Hujan sesaat, Salju, Badai petir | Clear, Mostly clear, Cloudy, Fog, Drizzle, Rain, Showers, Snow, Thunderstorm |

Pemilik meninjau teks ini di Task 6.

**Aturan format:**
- **`remaining`:** menit = `Math.max(0, Math.ceil(ms / 60000))`. Satuannya `hours` dan `minutes` dari bahasa itu.
- **`progress`:** `Math.round(count × (now − prev) / (next − prev))`, dipotong ke 0…count.
- **`weatherKey` (kode WMO):**
  - 0 → clear; 1, 2 → mostlyClear; 3 → cloudy; 45, 48 → fog;
  - 51–57 → drizzle; 61–67 → rain; 80–82 → showers; 71–77, 85, 86 → snow; 95–99 → storm;
  - lainnya → cloudy.
- **`parseTime`:**
  - Di-trim dulu. Bentuk yang diterima: `H`, `HH`, `H.MM`, `HH.MM`, `H:MM`, `HH:MM`, `HHMM`.
  - Jam 0–23, menit 0–59. Selain itu, atau teks kosong → `null`.
- **`dueAt`:** hari ini pada jam itu kalau masih di depan `now`, selain itu besok pada jam yang sama. Dibuat dengan konstruktor `Date` lokal.
- **`reminderLabel`:**
  - Hari ini: jam, atau `today` kalau tanpa jam.
  - Besok: `tomorrow`, ditambah jam kalau ada.
  - Hari lain: `Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' })`, misalnya "30 Okt", ditambah jam kalau ada.
- **`nearest`:** reminder yang belum selesai, diurutkan menurut `day`, lalu `at` (tanpa jam di akhir hari itu), lalu `id`.

**Aturan kartu (N2):**
- **Tampilan utama** (`.home`):
  - `.cols` dengan jarak 18 px, berisi tiga kolom yang dipisah `.vdots`:
    1. `.col[data-k=today]`:
       - `.lab` berisi `.rd` dan nama hari panjang dari `Intl` (`weekday: 'long'`),
       - `dotText(hari, 8)` putih, berjarak 10 px atas dan bawah,
       - `.lab` bulan dan tahun (`month: 'long', year: 'numeric'`).
    2. `.col[data-k=weather]`:
       - `.lab` nama kota, atau `weather` kalau belum ada kota,
       - `dotText(degrees(temp), 8)` berwarna `--g2`,
       - `.lab` "kondisi · min°/max°".
       - Tanpa kota: angka kosong, dan `.lab` berisi `noPlace`. Ada kota tapi belum ada cuaca: angka kosong, dan `.lab` berisi "—".
    3. `.col[data-k=next]`, flex 1, `role="button"`, `tabindex="0"`:
       - `.lab` `next`,
       - `.next` "Dzuhur 11.40" (15 px/500, jarak atas 6 px),
       - `.bar` berisi `dotBar(18, progress)` dan `.lab` sisa waktu (jarak atas 7 px). `.next` dan `.bar` tidak ada kalau `prayer` null.
       - Dua `.rm` dari `nearest`, atau satu `.rm.empty` berisi `noReminders`. Setiap `.rm` berisi `.ck`, judul (`textContent`, satu baris dengan "…"), dan `.m` label.
  - `.hdots`.
  - `.foot`:
    - Satu `span` per status: `label` lalu `<b>value</b>`, keduanya lewat `textContent`.
    - `.clk` berisi `clock(now)` di kanan, hanya kalau `showClock`.
    - Baris ini tetap ada walau kosong, supaya tinggi kartu tidak berubah.
  - Tinggi seluruh kartu 156 px (kolom N2 setinggi 112 px), lebar mengikuti panel 540 px. Ukuran lain mengikuti CSS N2 di mockup.
- **Daftar reminder** (`.list`), dibuka dengan klik atau Enter di kolom ketiga:
  - `.head`:
    - `.lab` "Reminder · n", dengan n = jumlah yang belum selesai,
    - `button.back` berisi `back`, untuk kembali ke tampilan utama.
  - `.add`:
    - `input.title` (placeholder `newReminder`, `maxlength` 80),
    - `input.time` (placeholder `time`, `maxlength` 5),
    - `.lab.err` untuk pesan.
  - Enter di salah satu isian:
    - Judul kosong → tidak terjadi apa-apa.
    - Jam berisi tapi `parseTime` null → `.err` berisi `badTime`.
    - Selain itu → `actions.add(judul, day, at)`. Tanpa jam berarti `dayKey(now)` dan `at` null; dengan jam berarti `dueAt`.
    - Berhasil → kedua isian dikosongkan. Gagal → `.err` berisi `addFailed`.
  - `.items` bisa di-scroll. Isinya yang belum selesai menurut urutan `nearest`, lalu yang sudah selesai (dicoret, `--g2`).
    - Setiap baris punya `button.ck` dengan `aria-pressed` dan `aria-label` `markDone`/`markOpen`. Klik → `actions.setDone(id, !done)`.
- **`update`:**
  - Tampilan utama digambar ulang seluruhnya.
  - Di daftar, hanya `.head` dan `.items` yang diganti. Isian dan fokusnya tidak pernah dibangun ulang.
- **CSS:**
  - Isian: latar transparan, garis bawah titik-titik, teks putih Space Grotesk 13 px, placeholder `--g2`.
  - `user-select: text` khusus untuk isian, karena kit mematikan seleksi di seluruh halaman.
- **`startTicks`:**
  - Langsung memanggil `read` dan `refreshWeather`.
  - Lalu memanggil `read` di setiap batas menit (`setTimer` dengan sisa milidetik sampai menit berikutnya).
  - `refreshWeather` diulang setiap `WEATHER_EVERY_MS`.
  - Panggilan yang gagal diabaikan, jadi kartu tetap menampilkan snapshot terakhir.
  - `refresh()` dipakai `HomeActions` setelah menambah atau mencentang.
- **`main.ts`:** `connectKit` → `renderHome` dengan teks bahasa kit → `startTicks(kit, s => card.update(s, new Date()), setTimeout, () => new Date())`.
- **`fakeHomeCall`** menyimpan data di memori untuk `npm run dev`:
  - Kota Jakarta, cuaca 31,4° Berawan 24,7°/33,2°.
  - Waktu sholat hari ini 04.10, 11.40, 14.53, 17.49, 19.00 waktu lokal, dan Subuh besok 04.09. `prev`/`next` dihitung dari jam sekarang.
  - Dua reminder contoh, `showClock: true`, `statuses: []`.
  - `?city=0` → tanpa kota. `?status=1` → `statuses` berisi `{ module: 'timer', label: 'Timer', value: '12.30' }`.
- **Huruf `-`:** `['000', '000', '000', '111', '000', '000', '000']`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
// format.test.ts
test('clock follows the language', () => { /* 10.25 lokal → '10.25' (id), '10:25' (en); 09.05 → '09.05' */ });
test('time left reads in hours and minutes', () => {
  expect(remaining(82 * 60000, 'id')).toBe('1 j 22 m'); expect(remaining(82 * 60000, 'en')).toBe('1 h 22 m');
  expect(remaining(22 * 60000, 'id')).toBe('22 m'); expect(remaining(-5, 'id')).toBe('0 m'); });
test('progress dots', () => { expect(progress(0, 100, 75, 18)).toBe(14); expect(progress(0, 100, -5, 18)).toBe(0); expect(progress(0, 100, 200, 18)).toBe(18); });
test('weather codes', () => { /* 0 clear, 2 mostlyClear, 3 cloudy, 48 fog, 53 drizzle, 63 rain, 81 showers, 86 snow, 95 storm, 999 cloudy */ });
test('times people type', () => {
  for (const ok of ['14.00', '14:00', '1400', '9', '09.30', '9:30']) expect(parseTime(ok)).not.toBeNull();
  expect(parseTime('0930')).toEqual({ h: 9, m: 30 });
  for (const bad of ['25.00', '9.5', '12.60', 'abc', '', '1.2.3']) expect(parseTime(bad)).toBeNull(); });
test('a time already past today means tomorrow', () => {
  const now = new Date(2026, 9, 27, 10, 18);
  expect(dueAt({ h: 9, m: 0 }, now)).toEqual({ day: '2026-10-28', at: new Date(2026, 9, 28, 9, 0).getTime() });
  expect(dueAt({ h: 14, m: 0 }, now).day).toBe('2026-10-27'); });
test('labels for today, tomorrow and later', () => {
  // hari ini dengan jam → '14.00'; hari ini tanpa jam → 'Hari ini'; besok 9.00 → 'Besok 09.00'; 30 Okt tanpa jam → '30 Okt'
});
test('the two nearest open reminders', () => { /* selesai dilewati; 27 Okt 14.00, 27 Okt tanpa jam, 28 Okt 9.00 → dua pertama */ });
test('degrees', () => { expect(degrees(31.4)).toBe('31°'); expect(degrees(-0.4)).toBe('0°'); expect(degrees(-2.6)).toBe('-3°'); });
// dots.test.ts
test('minus has its own glyph', () => expect(dotText('-3°', 5)).toContain('<circle'));
// card.test.ts (// @vitest-environment jsdom)
// SNAP: Jakarta, cuaca 31.4/3/24.7/33.2, prayer prev Subuh 04.10 → next Dzuhur 11.40 (27 Okt 2026 lokal),
//       reminders [Kirim invoice 27 Okt 14.00, Bayar listrik 27 Okt tanpa jam, Beli kopi selesai], showClock true, statuses []
// NOW = new Date(2026, 9, 27, 10, 18)  // Selasa
test('three columns: date, weather, next', () => {
  // today: teks memuat 'Selasa' dan 'Oktober 2026'; tepat satu .rd di seluruh kartu
  // weather: 'Jakarta', 'Berawan · 25°/33°'; next: 'Dzuhur 11.40', '1 j 22 m';
  // .bar circle fill #fff berjumlah progress(prev, next, NOW, 18); .rm judul ['Kirim invoice', 'Bayar listrik'] label ['14.00', 'Hari ini']
});
test('English names and times', () => { /* 'Tuesday', 'October 2026', 'Cloudy · 25°/33°', 'Dhuhr 11:40', '1 h 22 m', 'Today' */ });
test('without a city it asks for one and shows reminders only', () => { /* 'Atur kota di Pengaturan'; tidak ada .next */ });
test('reminder titles are text, never markup', () => {
  // judul '<img src=x onerror=alert(1)>' → tidak ada <img> di kartu; textContent .rm memuat judul itu apa adanya
});
test('the clock and the running modules sit in the bottom row', () => {
  // showClock → .clk '10.18'; showClock false → tidak ada .clk;
  // statuses [{ module: 'timer', label: 'Timer', value: '12.30' }] → .foot memuat 'Timer' dan '12.30'
});
test('the next column opens the full list; back returns', () => { /* klik .col[data-k=next] → view 'list', '.head' memuat 'Reminder · 2'; klik .back → 'main' */ });
test('adding a reminder with a time', async () => {
  // daftar; ketik 'Kirim invoice' dan '14.00'; Enter → add('Kirim invoice', '2026-10-27', new Date(2026, 9, 27, 14, 0).getTime());
  // setelah promise selesai, kedua isian kosong
});
test('an unreadable time says so and adds nothing', () => { /* '25.00' → 'Jam tidak dikenali'; add tidak dipanggil */ });
test('a circle marks a reminder done', () => { /* klik .ck pertama → setDone(id, true) */ });
test('an update keeps what you are typing', () => {
  // daftar; isian judul 'Kir' dan terfokus; update(SNAP, NOW) → value 'Kir', document.activeElement tetap isian itu
});
test('both languages have the same keys', () => { /* kunci dalam id.json dan en.json sama */ });
// ticks.test.ts
test('reads at once, then on each minute', () => {
  // now 10:18:30 → read dan refreshWeather sekali; timer berikutnya 30_000 ms; jalankan → read lagi
});
test('weather refreshes every half hour', () => { /* setelah 30 menit tick → refreshWeather kedua */ });
test('a failed call keeps the last snapshot', async () => { /* refreshWeather ditolak → onSnapshot tidak dipanggil untuk itu, tidak ada error */ });
```
Badan test yang hanya berupa komentar ditulis dari komentar itu.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run modules/home src/kit` → FAIL

- [ ] **Step 3: Implementasikan semua file sesuai Interfaces dan aturan di atas**

- [ ] **Step 4: Jalankan test dan build modul**

Run: `npx tsc --noEmit && npm test && npm run build:modules && ls dist-modules/home/locales`
Expected: semua PASS, dan `en.json` serta `id.json` ada.

- [ ] **Step 5: Commit**

`git add modules/home src/kit/dots.ts src/kit/dots.test.ts src/bridge-browser.ts src/bridge-browser-home.ts src/notch/test-helpers.ts && git commit -m "feat(modules): Beranda N2 card with weather, prayer times and reminders"`

---

### Task 6: Halaman Beranda di pengaturan, lalu cek di browser bersama pemilik

**Files:**
- Create: `src/settings/pages/home.ts`
- Modify:
  - `src/settings/types.ts`, `src/settings/pages/modules.ts`, `src/settings/search.ts`
  - `src/settings/bridge-tauri.ts`, `src/settings/bridge-browser.ts`, `src/settings/test-helpers.ts`
  - `src/settings/settings.css`, `src/i18n/id.json`, `src/i18n/en.json`
- Test: `src/settings/pages/home.test.ts`, `src/settings/search.test.ts`

**Interfaces:**
- Consumes: `PageContext`, kontrol (`row`, `toggle`, `select`, `button`, `group`, `note`, `el`), `searchIndex`, perintah Task 4.
- Produces:
```ts
// settings/types.ts
export interface Place { name: string; region: string; country: string; latitude: number; longitude: number }   // = Place di settings.rs
export type PrayerMethod = 'kemenag' | 'singapore' | 'muslimWorldLeague' | 'egyptian' | 'karachi' | 'ummAlQura' | 'northAmerica';
export interface HomeSettingsInfo { place: Place | null; prayerMethod: PrayerMethod; showClock: boolean }
export interface SettingsInfo { /* lama */ home: HomeSettingsInfo }
export interface SettingsBridge { /* lama */
  searchPlaces(query: string): Promise<Place[]>;
  setPlace(place: Place | null): Promise<void>;
  setPrayerMethod(method: PrayerMethod): Promise<void>;
  setShowClock(on: boolean): Promise<void>;
}
// settings/pages/modules.ts
export const MODULE_SETTINGS: Record<string, (ctx: PageContext) => HTMLElement>;   // { home: homeSettings }
// settings/pages/home.ts
export const PRAYER_METHODS: PrayerMethod[];          // urutan tabel di Global Constraints
export function placeLabel(p: Place): string;         // "Bandung, Jawa Barat, Indonesia"; bagian kosong atau kembar dilewati
export function homeSettings(ctx: PageContext): HTMLElement;
```

**Teks `settingsWindow`** (tambahan):

| Kunci | `id.json` | `en.json` |
|---|---|---|
| `home.place` | Kota | City |
| `home.placeHint` | Untuk cuaca dan waktu sholat. Hanya dikirim ke Open-Meteo. | For weather and prayer times. Sent only to Open-Meteo. |
| `home.placeNone` | Belum diatur | Not set |
| `home.placeSet` | Atur | Set |
| `home.placeChange` | Ganti | Change |
| `home.placeSearch` | Ketik nama kota, lalu Enter | Type a city, then Enter |
| `home.placeFind` | Cari | Search |
| `home.placeCancel` | Batal | Cancel |
| `home.placeSearching` | Mencari… | Searching… |
| `home.placeNotFound` | Kota tidak ditemukan. | No city found. |
| `home.placeFailed` | Tidak bisa mencari. Periksa internetmu. | Couldn't search. Check your internet. |
| `home.prayerMethod` | Metode hitung sholat | Prayer time method |
| `home.prayerMethodHint` | Kemenag RI: Subuh 20°, Isya 18°. | Kemenag RI: Fajr 20°, Isha 18°. |
| `home.methods.kemenag` … | Kemenag RI, MUIS (Singapura), Muslim World League, Mesir, Karachi, Umm al-Qura (Makkah), ISNA (Amerika Utara) | Kemenag RI, MUIS (Singapore), Muslim World League, Egypt, Karachi, Umm al-Qura (Makkah), ISNA (North America) |
| `home.showClock` | Tampilkan jam | Show the clock |
| `home.showClockHint` | Jam kecil di pojok kanan bawah Beranda. | A small clock at the bottom right of Home. |
| `keywords.place` | kota lokasi cuaca tempat | city location weather place |
| `keywords.prayerMethod` | sholat salat shalat waktu metode kemenag jadwal | prayer salah method kemenag schedule |
| `keywords.showClock` | jam waktu | clock time |

**Aturan:**
- **`modulePage`:** kalau `MODULE_SETTINGS[m.id]` ada, pasang hasilnya di tempat `.note` `noSettings`. Modul lain tetap seperti rencana 3.
- **`homeSettings`** berisi satu `group`:
  1. **`row('home.place')`** dengan hint `placeHint`. Kontrolnya teks `placeLabel(place)` atau `placeNone`, lalu `button('home.placeChange', place ? placeChange : placeSet)`.
     - Tombol itu membuka kotak cari. Saat terbuka, baris diikuti oleh:
       - `<input data-key="home.placeSearch">` dengan placeholder `placeSearch`,
       - `button('home.placeFind')` dan `button('home.placeCancel')`,
       - satu `<button data-key="home.place.<i>">` per hasil, bertuliskan `placeLabel`,
       - atau `.note` `placeSearching`, `placeNotFound`, atau `placeFailed`.
     - Enter di isian atau klik Cari → `bridge.searchPlaces(query)`. Tidak ada pencarian saat mengetik.
     - Pilih hasil → `ctx.save('home.place', bridge.setPlace(p))`, lalu kotak cari ditutup. Batal atau Esc di isian juga menutupnya.
     - **State kotak cari** disimpan di variabel modul `draft = { open, query, status, results, seq }`, karena halaman dibangun ulang di setiap siaran.
       - Isian mengambil nilainya dari `draft.query` dan diperbarui di event `input`.
       - Setelah jawaban datang, halaman digambar ulang dengan `ctx.go({ page: 'module', id: 'home' })`.
       - Jawaban dengan `seq` lama diabaikan.
  2. **`row('home.prayerMethod')`:** `select` berisi `PRAYER_METHODS` dengan label `methods.<m>`, dan hint `prayerMethodHint` → `save(key, bridge.setPrayerMethod(v))`.
  3. **`row('home.showClock')`:** `toggle` → `save(key, bridge.setShowClock(on))`.
- **`searchIndex`:** kalau `home` terpasang, entri `home.place`, `home.prayerMethod`, dan `home.showClock` ditaruh tepat setelah entri `module.home`.
  - `where` = nama modul. `route` = `{ page: 'module', id: 'home' }`. Kata kunci dari `keywords.*` dengan nama yang sama.
- **`tauriSettingsBridge`:** `invoke('search_places', { query })`, `invoke('set_place', { place })`, `invoke('set_prayer_method', { method })`, `invoke('set_show_clock', { on })`.
- **`browserSettingsBridge`:**
  - `home` awal: kota kosong, `kemenag`, jam nyala.
  - `searchPlaces` mencari awalan nama di daftar tetap (Jakarta, Bandung, Surabaya, Yogyakarta, Makassar, Medan, Denpasar).
  - Query "gagal" ditolak, supaya pesan galat bisa dilihat.
- **`TEST_INFO.home`:** `{ place: null, prayerMethod: 'kemenag', showClock: true }`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
// home.test.ts — memakai mountForTest(); BANDUNG = { name: 'Bandung', region: 'Jawa Barat', country: 'Indonesia', latitude: -6.9175, longitude: 107.6191 }
test('the Beranda page has its settings instead of the empty note', async () => {
  // go module home → [data-row] memuat home.place, home.prayerMethod, home.showClock; teks tidak memuat 'Modul ini belum punya pengaturan.'
});
test('System stat still says it has no settings', async () => { /* go module system-stat → 'Modul ini belum punya pengaturan.' */ });
test('finding a city and choosing it', async () => {
  // klik home.placeChange; isi [data-key="home.placeSearch"] 'Bandung' + Enter → searchPlaces('Bandung');
  // resolve [BANDUNG] → tombol 'Bandung, Jawa Barat, Indonesia'; klik → setPlace(BANDUNG); kotak cari tertutup
});
test('typing alone never searches', async () => { /* event input berkali-kali tanpa Enter → searchPlaces tidak dipanggil */ });
test('a failed search says so', async () => { /* searchPlaces ditolak → 'Tidak bisa mencari. Periksa internetmu.' */ });
test('no city found says so', async () => { /* resolve [] → 'Kota tidak ditemukan.' */ });
test('what you typed survives a broadcast', async () => {
  // kotak cari terbuka, isian 'Band'; emitSettings(TEST_INFO) → isian masih 'Band' dan terfokus
});
test('the chosen city shows with a Change button', async () => { /* info.home.place BANDUNG → 'Bandung, Jawa Barat, Indonesia' dan 'Ganti' */ });
test('the prayer method and the clock save at once', async () => {
  // select home.prayerMethod 'karachi' → setPrayerMethod('karachi'); klik home.showClock → setShowClock(false)
});
// search.test.ts
test('finds the city setting on the Beranda page', () => {
  const e = search(idx(), 'kota')[0]; expect(e.key).toBe('home.place'); expect(e.route).toEqual({ page: 'module', id: 'home' }); });
```
Test `both languages have the same keys at every depth` (rencana 3) menjaga kedua file teks.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/settings src/i18n` → FAIL

- [ ] **Step 3: Tulis teks, lalu implementasikan sesuai Interfaces dan aturan di atas**

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx tsc --noEmit && npm test` → PASS

- [ ] **Step 5: Cek di browser bersama pemilik**

Run: `npm run dev`, lalu buka:
- `http://localhost:1420/?notch=1` dan klik notch,
- `http://localhost:1420/?lang=en`,
- `http://localhost:1420/?city=0&status=1`,
- `http://localhost:1420/settings.html`, lalu Modul → Beranda.

Minta pemilik melihat dan melaporkan:
1. **Kartu Beranda:** tiga kolom dengan garis titik-titik. Tanggal putih dan suhu lebih redup, sama besar. Satu titik merah. Jam kecil di kanan bawah. Bentuknya mirip N2 di mockup.
2. **Kolom Berikutnya:** sholat berikutnya, baris titik, dan sisa waktu. Dua reminder terdekat di bawahnya.
3. **Daftar reminder:** klik kolom Berikutnya → daftar lengkap. Tambah reminder dengan jam dan tanpa jam, coba jam salah, tandai selesai, lalu Kembali.
4. Bahasa Inggris, tanpa kota, dan dengan status Timer.
5. **Pengaturan Beranda:** cari "Band" lalu Enter, pilih Bandung. Coba "gagal" dan "zzz". Ganti metode, matikan jam.
6. Teks di tabel kartu dan pengaturan.

Pemilik yang memutuskan semua soal tampilan dan teks. Terapkan perubahan yang diminta, jalankan test lagi, lalu cek ulang bersama pemilik. Catat di pesan commit bahwa pemilik sudah menyetujui.

- [ ] **Step 6: Commit**

`git add src/settings src/i18n modules/home && git commit -m "feat(settings): Beranda settings: city, prayer method and clock"`

---

### Task 7: Cek Bagian A di perangkat

**Files:**
- Create: `docs/superpowers/verification/2026-10-29-notching-4-beranda-notifications.md`, bagian "A. Beranda", dengan format seperti verifikasi rencana 3.

- [ ] **Step 1: Jalankan semua test dan catat jumlahnya**

Run: `npx tsc --noEmit && npm test && npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: semua PASS. Catat jumlahnya (awal: 153 web, 70 Rust).

- [ ] **Step 2: Cek bersama pemilik di `npm run tauri dev`**

Minta pemilik mencoba dan melaporkan:
1. Sebelum kota diatur, Beranda mengajak mengatur kota.
2. **Kota dan sholat:**
   - Atur kota tempat pemilik tinggal di Pengaturan → Modul → Beranda. Dalam beberapa detik setelah kartu dibuka, cuaca muncul.
   - Pemilik mencocokkan kelima waktu sholat hari ini dengan jadwal Kemenag kotanya, misalnya di bimasislam.kemenag.go.id atau app yang biasa dipakai. Selisihnya paling banyak 1 menit.
3. **Reminder:**
   - Tambah dua reminder: satu dengan jam, satu tanpa jam. Tandai satu selesai.
   - Cmd+Q, lalu jalankan lagi → reminder masih ada, dan yang selesai masih tercoret hari ini.
4. **Internet mati:**
   - Matikan Wi-Fi, Cmd+Q, lalu jalankan lagi → cuaca terakhir tetap tampil.
   - Cari kota → "Tidak bisa mencari. Periksa internetmu." Nyalakan Wi-Fi lagi.
5. Matikan jam → jam hilang dari kartu. Ganti metode ke Karachi → waktu Isya berubah. Kembalikan ke Kemenag.
6. Bahasa English → kartu dan pengaturan dalam bahasa Inggris. Kembalikan ke Otomatis.
7. **Mengetik di panel:**
   - Buka TextEdit, buka daftar reminder, ketik judul → huruf masuk ke isian, bukan ke TextEdit.
   - Tekan Esc → panel tertutup, dan ketikan berikutnya kembali ke TextEdit.
8. **Perilaku lama:** klik di luar menutup panel, menu bar dekat tengah bisa diklik, dan System stat masih jalan.

- [ ] **Step 3: Cek oleh pelaksana**

- **Jaringan:**
  - Saat kartu dibuka dengan cuaca kedaluwarsa, jalankan `lsof -nP -iTCP -a -p $(pgrep -x notching)` dan `dig +short api.open-meteo.com geocoding-api.open-meteo.com`.
  - Alamat tujuan harus milik Open-Meteo saja.
  - Buka kartu lagi dalam 30 menit → tidak ada koneksi baru.
- **File:**
  - `settings.json` memuat `home` dengan kota dan metode yang dipilih.
  - `reminders.json` dan `~/Library/Caches/id.web.notching/weather.json` ada dan isinya masuk akal.
- **CPU:** 10 sampel per keadaan, dengan cara rencana 3.
  - Kartu Beranda terbuka dan diam → `notching` dan WebContent di bawah 1,0, kecuali satu lonjakan kecil di batas menit.
  - Panel tertutup → di bawah 1,0.
- **Build rilis:** jalankan `npm run tauri build -- --bundles app`, catat ukuran `Notching.app` (rencana 3: 4,4 MB). Pemilik membuka `.app`-nya dari folder `bundle/macos`, lalu memastikan cuaca muncul. Ini membuktikan TLS jalan di build rilis.

- [ ] **Step 4: Tulis bagian A di file verifikasi**

Isi: jumlah test, ukuran, CPU, checklist 1–8 di atas dengan catatan "Dilaporkan pemilik", dan temuan. Perbaiki temuan dengan `superpowers:systematic-debugging`, lalu ulangi langkah yang gagal.

- [ ] **Step 5: Commit**

`git add docs/superpowers/verification/2026-10-29-notching-4-beranda-notifications.md && git commit -m "docs: verification notes for Beranda"`

Kalau pemilik memilih dua tahap, tanyakan sekarang apakah Bagian A boleh di-merge ke `main`. Merge hanya kalau pemilik memintanya. Bagian B lalu dilanjutkan dari `main` yang baru, di cabang yang sama.

---

## Bagian B — Notifikasi

### Task 8: Saluran notifikasi dan pengaturannya (Rust)

**Files:**
- Create: `src-tauri/src/notify.rs` (di task ini hanya empat perintah)
- Modify:
  - `src-tauri/src/modules/manifest.rs`, `src-tauri/src/modules/store.rs` (termasuk `fake_bundle`)
  - `src-tauri/src/settings.rs`, `src-tauri/src/app_core.rs`
  - `src-tauri/src/lib.rs`: `#[cfg(target_os = "macos")] mod notify;` dan perintah baru.
  - `modules/home/manifest.json`, `modules/home/locales/id.json`, `modules/home/locales/en.json`
- Test: di dalam `manifest.rs`, `settings.rs`, dan `app_core.rs`

**Interfaces:**
- Consumes: `Manifest`, `ModuleEntry`, `Settings`, `AppCore`, `change` (rencana 2 dan 3).
- Produces:
```rust
// manifest.rs
#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize)] #[serde(deny_unknown_fields)]
pub struct ChannelSpec { pub id: String, pub on: bool, pub sound: bool }
pub struct Manifest { /* lama */ #[serde(default)] pub notifications: Vec<ChannelSpec> }
pub enum ManifestError { /* lama */ BadChannel }
// store.rs
#[derive(Clone, Debug, PartialEq)]
pub struct ChannelEntry { pub id: String, pub name: String, pub on: bool, pub sound: bool }   // bawaan dari manifest
pub struct ModuleEntry { /* lama */ pub channels: Vec<ChannelEntry> }
// settings.rs
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ChannelPref { pub on: bool, pub sound: bool }
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NotificationSettings { pub glow: bool, pub seconds: f64,
                                  pub channels: std::collections::BTreeMap<String, ChannelPref> }  // kunci "home.prayer"
impl Default for NotificationSettings {}           // true, 3.5, kosong
pub fn clamp_seconds(s: f64) -> f64;               // 2.0..=8.0, kelipatan 0,5; bukan angka → 3.5
pub struct Settings { /* lama */ pub notifications: NotificationSettings }
// app_core.rs
#[derive(Clone, Debug, PartialEq, serde::Serialize)] #[serde(rename_all = "camelCase")]
pub struct ChannelDto { pub id: String, pub name: String, pub on: bool, pub sound: bool }
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)] #[serde(rename_all = "camelCase")]
pub struct NoticeLook { pub glow: bool, pub seconds: f64 }
pub struct ModuleInfoDto { /* lama */ pub channels: Vec<ChannelDto> }
pub struct ModuleStateDto { /* lama */ pub notifications: NoticeLook, pub missed: Vec<String> }
impl AppCore {
    pub fn channel(&self, module: &str, channel: &str) -> Option<ChannelPref>;   // None: modul mati/dicopot, atau saluran tak ada
    pub fn notice_look(&self) -> NoticeLook;
    pub fn set_glow(&mut self, on: bool) -> Result<(), CoreError>;
    pub fn set_notice_seconds(&mut self, seconds: f64) -> Result<(), CoreError>;
    pub fn set_channel(&mut self, module: &str, channel: &str, pref: ChannelPref) -> Result<(), CoreError>;
    pub fn mark_missed(&mut self, module: &str);   // di memori saja; satu kali per modul, urut kedatangan
    pub fn clear_missed(&mut self) -> bool;        // true kalau ada yang dihapus
}
// notify.rs
#[tauri::command] pub fn set_notice_glow(app: AppHandle, core: State<CoreState>, on: bool) -> Result<(), String>;
#[tauri::command] pub fn set_notice_seconds(app: AppHandle, core: State<CoreState>, seconds: f64) -> Result<(), String>;
#[tauri::command] pub fn set_channel(app: AppHandle, core: State<CoreState>, module: String, channel: String, on: bool, sound: bool) -> Result<(), String>;
#[tauri::command] pub fn clear_missed(app: AppHandle, core: State<CoreState>);   // siarkan module-state hanya kalau ada yang dihapus
```

**Aturan:**
- **Manifest:** `notifications` paling banyak 8. Setiap `id` lolos `is_module_id` dan tidak kembar. Selain itu → `BadChannel`.
- **`store.list`:** nama saluran dari `channels.<id>` di berkas bahasa. Kalau tidak ada, pakai `id`.
- **`state()`:** `channels` setiap modul memakai `ChannelPref` dari `settings.notifications.channels["<modul>.<id>"]`, atau bawaan manifest.
- **Pengaturan:** `notifications.glow` memakai `lenient_true` (Task 1), dan `channels` memakai `lenient`. `seconds` dibaca toleran lalu `clamp_seconds`.
- **Perintah:** semuanya memakai `change`, sehingga module-state tersimpan dan disiarkan. `set_channel` yang tidak dikenal → galat.
- **Beranda:**
  - `"notifications": [{ "id": "reminder", "on": true, "sound": true }, { "id": "prayer", "on": false, "sound": false }]`.
  - Locale: `"channels": { "reminder": "Reminder", "prayer": "Waktu sholat" }` / `{ "reminder": "Reminders", "prayer": "Prayer times" }`.
- **`fake_bundle`:** modul `a` mendapat `"notifications":[{"id":"ping","on":true,"sound":false}]` dan `"channels":{"ping":"Ping"}` di kedua bahasa.

- [ ] **Step 1: Tulis test yang gagal**

```rust
// manifest.rs
#[test] fn notification_channels_parse() {
    // GOOD + "notifications":[{"id":"done","on":true,"sound":true}] → [ChannelSpec { id "done", on true, sound true }];
    // tanpa field → kosong
}
#[test] fn bad_channels_are_refused()   // id "Done!", id kembar, 9 saluran → Err(ManifestError::BadChannel)
// repo_modules_are_valid diperluas: setiap saluran punya nama di channels.<id> pada kedua bahasa
// settings.rs
#[test] fn notification_defaults() {
    let n = Settings::default().notifications;
    assert_eq!((n.glow, n.seconds, n.channels.len()), (true, 3.5, 0)); }
#[test] fn notice_seconds_are_clamped() {
    // {"notifications":{"seconds":100}} → 8.0; "x" → 3.5; 2.2 → 2.0; 3.74 → 3.5; glow "ya" → true
}
// app_core.rs
#[test] fn channels_resolve_defaults_and_choices() {
    // state().modules[0].channels == [ChannelDto { id "ping", name "Ping", on true, sound false }];
    // set_channel("a","ping", ChannelPref { on: false, sound: true }) → state berubah; open lagi → sama;
    // channel("a","ping") == Some(ChannelPref { on: false, sound: true })
}
#[test] fn a_switched_off_module_has_no_live_channels()   // set_enabled("a", false) → channel("a","ping") None
#[test] fn unknown_channels_are_refused()                  // set_channel("a","zzz",…) dan set_channel("zzz","ping",…) → Err
#[test] fn missed_marks_are_kept_once_and_cleared() {
    // mark_missed("a") dua kali → state().missed == ["a"]; clear_missed() true → []; clear_missed() lagi false
}
#[test] fn the_notice_look_is_shared()   // set_glow(false), set_notice_seconds(6.0) → state().notifications == NoticeLook { glow false, seconds 6.0 }
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml -- manifest:: settings:: app_core::` → FAIL

- [ ] **Step 3: Implementasikan sesuai Interfaces dan aturan di atas**

- [ ] **Step 4: Jalankan semua test**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && npx tsc --noEmit && npm test` → PASS (+9 Rust)

`ModuleState` di TypeScript baru bertambah di Task 11. Sampai saat itu, field baru dari Rust diabaikan oleh frontend.

- [ ] **Step 5: Commit**

`git add src-tauri/src modules/home && git commit -m "feat(native): notification channels, glow and duration settings, and missed marks"`

---

### Task 9: Mengirim notifikasi ke layar yang ada kursornya (Rust)

**Files:**
- Modify:
  - `src-tauri/src/notify.rs`, `src-tauri/src/geometry.rs`
  - `src-tauri/src/modules/manifest.rs`: `Capability::Notify` (`"notify"`).
  - `src-tauri/src/modules/gate.rs`, `src-tauri/src/module_commands.rs`, `src-tauri/src/lib.rs`
  - `src-tauri/Cargo.toml`:
    - `objc2-core-graphics = { version = "0.3", default-features = false, features = ["std", "CGEventSource", "CGEventTypes", "CGWindow"] }`,
    - fitur `NSSound` di objc2-app-kit,
    - fitur `NSDictionary` dan `NSValue` di objc2-foundation.
- Test: di dalam `geometry.rs`, `notify.rs`, dan `gate.rs`

**Interfaces:**
- Consumes: `AppCore::{channel, notice_look, mark_missed}`, `Overlays`, `MODULE_STATE_EVENT` (Task 8, rencana 2).
- Produces:
```rust
// geometry.rs
pub fn screen_under(screens: &[(String, Rect)], px: f64, py: f64) -> Option<String>;   // layar yang memuat titik; selain itu yang pertama
pub fn to_cg(r: Rect, primary_height: f64) -> Rect;                                   // AppKit (kiri-bawah) → CoreGraphics (kiri-atas)
// gate.rs
pub enum Call { /* lama */ NotifyPost }
// notify.rs
pub const NOTICE_EVENT: &str = "notching://notice";
pub const IDLE_SECS: f64 = 120.0;
pub const SOUND: &str = "Glass";
pub const TITLE_MAX: usize = 60;
pub const DETAIL_MAX: usize = 40;
#[derive(Clone, Debug, PartialEq, serde::Serialize)] #[serde(rename_all = "camelCase")]
pub struct NoticeDto { pub module_id: Option<String>, pub title: String, pub detail: String, pub glow: bool, pub seconds: f64 }
pub fn clip(text: &str, max: usize) -> String;
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WindowBox { pub pid: i32, pub layer: i64, pub bounds: Rect }   // koordinat CoreGraphics
pub fn covers_screen(windows: &[WindowBox], screen_cg: Rect, own_pid: i32) -> bool;
pub fn post(app: &AppHandle, module_id: &str, channel: &str, title: &str, detail: &str) -> Result<(), String>;   // dari thread mana saja
#[tauri::command] pub fn send_sample_notice(app: AppHandle, title: String, detail: String);
```

**Aturan:**
- **`clip`:**
  - Baris baru dan tab menjadi spasi, lalu di-trim.
  - Lebih dari `max` karakter → `max − 1` karakter pertama (di-trim kanan) ditambah "…".
- **`covers_screen`:** ada jendela dengan `layer == 0`, `pid != own_pid`, dan `bounds` sama dengan layar (selisih tiap sisi ≤ 1 pt).
- **`post`:**
  1. `core.channel(module_id, channel)`:
     - `None` → `Err("unknown or switched-off channel")`.
     - `on == false` → `Ok(())` tanpa apa-apa.
  2. `NoticeDto` dengan `module_id: Some`, `clip(title, TITLE_MAX)`, `clip(detail, DETAIL_MAX)`, dan `glow`/`seconds` dari `notice_look()`.
  3. Di `run_on_main_thread`:
     - Pilih label dengan `screen_under(entri Overlays → (label, screen.frame), NSEvent::mouseLocation())`. Tidak ada overlay → selesai.
     - `idle = idle_seconds() >= IDLE_SECS`.
     - `fullscreen = covers_screen(window_list(), to_cg(frame, tinggi NSScreen::screens()[0]), pid sendiri)`.
     - Kalau `idle || fullscreen` → `mark_missed(module_id)` di core, lalu siarkan `MODULE_STATE_EVENT`.
     - Kalau `sound` → `NSSound::soundNamed(SOUND)` lalu `play()`.
     - `emit_to(EventTarget::webview_window(label), NOTICE_EVENT, dto)`.
- **Bagian khusus macOS** (tipis, dicek di perangkat):
  - `idle_seconds()` = `CGEventSourceSecondsSinceLastEventType(CombinedSessionState, kCGAnyInputEventType)`.
  - `window_list()` = `CGWindowListCopyWindowInfo(OptionOnScreenOnly | ExcludeDesktopElements, kCGNullWindowID)`.
    - Hasilnya dijembatani ke `NSArray<NSDictionary>`. Bacalah `kCGWindowOwnerPID`, `kCGWindowLayer`, dan `kCGWindowBounds` (`X`, `Y`, `Width`, `Height`).
    - Ketiganya tidak butuh izin Perekaman Layar.
  - `play_sound()`.
- **`send_sample_notice`:**
  - `module_id: None`, teks dari jendela pengaturan dengan `clip`, `glow` dan `seconds` dari pengaturan.
  - Selalu bersuara, tidak pernah menandai terlewat, dan tidak melihat saluran.
- **Kemampuan `notify`** untuk modul rencana 5:
  - `("notify", "post")` → `NotifyPost`.
  - Argumen `{ channel: String, title: String, detail: Option<String> }` → `post(app, module_id, channel, title, detail ?? "")`.
  - Modul hanya bisa memakai salurannya sendiri, karena `channel()` dicari di modul pemanggil.

- [ ] **Step 1: Tulis test yang gagal**

```rust
// geometry.rs
fn screens() -> Vec<(String, Rect)> { vec![("notch-0".into(), Rect { x: 0.0, y: 0.0, w: 1470.0, h: 956.0 }),
                                           ("notch-1".into(), Rect { x: 1470.0, y: 0.0, w: 1920.0, h: 1080.0 })] }
#[test] fn a_notice_goes_to_the_screen_under_the_cursor() {
    assert_eq!(screen_under(&screens(), 2000.0, 500.0), Some("notch-1".into()));
    assert_eq!(screen_under(&screens(), 100.0, 955.0), Some("notch-0".into())); }
#[test] fn a_cursor_off_every_screen_falls_back_to_the_first() {
    assert_eq!(screen_under(&screens(), -5000.0, 0.0), Some("notch-0".into())); assert_eq!(screen_under(&[], 0.0, 0.0), None); }
#[test] fn coordinates_flip_for_core_graphics() {
    assert_eq!(to_cg(Rect { x: 0.0, y: 0.0, w: 1470.0, h: 956.0 }, 956.0), Rect { x: 0.0, y: 0.0, w: 1470.0, h: 956.0 });
    assert_eq!(to_cg(Rect { x: 0.0, y: 956.0, w: 1920.0, h: 1080.0 }, 956.0), Rect { x: 0.0, y: -1080.0, w: 1920.0, h: 1080.0 }); }
// notify.rs
#[test] fn long_text_is_cut_with_an_ellipsis() {
    assert_eq!(clip(" Kirim invoice\nke klien ", 60), "Kirim invoice ke klien");
    let c = clip(&"é".repeat(70), 60); assert_eq!(c.chars().count(), 60); assert!(c.ends_with('…')); }
#[test] fn a_full_screen_app_covers_the_screen() {
    // screen = Rect{0,0,1470,956}; WindowBox { pid 9, layer 0, bounds screen } → true;
    // pid sendiri → false; layer 25 → false; bounds 1470×900 → false; bounds selisih 0,5 pt → true
}
// gate.rs
#[test] fn notify_needs_its_capability() {
    // entry("timer", &[Capability::Notify]) → ("notify","post") Ok(Call::NotifyPost); entry tanpa Notify → NotDeclared
}
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml -- geometry:: notify:: gate::` → FAIL

- [ ] **Step 3: Tambah dependensi, lalu implementasikan**

Run: `(cd src-tauri && cargo tree -d | grep objc2 || true)`
Expected: tidak ada dua versi `objc2`, `objc2-foundation`, `objc2-app-kit`, atau `objc2-core-graphics`.

- [ ] **Step 4: Jalankan semua test**

Run: `cargo test --manifest-path src-tauri/Cargo.toml` → PASS (+6)

- [ ] **Step 5: Commit**

`git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src && git commit -m "feat(native): notices go to the screen under the cursor, with sound and missed marks"`

---

### Task 10: Jadwal reminder dan waktu sholat (Rust)

**Files:**
- Create: `src-tauri/src/home/schedule.rs`
- Modify:
  - `src-tauri/src/home/mod.rs`, `src-tauri/src/home/commands.rs` (poke setelah `set_place` dan `set_prayer_method`)
  - `src-tauri/src/module_commands.rs` (poke setelah `reminders.add` dan `setDone`)
  - `src-tauri/src/notify.rs` (poke setelah `set_channel`)
  - `src-tauri/src/modules/store.rs`, `src-tauri/src/app_core.rs` (`module_text`)
  - `src-tauri/src/lib.rs`: `schedule::start` di `setup`, setelah overlay dibangun.
  - `modules/home/locales/id.json`, `modules/home/locales/en.json`: `"notice": { "prayer": "Waktu {name}" }` / `{ "prayer": "{name} time" }`.
- Test: di dalam `schedule.rs` dan `store.rs`

**Interfaces:**
- Consumes: `Reminders`, `day_times`, `PrayerTime`, `notify::post`, `AppCore::{home, channel}` (Task 1–9).
- Produces:
```rust
// home/schedule.rs
pub const LATE_MS: i64 = 10 * 60_000;
pub const MAX_SLEEP_MS: i64 = 60_000;
#[derive(Clone, Debug, PartialEq)]
pub enum Due { Reminder { id: u64, title: String, at: i64 }, Prayer(PrayerTime) }
pub fn due(now: i64, reminders: &[Reminder], prayers: &[PrayerTime], fired: &[i64]) -> Vec<Due>;   // urut waktu
pub fn sleep_ms(now: i64, reminders: &[Reminder], prayers: &[PrayerTime]) -> i64;
pub struct SchedulerState(pub std::sync::Arc<(std::sync::Mutex<bool>, std::sync::Condvar)>);
pub fn start(app: tauri::AppHandle);
pub fn poke(app: &tauri::AppHandle);
// store.rs
impl ModuleStore { pub fn module_text(&self, id: &str, lang: Lang, key: &str) -> Option<String>; }   // kunci bertitik, dari bundle
// app_core.rs
impl AppCore { pub fn module_text(&self, id: &str, key: &str) -> Option<String>; }                   // bahasa yang berlaku
```

**Aturan:**
- **`due`:**
  - Reminder ikut kalau belum `done`, belum `notified`, punya `at`, dan `now − LATE_MS < at ≤ now`.
  - Sholat ikut kalau `now − LATE_MS < at ≤ now` dan `at` tidak ada di `fired`.
- **`sleep_ms`:** sampai kejadian berikutnya yang `> now`, paling lama `MAX_SLEEP_MS`, paling cepat 1 000.
- **Loop di thread `std::thread`:**
  1. Ambil dari core, lalu lepaskan:
     - `home()` (kota, metode),
     - `channel("home", "prayer")`,
     - bahasa, teks `notice.prayer` dan `prayers.<nama>` lewat `module_text`.
  2. `prayers` = `day_times` hari ini dan besok, hanya kalau ada kota dan saluran sholat nyala.
  3. Salin `reminders.items()` dari `HomeState`, lalu lepaskan.
  4. Untuk setiap `due`:
     - Reminder → `notify::post(app, "home", "reminder", title, jam)`.
     - Sholat → `post(app, "home", "prayer", judul, jam)`, dengan judul = teks `notice.prayer` yang `{name}`-nya diganti nama sholat ("Waktu Ashar"). Lalu `at` masuk `fired` (simpan 20 terakhir).
     - Jam memakai format waktu bahasa yang berlaku (`%H.%M` atau `%H:%M`, `chrono::Local`).
  5. Reminder yang dikirim → `mark_notified` di `HomeState`. Ini dilakukan walau salurannya mati, supaya menyalakannya nanti tidak memunculkan reminder lama.
  6. `Condvar::wait_timeout(sleep_ms)`. `poke` membangunkannya lebih cepat.
- **Mac tidur:** jam monoton berhenti saat tidur, jadi batas 60 detik memastikan jadwal dicek ulang paling lambat semenit setelah bangun. Yang lewat lebih dari `LATE_MS` tidak dikirim.
- **Tidak ada lock** yang dipegang saat memanggil `post`.

- [ ] **Step 1: Tulis test yang gagal**

```rust
// schedule.rs
fn r(id: u64, at: Option<i64>) -> Reminder   // title "R{id}", day "2026-10-29", done false, notified false
#[test] fn a_reminder_fires_once_at_its_time() {
    // due(999, [r(1, Some(1000))]) kosong; due(1000, …) == [Due::Reminder { id 1, title "R1", at 1000 }];
    // dengan notified = true → kosong
}
#[test] fn events_older_than_ten_minutes_never_fire() {
    // at = now − LATE_MS → kosong; at = now − LATE_MS + 1 → ikut
}
#[test] fn done_or_timeless_reminders_never_fire()
#[test] fn a_prayer_fires_once() // PrayerTime { Dhuhr, at 5000 }: due(5000, [], [p], []) == [Due::Prayer(p)]; fired [5000] → kosong
#[test] fn events_come_out_in_time_order()   // reminder at 2000 dan sholat at 1500, now 2000 → [Prayer, Reminder]
#[test] fn sleeps_until_the_next_event_but_wakes_every_minute() {
    // berikutnya 5 detik lagi → 5_000; 2 jam lagi → 60_000; tidak ada → 60_000; 100 ms lagi → 1_000
}
// store.rs
#[test] fn module_text_reads_nested_keys() {
    // fake_bundle id.json modul a ditambah "notice":{"ping":"Ping {name}"} →
    // module_text("a", Lang::Id, "notice.ping") == Some("Ping {name}"); "notice.zzz" → None; modul "zzz" → None
}
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml -- home::schedule:: store::` → FAIL

- [ ] **Step 3: Implementasikan sesuai Interfaces dan aturan di atas**

- [ ] **Step 4: Jalankan semua test**

Run: `cargo test --manifest-path src-tauri/Cargo.toml` → PASS (+7)

- [ ] **Step 5: Commit**

`git add src-tauri/src modules/home/locales && git commit -m "feat(native): reminders and prayer times send notices on time"`

---

### Task 11: Telinga, pil, dan cahaya notifikasi di notch

**Files:**
- Modify:
  - `src/notch/controller.ts`, `src/notch/view.ts`, `src/notch/hit.ts`, `src/notch/notch.css`
  - `src/app.ts`, `src/bridge.ts`, `src/bridge-browser.ts`, `src/modules/types.ts`
  - `src/notch/test-helpers.ts`, `src/settings/bridge-browser.ts` (field `ModuleState` baru)
- Test: `src/notch/controller.test.ts`, `src/notch/view.test.ts`, `src/notch/hit.test.ts`, `src/app.test.ts`

**Interfaces:**
- Consumes: `NoticeDto`, `ModuleStateDto` baru, `clear_missed` (Task 8 dan 9).
- Produces:
```ts
// modules/types.ts
export interface Channel { id: string; name: string; on: boolean; sound: boolean }
export interface ModuleInfo { /* lama */ channels: Channel[] }
export interface ModuleState { /* lama */ notifications: { glow: boolean; seconds: number }; missed: string[] }
// bridge.ts
export interface Notice { moduleId: string | null; title: string; detail: string; glow: boolean; seconds: number }   // = NoticeDto
export interface Bridge { /* lama */ onNotice(cb: (n: Notice) => void): () => void; clearMissed(): Promise<void> }
// controller.ts
export type Phase = 'idle' | 'hover' | 'notify' | 'open' | 'closing';
export const EAR_W = 150;
export const NOTICE_PILL = { w: 300, h: 38 } as const;
export const NOTICE_FADE_MS = 140;
notify(durationMs: number): boolean;           // hanya dari idle atau hover
get noticeVisible(): boolean;
noticeSize(): { w: number; h: number };
// view.ts
export interface NoticeView { icon: string | null; title: string; detail: string; glow: boolean }
export interface PillItem { /* lama */ missed?: boolean }
export interface NotchView { /* lama */ setNotice(n: NoticeView | null): void; setMissed(on: boolean): void }
// app.ts
export const NOTICE_QUEUE_MAX = 5;
```

**Aturan controller:**
- **`notify(ms)`** dari `idle` atau `hover`:
  - Fase menjadi `notify` dan `panelVisible` true.
  - Kalau panel belum terlihat, mulai `pw`/`ph` seperti `click()`, tetapi `ph.v = 0`.
  - Timer `ms` → `noticeVisible` mati, lalu timer `NOTICE_FADE_MS` → kalau fase masih `notify`, fase menjadi `closing`.
  - Fase lain → `false`, tanpa perubahan.
- **Target selama `notify`:**
  - Notch: `{ W: 70, H: 0, s: 0, bx: 0, pw: notch.width + 2 × EAR_W, ph: notch.height }`.
  - Lensa: `{ W: 42, H: thickness, s: 0, bx: 0, pw: 300, ph: 38 }`.
  - `noticeSize()` mengembalikan `pw`/`ph` itu.
- **`noticeVisible`:** true selama fase `notify`, setelah `|pw − target| < 24` dan `|ph − target| < 8`, dan sebelum timer `ms` habis.
- **Interaksi:**
  - `click()` selama `notify` membatalkan kedua timer, lalu berjalan seperti biasa, jadi panel tumbuh dari ukuran telinga.
  - `pointer()` hanya mencatat hover. `escape()` dan `resignKey()` tidak berbuat apa-apa.
  - `needsFrames()` true selama `notify`.
- **`hitRects`** selama `notify`: satu kotak `{ x: CX − w/2 − 12, y: 0, w: w + 24, h: h + 4 }` dari `noticeSize()`, sehingga klik di telinga membuka panel lewat `onClick` yang sudah ada.

**Aturan view:**
- **Cahaya G2** (dari `notif-v1.html`):
  - `<defs>`:
    - `linearGradient` `userSpaceOnUse` dengan x1 −110, x2 110, `spreadMethod="reflect"`, dan stop #ff6ec4, #7873f5, #4adede, #ffd166,
    - filter `feGaussianBlur stdDeviation 3`.
    - ID diberi akhiran unik per `mountNotch`, karena pratinjau pengaturan juga memasangnya.
  - `<g class="notice-glow">` diletakkan sebelum path panel. Isinya dua path dengan `d` panel, `fill="none"`, stroke gradien:
    - satu `stroke-width` 5 dengan filter,
    - satu `stroke-width` 2.2 tanpa filter.
  - `glowA` mendekati target 1 (fase `notify` dan `glow`) atau 0, dengan laju `min(1, dt × 6)`. Grup dikosongkan saat `glowA ≤ 0.02`.
  - `gradientTransform = translate((t × 110) mod 440)`.
  - `tick` tetap meminta frame selama `glowA > 0.02`, walau controller sudah diam.
- **Telinga** (`.notch-notice`, `pointer-events: none`):
  - Isinya `.ear.l` (ikon) dan `.ear.r` (`.t1` judul, `.t2` keterangan).
  - Teks lewat `textContent`. `.ear.r` satu baris dengan "…".
  - Ikon: `.glyph` dengan `--icon` URL ikon modul, atau ikon lonceng tetap kalau `icon` null.
  - Posisi (OW = 640):

    | Layar | `.ear.l` kiri | `.ear.r` kiri | `.ear.r` lebar | tinggi |
    |---|---|---|---|---|
    | Notch | OW/2 − notch.width/2 − EAR_W + 14 | OW/2 + notch.width/2 + 12 | EAR_W − 24 | notch.height |
    | Lensa | OW/2 − 150 + 14 | OW/2 − 150 + 44 | 300 − 58 | 38 |

  - `.show` mengikuti `c.noticeVisible`. CSS: `transition: opacity .18s`, dan saat muncul ada `transition-delay .12s`.
  - Ukuran teks: `.t1` 12,5 px/500 putih, `.t2` 11,5 px `--g1` dengan jarak kiri 6 px.
- **Titik terlewat:**
  - `<circle class="missed-dot" r="2" fill="#fff">` di `cx 0`, `cy = notch ? notch.height + 5 : thickness + 4`.
  - Hanya terlihat saat `setMissed(true)` dan fase `idle`.
- **Pil:** `PillItem.missed` → kelas `missed` → titik putih 4 px di kanan atas ikon (`::before`). Titik aktif di bawah ikon tetap seperti biasa.

**Aturan app:**
- **`onNotice`:**
  - Masukkan ke antrean. Lebih dari `NOTICE_QUEUE_MAX` → buang yang paling lama. Lalu `pump()`.
- **`pump()`:**
  - Berjalan kalau tidak ada `showing`, fase `idle`/`hover`, dan antrean berisi.
  - Ambil yang terdepan sebagai `showing`, lalu `view.setNotice(...)`. Ikonnya `bridge.moduleUrl(id, icon)` kalau modulnya aktif, selain itu null.
  - Lalu `controller.notify(seconds × 1000)` dan `kick()`.
- **`onPhase`:**
  - `open`:
    - Kalau ada `showing`, dan modulnya aktif dan beda dari kartu sekarang → `useCard`, `renderPill`, dan `setLastCard`, sebelum `frames.show`.
    - Lalu `showing = null` dan `setNotice(null)`.
    - Kalau `state.missed` berisi → `bridge.clearMissed()`.
  - Kembali ke `idle`/`hover` dari `closing`: `showing = null`, `setNotice(null)`, lalu `pump()`.
- **`renderPill`:** item `missed` kalau id-nya ada di `state.missed`, dan `view.setMissed(state.missed.length > 0)`.
- **`tauriBridge`:** `onNotice` lewat `win.listen('notching://notice')`, dan `clearMissed` lewat `invoke('clear_missed')`.
- **`browserBridge`:**
  - `?notice=1` mengirim contoh 1 detik setelah dimuat, dan tombol `n` mengirim contoh lagi.
  - Isi contoh: modul `home`, "Kirim invoice", "14.00", `glow` true, 3,5 detik.
  - `clearMissed` mengosongkan `missed`.
- **Test helper:** `TEST_STATE` mendapat `notifications: { glow: true, seconds: 3.5 }` dan `missed: []`, dan `moduleInfo` mendapat `channels: []`. `fakeBridge` mendapat `onNotice`, `emitNotice`, dan `clearMissed`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
// controller.test.ts
test('a notice grows ears beside the notch, then folds back', () => {
  const c = ctl({ width: 190, height: 32 });
  expect(c.notify(3500)).toBe(true); expect(c.phase).toBe('notify');
  frames(c, 120);
  expect(c.targets().pw).toBe(190 + 2 * EAR_W); expect(c.targets().ph).toBe(32); expect(c.noticeVisible).toBe(true);
  timers.advance(3500); expect(c.noticeVisible).toBe(false); expect(c.phase).toBe('notify');
  timers.advance(NOTICE_FADE_MS); expect(c.phase).toBe('closing');
  frames(c, 240); expect(c.phase).toBe('idle'); expect(c.panelVisible).toBe(false); });
test('without a notch the lens opens into a small pill', () => {
  const c = ctl(null); c.notify(3500); frames(c, 120);
  expect(c.noticeSize()).toEqual({ w: 300, h: 38 }); expect(c.targets().pw).toBe(300); expect(c.noticeVisible).toBe(true); });
test('no notice while the panel is open', () => { const c = ctl(null); c.click(); expect(c.notify(3500)).toBe(false); expect(c.phase).toBe('open'); });
test('clicking a notice opens the panel and keeps it open', () => {
  const c = ctl(null); c.notify(3500); frames(c, 60); c.click(); timers.advance(5000);
  expect(c.phase).toBe('open'); });
test('a notice keeps the frame loop running', () => { const c = ctl(null); c.notify(3500); frames(c, 600); expect(c.needsFrames()).toBe(true); });
// hit.test.ts
test('a notice catches clicks on its ears', () => {
  const c = ctl({ width: 190, height: 32 }); c.notify(3500);
  expect(hitRects(c, null)).toEqual([{ x: 320 - 245 - 12, y: 0, w: 490 + 24, h: 36 }]); });
// view.test.ts
test('the notice shows its icon, title and detail as text', () => {
  // setNotice({ icon: 'mod://home/icon.svg', title: '<b>Kirim</b>', detail: '14.00', glow: true }); notify; runAll
  // → .notch-notice.show; .t1 textContent '<b>Kirim</b>', tidak ada <b>; .t2 '14.00'; .glyph --icon memuat 'mod://home/icon.svg'
});
test('the glow appears with the notice and fades after it', () => {
  // notify + kick + runAll(60) → .notice-glow berisi 2 path; timers.advance(3640) + runAll(600) → kosong dan r.pending() === 0
});
test('no glow when it is switched off', () => { /* glow false → .notice-glow tetap kosong */ });
test('the missed dot shows only while idle', () => { /* setMissed(true) → .missed-dot terlihat; click → tersembunyi */ });
test('a pill icon wears the missed dot', () => { /* setPill([{ …, missed: true }], …) → .ic.missed */ });
// app.test.ts
test('a notice shows on this notch', async () => {
  // emitNotice({ moduleId: 'home', title: 'Kirim invoice', detail: '14.00', glow: true, seconds: 3.5 })
  // → controller.phase 'notify'; .ear.r memuat 'Kirim invoice'
});
test('a notice waits while the panel is open', async () => {
  // open(app, r); emitNotice → phase tetap 'open'; escape + runAll(600) → phase 'notify'
});
test('several notices take turns', async () => {
  // dua emitNotice → yang pertama tampil; timers.advance(3640) + runAll(600) → .ear.r memuat judul kedua
});
test('clicking a notice opens its module card', async () => {
  // lastCard 'system-stat'; notice moduleId 'home'; controller.click() + runAll + timers → iframe src memuat 'home'; setLastCard('home')
});
test('opening the panel clears the missed dots', async () => {
  // state missed ['home'] → .notch-pill .ic[data-id=home].missed ada; open → clearMissed dipanggil sekali
});
test('the queue keeps the five newest', async () => {
  // panel terbuka; tujuh notice; tutup → urutan tampil judul 3, 4, 5, 6, 7
});
```
Badan test yang hanya berupa komentar ditulis dari komentar itu.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/notch src/app.test.ts` → FAIL

- [ ] **Step 3: Implementasikan sesuai Interfaces dan aturan di atas**

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx tsc --noEmit && npm test` → PASS

- [ ] **Step 5: Commit**

`git add src/notch src/app.ts src/app.test.ts src/bridge.ts src/bridge-browser.ts src/modules/types.ts src/settings/bridge-browser.ts && git commit -m "feat(notch): notice ears and pill with the G2 glow, a queue, and missed dots"`

---

### Task 12: Halaman Notifikasi dan saklar notifikasi sholat, lalu cek di browser bersama pemilik

**Files:**
- Create: `src/settings/pages/notifications.ts`
- Modify:
  - `src/settings/pages/info.ts` (`notificationsPage` lama dihapus), `src/settings/pages/home.ts`, `src/settings/shell.ts` (daftar `PAGES`)
  - `src/settings/types.ts`, `src/settings/search.ts`
  - `src/settings/bridge-tauri.ts`, `src/settings/bridge-browser.ts`, `src/settings/test-helpers.ts`
  - `src/settings/settings.css`, `src/i18n/id.json`, `src/i18n/en.json`
- Test: `src/settings/pages/notifications.test.ts`, `src/settings/pages/home.test.ts`, `src/settings/search.test.ts`

**Interfaces:**
- Consumes: `Channel`, `ModuleState.notifications` (Task 11), perintah Task 8 dan 9.
- Produces:
```ts
// settings/types.ts
export interface SettingsBridge { /* lama */
  setNoticeGlow(on: boolean): Promise<void>;
  setNoticeSeconds(seconds: number): Promise<void>;
  setChannel(module: string, channel: string, pref: { on: boolean; sound: boolean }): Promise<void>;
  sendSampleNotice(title: string, detail: string): Promise<void>;
}
// settings/pages/notifications.ts
export const NOTICE_SECONDS = { min: 2, max: 8, step: 0.5 } as const;
export const notificationsPage: PageRender;
```

**Teks `settingsWindow.notifications`** (`sub` lama diganti, `note` lama dihapus):

| Kunci | `id.json` | `en.json` |
|---|---|---|
| `sub` | Hanya dari modul Notching. Tidak dari app lain. | Only from Notching's modules. Never from other apps. |
| `glow` | Cahaya pelangi | Rainbow glow |
| `glowHint` | Pinggiran notch menyala saat ada notifikasi. | The notch's edge lights up for a notice. |
| `seconds` | Lama tampil | Show for |
| `secondsValue` | {n} dtk | {n} s |
| `sample` | Kirim contoh | Send a sample |
| `sampleTitle` | Contoh notifikasi | Sample notice |
| `sampleDetail` | Begini tampilnya. | This is how it looks. |
| `kinds` | Jenis notifikasi | Kinds of notices |
| `show` | Tampil | Show |
| `sound` | Suara | Sound |
| `none` | Belum ada modul yang memberi notifikasi. | No module sends notices yet. |
| `home.prayerNotice` | Notifikasi waktu sholat | Prayer time notices |
| `home.prayerNoticeHint` | Tanpa suara, kecuali kamu menyalakannya di Notifikasi. | Silent unless you turn sound on in Notifications. |
| `keywords.glow` | cahaya pelangi glow warna | glow rainbow light |
| `keywords.seconds` | lama durasi detik tampil | duration seconds time |
| `keywords.channels` | notifikasi suara bunyi reminder sholat | notification sound reminder prayer |

`home.prayerNotice` dan `home.prayerNoticeHint` ada di bawah kunci `home`, dan `keywords.*` di bawah `keywords`.

**Aturan:**
- **`notificationsPage`:**
  - `head({ title: sections.notifications, sub })`.
  - `group` pertama:
    - `toggle('notifications.glow')` dengan hint `glowHint` → `setNoticeGlow`.
    - `slider('notifications.seconds')` 2–8, langkah 0,5. `format` memakai `fill(secondsValue, { n })`, dengan `n` berformat `Intl.NumberFormat(lang)` ("3,5 dtk" / "3.5 s"). Simpan saat `change` → `setNoticeSeconds`.
    - `button('notifications.sample', sample, …, true)` → `sendSampleNotice(sampleTitle, sampleDetail)`.
  - Lalu label `kinds` dan satu `group` berisi satu `row` per saluran, untuk setiap modul terpasang yang punya saluran, dalam urutan katalog:
    - `key` = `channel.<modul>.<id>`, label = nama saluran, hint = nama modul.
    - Kontrolnya dua saklar: `channel.<modul>.<id>.on` (`aria-label` "Tampil") dan `.sound` (`aria-label` "Suara").
    - Di atas grup ada baris kepala kecil Space Mono berisi `show` dan `sound` yang sejajar dengan saklarnya.
    - Saklar suara nonaktif kalau `on` mati.
    - Ubah → `save(key, setChannel(modul, id, { on, sound }))`.
  - Tidak ada saluran → `.note` `none`.
- **Beranda:** `homeSettings` mendapat `row('home.prayerNotice')` setelah metode, dengan hint `prayerNoticeHint`. Saklarnya mengikuti saluran `home.prayer` → `setChannel('home', 'prayer', { on, sound })`.
- **`searchIndex`:**
  - Baris `notifications.glow` dan `notifications.seconds` di bagian Notifikasi.
  - Satu entri `channel.<modul>.<id>` per saluran: label nama saluran, `where` judul Notifikasi, kata kunci `keywords.channels`.
  - `home.prayerNotice` di bawah Beranda.
- **Bridge:**
  - `tauriSettingsBridge`: `invoke('set_notice_glow', { on })`, `invoke('set_notice_seconds', { seconds })`, `invoke('set_channel', { module, channel, on, sound })`, `invoke('send_sample_notice', { title, detail })`.
  - `browserSettingsBridge` mengubah state di memori. `sendSampleNotice` → `console.info`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
// notifications.test.ts — STATE: home dengan channels [{ id 'reminder', name 'Reminder', on true, sound true },
//                                                     { id 'prayer', name 'Waktu sholat', on false, sound false }]
test('glow, duration and the sample', async () => {
  // klik notifications.glow → setNoticeGlow(false); teks memuat '3,5 dtk';
  // slider value '5' + change → setNoticeSeconds(5); klik notifications.sample → sendSampleNotice('Contoh notifikasi', 'Begini tampilnya.')
});
test('each kind has a show and a sound switch', async () => {
  // baris 'Reminder' dan 'Waktu sholat', masing-masing dengan hint 'Beranda';
  // klik channel.home.prayer.on → setChannel('home', 'prayer', { on: true, sound: false })
});
test('sound waits for the kind to be on', async () => { /* channel.home.prayer.sound disabled; channel.home.reminder.sound tidak */ });
test('without kinds it says so', async () => { /* semua channels [] → 'Belum ada modul yang memberi notifikasi.' */ });
test('English seconds', async () => { /* lang en → '3.5 s' */ });
// home.test.ts
test('the Beranda page has the prayer notification switch', async () => {
  // [data-key="home.prayerNotice"] aria-checked 'false'; klik → setChannel('home', 'prayer', { on: true, sound: false })
});
// search.test.ts
test('finds the glow and the notice kinds', () => {
  expect(search(idx(), 'cahaya')[0].key).toBe('notifications.glow');
  expect(search(idx(), 'waktu sholat').map(e => e.key)).toContain('channel.home.prayer'); });
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/settings src/i18n` → FAIL

- [ ] **Step 3: Tulis teks, lalu implementasikan sesuai Interfaces dan aturan di atas**

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx tsc --noEmit && npm test` → PASS

- [ ] **Step 5: Cek di browser bersama pemilik**

Run: `npm run dev`, lalu buka:
- `http://localhost:1420/?notch=1&notice=1`,
- `http://localhost:1420/?notice=1`,
- `http://localhost:1420/settings.html`, lalu Notifikasi dan Modul → Beranda.

Minta pemilik melihat dan melaporkan:
1. **Dengan notch:** telinga kiri berisi ikon Beranda putih, telinga kanan berisi "Kirim invoice 14.00". Pinggirannya bercahaya pelangi yang bergerak. Setelah sekitar 3,5 detik semuanya kembali.
2. **Tanpa notch:** lensa membuka menjadi pil kecil dengan isi yang sama.
3. Tekan `n` beberapa kali → notifikasi tampil bergantian. Klik telinga → panel terbuka di kartu Beranda.
4. **Halaman Notifikasi:** cahaya, lama tampil, Kirim contoh, dan dua jenis notifikasi Beranda dengan saklar Tampil dan Suara.
5. Saklar "Notifikasi waktu sholat" di halaman Beranda.
6. Teks di tabel.

Pemilik yang memutuskan semua soal tampilan dan teks. Terapkan perubahan yang diminta, jalankan test lagi, lalu cek ulang bersama pemilik. Catat di pesan commit bahwa pemilik sudah menyetujui.

- [ ] **Step 6: Commit**

`git add src/settings src/i18n && git commit -m "feat(settings): Notifications page and the prayer notice switch"`

---

### Task 13: Cek Bagian B di perangkat, lalu verifikasi akhir

**Files:**
- Modify: `docs/superpowers/verification/2026-10-29-notching-4-beranda-notifications.md`, bagian "B. Notifikasi"

- [ ] **Step 1: Jalankan semua test dan catat jumlahnya**

Run: `npx tsc --noEmit && npm test && npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml` → semua PASS. Catat jumlahnya.

- [ ] **Step 2: Cek bersama pemilik di `npm run tauri dev`**

Minta pemilik mencoba dan melaporkan:
1. **Contoh notifikasi:**
   - Klik "Kirim contoh" dengan jendela pengaturan di layar MacBook → telinga di samping notch, cahaya pelangi, dan bunyi "Glass".
   - Pindahkan jendela ke monitor, lalu kirim lagi → pil kecil di monitor.
2. Matikan cahaya → tanpa cahaya. Lama tampil 6 dtk → lebih lama. Kembalikan ke bawaan.
3. **Reminder:**
   - Buat reminder 2 menit lagi. Saat waktunya, notifikasi muncul di layar yang ada kursornya, dengan bunyi.
   - Klik telinganya → kartu Beranda terbuka.
4. Dua reminder di menit yang sama → tampil bergantian.
5. Panel sedang terbuka saat reminder jatuh tempo → notifikasi muncul setelah panel ditutup.
6. **Terlewat:**
   - Buat reminder 3 menit lagi, lalu jangan sentuh Mac lebih dari 2 menit sampai lewat waktunya.
   - Saat kembali, ada titik putih di bawah notch dan di ikon Beranda di pil. Buka panel → kedua titik hilang.
   - Ulangi dengan video Safari layar penuh di layar itu → titik juga muncul.
7. Saklar Tampil reminder dimatikan → reminder berikutnya tidak muncul. Saklar Suara dimatikan → muncul tanpa bunyi. Kembalikan.
8. **Sholat:** nyalakan "Notifikasi waktu sholat". Pemilik melaporkan di waktu sholat berikutnya: notifikasi "Waktu Ashar 14.53" (sesuai kotanya) tanpa bunyi.
9. Cmd+Q, lalu jalankan lagi → reminder yang sudah memberi notifikasi tidak muncul lagi.
10. **Perilaku lama:** hover, buka-tutup panel, Esc, klik di luar, menu bar dekat tengah, slider di pengaturan, dan Beranda.

- [ ] **Step 3: Cek oleh pelaksana**

- **CPU,** 10 sampel per keadaan:
  - diam tanpa notifikasi, 60 detik → semua di bawah 1,0 (penjadwal bangun sekali semenit);
  - selama notifikasi dengan cahaya → catat angkanya, tanpa batas keras;
  - 10 detik setelah notifikasi selesai → di bawah 1,0.
- **Build rilis:** jalankan `npm run tauri build -- --bundles app`, catat ukuran `Notching.app` dan `dist/assets`. Pemilik membuka `.app`-nya lalu menekan "Kirim contoh". Bunyi dan cahaya harus jalan di build rilis.

- [ ] **Step 4: Tulis bagian B di file verifikasi**

Isi: jumlah test, ukuran, CPU, checklist 1–10 di atas dengan catatan "Dilaporkan pemilik", dan temuan. Perbaiki temuan dengan `superpowers:systematic-debugging`, lalu ulangi langkah yang gagal.

- [ ] **Step 5: Commit**

`git add docs/superpowers/verification/2026-10-29-notching-4-beranda-notifications.md && git commit -m "docs: verification notes for notifications"`

Merge ke `main` hanya setelah pemilik memintanya. Setelah merge, minta pemilik meminta sesi induk memasang ulang `/Applications/Notching.app`.
