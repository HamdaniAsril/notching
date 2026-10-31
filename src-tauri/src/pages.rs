//! Pages in the pill (design 30 Oct, §3–4): Beranda first, then custom pages,
//! each one row of 4 columns holding widgets 1 or 2 columns wide, and an
//! optional strip under it (design 31 Oct, Timer §3).

use crate::modules::manifest::is_module_id;

pub const HOME_PAGE: &str = "home";
pub const MODULES_PAGE: &str = "modules";
pub const MODULE_PAGE_PREFIX: &str = "module:";
pub const COLUMNS: u8 = 4;
pub const PAGE_NAME_MAX: usize = 24;
/// A strip widget's width in its manifest: the whole row, on a line of its own.
pub const STRIP_WIDTH: u8 = 4;

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
    /// A strip widget's "<package>/<widget>". Kept while its package is away,
    /// like a placement.
    #[serde(default)]
    pub strip: Option<String>,
}

/// The new Beranda (§6): Tanggal, Cuaca and Reminder.
pub fn beranda() -> Page {
    let at = |widget: &str, col, width| Placement { widget: widget.into(), col, width };
    Page {
        id: HOME_PAGE.into(),
        name: None,
        icon: "home".into(),
        widgets: vec![at("home/date", 0, 1), at("home/weather", 1, 1), at("home/reminders", 2, 2)],
        strip: None,
    }
}

/// One row of 4 columns: widths 1–2, inside the row, no overlap, each widget once.
pub fn fits(widgets: &[Placement]) -> bool {
    let mut taken = [false; COLUMNS as usize];
    for (i, p) in widgets.iter().enumerate() {
        // Subtracting, so a column near 255 cannot overflow the byte.
        if !(1..=2).contains(&p.width) || p.col >= COLUMNS || p.width > COLUMNS - p.col
            || widgets[..i].iter().any(|q| q.widget == p.widget)
        {
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
            // Only the fixed icons: the editor sends the icon back with every save.
            let icon = if PAGE_ICONS.contains(&page.icon.as_str()) { page.icon } else { "dot".into() };
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

/// The fixed line icons a page may wear; the same names as PAGE_ICONS in
/// src/pages/icons.ts.
pub const PAGE_ICONS: [&str; 24] = [
    "home", "star", "heart", "bolt", "briefcase", "book", "code", "chart", "calendar", "clock", "bell", "flag",
    "pin", "globe", "cloud", "sun", "moon", "leaf", "coffee", "music", "camera", "gift", "compass", "dot",
];

#[derive(Debug, PartialEq)]
pub enum PageError {
    NotFound(String),
    Fixed,
    BadName,
    BadIcon,
    BadLayout,
    BadStrip,
    UnknownWidget(String),
}

impl std::fmt::Display for PageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PageError::NotFound(id) => write!(f, "unknown page {id}"),
            PageError::Fixed => write!(f, "Beranda cannot be changed that way"),
            PageError::BadName => write!(f, "a page name has 1 to 24 characters"),
            PageError::BadIcon => write!(f, "unknown icon"),
            PageError::BadLayout => write!(f, "widgets do not fit the row"),
            PageError::BadStrip => write!(f, "the strip takes a strip widget"),
            PageError::UnknownWidget(r) => write!(f, "unknown widget {r}"),
        }
    }
}

fn page_name(name: &str) -> Result<String, PageError> {
    let name = name.trim();
    match name.chars().count() {
        1..=PAGE_NAME_MAX => Ok(name.to_string()),
        _ => Err(PageError::BadName),
    }
}

fn page_icon(icon: &str) -> Result<String, PageError> {
    PAGE_ICONS.contains(&icon).then(|| icon.to_string()).ok_or(PageError::BadIcon)
}

/// A new, empty custom page at the end; its id is one past the highest "p<n>".
pub fn add_page(pages: &mut Vec<Page>, name: &str, icon: &str) -> Result<String, PageError> {
    let (name, icon) = (page_name(name)?, page_icon(icon)?);
    let n = pages.iter().filter_map(|p| p.id.strip_prefix('p')?.parse::<u32>().ok()).max().unwrap_or(0) + 1;
    let id = format!("p{n}");
    pages.push(Page { id: id.clone(), name: Some(name), icon, widgets: vec![], strip: None });
    Ok(id)
}

