//! CPU, memory and network, read only when a module asks.

use std::time::{Duration, Instant};

use sysinfo::{Networks, System, MINIMUM_CPU_UPDATE_INTERVAL};

/// `cpu` 0–100; `rx`/`tx` in bytes per second.
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub cpu: f32,
    pub mem_used: u64,
    pub mem_total: u64,
    pub rx: f64,
    pub tx: f64,
}

#[derive(Clone, Copy, Debug)]
pub struct NetSample {
    pub at: Instant,
    pub rx_total: u64,
    pub tx_total: u64,
}

/// A baseline older than this is too old to measure rates against.
pub const STALE_AFTER: Duration = Duration::from_secs(5);

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

pub struct SystemStats {
    sys: System,
    nets: Networks,
    last: Option<NetSample>,
}

impl SystemStats {
    pub fn new() -> Self {
        SystemStats { sys: System::new(), nets: Networks::new(), last: None }
    }

    /// Without a fresh baseline (first read, or the card was closed a while),
    /// samples twice, the minimum CPU interval apart, so every read has numbers.
    pub fn read(&mut self) -> Stats {
        let fresh = self.last.is_some_and(|l| l.at.elapsed() < STALE_AFTER);
        if !fresh {
            self.sample();
            std::thread::sleep(MINIMUM_CPU_UPDATE_INTERVAL);
        }
        let prev = self.last;
        let now = self.sample();
        self.sys.refresh_memory();
        let (rx, tx) = prev.map_or((0.0, 0.0), |p| rates(&p, &now));
        Stats {
            cpu: self.sys.global_cpu_usage().clamp(0.0, 100.0),
            mem_used: self.sys.used_memory(),
            mem_total: self.sys.total_memory(),
            rx,
            tx,
        }
    }

    // Refreshes CPU and network counters and records the network totals.
    fn sample(&mut self) -> NetSample {
        self.sys.refresh_cpu_usage();
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
    fn live_read_is_plausible() {
        let s = SystemStats::new().read();
        assert!((0.0..=100.0).contains(&s.cpu), "cpu {}", s.cpu);
        assert!(s.mem_total > 0 && s.mem_used <= s.mem_total);
        assert!(s.rx >= 0.0 && s.tx >= 0.0);
    }
}
