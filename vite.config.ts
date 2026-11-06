import { defineConfig } from "vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // Eight pages: the notch overlay, the settings window, the dim layer, the
  // screenshot picker, the screenshot editor, and Intip jendela's card, layer
  // and switcher.
  build: {
    rolldownOptions: {
      input: {
        main: "index.html",
        settings: "settings.html",
        clean: "clean.html",
        pick: "pick.html",
        editor: "editor.html",
        peek: "peek.html",
        peekStage: "peek-stage.html",
        switcher: "switcher.html",
      },
    },
  },
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
