# Biometria: rosto (ArcFace), periocular e íris

Documento técnico das Etapas 1, 2 e 3. A Etapa 4 (íris em infravermelho com leitor dedicado) é o próximo passo e está descrita no final.

Tudo roda **no aparelho**: nenhuma imagem sai do navegador.

```
foto ─► BlazeFace ─► malha de 478 pontos (Human/MediaPipe + modelo de íris)
                        │
        ┌───────────────┼──────────────────────────────┐
        ▼               ▼                              ▼
  Etapa 1: rosto   Etapa 2: periocular           Etapa 3: íris (foto de perto)
  alinhamento 5    rosto alinhado com tudo       Daugman: integro-diferencial →
  pontos → ArcFace abaixo do nariz apagado →     rubber sheet → log-Gabor →
  (512 números)    ArcFace (512 números)         código de 32 768 bits + máscara
        │               │                              │
        └──── fusão (z-norm) ────┘               distância de Hamming
                 │                                     │
         5 candidatos + faixa                 conferência 1:1 ou busca 1:N
```

## Etapa 1 — rosto com ArcFace

| Antes | Agora |
| --- | --- |
| `faceres` do Human (1024 números), recorte sem alinhamento fino | **ArcFace/InsightFace** (`efficientnet-b0`), 512 números |
| — | **Alinhamento por 5 pontos** (olhos, nariz, cantos da boca) no gabarito 112×112 do treino do ArcFace (similaridade de Umeyama) |
| — | **Flip test**: soma o vetor da imagem e do espelho |
| — | **Laudo de qualidade** por rosto: distância entre olhos, rotação, brilho, nitidez |
| câmera 1280×960, análise até 1600 px | câmera 2560×1920, análise até 2560 px |

Arquivos: [align.ts](src/lib/recognition/align.ts), [arcface.ts](src/lib/recognition/arcface.ts), [quality.ts](src/lib/recognition/quality.ts), [engine.ts](src/lib/recognition/engine.ts).

## Etapa 2 — periocular (região dos olhos)

O mesmo ArcFace é aplicado ao rosto alinhado com **tudo abaixo da linha 66 (de 112) apagado**: o vetor passa a depender só de olhos, pálpebras, sobrancelhas e testa. Serve para:

- **rosto coberto** (máscara, balaclava, gola, mão na boca): botão "Rosto coberto (só olhos)" na consulta;
- **reforço** no rosto inteiro: a pontuação final soma rosto e olhos (fusão por z-norm, peso 0,35 para os olhos).

Também foi testado o descritor clássico de periocular (LBP + HOG). Ele ficou muito pior nas fotos do LFW (tabela abaixo), então **não é usado** — o código continua em [periocular.ts](src/lib/recognition/periocular.ts) para referência.

## Etapa 3 — íris em luz visível (experimental)

Implementação própria, sem bibliotecas, seguindo Daugman:

1. **Captura**: câmera traseira na maior resolução do aparelho (`ImageCapture.takePhoto` quando o navegador permite), lanterna e zoom quando disponíveis. Enquanto a câmera está aberta, o app mede o diâmetro da íris e orienta ("aproxime mais").
2. **Localização**: a malha facial dá uma estimativa; o **operador integro-diferencial** refina a borda íris/esclera (só nos setores laterais, onde não há pálpebra) e a borda da pupila.
3. **Máscara**: pálpebras (contorno da malha), reflexos (muito claros) e cílios (muito escuros).
4. **Normalização** ("rubber sheet", 256 × 32), com o ângulo zero na linha canto interno → externo (compensa a inclinação da cabeça).
5. **Código**: filtro log-Gabor 1D em 2 escalas sobre o **canal vermelho** (o mais próximo do infravermelho), fase quantizada em 2 bits → 32 768 bits; os 20% de bits mais frágeis são descartados (Hollingsworth et al.).
6. **Comparação**: distância de Hamming fracionária com deslocamento de ±12 colunas (±17°), normalizada pelo número de bits comparados. Olho direito só é comparado com olho direito.
7. **Laudo**: diâmetro (ISO/IEC 19794-6: ≥150 px autenticação, ≥210 px cadastro), área útil, razão pupila/íris, nitidez (passa-banda), contraste com a esclera e direção do olhar. Captura "ruim" não pode ser cadastrada.

Arquivos: [src/lib/iris/](src/lib/iris/), tela [IrisCheck.tsx](src/pages/IrisCheck.tsx), captura [IrisCapture.tsx](src/components/IrisCapture.tsx).

**Limitação conhecida**: em luz visível a melanina esconde a textura de íris castanhas e escuras (NIST IREX IX) — justamente a maioria da população atendida. Por isso a íris aparece como **confirmação** ao lado do rosto, nunca sozinha, e os limiares (HD ≤ 0,30 forte, ≤ 0,36 moderada) **não foram calibrados com olhos reais**.

