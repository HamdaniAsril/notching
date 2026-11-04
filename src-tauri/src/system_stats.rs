//! What the System stat card shows, read only when a module asks: nothing runs
//! between reads, so a closed card costs nothing.

use std::collections::{HashMap, VecDeque};
use std::path::Path;
use std::time::{Duration, Instant};

use sysinfo::{Components, Networks, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind, MINIMUM_CPU_UPDATE_INTERVAL};

/// `cpu` and `pressure` 0–100; `rx`/`tx` in bytes per second.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub cpu: f32,
    pub mem_used: u64,
    pub mem_total: u64,
    pub rx: f64,
    pub tx: f64,
    pub pressure: Option<f32>,
    pub history: Vec<Point>,
    pub apps: Vec<AppUse>,
    pub temps: Temps,
    pub disk: Option<Disk>,
}

/// One earlier reading, `ago` seconds before this one.
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
pub struct Point {
    pub ago: f32,
    pub cpu: f32,
    pub pressure: Option<f32>,
}

/// An app's processes together: `cpu` as a share of the whole Mac, `mem` in bytes.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub struct AppUse {
    pub name: String,
    pub cpu: f32,
    pub mem: u64,
}

#[derive(Clone, Debug, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Temps {
    pub chip: Option<f32>,
    pub other: Option<f32>,
    pub other_kind: Option<&'static str>,
    pub state: &'static str,
}

/// The startup volume, and the parts Cleaner last measured (none until it has).
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub struct Disk {
    pub total: u64,
    pub free: u64,
    pub parts: Option<Parts>,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub struct Parts {
    pub apps: Option<u64>,
    pub documents: Option<u64>,
    pub photos: Option<u64>,
    pub cleanable: Option<u64>,
}

#[derive(Clone, Copy, Debug)]
pub struct NetSample {
    pub at: Instant,
    pub rx_total: u64,
    pub tx_total: u64,
}

/// A baseline older than this is too old to measure rates against.
pub const STALE_AFTER: Duration = Duration::from_secs(5);
/// How far back the card's charts reach.
pub const HISTORY: Duration = Duration::from_secs(60);
/// Sensors and the disk change slowly and cost more to read: at most this often.
pub const SLOW_EVERY: Duration = Duration::from_secs(5);
pub const TOP_APPS: usize = 4;

/// Bytes per second between two samples. A counter that went backwards (an
/// interface was reset) or no time between them reads as 0.
pub fn rates(prev: &NetSample, now: &NetSample) -> (f64, f64) {
    let secs = now.at.saturating_duration_since(prev.at).as_secs_f64();
    if secs <= 0.0 {
        return (0.0, 0.0);
    }
    let per_sec = |a: u64, b: u64| b.saturating_sub(a) as f64 / secs;
    (per_sec(prev.rx_total, now.rx_total), per_sec(prev.tx_total, now.tx_total))
}

pub fn is_loopback(name: &str) -> bool {
    name.starts_with("lo")
}

/// The outermost `.app` bundle a program lives in, without ".app": a browser's
/// helpers count as the browser. None for programs outside any app.
pub fn app_name(exe: &Path) -> Option<String> {
    exe.components()
        .filter_map(|c| c.as_os_str().to_str())
        .find_map(|c| c.strip_suffix(".app").filter(|n| !n.is_empty()))
        .map(str::to_string)
}

/// Processes as (program, CPU % of one core, bytes) grouped into apps; the
/// `TOP_APPS` busiest, CPU as a share of all `cores`.
pub fn top_apps<'a>(rows: impl IntoIterator<Item = (Option<&'a Path>, f32, u64)>, cores: usize) -> Vec<AppUse> {
    let mut by_app: HashMap<String, (f32, u64)> = HashMap::new();
    for (exe, cpu, mem) in rows {
        if let Some(name) = exe.and_then(app_name) {
            let e = by_app.entry(name).or_default();
            e.0 += cpu.max(0.0);
            e.1 += mem;
        }
    }
    let cores = cores.max(1) as f32;
    let mut apps: Vec<AppUse> = by_app
        .into_iter()
        .map(|(name, (cpu, mem))| AppUse { name, cpu: (cpu / cores).clamp(0.0, 100.0), mem })
        .collect();
    apps.sort_by(|a, b| b.cpu.total_cmp(&a.cpu).then(b.mem.cmp(&a.mem)).then(a.name.cmp(&b.name)));
    apps.truncate(TOP_APPS);
    apps
}

