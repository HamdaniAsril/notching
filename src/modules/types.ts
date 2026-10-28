import type { Lang } from '../kit/protocol';
import type { NotchConfig } from '../notch/config';
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
  size: number; // bytes of the original package
  iconSvg: string; // the icon file's SVG text
}

export interface ModuleState {
  lang: Lang;
  modules: ModuleInfo[];
  lastCard: string | null;
  notch: NotchConfig;
}
