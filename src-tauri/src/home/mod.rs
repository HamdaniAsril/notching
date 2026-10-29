//! Beranda: its settings live in settings.json; its data lives here.

pub mod prayer;
pub mod weather;

/// Writes a temporary file and renames it over the old one, so a crash mid-write
/// never leaves half a file.
pub(crate) fn write_atomic(path: &std::path::Path, text: &str) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text)?;
    std::fs::rename(&tmp, path)
}