fn plausible(t: Option<f32>) -> Option<f32> {
    t.filter(|t| (1.0..=130.0).contains(t))
}

/// The chip is its hottest die sensor; the second number is the battery, or
/// the SSD on a Mac without one.
pub fn pick_temps<'a>(sensors: impl IntoIterator<Item = (&'a str, Option<f32>)>) -> (Option<f32>, Option<f32>, Option<&'static str>) {
    let (mut chip, mut battery, mut ssd) = (None::<f32>, None, None);
    for (label, t) in sensors {
        let Some(t) = plausible(t) else { continue };
        if label.starts_with("PMU") && label.contains("tdie") {
            chip = Some(chip.map_or(t, |c| c.max(t)));
        } else if label.contains("battery") {
            battery.get_or_insert(t);
        } else if label.starts_with("NAND") {
            ssd.get_or_insert(t);
        }
    }
    match (battery, ssd) {
        (Some(b), _) => (chip, Some(b), Some("battery")),
        (None, Some(s)) => (chip, Some(s), Some("ssd")),
        _ => (chip, None, None),
    }
}

/// macOS keeps `kern.memorystatus_level` as the percent of memory still free.
pub fn pressure_from_level(level: i32) -> Option<f32> {
    (0..=100).contains(&level).then(|| 100.0 - level as f32)
}

/// Readings of the last `HISTORY`, oldest first, as seconds before `now`.
pub fn recent(history: &mut VecDeque<(Instant, f32, Option<f32>)>, now: Instant) -> Vec<Point> {
    while history.front().is_some_and(|(at, ..)| now.saturating_duration_since(*at) > HISTORY) {
        history.pop_front();
    }
    history
        .iter()
        .map(|&(at, cpu, pressure)| Point { ago: now.saturating_duration_since(at).as_secs_f32(), cpu, pressure })
        .collect()
}

#[cfg(target_os = "macos")]
fn memorystatus_level() -> Option<i32> {
    let mut v: libc::c_int = 0;
    let mut len = std::mem::size_of::<libc::c_int>();
    let r = unsafe {
        libc::sysctlbyname(c"kern.memorystatus_level".as_ptr(), (&mut v as *mut libc::c_int).cast(), &mut len, std::ptr::null_mut(), 0)
    };
    (r == 0).then_some(v)
}

#[cfg(not(target_os = "macos"))]
fn memorystatus_level() -> Option<i32> {
    None
}

#[cfg(target_os = "macos")]
fn thermal_state() -> &'static str {
    use objc2_foundation::{NSProcessInfo, NSProcessInfoThermalState as T};
    match NSProcessInfo::processInfo().thermalState() {
        T::Fair => "fair",
        T::Serious => "serious",
        T::Critical => "critical",
        _ => "nominal",
    }
}

#[cfg(not(target_os = "macos"))]
fn thermal_state() -> &'static str {
    "nominal"
}

pub struct SystemStats {
    sys: System,
    nets: Networks,
    comps: Option<Components>,
    last: Option<NetSample>,
    history: VecDeque<(Instant, f32, Option<f32>)>,
    slow_at: Option<Instant>,
    temps: Temps,
    disk: Option<Disk>,
}

impl SystemStats {
    pub fn new() -> Self {
        SystemStats {
            sys: System::new(),
            nets: Networks::new(),
            comps: None,
            last: None,
            history: VecDeque::new(),
            slow_at: None,
            temps: Temps { state: "nominal", ..Temps::default() },
            disk: None,
        }
    }

