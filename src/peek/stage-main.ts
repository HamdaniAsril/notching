import './stage.css';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { renderStage, type StageView } from './stage';

// The peek layer's panel (peek_service.rs): one picture at a time, or none.
const root = document.getElementById('stage-root')!;
void getCurrentWebviewWindow().listen<StageView | null>('notching://peek-stage', e => renderStage(root, e.payload));
