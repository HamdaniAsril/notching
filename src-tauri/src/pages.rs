//! Pages in the pill (design 30 Oct, §3–4): Beranda first, then custom pages,
//! each one row of 4 columns holding widgets 1 or 2 columns wide.

use crate::modules::manifest::is_module_id;

pub const HOME_PAGE: &str = "home";
pub const MODULES_PAGE: &str = "modules";
pub const MODULE_PAGE_PREFIX: &str = "module:";
pub const COLUMNS: u8 = 4;
pub const PAGE_NAME_MAX: usize = 24;

/// A widget on a page. `widget` is "<package>/<widget>"; `width` is kept so the
/// spot survives while the widget's package is away (§4).
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Placement {
    pub widget: String,
    pub col: u8,
    pub width: u8,
}

/// Same shape as Page in src/modules/types.ts. Beranda has no name of its own:
/// it is called after the language.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    pub id: String,
    pub name: Option<String>,
    pub icon: String,
    pub widgets: Vec<Placement>,
}

/// The new Beranda (§6): Tanggal, Cuaca and Reminder.
pub fn beranda() -> Page {
    let at = |widget: &str, col, width| Placement { widget: widget.into(), col, width };
    Page {
        id: HOME_PAGE.into(),
        name: None,
        icon: "home".into(),
        widgets: vec![at("home/date", 0, 1), at("home/weather", 1, 1), at("home/reminders", 2, 2)],
    }
}

/// One row of 4 columns: widths 1–2, inside the row, no overlap, each widget once.
pub fn fits(widgets: &[Placement]) -> bool {
    let mut taken = [false; COLUMNS as usize];
    for (i, p) in widgets.iter().enumerate() {
        if !(1..=2).contains(&p.width) || p.col + p.width > COLUMNS || widgets[..i].iter().any(|q| q.widget == p.widget) {
            return false;
        }
        for c in p.col..p.col + p.width {
            if std::mem::replace(&mut taken[c as usize], true) {
                return false;
            }
        }
    }
    true
}

// Keeps placements in order while they still fit with the ones kept before.
fn keep_fitting(widgets: Vec<Placement>) -> Vec<Placement> {
    let mut kept: Vec<Placement> = Vec::new();
    for p in widgets {
        kept.push(p);
        if !fits(&kept) {
            kept.pop();
        }
    }
    kept
}

/// Mends pages from a hand-edited or newer file instead of dropping them: bad or
/// repeated ids go, names and icons are tidied, widgets that do not fit go, and
/// Beranda is put back first. Widgets from unknown packages keep their spot.
pub fn repair(pages: Vec<Page>) -> Vec<Page> {
    let mut out: Vec<Page> = Vec::new();
    for page in pages {
        if !is_module_id(&page.id) || page.id == MODULES_PAGE || out.iter().any(|p| p.id == page.id) {
            continue;
        }
        let widgets = keep_fitting(page.widgets);
        let fixed = if page.id == HOME_PAGE {
            Page { name: None, icon: "home".into(), widgets, ..page }
        } else {
            let name: String = page.name.unwrap_or_default().trim().chars().take(PAGE_NAME_MAX).collect();
            let name = if name.trim().is_empty() { "?".to_string() } else { name.trim_end().to_string() };
            let icon = if is_module_id(&page.icon) { page.icon } else { "dot".into() };
            Page { name: Some(name), icon, widgets, ..page }
        };
        out.push(fixed);
    }
    match out.iter().position(|p| p.id == HOME_PAGE) {
        Some(0) => {}
        Some(i) => {
            let home = out.remove(i);
            out.insert(0, home);
        }
        None => out.insert(0, beranda()),
    }
    out
}

/// What the panel can open: a page, the Modul page, or a module's page.
pub fn is_route(pages: &[Page], route: &str) -> bool {
    route == MODULES_PAGE
        || pages.iter().any(|p| p.id == route)
        || route.strip_prefix(MODULE_PAGE_PREFIX).is_some_and(is_module_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(w: &str, col: u8, width: u8) -> Placement {
        Placement { widget: w.into(), col, width }
    }

    fn custom(id: &str, widgets: Vec<Placement>) -> Page {
        Page { id: id.into(), name: Some("Kerja".into()), icon: "briefcase".into(), widgets }
    }

    #[test]
    fn beranda_holds_date_weather_and_reminders() {
        let b = beranda();
        assert_eq!((b.id.as_str(), b.name.clone(), b.icon.as_str()), (HOME_PAGE, None, "home"));
        assert_eq!(b.widgets, [p("home/date", 0, 1), p("home/weather", 1, 1), p("home/reminders", 2, 2)]);
    }

    #[test]
    fn fits_follows_the_four_columns() {
        assert!(!fits(&[p("a/a", 3, 2)]));
        assert!(!fits(&[p("a/a", 0, 1), p("b/b", 0, 1)]));
        assert!(!fits(&[p("a/a", 0, 1), p("a/a", 2, 1)]));
        assert!(!fits(&[p("a/a", 0, 0)]));
        assert!(!fits(&[p("a/a", 0, 3)]));
        assert!(fits(&[p("a/a", 1, 2), p("b/b", 3, 1)]));
        assert!(fits(&[]));
    }

    #[test]
    fn broken_pages_are_repaired() {
        let first = Page {
            id: "p1".into(),
            name: Some("  Kerja  ".into()),
            icon: "Bad Icon!".into(),
            widgets: vec![p("a/a", 0, 2), p("b/b", 1, 1), p("c/c", 3, 2), p("a/a", 2, 1)],
        };
        let home = Page { name: Some("X".into()), icon: "star".into(), ..beranda() };
        let modules = Page { id: MODULES_PAGE.into(), ..custom("x", vec![]) };
        let fixed = repair(vec![first, home, custom("p1", vec![]), modules]);
        assert_eq!(
            fixed,
            [
                beranda(),
                Page { id: "p1".into(), name: Some("Kerja".into()), icon: "dot".into(), widgets: vec![p("a/a", 0, 2)] },
            ]
        );
    }

    #[test]
    fn a_missing_beranda_is_put_back() {
        assert_eq!(repair(vec![]), [beranda()]);
        assert_eq!(repair(vec![custom("p1", vec![])])[0], beranda());
    }

    #[test]
    fn names_are_cut_and_never_empty() {
        let long = Page { name: Some("x".repeat(30)), ..custom("p1", vec![]) };
        let blank = Page { name: Some("   ".into()), ..custom("p2", vec![]) };
        let none = Page { name: None, ..custom("p3", vec![]) };
        let fixed = repair(vec![beranda(), long, blank, none]);
        assert_eq!(fixed[1].name.as_deref(), Some("x".repeat(24).as_str()));
        assert_eq!(fixed[2].name.as_deref(), Some("?"));
        assert_eq!(fixed[3].name.as_deref(), Some("?"));
    }

    #[test]
    fn unknown_widgets_keep_their_place() {
        let fixed = repair(vec![beranda(), custom("p1", vec![p("timer/timer", 3, 1)])]);
        assert_eq!(fixed[1].widgets, [p("timer/timer", 3, 1)]);
    }

    #[test]
    fn routes_are_pages_the_modules_page_or_a_module() {
        let pages = vec![beranda()];
        for ok in ["home", "modules", "module:system-stat"] {
            assert!(is_route(&pages, ok), "{ok}");
        }
        for bad in ["p9", "module:", "module:Bad!", ""] {
            assert!(!is_route(&pages, bad), "{bad}");
        }
    }
}
