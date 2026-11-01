#!/bin/bash
# Builds Cleaner's sample folder (design 1 Nov §11): a fake home and app folder
# with caches, logs, leftovers, a sample app, and baits Cleaner must never touch.
# Notching started with NOTCHING_CLEANER_ROOT=<this folder> sees only this.
#
#   scripts/cleaner-cek.sh [ROOT]        (default ~/cleaner-cek)
#
# An existing ROOT is rebuilt only if this script made it (the .cleaner-cek mark).
set -euo pipefail

ROOT="${1:-$HOME/cleaner-cek}"
MARK=".cleaner-cek"
case "$ROOT" in
  /*) ;;
  *) echo "cleaner-cek: ROOT must be an absolute path" >&2; exit 1 ;;
esac
if [ -e "$ROOT" ]; then
  if [ ! -f "$ROOT/$MARK" ]; then
    echo "cleaner-cek: $ROOT exists and is not a sample folder; nothing done" >&2
    exit 1
  fi
  rm -rf "$ROOT"
fi

H="$ROOT/home"
L="$H/Library"
mkdir -p "$ROOT" "$ROOT/Applications"
touch "$ROOT/$MARK"

bytes() { # bytes FILE KB
  mkdir -p "$(dirname "$1")"
  head -c "$(( $2 * 1024 ))" /dev/urandom > "$1"
}
old() { # old PATH DAYS: the path and everything in it, that many days ago
  local t
  t="$(date -v-"$2"d +%Y%m%d%H%M)"
  find "$1" -exec touch -h -t "$t" {} +
}

# Caches, logs and developer caches (ticked when the list opens).
bytes "$L/Caches/com.contoh.editor/cache.db" 2048
bytes "$L/Caches/Google/Chrome/Default/Cache/data_0" 1024
bytes "$L/Caches/Homebrew/downloads/x.tar.gz" 1024
bytes "$L/Logs/com.contoh.editor/a.log" 64
bytes "$L/Developer/Xcode/DerivedData/Proyek-abc/Build/x.o" 512
bytes "$H/.npm/_cacache/index-v5/x" 256

# Leftovers of an app that is gone: one old enough, one too new.
bytes "$L/Caches/com.contoh.yatim/x" 128
bytes "$L/Saved Application State/com.contoh.yatim.savedState/data.data" 8
old "$L/Caches/com.contoh.yatim" 40
old "$L/Saved Application State/com.contoh.yatim.savedState" 40
bytes "$L/Caches/com.contoh.baru/x" 128

# Unticked rows: build folders, an installer, an iPhone backup, the Trash.
mkdir -p "$H/dev/proyek" "$H/dev/rust"
echo '{ "name": "proyek" }' > "$H/dev/proyek/package.json"
bytes "$H/dev/proyek/node_modules/x/index.js" 256
printf '[package]\nname = "rust"\n' > "$H/dev/rust/Cargo.toml"
bytes "$H/dev/rust/target/debug/rust" 512
bytes "$H/Downloads/Installer Contoh.dmg" 300
BACKUP="$L/Application Support/MobileSync/Backup/0000-COBA"
mkdir -p "$BACKUP"
cat > "$BACKUP/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Device Name</key><string>iPhone Coba</string>
  <key>Last Backup Date</key><date>2026-03-02T09:00:00Z</date>
</dict></plist>
PLIST
bytes "$BACKUP/Manifest.db" 256
bytes "$H/.Trash/sampah.txt" 16

# The sample app: it shows a dialog while open, so "Tutup … dulu" can be tried.
APP="$ROOT/Applications/Coba Cleaner.app"
/usr/bin/osacompile -o "$APP" -e 'display dialog "Coba Cleaner sedang berjalan" buttons {"Tutup"} default button 1'
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.contoh.cobacleaner" "$APP/Contents/Info.plist" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string com.contoh.cobacleaner" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleName Coba Cleaner" "$APP/Contents/Info.plist" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :CFBundleName string Coba Cleaner" "$APP/Contents/Info.plist"
bytes "$L/Preferences/com.contoh.cobacleaner.plist" 4
bytes "$L/Application Support/Coba Cleaner/data.json" 32
bytes "$L/Containers/com.contoh.cobacleaner/Data/x" 64

# Baits: none of these may change.
mkdir -p "$H/.claude" "$H/Documents/proyek/node_modules" "$L/Cookies" "$L/Application Support/Coba"
echo "memori penting" > "$H/.claude/memory.md"
echo "dokumen penting" > "$H/Documents/penting.txt"
echo '{ "name": "dok" }' > "$H/Documents/proyek/package.json"
echo "jangan dihapus" > "$H/Documents/proyek/node_modules/x.js"
echo "cookie" > "$L/Cookies/Cookies.binarycookies"
echo "app lain" > "$L/Application Support/Coba/x.txt"
ln -s ../../../Documents/penting.txt "$L/Caches/com.contoh.editor/tautan"

# Checksums of every file, to compare after a try (shasum -c).
( cd "$ROOT" && find . -type f ! -name checksums-before.txt ! -name "$MARK" -print0 | xargs -0 shasum > checksums-before.txt )

cat <<EOF
Folder contoh siap: $ROOT
Buka Notching dalam mode coba:
  open -n /Applications/Notching.app --env NOTCHING_CLEANER_ROOT="$ROOT"
Setelah dicoba, cek umpan:
  cd "$ROOT" && shasum -c checksums-before.txt 2>/dev/null | grep -v ': OK'
EOF