    /// Without a fresh baseline (first read, or the card was closed a while),
    /// samples twice, the minimum CPU interval apart, so every read has numbers.
    /// `disk` is asked for at most every `SLOW_EVERY`.
    pub fn read(&mut self, disk: impl FnOnce() -> Disk) -> Stats {
        let fresh = self.last.is_some_and(|l| l.at.elapsed() < STALE_AFTER);
        if !fresh {
            self.sample();
            std::thread::sleep(MINIMUM_CPU_UPDATE_INTERVAL);
        }
        let prev = self.last;
        let now = self.sample();
        self.sys.refresh_memory();
        let (rx, tx) = prev.map_or((0.0, 0.0), |p| rates(&p, &now));
        let cpu = self.sys.global_cpu_usage().clamp(0.0, 100.0);
        let pressure = memorystatus_level().and_then(pressure_from_level);
        if self.slow_at.is_none_or(|t| t.elapsed() >= SLOW_EVERY) {
            self.slow_at = Some(now.at);
            self.temps = self.read_temps();
            self.disk = Some(disk());
        }
        let exes = self.sys.processes().values().map(|p| (p.exe(), p.cpu_usage(), p.memory()));
        let apps = top_apps(exes, self.sys.cpus().len());
        self.history.push_back((now.at, cpu, pressure));
        Stats {
            cpu,
            mem_used: self.sys.used_memory(),
            mem_total: self.sys.total_memory(),
            rx,
            tx,
            pressure,
            history: recent(&mut self.history, now.at),
            apps,
            temps: self.temps.clone(),
            disk: self.disk.clone(),
        }
    }

    fn read_temps(&mut self) -> Temps {
        let comps = match &mut self.comps {
            Some(c) => {
                c.refresh(false);
                c
            }
            None => self.comps.insert(Components::new_with_refreshed_list()),
        };
        let (chip, other, other_kind) = pick_temps(comps.iter().map(|c| (c.label(), c.temperature())));
        Temps { chip, other, other_kind, state: thermal_state() }
    }

