# Rencana: tombol Atur jendela bisa diganti

Spec: `docs/superpowers/specs/2026-11-04-tombol-atur-jendela-design.md`. TDD per langkah; `cargo test --lib` dan `npm test` hijau sebelum commit.

1. **`win_rules.rs`** — `WindowKeys` (sembilan `Combo`, serde camelCase per sel, sel hilang → bawaan), `get`, `cell_of`, `is_default`, `set_key(keys, cell, combo, shot: Option<ShotKeys>) -> Result<WindowKeys, WinKeyError>` (invalid / duplicate{cell} / shot). Tes dulu.
2. **`settings.rs` + `app_core.rs`** — field `window_keys` (lenient), `window_keys()` / `set_window_keys()`, uninstall `window-keys` mengembalikan bawaan. Tes dulu.
3. **`win_service.rs`** — daftar dari tombol tersimpan, `window_keys` memberi label dari tombol tersimpan, perintah `window_set_key`, `window_reset_keys`, `hold(bool)`, `restore()` saat Pengaturan ditutup, `holds(app, combo)` pengganti `is_grid_key`.
4. **`shot_hotkey.rs`** — `shot_set_key` menolak tombol Atur jendela yang tersimpan; `shot_keys_hold` dan `settings_closed` ikut melepas/memasang tombol Atur jendela. Daftarkan perintah di `lib.rs`.
5. **UI** — `types.ts`, `bridge-tauri.ts`, `bridge-browser.ts`, `test-helpers.ts`: `windowSetKey`, `windowResetKeys`. `modules.ts windowSettings`: kotak jadi tombol, alur rekam seperti `screenshotKeys`, pesan di bawah grid, reset. i18n id/en. CSS kotak merekam dan label lengkap. Tes `modules.test.ts` dulu.
6. Tinjau diff, commit lokal di main, build uji untuk pemilik, dokumen verifikasi setelah dicoba.
