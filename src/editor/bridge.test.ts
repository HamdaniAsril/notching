import { beforeEach, expect, test, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@tauri-apps/api/webviewWindow', () => ({ getCurrentWebviewWindow: () => ({ listen: vi.fn(async () => () => {}) }) }));

const { commitBody, tauriEditorBridge } = await import('./bridge');

beforeEach(() => invoke.mockReset());

test('the body is the edits as UTF-8, then the PNG', () => {
  const { body, editsLength } = commitBody('{"t":"é"}', new Uint8Array([0x89, 0x50]));
  expect(editsLength).toBe(10); // é is two bytes
  expect(new TextDecoder().decode(body.slice(0, editsLength))).toBe('{"t":"é"}');
  expect([...body.slice(editsLength)]).toEqual([0x89, 0x50]);
  expect([...commitBody('', null).body]).toEqual([]);
  expect(commitBody('{}', null)).toEqual({ body: new TextEncoder().encode('{}'), editsLength: 2 });
});

test('commit sends raw bytes with the id, action and edits length in headers', async () => {
  invoke.mockResolvedValue('/Desktop/x.png');
  const png = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
  await expect(tauriEditorBridge().commit(7, '{}', png, 'save')).resolves.toBe('/Desktop/x.png');
  const [cmd, body, options] = invoke.mock.calls[0];
  expect(cmd).toBe('editor_commit');
  expect(body).toBeInstanceOf(Uint8Array);
  expect([...body]).toEqual([0x7b, 0x7d, 1, 2, 3]);
  expect(options).toEqual({ headers: { 'Notching-Id': '7', 'Notching-Action': 'save', 'Notching-Edits-Length': '2' } });

  // No picture: the body ends with the edits.
  await tauriEditorBridge().commit(7, '', null, 'keep');
  expect([...invoke.mock.calls[1][1]]).toEqual([]);
  expect(invoke.mock.calls[1][2].headers['Notching-Edits-Length']).toBe('0');
});

test('doc, closing and close call their commands', async () => {
  const b = tauriEditorBridge();
  await b.doc();
  await b.closing();
  await b.close();
  expect(invoke.mock.calls.map(c => c[0])).toEqual(['editor_doc', 'editor_closing', 'editor_close']);
});