/// Replaces a page's name, icon, widgets and strip. Widgets must be in the
/// catalog (`width_of`), which also gives their width, unless the page already
/// held them: a spot whose package is away keeps its place. So does the strip,
/// which must otherwise be a strip widget.
pub fn set_page(
    pages: &mut [Page],
    id: &str,
    name: Option<&str>,
    icon: &str,
    widgets: Vec<Placement>,
    strip: Option<String>,
    width_of: &dyn Fn(&str) -> Option<u8>,
) -> Result<(), PageError> {
    let page = pages.iter_mut().find(|p| p.id == id).ok_or_else(|| PageError::NotFound(id.into()))?;
    let (name, icon) = if id == HOME_PAGE {
        if name.is_some() || icon != "home" {
            return Err(PageError::Fixed);
        }
        (None, icon.to_string())
    } else {
        (Some(page_name(name.unwrap_or_default())?), page_icon(icon)?)
    };
    let mut placed = Vec::with_capacity(widgets.len());
    for w in widgets {
        match width_of(&w.widget) {
            Some(width) => placed.push(Placement { width, ..w }),
            None if page.widgets.iter().any(|old| old.widget == w.widget) => placed.push(w),
            None => return Err(PageError::UnknownWidget(w.widget)),
        }
    }
    if !fits(&placed) {
        return Err(PageError::BadLayout);
    }
    if let Some(r) = &strip {
        match width_of(r) {
            Some(STRIP_WIDTH) => {}
            Some(_) => return Err(PageError::BadStrip),
            None if page.strip.as_ref() == Some(r) => {}
            None => return Err(PageError::UnknownWidget(r.clone())),
        }
    }
    placed.sort_by_key(|w| w.col);
    *page = Page { id: page.id.clone(), name, icon, widgets: placed, strip };
    Ok(())
}

pub fn delete_page(pages: &mut Vec<Page>, id: &str) -> Result<(), PageError> {
    if id == HOME_PAGE {
        return Err(PageError::Fixed);
    }
    let i = pages.iter().position(|p| p.id == id).ok_or_else(|| PageError::NotFound(id.into()))?;
    pages.remove(i);
    Ok(())
}

