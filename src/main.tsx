import { createRoot } from "react-dom/client";
import "@fontsource/barlow-semi-condensed/600.css";
import "@fontsource/barlow-semi-condensed/700.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import App from "./App";
import { RootErrorBoundary } from "./components/RootErrorBoundary";
import "./index.css";

// Guarda app e modelos no aparelho (abre sem internet e não baixa os ~18 MB de novo). Só no build publicado.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js?v=${__BUILD_ID__}`, { scope: import.meta.env.BASE_URL })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        // Arquivos do app carregados antes de o service worker existir: pede para guardá-los também.
        const urls = performance.getEntriesByType("resource").map((e) => e.name);
        reg.active?.postMessage({ type: "guardar", urls });
      })
      .catch((e) => console.warn("Service worker não registrado:", e));
  });
}

createRoot(document.getElementById("root")!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>,
);
