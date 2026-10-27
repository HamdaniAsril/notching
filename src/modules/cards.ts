import type { CardSize } from '../notch/controller';
import type { ModuleInfo, ModuleState } from './types';

// Size of the "every module is off" card.
export const EMPTY_CARD: CardSize = { width: 360, height: 56 };

export function activeModules(s: ModuleState): ModuleInfo[] {
  return s.modules.filter(m => m.installed && m.enabled);
}

// The card the panel shows: an open card while it stays on, else the last card
// opened (spec 4.2), else the first module that is on.
export function pickCard(s: ModuleState, current: string | null, panelOpen: boolean): ModuleInfo | null {
  const active = activeModules(s);
  const byId = (id: string | null) => active.find(m => m.id === id);
  return (panelOpen ? byId(current) : undefined) ?? byId(s.lastCard) ?? active[0] ?? null;
}
