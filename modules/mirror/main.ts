import '../../src/kit/kit.css';
import '../../src/kit/volt.css';
import './style.css';
import { connectKit } from '../../src/kit/client';
import en from './locales/en.json';
import id from './locales/id.json';
import { kitSound } from '../timer/tik';
import { glowColor, lightColor } from './ruler';
import { renderMirror } from './view';

// The camera lives as long as this page: the notch drops the frame when the
// panel closes or another page opens, and WebKit ends the capture with it.
async function start(): Promise<void> {
  const kit = await connectKit();
  const t = kit.lang === 'en' ? en : id;
  let stream: MediaStream | null = null;
  let cameras: MediaDeviceInfo[] = [];
  let current = 0;

  const stop = () => {
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
  };

  // Names show only once the camera is allowed, so the list is read after it opens.
  async function listCameras(): Promise<void> {
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    cameras = devices.filter(d => d.kind === 'videoinput');
    const using = stream?.getVideoTracks()[0]?.getSettings().deviceId;
    const at = cameras.findIndex(c => c.deviceId === using);
    current = at < 0 ? 0 : at;
    view.setCameras(cameras.map((c, i) => c.label || `${t.mirror} ${i + 1}`), current);
  }

  async function open(deviceId?: string): Promise<void> {
    stop();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false,
      });
      view.setStream(stream);
    } catch {
      view.setStream(null);
    }
    await listCameras();
  }

  const sound = await kitSound(kit);
  const view = renderMirror(document.getElementById('cm')!, t, {
    lamp: (on, k) => kit.lamp(on, lightColor(k), glowColor(k)),
    nextCamera: () => {
      if (cameras.length < 2) return;
      void open(cameras[(current + 1) % cameras.length].deviceId);
    },
  }, sound);

  navigator.mediaDevices?.addEventListener('devicechange', () => void listCameras());
  window.addEventListener('pagehide', stop);
  if (navigator.mediaDevices) await open();
  else view.setStream(null);
}

void start();
