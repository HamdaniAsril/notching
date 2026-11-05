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
    version: '0.1.4',
    date: null,
    items: {
      id: [
        'Shelf terbuka begitu kamu mulai menyeret file, dari mana saja. Bisa dimatikan di pengaturan Shelf.',
        'Panel tembus pandang pindah ke Tampilan notch, dan preview-nya langsung ikut berubah.',
      ],
      en: [
        'Shelf opens as soon as you start dragging a file, from anywhere. Turn it off in Shelf’s settings.',
        'See-through panel moved to Notch look, and its preview follows at once.',
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
