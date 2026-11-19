//! Volume app (design 19 Nov): which app a sound process belongs to, which
//! apps get a tap, and copying a tap's sound to the output at a level. Free of
//! Core Audio so it can be unit tested.

use std::collections::BTreeMap;

/// The outermost `.app` bundle in a process's path: Chrome's helpers belong to
/// Chrome. None for a process outside any app.
pub fn app_of(path: &str) -> Option<String> {
    let at = path.find(".app/").map(|i| i + 4).or_else(|| path.ends_with(".app").then_some(path.len()))?;
    let app = &path[..at];
    (app.len() > 4 && app.starts_with('/')).then(|| app.to_string())
}

/// "Google Chrome" for "/Applications/Google Chrome.app".
pub fn app_name(app: &str) -> String {
    let last = app.trim_end_matches('/').rsplit('/').next().unwrap_or(app);
    last.strip_suffix(".app").unwrap_or(last).to_string()
}

/// The taps there should be: every app below 100 % with the process objects
/// it has now, sorted so a change is easy to see.
pub fn wanted(processes: &[(String, u32)], levels: &BTreeMap<String, f32>) -> BTreeMap<String, Vec<u32>> {
    let mut taps: BTreeMap<String, Vec<u32>> = BTreeMap::new();
    for (app, object) in processes {
        if levels.get(app).is_some_and(|l| *l < 1.0) {
            taps.entry(app.clone()).or_default().push(*object);
        }
    }
    for objects in taps.values_mut() {
        objects.sort_unstable();
        objects.dedup();
    }
    taps
}

/// Copies interleaved audio from `input` (`in_ch` channels) to `output`
/// (`out_ch` channels) at `gain`; output channel n takes input channel n mod
/// in_ch. Frames the input lacks are silence.
pub fn copy_scaled(input: &[f32], in_ch: usize, output: &mut [f32], out_ch: usize, gain: f32) {
    if in_ch == 0 || out_ch == 0 {
        output.fill(0.0);
        return;
    }
    let in_frames = input.len() / in_ch;
    for (frame, out) in output.chunks_mut(out_ch).enumerate() {
        for (n, sample) in out.iter_mut().enumerate() {
            *sample = if frame < in_frames { input[frame * in_ch + n % in_ch] * gain } else { 0.0 };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RENDERER: &str = "/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Versions/131/Helpers/Google Chrome Helper (Renderer).app/Contents/MacOS/Google Chrome Helper (Renderer)";

    #[test]
    fn a_helper_belongs_to_the_app_around_it() {
        assert_eq!(app_of(RENDERER).as_deref(), Some("/Applications/Google Chrome.app"));
        assert_eq!(app_of("/Applications/Spotify.app/Contents/MacOS/Spotify").as_deref(), Some("/Applications/Spotify.app"));
        assert_eq!(app_of("/Users/me/Applications/Claude.app/Contents/MacOS/Claude").as_deref(), Some("/Users/me/Applications/Claude.app"));
        // Not inside an app.
        assert_eq!(app_of("/usr/sbin/coreaudiod"), None);
        assert_eq!(app_of("/opt/bin/thing.application/x"), None);
        assert_eq!(app_of(""), None);
    }

    #[test]
    fn an_app_is_named_by_its_bundle() {
        assert_eq!(app_name("/Applications/Google Chrome.app"), "Google Chrome");
        assert_eq!(app_name("/Applications/Spotify.app/"), "Spotify");
    }

    #[test]
    fn only_apps_below_full_get_a_tap_with_all_their_processes() {
        let chrome = "/Applications/Google Chrome.app".to_string();
        let music = "/System/Applications/Music.app".to_string();
        let processes = vec![(chrome.clone(), 140), (music.clone(), 90), (chrome.clone(), 120)];
        let levels = BTreeMap::from([(chrome.clone(), 0.4), (music.clone(), 1.0), ("/Applications/Gone.app".into(), 0.2)]);
        let taps = wanted(&processes, &levels);
        assert_eq!(taps, BTreeMap::from([(chrome, vec![120, 140])]));
    }

    #[test]
    fn stereo_to_stereo_at_half() {
        let input = [0.5, -0.5, 1.0, 0.25];
        let mut output = [9.0; 4];
        copy_scaled(&input, 2, &mut output, 2, 0.5);
        assert_eq!(output, [0.25, -0.25, 0.5, 0.125]);
    }

    #[test]
    fn more_output_channels_repeat_the_input_ones() {
        let input = [0.2, 0.4];
        let mut output = [9.0; 4];
        copy_scaled(&input, 2, &mut output, 4, 1.0);
        assert_eq!(output, [0.2, 0.4, 0.2, 0.4]);
        let mono = [0.6];
        let mut out = [9.0; 2];
        copy_scaled(&mono, 1, &mut out, 2, 1.0);
        assert_eq!(out, [0.6, 0.6]);
    }

    #[test]
    fn missing_input_frames_and_zero_gain_are_silence() {
        let input = [0.5, 0.5];
        let mut output = [9.0; 4];
        copy_scaled(&input, 2, &mut output, 2, 1.0);
        assert_eq!(output, [0.5, 0.5, 0.0, 0.0]);
        let mut quiet = [9.0; 2];
        copy_scaled(&input, 2, &mut quiet, 2, 0.0);
        assert_eq!(quiet, [0.0, 0.0]);
        let mut none = [9.0; 2];
        copy_scaled(&[], 0, &mut none, 2, 1.0);
        assert_eq!(none, [0.0, 0.0]);
    }
}
