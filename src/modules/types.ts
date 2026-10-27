import type { Lang } from '../kit/protocol';
import type { CardSize } from '../notch/controller';

// Same shape as ModuleStateDto in src-tauri/src/app_core.rs.
export interface ModuleInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  entry: string;
  icon: string;
  card: CardSize;
  installed: boolean;
  enabled: boolean;
}

export interface ModuleState {
  lang: Lang;
  modules: ModuleInfo[];
  lastCard: string | null;
}
