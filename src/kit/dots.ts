// Our own 5 × 7 dot font (beranda-nothing.html); '1' is a lit dot.
export const GLYPHS: Record<string, readonly string[]> = {
  '0': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '°': ['010', '101', '010', '000', '000', '000', '000'],
  '%': ['11000', '11001', '00010', '00100', '01000', '10011', '00011'],
};

// Glyphs one dot apart; dot radius 0.4 of the pitch.
export function dotText(text: string, pitch: number): string {
  let x = 0;
  let out = '';
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (!g) throw new Error(`no dot glyph for "${ch}"`);
    g.forEach((row, r) => [...row].forEach((b, c) => {
      if (b === '1') out += `<circle cx="${(x + c) * pitch + pitch / 2}" cy="${r * pitch + pitch / 2}" r="${pitch * 0.4}"/>`;
    }));
    x += g[0].length + 1;
  }
  const w = (x - 1) * pitch;
  const h = 7 * pitch;
  return `<svg class="dm" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="currentColor">${out}</svg>`;
}

// Row of dots with the first `lit` ones white (Beranda N2's progress row).
export function dotBar(count: number, lit: number): string {
  let out = '';
  for (let i = 0; i < count; i++) {
    out += `<circle cx="${i * 6 + 2.5}" cy="2.5" r="1.7" fill="${i < lit ? '#fff' : 'rgba(255,255,255,.16)'}"/>`;
  }
  return `<svg class="dbar" width="${count * 6 - 1}" height="5">${out}</svg>`;
}