/// `to` counts among the custom pages only; Beranda stays first.
pub fn move_page(pages: &mut Vec<Page>, id: &str, to: usize) -> Result<(), PageError> {
    if id == HOME_PAGE {
        return Err(PageError::Fixed);
    }
    let i = pages.iter().position(|p| p.id == id).ok_or_else(|| PageError::NotFound(id.into()))?;
    let page = pages.remove(i);
    let custom = pages.iter().filter(|p| p.id != HOME_PAGE).count();
    pages.insert(1 + to.min(custom), page);
    Ok(())
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
        Page { id: id.into(), name: Some("Kerja".into()), icon: "briefcase".into(), widgets, strip: None }
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
        // Past the row, even where col + width would not fit in a byte.
        assert!(!fits(&[p("a/a", 255, 1)]));
        assert!(!fits(&[p("a/a", 254, 2)]));
        assert!(!fits(&[p("a/a", 4, 1)]));
    }

    #[test]
    fn broken_pages_are_repaired() {
        let first = Page {
            id: "p1".into(),
            name: Some("  Kerja  ".into()),
            icon: "Bad Icon!".into(),
            widgets: vec![p("a/a", 0, 2), p("b/b", 1, 1), p("c/c", 3, 2), p("a/a", 2, 1)],
            strip: None,
        };
        let home = Page { name: Some("X".into()), icon: "star".into(), ..beranda() };
        let modules = Page { id: MODULES_PAGE.into(), ..custom("x", vec![]) };
        let fixed = repair(vec![first, home, custom("p1", vec![]), modules]);
        assert_eq!(
            fixed,
            [
                beranda(),
                Page { id: "p1".into(), name: Some("Kerja".into()), icon: "dot".into(), widgets: vec![p("a/a", 0, 2)], strip: None },
            ]
        );
    }

    #[test]
    fn an_icon_not_in_the_list_becomes_the_dot() {
        let rocket = Page { icon: "rocket".into(), ..custom("p1", vec![]) };
        let fixed = repair(vec![beranda(), rocket]);
        assert_eq!(fixed[1].icon, "dot");
        // So the page can be saved again with the icon it shows.
        let mut pages = fixed;
        assert_eq!(set_page(&mut pages, "p1", Some("Kerja"), "dot", vec![], None, &|_| None), Ok(()));
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

    fn known(r: &str) -> Option<u8> {
        match r {
            "home/date" | "a/a" | "b/b" => Some(1),
            "home/reminders" => Some(2),
            _ => None,
        }
    }

    fn ids(pages: &[Page]) -> Vec<&str> {
        pages.iter().map(|p| p.id.as_str()).collect()
    }

    #[test]
    fn new_pages_get_the_next_free_id() {
        let mut pages = vec![beranda(), custom("p1", vec![]), custom("p4", vec![])];
        assert_eq!(add_page(&mut pages, "Ibadah", "moon"), Ok("p5".into()));
        assert_eq!(pages[3], Page { id: "p5".into(), name: Some("Ibadah".into()), icon: "moon".into(), widgets: vec![], strip: None });
        let mut only = vec![beranda()];
        assert_eq!(add_page(&mut only, "Kerja", "briefcase"), Ok("p1".into()));
        assert_eq!(add_page(&mut only, "Kerja", "nope"), Err(PageError::BadIcon));
    }

    #[test]
    fn page_names_are_trimmed_and_limited() {
        let mut pages = vec![beranda()];
        add_page(&mut pages, "  Kerja ", "dot").unwrap();
        assert_eq!(pages[1].name.as_deref(), Some("Kerja"));
        for bad in ["x".repeat(25), String::new(), "   ".into()] {
            assert_eq!(add_page(&mut pages, &bad, "dot"), Err(PageError::BadName), "{bad:?}");
        }
        assert!(add_page(&mut pages, &"🌙".repeat(24), "dot").is_ok());
        assert_eq!(set_page(&mut pages, "p1", None, "dot", vec![], None, &known), Err(PageError::BadName));
    }

    #[test]
    fn beranda_keeps_its_name_icon_and_place() {
        let mut pages = vec![beranda(), custom("p1", vec![])];
        assert_eq!(set_page(&mut pages, "home", Some("X"), "home", vec![], None, &known), Err(PageError::Fixed));
        assert_eq!(set_page(&mut pages, "home", None, "star", vec![], None, &known), Err(PageError::Fixed));
        assert_eq!(delete_page(&mut pages, "home"), Err(PageError::Fixed));
        assert_eq!(move_page(&mut pages, "home", 1), Err(PageError::Fixed));
        assert_eq!(set_page(&mut pages, "home", None, "home", vec![p("home/date", 0, 1)], None, &known), Ok(()));
        assert_eq!(pages[0].widgets, [p("home/date", 0, 1)]);
        assert_eq!(set_page(&mut pages, "p9", Some("X"), "dot", vec![], None, &known), Err(PageError::NotFound("p9".into())));
        assert_eq!(delete_page(&mut pages, "p9"), Err(PageError::NotFound("p9".into())));
    }

    #[test]
    fn widgets_must_fit_and_be_known() {
        let mut pages = vec![beranda(), custom("p1", vec![])];
        assert_eq!(set_page(&mut pages, "p1", Some("Kerja"), "dot", vec![p("a/a", 0, 1), p("b/b", 0, 1)], None, &known), Err(PageError::BadLayout));
        assert_eq!(set_page(&mut pages, "p1", Some("Kerja"), "dot", vec![p("x/y", 0, 1)], None, &known),
            Err(PageError::UnknownWidget("x/y".into())));
        // The catalog decides the width; placements come back in column order.
        let widgets = vec![p("a/a", 3, 1), p("home/reminders", 0, 1)];
        assert_eq!(set_page(&mut pages, "p1", Some(" Kerja "), "briefcase", widgets, None, &known), Ok(()));
        assert_eq!(pages[1], Page {
            id: "p1".into(), name: Some("Kerja".into()), icon: "briefcase".into(),
            widgets: vec![p("home/reminders", 0, 2), p("a/a", 3, 1)], strip: None,
        });
        // At its catalog width it no longer fits.
        assert_eq!(set_page(&mut pages, "p1", Some("Kerja"), "dot", vec![p("home/reminders", 3, 1)], None, &known),
            Err(PageError::BadLayout));
    }

    #[test]
    fn set_page_keeps_widgets_whose_source_is_gone() {
        let mut pages = vec![beranda(), custom("p1", vec![p("timer/timer", 3, 1)])];
        let widgets = vec![p("a/a", 0, 1), p("timer/timer", 3, 1)];
        assert_eq!(set_page(&mut pages, "p1", Some("Kerja"), "dot", widgets.clone(), None, &known), Ok(()));
        assert_eq!(pages[1].widgets, widgets);
    }

    fn strips(r: &str) -> Option<u8> {
        if r == "timer/strip" { Some(4) } else { known(r) }
    }

    #[test]
    fn a_page_takes_one_strip_widget() {
        let mut pages = vec![beranda(), custom("p1", vec![])];
        assert_eq!(set_page(&mut pages, "p1", Some("Kerja"), "dot", vec![], Some("timer/strip".into()), &strips), Ok(()));
        assert_eq!(pages[1].strip.as_deref(), Some("timer/strip"));
        // A row widget cannot be the strip, and the strip widget cannot sit in the row.
        assert_eq!(set_page(&mut pages, "p1", Some("Kerja"), "dot", vec![], Some("a/a".into()), &strips), Err(PageError::BadStrip));
        assert_eq!(set_page(&mut pages, "p1", Some("Kerja"), "dot", vec![p("timer/strip", 0, 4)], None, &strips),
            Err(PageError::BadLayout));
        assert_eq!(set_page(&mut pages, "p1", Some("Kerja"), "dot", vec![], Some("x/y".into()), &strips),
            Err(PageError::UnknownWidget("x/y".into())));
        assert_eq!(pages[1].strip.as_deref(), Some("timer/strip"));
        assert_eq!(set_page(&mut pages, "home", None, "home", vec![], Some("timer/strip".into()), &strips), Ok(()));
        assert_eq!(pages[0].strip.as_deref(), Some("timer/strip"));
        assert_eq!(set_page(&mut pages, "p1", Some("Kerja"), "dot", vec![], None, &strips), Ok(()));
        assert_eq!(pages[1].strip, None);
    }

    #[test]
    fn a_strip_whose_source_is_gone_keeps_its_place() {
        let mut pages = vec![beranda(), Page { strip: Some("timer/strip".into()), ..custom("p1", vec![]) }];
        assert_eq!(set_page(&mut pages, "p1", Some("Kerja"), "dot", vec![], Some("timer/strip".into()), &known), Ok(()));
        assert_eq!(repair(pages.clone())[1].strip.as_deref(), Some("timer/strip"));
    }

    #[test]
    fn pages_move_among_the_custom_ones() {
        let mut pages = vec![beranda(), custom("p1", vec![]), custom("p2", vec![]), custom("p3", vec![])];
        move_page(&mut pages, "p3", 0).unwrap();
        assert_eq!(ids(&pages), ["home", "p3", "p1", "p2"]);
        move_page(&mut pages, "p3", 99).unwrap();
        assert_eq!(ids(&pages), ["home", "p1", "p2", "p3"]);
        delete_page(&mut pages, "p2").unwrap();
        assert_eq!(ids(&pages), ["home", "p1", "p3"]);
    }

    #[test]
    fn icons_match_the_notch() {
        let ts = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../src/pages/icons.ts")).unwrap();
        for icon in PAGE_ICONS {
            assert!(ts.contains(&format!("\n  {icon}: '")), "{icon}");
        }
    }

    #[test]
    fn errors_read_plainly() {
        assert_eq!(PageError::NotFound("p9".into()).to_string(), "unknown page p9");
        assert_eq!(PageError::Fixed.to_string(), "Beranda cannot be changed that way");
        assert_eq!(PageError::BadName.to_string(), "a page name has 1 to 24 characters");
        assert_eq!(PageError::BadIcon.to_string(), "unknown icon");
        assert_eq!(PageError::BadLayout.to_string(), "widgets do not fit the row");
        assert_eq!(PageError::UnknownWidget("x/y".into()).to_string(), "unknown widget x/y");
        assert_eq!(PageError::BadStrip.to_string(), "the strip takes a strip widget");
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
