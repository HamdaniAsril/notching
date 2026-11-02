//! Each package's own small settings: one JSON object per module id (the `prefs`
//! capability). The file is named by the calling module, never by its arguments.

use std::path::PathBuf;

use crate::modules::manifest::is_module_id;

/// Largest serialized prefs object a module may store.
pub const PREFS_MAX: usize = 16 * 1024;

pub struct Prefs {
    dir: PathBuf,
}

pub struct PrefsState(pub Prefs);

impl Prefs {
    pub fn new(dir: PathBuf) -> Self {
        Prefs { dir }
    }

    /// `{}` when the file is missing, unreadable or not an object. A module id that
    /// is not valid reads as `{}` and never touches the disk.
    pub fn read(&self, module: &str) -> serde_json::Value {
        let empty = || serde_json::json!({});
        if !is_module_id(module) {
            return empty();
        }
        std::fs::read_to_string(self.dir.join(format!("{module}.json")))
            .ok()
            .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
            .filter(|v| v.is_object())
            .unwrap_or_else(empty)
    }

    pub fn write(&self, module: &str, value: &serde_json::Value) -> Result<(), String> {
        if !is_module_id(module) {
            return Err("bad module id".to_string());
        }
        if !value.is_object() {
            return Err("prefs must be an object".to_string());
        }
        let text = serde_json::to_string(value).map_err(|e| e.to_string())?;
        if text.len() > PREFS_MAX {
            return Err("prefs too large".to_string());
        }
        crate::home::write_atomic(&self.dir.join(format!("{module}.json")), &text).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn prefs() -> (tempfile::TempDir, Prefs) {
        let d = tempfile::tempdir().unwrap();
        let p = Prefs::new(d.path().join("widget-prefs"));
        (d, p)
    }

    #[test]
    fn read_missing_is_empty_object() {
        let (_d, p) = prefs();
        assert_eq!(p.read("paket"), serde_json::json!({}));
    }

    #[test]
    fn write_then_read() {
        let (_d, p) = prefs();
        let v = serde_json::json!({ "start": "08:00", "n": 3 });
        p.write("paket", &v).unwrap();
        assert_eq!(p.read("paket"), v);
        // Another module's prefs are separate.
        assert_eq!(p.read("other"), serde_json::json!({}));
    }

    #[test]
    fn a_broken_file_reads_empty() {
        let (_d, p) = prefs();
        std::fs::create_dir_all(&p.dir).unwrap();
        std::fs::write(p.dir.join("paket.json"), "{ nope").unwrap();
        assert_eq!(p.read("paket"), serde_json::json!({}));
        // A valid file that is not an object reads empty too.
        std::fs::write(p.dir.join("paket.json"), "[1,2]").unwrap();
        assert_eq!(p.read("paket"), serde_json::json!({}));
    }

    #[test]
    fn too_large_is_refused() {
        let (_d, p) = prefs();
        let v = serde_json::json!({ "x": "a".repeat(17 * 1024) });
        assert_eq!(p.write("paket", &v), Err("prefs too large".to_string()));
        assert_eq!(p.read("paket"), serde_json::json!({}));
    }

    #[test]
    fn a_non_object_is_refused() {
        let (_d, p) = prefs();
        for v in [serde_json::json!([1]), serde_json::json!("x"), serde_json::json!(null), serde_json::json!(4)] {
            assert!(p.write("paket", &v).is_err());
        }
        assert_eq!(p.read("paket"), serde_json::json!({}));
    }

    #[test]
    fn a_path_trick_is_refused() {
        let (d, p) = prefs();
        let v = serde_json::json!({});
        assert!(p.write("../escape", &v).is_err());
        assert!(!d.path().join("escape.json").exists());
        assert_eq!(p.read("../escape"), serde_json::json!({}));
    }
}
