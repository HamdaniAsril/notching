import type { Lang } from '../kit/protocol';

// What changed in each version, newest first, for Yang baru (owner, 4 Nov).
// Kept in the app, so the page needs no network. A version with no date is not
// released yet: add its date when it ships, and the next one on top.
export interface ChangelogEntry {
  version: string;
  date: string | null; // "2026-11-03"
  items: Record<Lang, string[]>;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.1.5',
    date: null,
    items: {
      id: [
        'Fokus jendela (pasang dari Katalog): tekan ⌃⌥F dan semua yang di belakang jendelamu jadi blur. Fokus ikut pindah saat kamu berganti jendela atau mengklik jendela yang ter-blur. Setiap monitor punya fokus sendiri, dan ⌃⌥⇧F atau ⇧-klik menambah jendela kedua.',
        'Intip di Fokus jendela: arahkan kursor ke jendela yang ter-blur untuk melihat isinya, utuh atau bagian atasnya saja. Atur di pengaturan modul, termasuk Gelapkan dan Animasi intip. Intip butuh izin Rekaman Layar & Audio Sistem.',
        'Agent AI (pasang dari Katalog): Claude Code, Codex, dan OpenCode terlihat di samping notch dengan logonya masing-masing, mana yang sedang bekerja (Working...), menunggu kamu, atau sudah selesai. Notifikasinya juga memakai logo agent. Hubungkan tiap agent di pengaturan modul.',
        'Kecerahan (pasang dari Katalog): atur kecerahan setiap layar dari notch, termasuk monitor eksternal. Monitor yang menerima DDC diatur lampunya; yang tidak, diredupkan lewat warna.',
        'Volume app (pasang dari Katalog): kecilkan satu app dari notch tanpa mengubah app lain. Levelnya diingat per app. Butuh izin Rekam Audio Sistem.',
        'Volume utama di kartu Volume app: atur volume Mac, bisukan dengan tombol speaker, dan pindahkan suara ke speaker lain (laptop, monitor, Bluetooth, AirPlay) lewat nama speakernya.',
        'Musik di samping notch bisa dimatikan di Pengaturan › Tampilan notch. Widget Musik tetap jalan.',
      ],
      en: [
        'Window focus (install it from the Catalog): press ⌃⌥F and everything behind your window blurs. Focus follows you when you switch windows or click a blurred one. Every screen has its own focus, and ⌃⌥⇧F or ⇧-click adds a second window.',
        'Peek in Window focus: point at a blurred window to see it, whole or just its top. Set it in the module’s settings, along with Darken and Peek animation. Peek needs Screen & System Audio Recording.',
        'AI agents (install it from the Catalog): Claude Code, Codex, and OpenCode show beside the notch with their own logos, working (Working...), waiting for you, or done. Their notices carry the agent’s logo too. Connect every agent in the module’s settings.',
        'Brightness (install it from the Catalog): set every screen’s brightness from the notch, external monitors too. A monitor that takes DDC has its backlight set; one that doesn’t is dimmed through its colours.',
        'App volume (install it from the Catalog): turn one app down from the notch without touching the others. Levels are remembered per app. Needs System Audio Recording.',
        'Main volume on the App volume card: set the Mac’s volume, mute with the speaker button, and send the sound to another speaker (laptop, monitor, Bluetooth, AirPlay) from its name.',
        'Music beside the notch can be switched off in Settings › Notch look. The Musik widgets keep working.',
      ],
    },
  },
  {
    version: '0.1.4',
    date: '2026-11-07',
    items: {
      id: [
        'Shelf terbuka begitu kamu mulai menyeret file, dari mana saja. Bisa dimatikan di pengaturan Shelf.',
        'Panel tembus pandang pindah ke Tampilan notch, dan preview-nya langsung ikut berubah.',
        'Intip jendela (pasang dari Katalog): arahkan kursor ke ikon Dock untuk melihat semua jendela app, termasuk yang di-minimize, klik ikon Dock untuk me-minimize atau memunculkan semuanya, dan ⌘Tab menampilkan semua jendela, termasuk yang di-minimize.',
        'Liquid glass di Intip jendela kini kaca buatan Notching: bening, dengan blur dan pembiasan di tepinya.',
        'Lebih hemat saat diam: halaman yang tersembunyi tidak lagi menggambar terus-menerus.',
        'Saat izin dicabut, Notching langsung melepas pintasan keyboard dan mouse-nya.',
        'Nama izin mengikuti System Settings di Mac-mu.',
      ],
      en: [
        'Shelf opens as soon as you start dragging a file, from anywhere. Turn it off in Shelf’s settings.',
        'See-through panel moved to Notch look, and its preview follows at once.',
        'Window peek (install it from the Catalog): point at a Dock icon to see every window of the app, minimized ones too, click the icon to minimize or bring them all back, and ⌘Tab shows every window, minimized ones too.',
        'Liquid glass in Window peek is now Notching’s own glass: clear, with blur and refraction at the edges.',
        'Lighter at rest: hidden pages no longer keep redrawing.',
        'When a permission is taken away, Notching lets go of its keyboard and mouse shortcuts at once.',
        'Permissions are named the way your Mac’s System Settings names them.',
      ],
    },
  },
  {
    version: '0.1.3',
    date: '2026-11-04',
    items: {
      id: [
        'Ikon app baru: simbol nøtching.',
        'Katalog: semua modul dan paket widget bawaan, bisa dipasang dan dicopot.',
        'System stat baru: grafik, app teratas, suhu, jaringan, dan penyimpanan.',
        'Pintasan: semua tombol pintas di satu menu, ditambah ⌃⌥K untuk Keep awake dan ⌃⌥V untuk Shelf.',
        'Potong file: ⌘X dan ⌘V memindah file di Finder.',
        'Atur jendela: ⌃⌥ dengan panah dan tanda baca menata jendela, ⌃⌥↩ memenuhi layar.',
        'Modul dikelompokkan per kategori.',
        'Pengaturan: mode terang atau gelap, panel notch bisa dibuat hitam penuh, dan preview notch dengan widget Beranda.',
        'Update dari dalam app, dicek otomatis sehari sekali.',
        'Copot Notching: lepas semua izin, atau hapus Notching sepenuhnya ke Trash.',
        'Penggaris Cermin berbunyi, daftar Clean uninstall bisa digulir, dan halaman Izin lebih rapi.',
      ],
      en: [
        'A new app icon: the nøtching symbol.',
        'Catalog: every built-in module and widget pack, to install and remove.',
        'A new System stat: charts, top apps, heat, network and storage.',
        'Shortcuts: every key in one place, plus ⌃⌥K for Keep awake and ⌃⌥V for Shelf.',
        'Cut files: ⌘X and ⌘V move files in Finder.',
        'Arrange windows: ⌃⌥ with arrows and punctuation places windows, ⌃⌥↩ fills the screen.',
        'Modules grouped by category.',
        'Settings: light or dark, a solid black notch panel if you like, and a notch preview with your Home widgets.',
        'Updates from inside the app, checked once a day.',
        'Uninstall: release every permission, or move Notching to the Trash completely.',
        'Mirror’s rulers tick, the Clean uninstall list scrolls, and a tidier Permissions page.',
      ],
    },
  },
  {
    version: '0.1.2',
    date: '2026-11-03',
    items: {
      id: [
        'Warna aksen: pilih warna untuk notch dan Pengaturan.',
        'Tombol Screenshot bisa diganti, dengan pemberitahuan saat tombolnya masih dipakai Mac.',
        'Penggaris Timer berbunyi saat diputar.',
      ],
      en: [
        'Accent colour: pick one for the notch and Settings.',
        'Screenshot’s keys can be changed, with a notice when the Mac still uses them.',
        'Timer’s ruler ticks as it turns.',
      ],
    },
  },
  {
    version: '0.1.1',
    date: '2026-11-03',
    items: {
      id: ['Ditandatangani Developer ID dan dinotarisasi Apple, jadi langsung bisa dibuka.'],
      en: ['Signed with a Developer ID and notarized by Apple, so it opens right away.'],
    },
  },
  {
    version: '0.1.0',
    date: '2026-11-03',
    items: {
      id: ['Rilis pertama: 8 modul dan 25 widget. Gratis, open source, tanpa pelacakan.'],
      en: ['The first release: 8 modules and 25 widgets. Free, open source, no tracking.'],
    },
  },
];
