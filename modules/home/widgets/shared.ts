import type id from '../locales/id.json';

export type HomeStrings = typeof id;

// The helpers live in the kit now; home widgets keep importing them from here.
export { big, COLUMN_PX, el, svgBox } from '../../../src/kit/widget';
