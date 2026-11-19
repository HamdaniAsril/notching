//! Kecerahan (design 19 Nov): telling monitors apart by their EDID, the DDC
//! packets for brightness, and software dimming's gamma. Free of IOKit and
//! CoreGraphics so it can be unit tested.

/// VCP code of brightness (MCCS).
pub const VCP_BRIGHTNESS: u8 = 0x10;
/// Software dimming never goes below this share of the monitor's own light.
pub const SOFT_FLOOR: f32 = 0.1;

/// A monitor's EDID vendor, product and serial: what CGDisplayVendorNumber,
/// CGDisplayModelNumber and CGDisplaySerialNumber give for the same screen.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct MonitorId {
    pub vendor: u32,
    pub product: u32,
    pub serial: u32,
}

impl MonitorId {
    /// The key it is remembered under.
    pub fn key(self) -> String {
        format!("{:x}-{:x}-{:x}", self.vendor, self.product, self.serial)
    }
}

pub fn edid_id(edid: &[u8]) -> Option<MonitorId> {
    const HEADER: [u8; 8] = [0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00];
    if edid.len() < 16 || edid[..8] != HEADER {
        return None;
    }
    Some(MonitorId {
        vendor: u32::from(u16::from_be_bytes([edid[8], edid[9]])),
        product: u32::from(u16::from_le_bytes([edid[10], edid[11]])),
        serial: u32::from_le_bytes([edid[12], edid[13], edid[14], edid[15]]),
    })
}

/// "Get VCP feature" for `vcp`, as IOAVServiceWriteI2C takes it (chip 0x37,
/// offset 0x51).
pub fn get_packet(vcp: u8) -> [u8; 4] {
    let mut p = [0x82, 0x01, vcp, 0];
    p[3] = p[..3].iter().fold(0x6E, |a, b| a ^ b);
    p
}

/// "Set VCP feature" `vcp` to `value`.
pub fn set_packet(vcp: u8, value: u16) -> [u8; 6] {
    let [hi, lo] = value.to_be_bytes();
    let mut p = [0x84, 0x03, vcp, hi, lo, 0];
    p[5] = p[..5].iter().fold(0x6E ^ 0x51, |a, b| a ^ b);
    p
}

/// The (current, max) of a get-VCP reply for `vcp`; None for an error, another
/// code, or a reply that fails its checksum.
pub fn parse_reply(vcp: u8, reply: &[u8]) -> Option<(u16, u16)> {
    let r = reply.get(..11)?;
    let checksum = r[..10].iter().fold(0x50, |a, b| a ^ b);
    if checksum != r[10] || r[2] != 0x02 || r[3] != 0x00 || r[4] != vcp {
        return None;
    }
    let max = u16::from_be_bytes([r[6], r[7]]);
    let current = u16::from_be_bytes([r[8], r[9]]);
    (max > 0).then_some((current.min(max), max))
}

/// The DDC value for a level of 0–1.
pub fn ddc_value(level: f32, max: u16) -> u16 {
    (level.clamp(0.0, 1.0) * f32::from(max)).round() as u16
}

/// The level 0–1 of a DDC value.
pub fn ddc_level(current: u16, max: u16) -> f32 {
    if max == 0 {
        return 1.0;
    }
    (f32::from(current) / f32::from(max)).clamp(0.0, 1.0)
}

/// How much of the monitor's light software dimming keeps at a level of 0–1.
pub fn soft_factor(level: f32) -> f32 {
    SOFT_FLOOR + (1.0 - SOFT_FLOOR) * level.clamp(0.0, 1.0)
}

/// Two gamma channels the same to within what macOS rounds a table to.
pub fn same_gamma(a: &[f32], b: &[f32]) -> bool {
    a.len() == b.len() && a.iter().zip(b).all(|(x, y)| (x - y).abs() < 0.005)
}

