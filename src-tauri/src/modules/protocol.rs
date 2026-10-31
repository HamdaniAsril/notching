//! The notchmod:// protocol: serves module packages from the active modules folder.

use std::path::{Path, PathBuf};

use tauri::http::Response;

use super::manifest::{is_module_id, is_package_path};

pub const SCHEME: &str = "notchmod";

/// Sent with every module page: a module can load only its own package files and
/// has no network at all; anything else goes through a declared capability.
pub const MODULE_CSP: &str = "default-src 'none'; script-src notchmod:; style-src notchmod: 'unsafe-inline'; img-src notchmod: data:; font-src notchmod:; connect-src 'none'; media-src mediastream: blob:";

/// "/<id>/<file…>" → (id, file inside the active folder), or None for any path
/// that could leave the module's folder. '%' is refused outright, so encoded dots
/// never get decoded into a "..".
pub fn resolve(active_dir: &Path, uri_path: &str) -> Option<(String, PathBuf)> {
    let rest = uri_path.strip_prefix('/')?;
    if rest.contains('%') {
        return None;
    }
    let (id, file) = rest.split_once('/')?;
    if !is_module_id(id) || !is_package_path(file) {
        return None;
    }
    Some((id.to_string(), active_dir.join(id).join(file)))
}

pub fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") => "application/json",
        Some("svg") => "image/svg+xml",
        Some("woff2") => "font/woff2",
        Some("woff") => "font/woff",
        Some("png") => "image/png",
        _ => "application/octet-stream",
    }
}

/// 404 unless the module is installed and on and the file exists. Module frames
/// have an opaque origin and load scripts, fonts and icons with CORS, hence the
/// Access-Control-Allow-Origin header.
pub fn respond(active_dir: &Path, servable: impl Fn(&str) -> bool, uri_path: &str) -> Response<Vec<u8>> {
    let found = resolve(active_dir, uri_path)
        .filter(|(id, _)| servable(id))
        .and_then(|(_, path)| std::fs::read(&path).ok().map(|body| (path, body)));
    let Some((path, body)) = found else {
        return Response::builder().status(404).body(Vec::new()).unwrap();
    };
    let kind = content_type(&path);
    let mut builder = Response::builder()
        .status(200)
        .header("Content-Type", kind)
        .header("Access-Control-Allow-Origin", "*");
    if kind.starts_with("text/html") {
        builder = builder.header("Content-Security-Policy", MODULE_CSP);
    }
    builder.body(body).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_files_inside_a_module() {
        let d = Path::new("/active");
        assert_eq!(
            resolve(d, "/system-stat/assets/index-1a.js"),
            Some(("system-stat".into(), d.join("system-stat/assets/index-1a.js")))
        );
    }

    #[test]
    fn refuses_paths_that_leave_the_module() {
        for p in ["/", "/a", "/ab/", "/ab/../cd/x", "/../x", "/ab/./x", "/ab//x", "/ab/%2e%2e/x", "/ab\\x", "/AB/x"] {
            assert_eq!(resolve(Path::new("/active"), p), None, "{p}");
        }
    }

    #[test]
    fn content_types_by_extension() {
        assert_eq!(content_type(Path::new("a.html")), "text/html; charset=utf-8");
        assert_eq!(content_type(Path::new("a.js")), "text/javascript; charset=utf-8");
        assert_eq!(content_type(Path::new("a.woff2")), "font/woff2");
        assert_eq!(content_type(Path::new("a.svg")), "image/svg+xml");
        assert_eq!(content_type(Path::new("a.bin")), "application/octet-stream");
    }

    #[test]
    fn serves_only_modules_that_are_on() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("ab")).unwrap();
        std::fs::write(d.path().join("ab/index.html"), "hi").unwrap();
        std::fs::write(d.path().join("ab/main.js"), "x").unwrap();

        let ok = respond(d.path(), |id| id == "ab", "/ab/index.html");
        assert_eq!(ok.status(), 200);
        assert_eq!(ok.body(), b"hi");
        assert_eq!(ok.headers()["access-control-allow-origin"], "*");
        assert_eq!(ok.headers()["content-security-policy"], MODULE_CSP);
        assert_eq!(ok.headers()["content-type"], "text/html; charset=utf-8");

        let js = respond(d.path(), |_| true, "/ab/main.js");
        assert!(js.headers().get("content-security-policy").is_none());

        assert_eq!(respond(d.path(), |_| false, "/ab/index.html").status(), 404);
        assert_eq!(respond(d.path(), |_| true, "/ab/missing.js").status(), 404);
        assert_eq!(respond(d.path(), |_| true, "/ab/../ab/index.html").status(), 404);
    }
}
