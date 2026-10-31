//! Cermin's lamp (design 31 Oct, Cermin §4): the screens go to full brightness
//! while it is on, and back to what they were when it goes off.

/// A display's id and its brightness, 0–1.
pub type Level = (u32, f32);

/// Who turned the lamp on, and the brightness to put back.
#[derive(Debug, Default)]
pub struct Lamp {
    owner: Option<String>,
    saved: Vec<Level>,
}

impl Lamp {
    pub fn owner(&self) -> Option<&str> {
        self.owner.as_deref()
    }

    /// The displays to raise. A lamp already on keeps the brightness it saved
    /// first, so a second `on` cannot save the maximum as the one to go back to.
    pub fn turn_on(&mut self, owner: &str, current: Vec<Level>) -> Vec<u32> {
        if self.owner.is_none() {
            self.saved = current;
        }
        self.owner = Some(owner.to_string());
        self.saved.iter().map(|(id, _)| *id).collect()
    }

    /// The brightness to put back; nothing when the lamp was off.
    pub fn turn_off(&mut self) -> Vec<Level> {
        self.owner = None;
        std::mem::take(&mut self.saved)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn on_saves_the_brightness_and_off_gives_it_back() {
        let mut l = Lamp::default();
        assert_eq!(l.turn_on("mirror", vec![(1, 0.4), (2, 0.7)]), vec![1, 2]);
        assert_eq!(l.owner(), Some("mirror"));
        assert_eq!(l.turn_off(), vec![(1, 0.4), (2, 0.7)]);
        assert_eq!(l.owner(), None);
    }

    #[test]
    fn a_second_on_keeps_the_first_brightness() {
        let mut l = Lamp::default();
        l.turn_on("mirror", vec![(1, 0.4)]);
        assert_eq!(l.turn_on("mirror", vec![(1, 1.0)]), vec![1]);
        assert_eq!(l.turn_off(), vec![(1, 0.4)]);
    }

    #[test]
    fn off_while_off_restores_nothing() {
        let mut l = Lamp::default();
        assert!(l.turn_off().is_empty());
    }
}
