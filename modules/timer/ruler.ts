// "6:42": minutes and seconds left, seconds rounded up, never below "0:01";
// the same as status_text in src-tauri/src/timer.rs.
export function formatLeft(ms: number): string {
  const s = Math.max(1, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
