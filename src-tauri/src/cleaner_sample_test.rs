// The sample folder (design 1 Nov §11) against the real scan and removal code:
// every item Cleaner offers is ticked, then every bait must be untouched.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::AtomicBool;

use crate::cleaner_apps::{app_item, leftovers, list_apps, Leftovers};
use crate::cleaner_rules::{Category, Exclusions, Purpose, Roots};
use crate::cleaner_run::{run, RunCtx, Trash};
use crate::cleaner_scan::{deep_scan, Env};

struct MoveTrash(PathBuf);

impl Trash for MoveTrash {
    fn trash(&self, p: &Path) -> Result<(), String> {
        fs::create_dir_all(&self.0).map_err(|e| e.to_string())?;
        let to = self.0.join(format!("{}-{}", fs::read_dir(&self.0).map(|d| d.count()).unwrap_or(0), p.file_name().unwrap().to_string_lossy()));
        fs::rename(p, to).map_err(|e| e.to_string())
    }
}

const BAITS: &[&str] = &[
    "home/.claude/memory.md",
    "home/Documents/penting.txt",
    "home/Documents/proyek/node_modules/x.js",
    "home/Library/Cookies/Cookies.binarycookies",
    "home/Library/Application Support/Coba/x.txt",
];

fn contents(root: &Path) -> HashMap<&'static str, Vec<u8>> {
    BAITS.iter().map(|b| (*b, fs::read(root.join(b)).unwrap_or_else(|e| panic!("{b}: {e}")))).collect()
}

#[test]
fn sample_baits_survive_ticking_everything() {
    if !Path::new("/usr/bin/osacompile").exists() {
        eprintln!("no osacompile: skipped");
        return;
    }
    let d = tempfile::tempdir().unwrap();
    let root = d.path().join("cleaner-cek");
    let script = Path::new(env!("CARGO_MANIFEST_DIR")).join("../scripts/cleaner-cek.sh");
    let out = Command::new("/bin/bash").arg(&script).arg(&root).output().unwrap();
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    let before = contents(&root);
    assert!(root.join("checksums-before.txt").is_file());

    let roots = Roots::test(&root);
    let cancel = AtomicBool::new(false);
    let excluded = Exclusions::default();
    let mut ids = 1;
    let apps = list_apps(&roots, &cancel, &mut ids);
    let installed_ids: Vec<String> = apps.iter().map(|a| a.bundle_id.clone()).collect();
    let installed = |bid: &str| Some(installed_ids.iter().any(|i| i == bid));
    let env = Env {
        roots: &roots,
        fda: true,
        running: &|_| false,
        installed: &installed,
        mounted: &|_| false,
        busy_tool: &|_| false,
        excluded: &excluded,
        now_ms: chrono::Utc::now().timestamp_millis(),
        cancel: &cancel,
    };
    let items = deep_scan(&env, &mut ids);
    let cat = |name: &str| items.iter().find(|i| i.path.file_name().unwrap() == name).map(|i| i.category);
    assert_eq!(cat("com.contoh.yatim"), Some(Category::Orphan));
    assert_eq!(cat("com.contoh.baru"), Some(Category::AppCache));
    for want in [Category::BrowserCache, Category::DevCache, Category::Log, Category::Trash, Category::Build, Category::Installer, Category::Backup] {
        assert!(items.iter().any(|i| i.category == want), "missing {want:?}");
    }

    let trash = MoveTrash(root.join("fake-trash"));
    let mut lines = Vec::new();
    let mut log = |l: String| lines.push(l);
    let ctx = RunCtx {
        roots: &roots,
        excluded: &excluded,
        running: &|_| false,
        trash: &trash,
        other_copy: &|| false,
        stop: &AtomicBool::new(false),
        log: &mut log,
        now: &|| "T".into(),
    };
    run(&items, &Purpose::Clean, ctx, |_, _| {});

    let app = apps.iter().find(|a| a.name == "Coba Cleaner").expect("sample app");
    let others: Vec<String> = apps.iter().filter(|a| a.id != app.id).map(|a| a.bundle_id.clone()).collect();
    let lctx = Leftovers { roots: &roots, fda: true, other_copy: false, team: None, team_shared: &|_| false, others: &others, excluded: &excluded };
    let mut un = vec![app_item(app, &mut ids)];
    un.extend(leftovers(app, &lctx, &mut ids));
    let names: Vec<String> = un.iter().map(|i| i.label.clone()).collect();
    assert!(names.iter().any(|n| n == "com.contoh.cobacleaner.plist"), "{names:?}");
    assert!(un.iter().any(|i| i.label == "Coba Cleaner" && i.confidence == Some("maybe")), "{names:?}");
    assert!(!names.iter().any(|n| n == "Coba"), "{names:?}");
    let purpose = Purpose::Uninstall { bundle_id: &app.bundle_id, app: &app.path };
    let ctx = RunCtx {
        roots: &roots,
        excluded: &excluded,
        running: &|_| false,
        trash: &trash,
        other_copy: &|| false,
        stop: &AtomicBool::new(false),
        log: &mut log,
        now: &|| "T".into(),
    };
    let outcomes = run(&un, &purpose, ctx, |_, _| {});
    assert!(outcomes.iter().all(|o| o.result.is_ok()), "{outcomes:?}");
    assert!(!app.path.exists());

    assert_eq!(contents(&root), before, "a bait changed");
    let link = root.join("home/Library/Caches/com.contoh.editor/tautan");
    assert!(fs::symlink_metadata(&link).is_err(), "the link itself goes");
    assert!(root.join("home/Library/Caches/com.contoh.baru").is_dir());
}
