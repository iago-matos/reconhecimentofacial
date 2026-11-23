import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// GitHub Pages publica em https://<usuario>.github.io/<repositorio>/
export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/reconhecimentofacial/" : "/",
  server: { host: "::", port: 8080 },
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: { chunkSizeWarningLimit: 3000 },
  // Identificador do build: o service worker usa para renovar a cópia guardada do app a cada publicação.
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
}));
