// Copia os modelos de IA para public/models, para o app funcionar offline sem baixar nada de servidores externos.
//   - do pacote @vladmandic/human: detector de rosto, malha facial (478 pontos) e íris;
//   - de vendor/models: ArcFace/InsightFace (Etapas 1 e 2), que não vem no pacote npm.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const human = join(root, "node_modules", "@vladmandic", "human", "models");
const vendor = join(root, "vendor", "models");
const dest = join(root, "public", "models");
const humanModels = ["blazeface", "facemesh", "iris"];

mkdirSync(dest, { recursive: true });
if (existsSync(human)) {
  for (const name of humanModels) for (const ext of ["json", "bin"]) copyFileSync(join(human, `${name}.${ext}`), join(dest, `${name}.${ext}`));
} else {
  console.warn("[models] @vladmandic/human não encontrado; rode npm install.");
}
let extra = 0;
if (existsSync(vendor)) {
  for (const f of readdirSync(vendor)) {
    if (!/\.(json|bin)$/.test(f)) continue;
    copyFileSync(join(vendor, f), join(dest, f));
    extra++;
  }
}
console.log(`[models] ${humanModels.length} modelos do Human + ${extra} arquivo(s) de vendor/models copiados para public/models`);
