# Reconhecimento Facial — apoio à identificação

Protótipo acadêmico de uma aplicação web que ajuda a identificar pessoas **por rosto** e **por marcas corporais** (tatuagens, cicatrizes, sinais), rodando **100% no navegador**: a IA, o banco de dados e a criptografia funcionam no próprio aparelho, sem servidor e sem enviar nenhuma imagem para fora.

Projeto acadêmico da Faculdade Municipal de Palhoça, pensado para o contexto de uso da PMSC (Palhoça).

**[▶ Demo ao vivo](https://<seu-usuario>.github.io/reconhecimentofacial/)**

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-tested-6E9F18?logo=vitest&logoColor=white)

---

## Funcionalidades

| Aba | O que faz |
| --- | --- |
| **Rosto** | Captura pela câmera (frontal/traseira) ou envio de imagem (JPG, PNG, WEBP). Detecta vários rostos na mesma foto e, para cada um, lista os **5 candidatos mais parecidos** com faixa de semelhança (alta / média / baixa), a similaridade do rosto e dos olhos e um **laudo de qualidade** da foto. Modo **"rosto coberto"** compara só a região dos olhos (máscara, balaclava). |
| **Íris** *(experimental)* | Foto de perto com a câmera traseira em resolução máxima, com orientação ao vivo ("aproxime mais"), lanterna e zoom. Confere a íris com uma ficha (1:1) ou busca em todas (1:N), mostrando o olho capturado ao lado do cadastrado. |
| **Marcas** | Busca por tipo de marca, região do corpo, lado e descrição livre ("carpa colorida no antebraço"). Funciona mesmo sem foto do rosto. |
| **Pessoas** | Cadastro com nome, apelido, observações, **várias fotos de épocas diferentes**, **amostras de íris** e marcas corporais. Backup criptografado, registro de uso e exclusão total dos dados. |

## Identidade visual

Cores institucionais da PMSC (tiradas do site oficial) e do uniforme, pensadas para uso na rua, de dia e à noite:

| Cor | Hex | Uso |
| --- | --- | --- |
| Farda noturna | `#23211C` | fundo (cáqui do uniforme escurecido) |
| Cáqui PMSC | `#B2A998` | texto secundário, régua de evidência |
| Branco SC | `#F3F1EC` | texto principal |
| Vermelho PMSC | `#D7042B` | identidade e ação principal (faixa do cabeçalho, aba ativa, capturar) |
| Verde SC | `#008448` | **só ações que o policial confirma** ("É esta pessoa", "Salvar ficha"); o sistema nunca mostra verde por conta própria |
| Dourado do brasão | `#FBED21` | foco do teclado e avisos |

Títulos em Barlow Semi Condensed (desenho inspirado em placas de rodovia) e texto em Atkinson Hyperlegible (feita para máxima legibilidade, com zero cortado para não confundir com a letra O). O resultado de cada consulta é uma **folha de comparação**: a foto consultada e a da ficha alinhadas na mesma escala, com linhas de referência nos olhos e na boca, e uma régua com as taxas de falso positivo medidas.

## Decisões de projeto

- **Nunca "identifica" sozinho.** O sistema devolve uma lista ranqueada de candidatos e exige conferência humana — reduz o risco de falso positivo, que é o erro mais grave nesse domínio.
- **Privacidade por padrão.** Modelos de IA servidos localmente (`public/models`), dados em IndexedDB no próprio aparelho, e só o recorte do rosto é armazenado (minimização de dados).
- **Backup criptografado.** Exportação com AES‑256‑GCM e chave derivada da senha por PBKDF2‑SHA256 (310 mil iterações), via Web Crypto API.
- **Várias fotos por pessoa.** A comparação usa a foto mais parecida de cada ficha, o que ajuda com envelhecimento e mudanças de aparência.
- **Vetores versionados.** Cada embedding guarda o modelo que o gerou; vetores de modelos diferentes nunca são comparados. Quando o modelo muda, a base é **recalculada sozinha** a partir das fotos guardadas.
- **Limiares medidos, não chutados.** Faixas definidas pela taxa de falso positivo medida no LFW (828 mil pares de pessoas diferentes) — ver [BIOMETRIA.md](BIOMETRIA.md).
- **Registro de uso** das consultas, cadastros e exportações (últimos 1.000 eventos).

## Como funciona o reconhecimento

```
foto ─► BlazeFace ─► malha de 478 pontos (olhos, pálpebras, íris, nariz, boca)
                         │
   ┌─────────────────────┼─────────────────────────────┐
   ▼                     ▼                             ▼
Etapa 1: rosto      Etapa 2: periocular          Etapa 3: íris (foto de perto)
alinhamento por     mesmo ArcFace com tudo       Daugman: integro-diferencial,
5 pontos → ArcFace  abaixo do nariz apagado      rubber sheet, log-Gabor,
   │                     │                       distância de Hamming
   └── fusão (z-norm) ───┘                             │
            ▼                                          ▼
   top 5 candidatos + faixa                 conferência 1:1 / busca 1:N
```