## Prova de vida

A biblioteca Human traz dois modelos passivos, que olham uma única foto: `antispoof` e `liveness`. Eles foram testados antes de entrar no app:

| Teste | antispoof (< 0,5 = falso) | liveness (< 0,5 = falso) |
| --- | --- | --- |
| 400 fotos reais (LFW): alarme falso | 11,8% | 1,8% |
| 137 fotos exibidas numa tela de celular (simuladas): detectadas | 0,7% | 0% |
| 150 fotos impressas fotografadas (simuladas): detectadas | 4,7% | 4,0% |

Os dois quase não detectaram as fraudes simuladas e ainda geram alarme falso. As simulações (moiré, borda de tela, papel, reflexo) não são ataques reais, mas o resultado basta para não confiar nesses modelos. Por isso eles **não são usados**.

O app usa **prova de vida ativa** ([liveness.ts](src/lib/recognition/liveness.ts)): por até 6 s a câmera acompanha a abertura das pálpebras (*eye aspect ratio*, Soukupová & Čech, 2016) e o giro da cabeça. Ela aceita uma piscada completa (abertura abaixo de 60% da típica e volta acima de 85%) ou um giro de 18° ou mais. Uma foto impressa ou parada numa tela não passa; um **vídeo** da pessoa exibido numa tela pode passar.

A função é **opcional e fica desligada por padrão** (Pessoas → Preferências): numa abordagem o policial já vê a pessoa, então ela serve sobretudo para auditoria. Cada consulta registra o resultado: comprovada, não comprovada, não verificada (captura simples) ou foto enviada do aparelho.

## Avaliação (LFW, no próprio navegador)

Método: o **próprio pipeline do app** rodando no Chrome (WebGL) sobre 700 pares sorteados do LFW (*Labeled Faces in the Wild*), totalizando 1 288 fotos. Foram comparadas **todas** as combinações de fotos: 468 pares da mesma pessoa e 828 360 de pessoas diferentes. Isso permite medir taxas de falso positivo de até 1 em 10 000.

- **EER**: ponto em que a taxa de falsos positivos é igual à de falsos negativos (quanto menor, melhor).
- **Acerto @ FMR**: fração de pares da mesma pessoa aceitos quando o limiar deixa passar só 1% (ou 0,1%) dos pares de pessoas diferentes.

### Etapa 1 — rosto inteiro

| Modelo | EER | Acerto @ FMR 1% | Acerto @ FMR 0,1% |
| --- | --- | --- | --- |
| faceres (modelo anterior) | 4,91% | 86,8% | 68,8% |
| **ArcFace efficientnet-b0 (escolhido)** | **1,07%** | **98,9%** | **98,9%** |
| ArcFace ghostnet-strides1 | 1,07% | 98,9% | 98,7% |
| ArcFace mobilenet-swish | 1,07% | 98,9% | 98,1% |
| ArcFace ghostnet-strides2 | 1,07% | 98,9% | 97,9% |
| ArcFace mobilenet-emore | 1,50% | 98,3% | 97,4% |
| efficientnet-b0 sem o flip test | 1,07% | 98,9% | 98,5% |

O ~1% de erro restante no LFW é dominado por pares difíceis (perfil, oclusão, foto muito antiga).

### Etapa 2 — periocular

| Representação | Rosto visível: acerto @ FMR 0,1% | **Consulta de máscara** × ficha sem máscara: acerto @ FMR 0,1% |
| --- | --- | --- |
| faceres (modelo anterior), rosto inteiro | 68,8% | 14,1% |
| ArcFace, rosto inteiro | 98,9% | 84,0% |
| **ArcFace periocular (corte 66) — usado no modo "rosto coberto"** | 94,4% | **85,8%** |
| ArcFace periocular, corte 74 | 94,9% | 86,5% |
| Textura LBP + HOG (clássico) | 8,3% | 5,0% |

A máscara foi simulada com um retângulo azul cobrindo da metade do nariz ao queixo, e o rosto foi **detectado de novo** na foto mascarada, como seria na rua. O detector achou 1 105 dos 1 288 rostos mascarados (86%).

O corte 74 rende um pouco mais, mas inclui a ponta do nariz, ou seja, parte da própria máscara. Isso pode fazer duas pessoas diferentes de máscara parecerem iguais, caso que esta simulação não testou. Por isso o app usa o corte 66.

**Leitura honesta:** no LFW o ArcFace já aguenta bem a máscara sozinho. O periocular soma pouco (+1,7 ponto) sobre ele; o ganho grande é sobre o modelo anterior. A fusão rosto + olhos (peso 0,35) é praticamente neutra com o rosto visível (98,5% contra 98,9%) e ajuda um pouco quando a máscara não foi sinalizada (84,0% → 85,2%).

