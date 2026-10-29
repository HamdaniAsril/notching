//! Modules that are on or running (design 30 Oct, §7–8). Plan 5 part B fills
//! this in; for now no module reports anything.

/// White tile while on (Keep awake), a red dot while running (Timer).
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)] // reported from part B on
pub enum Activity {
    On,
    Running,
}
