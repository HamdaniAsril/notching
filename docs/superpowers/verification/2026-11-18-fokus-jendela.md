# Verifikasi Fokus jendela

Tanggal: 18 November 2026. Cabang `fokus-jendela`.

## Uji pertama (rencana Task 1, desain bagian 8)

Skrip AppKit buang-pakai (`spike.swift`, tidak di-commit): panel transparan berisi `NSVisualEffectView` (`behindWindow`, `fullScreenUI`, `active`, gelap), level normal, diurutkan dengan `order(.below, relativeTo:)` di bawah jendela teratas app lain. Mac pemilik, macOS 27.2, Apple Silicon.

1. **Panel tepat di bawah jendela app lain: lulus.** Daftar jendela window server selama uji: `Claude > [LAPISAN] > Arc > warust > System Settings`, tetap sama sampai uji selesai.
2. **Jendela app lain ter-blur, bukan hanya desktop: lulus.** Dilihat pemilik ("semua aman").
3. **Lubang intipan bergradasi halus: lulus.** Dilihat pemilik. Pemilik meminta yang jelas hanya **sepertiga atas** jendela, bukan setengah. Desain dan aturan (`PEEK_CLEAR`) diubah.
4. **Dua jendela dari dua app (AXRaise): belum diuji.** Proses skrip tidak punya izin Aksesibilitas. Diuji di dalam Notching, yang punya izin itu, pada uji di Mac (rencana Task 9).

Skrip tidak bisa memotret layar (tanpa izin Screen Recording), jadi nomor 2 dan 3 dinilai dari mata pemilik.
