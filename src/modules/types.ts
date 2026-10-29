import type { Lang } from '../kit/protocol';
import type { NotchConfig } from '../notch/config';
import type { CardSize } from '../notch/controller';

// A module's notification channel with the person's switches (ChannelDto).
export interface Channel {
  id: string;
  name: string;
  on: boolean;
  sound: boolean;
}

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
  channels: Channel[];
}

export interface ModuleState {
  lang: Lang;
  modules: ModuleInfo[];
  lastCard: string | null;
  notch: NotchConfig;
  notifications: { glow: boolean; seconds: number };
  missed: string[]; // modules with a notice nobody saw, oldest first
}