/// A gamma channel scaled by `factor`.
pub fn scaled(table: &[f32], factor: f32) -> Vec<f32> {
    let f = factor.clamp(0.0, 1.0);
    table.iter().map(|v| v * f).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    // The first 16 bytes of the Lenovo L24i-40's EDID, read in the spike.
    const LENOVO: [u8; 16] = [0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00, 0x30, 0xae, 0xa8, 0x67, 0x01, 0x01, 0x01, 0x01];

    #[test]
    fn a_monitor_is_known_by_its_edid() {
        let id = edid_id(&LENOVO).unwrap();
        assert_eq!(id, MonitorId { vendor: 0x30ae, product: 0x67a8, serial: 0x0101_0101 });
        assert_eq!(id.key(), "30ae-67a8-1010101");
        assert_eq!(edid_id(&LENOVO[..12]), None);
        let mut broken = LENOVO;
        broken[1] = 0;
        assert_eq!(edid_id(&broken), None);
    }

    #[test]
    fn packets_carry_their_checksum() {
        // Get: 0x82 0x01 0x10, the checksum seeded with 0x6E.
        assert_eq!(get_packet(0x10), [0x82, 0x01, 0x10, 0x6E ^ 0x82 ^ 0x01 ^ 0x10]);
        // Set to 300: 0x84 0x03 0x10 0x01 0x2C, seeded with 0x6E ^ 0x51.
        assert_eq!(set_packet(0x10, 300), [0x84, 0x03, 0x10, 0x01, 0x2C, 0x6E ^ 0x51 ^ 0x84 ^ 0x03 ^ 0x10 ^ 0x01 ^ 0x2C]);
    }

    fn reply(vcp: u8, result: u8, max: u16, current: u16) -> Vec<u8> {
        let mut r = vec![0x6E, 0x88, 0x02, result, vcp, 0x00, (max >> 8) as u8, max as u8, (current >> 8) as u8, current as u8, 0];
        r[10] = r[..10].iter().fold(0x50, |a, b| a ^ b);
        r
    }

    #[test]
    fn a_reply_gives_current_and_max() {
        assert_eq!(parse_reply(0x10, &reply(0x10, 0, 100, 42)), Some((42, 100)));
        // An error, another code, a bad checksum, or too short.
        assert_eq!(parse_reply(0x10, &reply(0x10, 1, 100, 42)), None);
        assert_eq!(parse_reply(0x10, &reply(0x12, 0, 100, 42)), None);
        let mut bad = reply(0x10, 0, 100, 42);
        bad[10] ^= 1;
        assert_eq!(parse_reply(0x10, &bad), None);
        assert_eq!(parse_reply(0x10, &bad[..9]), None);
        // What the Lenovo answered through its adapter: EDID text, not DDC.
        assert_eq!(parse_reply(0x10, &[0x35, 0x35, 0x42, 0x35, 0x0a, 0x20, 0x20, 0x20, 0x20, 0x00, 0x00]), None);
        // A max of 0 is not an answer either.
        assert_eq!(parse_reply(0x10, &reply(0x10, 0, 0, 0)), None);
    }

    #[test]
    fn ddc_values_and_levels() {
        assert_eq!(ddc_value(0.0, 100), 0);
        assert_eq!(ddc_value(0.426, 100), 43);
        assert_eq!(ddc_value(1.0, 100), 100);
        assert_eq!(ddc_value(2.0, 100), 100);
        assert_eq!(ddc_value(-1.0, 100), 0);
        assert_eq!(ddc_level(50, 100), 0.5);
        assert_eq!(ddc_level(80, 0), 1.0);
    }

    #[test]
    fn software_dimming_keeps_a_tenth() {
        assert_eq!(soft_factor(1.0), 1.0);
        assert_eq!(soft_factor(0.0), SOFT_FLOOR);
        assert!((soft_factor(0.5) - 0.55).abs() < 1e-6);
        assert_eq!(soft_factor(3.0), 1.0);
    }

    #[test]
    fn gamma_read_back_after_rounding_is_the_same() {
        assert!(same_gamma(&[0.0, 0.5, 1.0], &[0.001, 0.499, 0.998]));
        assert!(!same_gamma(&[0.0, 0.5, 1.0], &[0.0, 0.45, 1.0]));
        assert!(!same_gamma(&[0.0, 0.5], &[0.0, 0.5, 1.0]));
    }

    #[test]
    fn a_gamma_channel_scales() {
        assert_eq!(scaled(&[0.0, 0.5, 1.0], 0.5), vec![0.0, 0.25, 0.5]);
        assert_eq!(scaled(&[0.2, 1.0], 2.0), vec![0.2, 1.0]);
    }
}
