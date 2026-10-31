// Same as TimerDto in src-tauri/src/timer.rs.
export interface TimerView {
  state: 'idle' | 'running' | 'paused';
  minutes: number; // the last started, or the default 5
  until: number | null; // wall-clock ms, only while running
  left: number | null; // ms, while running or paused
  text: string | null; // the status text unless idle: "6:42"
}
