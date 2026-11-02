import type { Lang } from '../../kit/protocol';
import type { CatalogWidget } from '../../pages/layout';
import { analogSvg } from '../../../modules/waktu/widgets/analog';
import { clockDateView } from '../../../modules/waktu/widgets/clockdate';
import { svgBox } from '../../kit/widget';

// Editor samples for the widget packs, drawn with the helpers the widgets use. Static, at the
// same moment as the home samples (30 Oct 2026, 09:32), not live.
const AT = new Date(2026, 9, 30, 9, 32, 15);

// The sample for a pack widget, or null for one that is not a pack's.
export function packSample(w: CatalogWidget, lang: Lang): HTMLElement[] | null {
  switch (w.ref) {
    case 'waktu/clockdate': {
      // The widget's own content, minus the wrapper that fills a frame.
      const view = clockDateView(document.body, lang, AT, 'Jakarta');
      return [...view.children] as HTMLElement[];
    }
    case 'waktu/analog':
      return [svgBox('ed-analog', analogSvg(AT, lang))];
    default:
      return null;
  }
}