### Limiares adotados ([match.ts](src/lib/recognition/match.ts))

| Faixa | Taxa de falso positivo | Acerto (rosto inteiro) | Acerto (rosto coberto) |
| --- | --- | --- | --- |
| Semelhança alta | 0,01% | 97,9% | 78,2% |
| Semelhança média | 0,1% | 98,5% | 85,8% |
| Mostrado como "baixa" (mínimo) | 1% | 98,9% | 91,6% |

Numa base com N pessoas, cada consulta tende a ter ~N/100 pessoas erradas acima do mínimo. Por isso só os 5 primeiros aparecem e "baixa" significa pista fraca.

### Etapa 3 — íris

Não existe base pública de íris em luz visível de celular que possa ser baixada sem cadastro (UBIRIS, MICHE e CUVIRIS exigem solicitação). Por isso o código foi validado assim:

- **Olhos sintéticos** ([syntheticEye.ts](src/test/syntheticEye.ts)): a mesma íris com rotação de 6°, deslocamento, pupila dilatada, ruído e outra luz dá distância ≈ 0,00–0,03, e íris diferentes dão ≈ 0,46 (mínimo de 0,41 em 20 pares). Isso confirma a localização, a compensação de rotação e a máscara. A textura sintética é muito mais fácil que a real, então os números **não** indicam o desempenho real.
- **Teste de ponta a ponta** no app com câmera simulada: o fluxo completo funciona, e fotos de baixa resolução são recusadas com os motivos corretos.
- A medida de nitidez foi ajustada para ignorar ruído do sensor e cair junto com o desfoque (testado com σ = 0 a 9 px).

**A validação real precisa de olhos reais** (ver "Como recalibrar"). Se for possível obter acesso à UBIRIS.v2 ou à CUVIRIS para fins acadêmicos, este é o próximo teste.

## Como recalibrar com dados reais

Os limiares atuais vêm do LFW (fotos de famosos, boa luz). Antes de qualquer uso real:

1. Junte pares reais: mesma pessoa em datas diferentes, e pessoas diferentes, nas condições de uso (rua, noite, celular da viatura).
2. Calcule os vetores com o próprio app (cadastro) e as similaridades de todos os pares.
3. Ajuste `CALIBRATION` (média/desvio dos impostores) e `SCORE_BANDS` em [match.ts](src/lib/recognition/match.ts) para a taxa de falso positivo desejada.
4. Para a íris: capture 3+ amostras por olho de algumas dezenas de pessoas e ajuste `IRIS_BANDS` em [iris/match.ts](src/lib/iris/match.ts) pelas distâncias de Hamming entre pessoas diferentes.

## Próximo passo — Etapa 4 (íris em infravermelho)

O código da Etapa 3 já separa captura, localização, normalização, codificação e comparação. Para a Etapa 4:

- leitor de íris NIR (700–900 nm) via USB, ou serviço local que o exponha ao navegador;
- trocar o canal vermelho pela imagem NIR e recalibrar `IRIS_BANDS` (em NIR o limiar típico é HD ≈ 0,32);
- opcional: substituir o codificador por um modelo treinado (ex.: open-iris da Worldcoin, ArcIris/TripletIris da Notre Dame) em um backend.

## Referências

- Deng et al. **ArcFace: Additive Angular Margin Loss for Deep Face Recognition**. CVPR 2019.
- Daugman. **How iris recognition works**. IEEE TCSVT, 2004; **Probing the uniqueness and randomness of IrisCodes**. Proc. IEEE, 2006.
- Masek & Kovesi. **Recognition of human iris patterns for biometric identification**, 2003 (log-Gabor).
- Hollingsworth, Bowyer & Flynn. **The best bits in an iris code**. IEEE TPAMI, 2009.
- Park, Ross & Jain. **Periocular biometrics in the visible spectrum**. IEEE TIFS, 2011.
- Hernandez-Diaz, Alonso-Fernandez & Bigun. **Periocular recognition using CNN features off-the-shelf**. BIOSIG 2018.
- NIST IREX IX (NISTIR 8252), efeito do comprimento de onda e da pigmentação.
- ISO/IEC 19794-6 e 29794-6 (imagem e qualidade de íris).
- Huang et al. **Labeled Faces in the Wild**, 2007.
- Modelos: [vladmandic/insightface](https://github.com/vladmandic/insightface) (MIT), treinados por [leondgarse/Keras_insightface](https://github.com/leondgarse/Keras_insightface) sobre dados do InsightFace (uso acadêmico/não comercial).
