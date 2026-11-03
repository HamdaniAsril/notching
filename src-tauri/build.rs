use std::path::Path;
use std::process::Command;

// The Now Playing helper's library (Musik, design 3 Nov §2). It is built before
// tauri_build, which copies the bundle resources (target/<profile>/ for `tauri
// dev`), and into media/build/, which tauri.conf.json lists and git ignores.
const MEDIA_SOURCE: &str = "media/notching_media.m";
const MEDIA_LIB: &str = "media/build/libnotching-media.dylib";

fn main() {
    build_media_helper();
    tauri_build::build()
}

fn build_media_helper() {
    println!("cargo:rerun-if-changed={MEDIA_SOURCE}");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return;
    }
    // tauri_build watches the resources too: rewriting an unchanged library
    // would only make the next build run this script again.
    if is_newer(Path::new(MEDIA_LIB), Path::new(MEDIA_SOURCE)) {
        return;
    }
    std::fs::create_dir_all("media/build").expect("media/build");
    let status = Command::new("clang")
        .args(["-fobjc-arc", "-fvisibility=hidden", "-O2", "-Wall", "-mmacosx-version-min=13.0"])
        .args(["-framework", "Foundation", "-framework", "CoreGraphics", "-framework", "ImageIO"])
        .args(["-dynamiclib", "-arch", "arm64", "-arch", "x86_64"])
        .args([MEDIA_SOURCE, "-o", MEDIA_LIB])
        .status()
        .expect("clang (Xcode command line tools) is needed to build the Now Playing helper");
    assert!(status.success(), "building {MEDIA_LIB} failed");
}

fn is_newer(a: &Path, b: &Path) -> bool {
    let modified = |p: &Path| std::fs::metadata(p).and_then(|m| m.modified()).ok();
    matches!((modified(a), modified(b)), (Some(a), Some(b)) if a > b)
}
