//! Reminders, kept on this Mac only (spec 7): reminders.json in the app's data folder.

use std::path::PathBuf;

use chrono::NaiveDate;

/// `day` is the local date ("YYYY-MM-DD"); `at` is the due time in milliseconds
/// since the epoch, None for a reminder without a time.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    pub id: u64,
    pub title: String,
    pub day: String,
    pub at: Option<i64>,
    pub done: bool,
    #[serde(default)]
    pub notified: bool,
}

pub const REMINDERS_FILE: &str = "reminders.json";
pub const TITLE_MAX: usize = 80;
pub const OPEN_MAX: usize = 100;

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct File {
    version: u32,
    next_id: u64,
    items: Vec<Reminder>,
}

pub struct Reminders {
    path: PathBuf,
    next_id: u64,
    items: Vec<Reminder>,
}

impl Reminders {
    /// Missing file: none yet. Unreadable or broken file: kept aside as
    /// reminders.json.broken, so a bad file never stops the app.
    pub fn open(path: PathBuf) -> Reminders {
        let file = match std::fs::read_to_string(&path) {
            Ok(text) => serde_json::from_str::<File>(&text).map_err(|e| e.to_string()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(File { version: 1, next_id: 1, items: Vec::new() }),
            Err(e) => Err(e.to_string()),
        };
        match file {
            Ok(f) => {
                // A hand-edited nextId must never hand out an id already in use.
                let next_id = f.items.iter().map(|r| r.id + 1).max().unwrap_or(1).max(f.next_id);
                Reminders { path, next_id, items: f.items }
            }
            Err(why) => {
                let broken = path.with_extension("json.broken");
                eprintln!("notching: reminders unreadable ({why}); kept aside as {}", broken.display());
                let _ = std::fs::rename(&path, broken);
                Reminders { path, next_id: 1, items: Vec::new() }
            }
        }
    }

    pub fn items(&self) -> &[Reminder] {
        &self.items
    }

    pub fn add(&mut self, title: &str, day: &str, at: Option<i64>) -> Result<Reminder, String> {
        let title = title.replace(['\n', '\r', '\t'], " ").trim().to_string();
        if !(1..=TITLE_MAX).contains(&title.chars().count()) {
            return Err(format!("title must be 1–{TITLE_MAX} characters"));
        }
        if NaiveDate::parse_from_str(day, "%Y-%m-%d").is_err() {
            return Err("day must be a date like 2026-10-29".into());
        }
        if self.items.iter().filter(|r| !r.done).count() >= OPEN_MAX {
            return Err(format!("at most {OPEN_MAX} open reminders"));
        }
        let reminder = Reminder { id: self.next_id, title, day: day.to_string(), at, done: false, notified: false };
        self.next_id += 1;
        self.items.push(reminder.clone());
        self.save()?;
        Ok(reminder)
    }

    pub fn set_done(&mut self, id: u64, done: bool) -> Result<(), String> {
        let r = self.items.iter_mut().find(|r| r.id == id).ok_or_else(|| format!("unknown reminder {id}"))?;
        r.done = done;
        self.save()
    }

    pub fn mark_notified(&mut self, ids: &[u64]) -> Result<(), String> {
        for r in self.items.iter_mut().filter(|r| ids.contains(&r.id)) {
            r.notified = true;
        }
        self.save()
    }

    /// Done reminders leave from the day after their own day.
    pub fn purge(&mut self, today: &str) -> Result<(), String> {
        let before = self.items.len();
        self.items.retain(|r| !(r.done && r.day.as_str() < today));
        if self.items.len() == before { Ok(()) } else { self.save() }
    }

    fn save(&self) -> Result<(), String> {
        let file = File { version: 1, next_id: self.next_id, items: self.items.clone() };
        let json = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
        super::write_atomic(&self.path, &json).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open(d: &tempfile::TempDir) -> Reminders {
        Reminders::open(d.path().join(REMINDERS_FILE))
    }

    #[test]
    fn add_keeps_reminders_across_a_restart() {
        let d = tempfile::tempdir().unwrap();
        let mut r = open(&d);
        assert_eq!(r.add("Kirim invoice", "2026-10-29", Some(1_000)).unwrap().id, 1);
        assert_eq!(r.add("Bayar listrik", "2026-10-29", None).unwrap().id, 2);
        let mut again = open(&d);
        assert_eq!(again.items(), r.items());
        assert_eq!(again.items()[0].title, "Kirim invoice");
        assert_eq!(again.items()[1].at, None);
        assert_eq!(again.add("Beli kopi", "2026-10-30", None).unwrap().id, 3);
    }

    #[test]
    fn titles_are_trimmed_and_limited() {
        let d = tempfile::tempdir().unwrap();
        let mut r = open(&d);
        assert_eq!(r.add("  Beli <b>susu</b>\n ", "2026-10-29", None).unwrap().title, "Beli <b>susu</b>");
        assert_eq!(r.add("Satu\tdua\nTiga", "2026-10-29", None).unwrap().title, "Satu dua Tiga");
        assert!(r.add("", "2026-10-29", None).is_err());
        assert!(r.add("   ", "2026-10-29", None).is_err());
        assert!(r.add(&"é".repeat(TITLE_MAX + 1), "2026-10-29", None).is_err());
        assert!(r.add(&"é".repeat(TITLE_MAX), "2026-10-29", None).is_ok());
    }

    #[test]
    fn a_bad_day_is_refused() {
        let d = tempfile::tempdir().unwrap();
        let mut r = open(&d);
        assert!(r.add("A", "2026-13-01", None).is_err());
        assert!(r.add("A", "kemarin", None).is_err());
        assert!(r.items().is_empty());
    }

    #[test]
    fn done_ones_leave_the_day_after() {
        let d = tempfile::tempdir().unwrap();
        let mut r = open(&d);
        let old = r.add("Selesai kemarin", "2026-10-28", None).unwrap().id;
        let today = r.add("Selesai hari ini", "2026-10-29", None).unwrap().id;
        r.add("Belum selesai", "2026-10-27", None).unwrap();
        r.set_done(old, true).unwrap();
        r.set_done(today, true).unwrap();
        r.purge("2026-10-29").unwrap();
        let titles: Vec<&str> = r.items().iter().map(|x| x.title.as_str()).collect();
        assert_eq!(titles, ["Selesai hari ini", "Belum selesai"]);
        assert_eq!(open(&d).items().len(), 2);
        assert!(r.set_done(99, true).is_err());
    }

    #[test]
    fn a_broken_file_is_kept_aside() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join(REMINDERS_FILE), "{oops").unwrap();
        assert!(open(&d).items().is_empty());
        assert_eq!(std::fs::read_to_string(d.path().join("reminders.json.broken")).unwrap(), "{oops");
    }

    #[test]
    fn there_is_a_limit_on_open_reminders() {
        let d = tempfile::tempdir().unwrap();
        let mut r = open(&d);
        for i in 0..OPEN_MAX {
            r.add(&format!("R{i}"), "2026-10-29", None).unwrap();
        }
        assert!(r.add("Satu lagi", "2026-10-29", None).is_err());
        r.set_done(1, true).unwrap();
        assert!(r.add("Satu lagi", "2026-10-29", None).is_ok());
    }

    #[test]
    fn notified_marks_survive_a_restart() {
        let d = tempfile::tempdir().unwrap();
        let mut r = open(&d);
        r.add("A", "2026-10-29", Some(1_000)).unwrap();
        r.add("B", "2026-10-29", Some(2_000)).unwrap();
        r.mark_notified(&[1]).unwrap();
        let again = open(&d);
        assert_eq!(again.items().iter().map(|x| x.notified).collect::<Vec<_>>(), [true, false]);
    }
}