    // Refreshes CPU, processes and network counters and records the network totals.
    fn sample(&mut self) -> NetSample {
        self.sys.refresh_cpu_usage();
        let kind = ProcessRefreshKind::nothing().with_cpu().with_memory().with_exe(UpdateKind::OnlyIfNotSet);
        self.sys.refresh_processes_specifics(ProcessesToUpdate::All, true, kind);
        self.nets.refresh(true);
        let (rx_total, tx_total) = self
            .nets
            .iter()
            .filter(|(name, _)| !is_loopback(name))
            .fold((0, 0), |(rx, tx), (_, d)| (rx + d.total_received(), tx + d.total_transmitted()));
        let s = NetSample { at: Instant::now(), rx_total, tx_total };
        self.last = Some(s);
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rates_are_bytes_per_second() {
        let t = Instant::now();
        let a = NetSample { at: t, rx_total: 1_000_000, tx_total: 0 };
        let b = NetSample { at: t + Duration::from_secs(2), rx_total: 2_000_000, tx_total: 100_000 };
        assert_eq!(rates(&a, &b), (500_000.0, 50_000.0));
    }

    #[test]
    fn a_counter_reset_reads_as_zero() {
        let t = Instant::now();
        let a = NetSample { at: t, rx_total: 5_000, tx_total: 5_000 };
        let b = NetSample { at: t + Duration::from_secs(1), rx_total: 1_000, tx_total: 6_000 };
        assert_eq!(rates(&a, &b), (0.0, 1_000.0));
    }

    #[test]
    fn zero_elapsed_reads_as_zero() {
        let t = Instant::now();
        let a = NetSample { at: t, rx_total: 0, tx_total: 0 };
        let b = NetSample { at: t, rx_total: 9_000, tx_total: 9_000 };
        assert_eq!(rates(&a, &b), (0.0, 0.0));
    }

    #[test]
    fn loopback_is_left_out() {
        assert!(is_loopback("lo0"));
        assert!(!is_loopback("en0"));
    }

    #[test]
    fn an_apps_helpers_count_as_the_app() {
        let p = Path::new("/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Helpers/Google Chrome Helper (Renderer).app/Contents/MacOS/x");
        assert_eq!(app_name(p).as_deref(), Some("Google Chrome"));
        assert_eq!(app_name(Path::new("/Applications/Arc.app/Contents/MacOS/Arc")).as_deref(), Some("Arc"));
        assert_eq!(app_name(Path::new("/usr/libexec/mdworker_shared")), None);
        assert_eq!(app_name(Path::new("/x/.app/y")), None);
    }

    #[test]
    fn top_apps_groups_sorts_and_keeps_four() {
        let chrome = Path::new("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
        let helper = Path::new("/Applications/Google Chrome.app/Contents/Frameworks/H.app/Contents/MacOS/H");
        let xcode = Path::new("/Applications/Xcode.app/Contents/MacOS/Xcode");
        let a = Path::new("/Applications/A.app/a");
        let b = Path::new("/Applications/B.app/b");
        let c = Path::new("/Applications/C.app/c");
        let kernel = Path::new("/kernel");
        let rows = vec![
            (Some(chrome), 40.0, 100),
            (Some(helper), 40.0, 50),
            (Some(xcode), 120.0, 10),
            (Some(a), 8.0, 1),
            (Some(b), 4.0, 1),
            (Some(c), 4.0, 2),
            (Some(kernel), 300.0, 1),
            (None, 300.0, 1),
        ];
        let apps = top_apps(rows, 8);
        let names: Vec<&str> = apps.iter().map(|a| a.name.as_str()).collect();
        assert_eq!(names, ["Xcode", "Google Chrome", "A", "C"]);
        assert_eq!(apps[0].cpu, 15.0);
        assert_eq!(apps[1], AppUse { name: "Google Chrome".into(), cpu: 10.0, mem: 150 });
    }

    #[test]
    fn an_app_share_never_passes_the_whole_mac() {
        let p = Path::new("/Applications/A.app/a");
        assert_eq!(top_apps([(Some(p), 900.0, 0), (Some(p), -5.0, 0)], 4)[0].cpu, 100.0);
        assert_eq!(top_apps([(Some(p), 50.0, 0)], 0)[0].cpu, 50.0);
    }

    #[test]
    fn the_chip_is_its_hottest_die_and_bogus_readings_are_skipped() {
        let s = [("PMU tdie1", Some(40.0)), ("PMU2 tdie3", Some(52.5)), ("PMU tdev1", Some(99.0)), ("PMU tdie2", Some(-22.0)), ("PMU tdie9", None)];
        assert_eq!(pick_temps(s).0, Some(52.5));
    }

    #[test]
    fn the_second_number_is_the_battery_then_the_ssd() {
        let both = [("NAND CH0 temp", Some(33.0)), ("gas gauge battery", Some(31.0))];
        assert_eq!(pick_temps(both), (None, Some(31.0), Some("battery")));
        assert_eq!(pick_temps([("NAND CH0 temp", Some(33.0))]), (None, Some(33.0), Some("ssd")));
        assert_eq!(pick_temps([("als-temp", None)]), (None, None, None));
    }

    #[test]
    fn pressure_is_what_is_not_free() {
        assert_eq!(pressure_from_level(56), Some(44.0));
        assert_eq!(pressure_from_level(100), Some(0.0));
        assert_eq!(pressure_from_level(-1), None);
        assert_eq!(pressure_from_level(101), None);
    }

    #[test]
    fn history_keeps_the_last_minute_oldest_first() {
        let t = Instant::now();
        let mut h = VecDeque::new();
        h.push_back((t, 1.0, Some(10.0)));
        h.push_back((t + Duration::from_secs(30), 2.0, None));
        h.push_back((t + Duration::from_secs(61), 3.0, Some(30.0)));
        let now = t + Duration::from_secs(61);
        assert_eq!(recent(&mut h, now), vec![
            Point { ago: 31.0, cpu: 2.0, pressure: None },
            Point { ago: 0.0, cpu: 3.0, pressure: Some(30.0) },
        ]);
        assert_eq!(h.len(), 2);
    }

    fn no_disk() -> Disk {
        Disk { total: 0, free: 0, parts: None }
    }

    #[test]
    fn live_read_is_plausible() {
        let mut stats = SystemStats::new();
        let s = stats.read(no_disk);
        assert!((0.0..=100.0).contains(&s.cpu), "cpu {}", s.cpu);
        assert!(s.mem_total > 0 && s.mem_used <= s.mem_total);
        assert!(s.rx >= 0.0 && s.tx >= 0.0);
        assert!(s.pressure.is_some_and(|p| (0.0..=100.0).contains(&p)), "pressure {:?}", s.pressure);
        assert!(!s.apps.is_empty(), "some app is always running on a Mac");
        assert_eq!(s.history.len(), 1);
        assert_eq!(s.disk, Some(no_disk()));
        let again = stats.read(|| panic!("the disk is read at most every SLOW_EVERY"));
        assert_eq!(again.history.len(), 2);
    }
}