Detecção e malha vêm da biblioteca [`@vladmandic/human`](https://github.com/vladmandic/human); o vetor facial é o **ArcFace/InsightFace** (efficientnet-b0, em [vendor/models](vendor/models)); o módulo de íris é implementação própria em [src/lib/iris](src/lib/iris). Tudo roda com TensorFlow.js (WebGL, com fallback para CPU).

Resultado no LFW, com o pipeline do próprio app (detalhes e metodologia em **[BIOMETRIA.md](BIOMETRIA.md)**):

| | Modelo anterior (faceres) | Agora |
| --- | --- | --- |
| Rosto inteiro — acerto com 0,1% de falso positivo | 68,8% | **98,9%** |
| Consulta de máscara × ficha sem máscara — idem | 14,1% | **85,8%** (modo "rosto coberto") |

Faixas de semelhança ([match.ts](src/lib/recognition/match.ts)):

| Faixa | Taxa de falso positivo medida |
| --- | --- |
| Alta | 0,01% |
| Média | 0,1% |
| Baixa (mínimo exibido) | 1% |

A busca por marcas usa uma pontuação explicável ([marks.ts](src/lib/marks.ts)): região exata vale mais que região vizinha, lado diferente não elimina o candidato (testemunhas confundem lados) e o texto é comparado sem acentos e por início de palavra.

## Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Lucide
- **IA no navegador:** @vladmandic/human (TensorFlow.js)
- **Dados:** IndexedDB, Web Crypto API
- **Qualidade:** Vitest + Testing Library + fake-indexeddb, ESLint
- **CI/CD:** GitHub Actions (lint → testes → build → GitHub Pages)

## Estrutura

```
src/
├── pages/                FaceSearch, IrisCheck, MarkSearch, Persons (uma por aba)
├── components/           câmera, captura de íris, formulário de pessoa, editor de marcas, backup
├── lib/
│   ├── recognition/      engine (modelos) · align + arcface (Etapa 1) · periocular (Etapa 2)
│   │                     · landmarks · quality · match (fusão e faixas)
│   ├── iris/             Etapa 3: localize · normalize · encode · match · pipeline · verify
│   ├── migrate.ts        atualização automática da base quando o modelo muda
│   ├── marks.ts          busca por marcas corporais
│   ├── db.ts             IndexedDB
│   ├── backup.ts         exportação/importação criptografada
│   └── image.ts          validação, redimensionamento e recorte
├── state/AppState.tsx    estado global
└── test/                 testes unitários
```

## Rodando localmente

Requisitos: Node.js 18+ e um navegador com WebRTC para a câmera.

```bash
npm install     # também copia os modelos de IA para public/models
npm run dev     # http://localhost:8080
```

| Comando | Descrição |
| --- | --- |
| `npm run build` | Build de produção em `dist/` |
| `npm run preview` | Serve o build localmente |
| `npm test` | Testes unitários |
| `npm run lint` | ESLint |

> A câmera só funciona em `localhost` ou HTTPS.

## Deploy

Cada push na `main` roda lint, testes e build, e publica no GitHub Pages ([workflow](.github/workflows/deploy-pages.yml)). Na primeira vez, ative em **Settings → Pages → Source → GitHub Actions**. O caminho base (`/reconhecimentofacial/`) está em [vite.config.ts](vite.config.ts) e deve bater com o nome do repositório.

## Limitações

- Protótipo acadêmico: **não substitui sistemas biométricos certificados** e não deve ser usado para decisões reais sem validação.
- Os limiares de rosto foram medidos no LFW (fotos de famosos, boa luz); precisam ser recalibrados com pares reais nas condições de uso (rua, noite, celular da viatura).
- **Íris em luz visível é experimental**: funciona pior que leitores infravermelhos, principalmente em olhos castanhos/escuros, e os limiares ainda não foram calibrados com olhos reais. Use só como confirmação. A Etapa 4 (leitor NIR) está descrita em [BIOMETRIA.md](BIOMETRIA.md).
- O modelo ArcFace foi treinado com dados liberados para pesquisa/uso não comercial ([vendor/models/LEIA-ME.md](vendor/models/LEIA-ME.md)).
- O desempenho depende do aparelho; iluminação, ângulo e resolução afetam o resultado.
- A base existe só no navegador em que foi criada — use o backup criptografado para transferir.

## Equipe

- Letícia Tambani
- Marcelo Marques de Souza
- Rithiély Schmitt
