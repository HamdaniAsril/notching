// Shared by the waktu tests: a Saturday morning in Jakarta.
export const NOW = new Date(2026, 9, 31, 9, 41, 30);

export function host(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  return root;
}
