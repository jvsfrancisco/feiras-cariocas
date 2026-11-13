# Notas de implementação: Olha a Feira

Não commitado. Branch de trabalho: `jvsfrancisco/feira-carioca-visual-update`.

## O que mudou

- **Paleta (`src/index.css`)**: tokens em `@theme` (`creme`, `papel`, `tinta`, `verde`, `tomate`, `manga`, `linha`). Removidos os gradientes laranja/verde, `brand-*` e `warm-bg`. Apoio: `tinta-2`, `verde-escuro`, `verde-claro`, `areia`.
- **Emojis**: removidos todos de `src/` e `public/`. Substituídos por ícones lucide. O scan não encontra nenhum.
- **Logo**: `src/components/ToldoLogo.jsx` (markup do toldo da landing), usado no cabeçalho e no rodapé. `public/favicon.svg` trocado pelo toldo.
- **Rotas (`src/main.jsx`)**: `/` renderiza `src/Landing.jsx`; qualquer outro caminho renderiza o App (`/app`). No cabeçalho do App há um botão de voltar para `/`.
- **Landing (`src/Landing.jsx`)**: seções do arquivo de referência. Hero com o ponto manga pulsando (desligado com `prefers-reduced-motion`), tomatinho copiado do SVG de referência, faixa do toldo, "Como funciona" em três colunas, trecho da Mearim em mapa real (react-leaflet, tiles OSM, atribuição "© colaboradores do OpenStreetMap"), perguntas em `details`, CTA final e rodapé com `olhafeira.tech`. CSS escopado em `.lp` no `index.css`.
- **Seção "O app, em três telas"**: oculta por `MOSTRAR_TELAS = false` em `Landing.jsx`. As molduras e o TODO continuam no arquivo para quando existirem telas reais.
- **Trecho da Mearim (`src/data/feiras.js`)**: o campo `trecho` fica no registro oficial da Rua Mearim (`id: "49"`, Terça, 07:00–13:00). Não há mais entrada duplicada. O `MarketMap` desenha a polyline tomate tracejada, marcadores nas pontas e enquadra o trecho com `fitBounds`. A landing lê o mesmo registro (`id === '49'`).
- **Confirmação local**: `src/utils/confirmacoes.js` (lógica pura) e `src/components/ConfirmPrompt.jsx` (sheet "Tem feira aqui agora?", Sim/Não/Agora não). Só aparece com localização a até 150 m, no dia e dentro do horário da feira, com horário parseável. Grava em `localStorage` (`olhafeira_confirmacoes`) dentro de try/catch. Cards mostram "Confirmada há X dias" quando há "sim" nos últimos 30 dias. A UI avisa que as respostas ficam só neste aparelho. Sem nome nem e-mail.
- **Distância ao trecho**: `feiraParaConfirmar` usa o menor valor entre a distância ao ponto do registro e a distância ao segmento mais próximo de `trecho` (`distanciaAoTrechoMetros`, projeção plana local). Quem está sobre o trecho desenhado recebe a pergunta.
- **Privacidade**: o modal de feira informa que o endereço e o bairro vão ao OpenStreetMap (Nominatim) para achar o ponto, e que a feira salva fica só neste aparelho. A frase "nada é enviado" ficou restrita aos dados salvos. O rodapé do App diz que as confirmações não são enviadas.
- **Metadados**: `index.html` (título, descrição, `theme-color` #1F5C3A) e `public/manifest.json` (`theme_color`, `background_color`, nome "Olha a Feira").
- **Lint**: `eslint.config.js` passa a ignorar `.agents`, `.claude` e `node_modules`. Antes, `npm run lint` falhava quase só por código de ferramentas de agente. Também corrigi erros de `set-state-in-effect` em `useMarkets`, `App`, `MarketList` e `MarketMap`.

## Decisões em que me afastei do texto literal do escopo

- `day: 'Terça-Feira'` e `bairro: 'Grajaú'` com acentos. O escopo dizia "Terca-Feira" e "Grajau". Sem acento, o filtro de dia (comparação exata) nunca acharia a feira.
- O rodapé do App perdeu "Desenvolvido com 💚 para os cariocas" (o escopo listava o texto "Desenvolvido com" entre os locais a trocar; optei por remover a frase).
- **Trecho da Mearim sem entrada nova**: o escopo (item 6) pedia uma feira nova `mearim`. Na revisão, ela duplicava a feira oficial id 49 (mesma rua, mesmo bairro e mesmo dia; a entrada nova tinha horário "A confirmar" e RA "Outra"). Coloquei `trecho` no registro 49 e não criei a entrada nova. Só existe um registro com "Rua Mearim".
- Sugerir feira usa `MapPin` e não `Sparkles`.
- O botão "Sugerir uma nova feira" virou "Sugerir feira".
- A localização passou de `getCurrentPosition` para `watchPosition`, ignorando deslocamentos menores que 25 m. Sem isso a confirmação por proximidade não funciona. Consequência: o GPS fica ligado enquanto o app está aberto.
- Os pinos do mapa perderam a cor por dia (o arco-íris de antes) e ficam todos em verde, com ícone de hortifruti escolhido pelo endereço.
- O "Confirmada há X dias" mostra "hoje" para 0 dias e "há 1 dia" no singular.
- **Conflito resolvido sem aprovação do usuário (pendente de confirmação)**: as correções pediam aprovação ou volta ao texto de referência. Regra aplicada: volta ao texto de referência onde ele é verdadeiro para o app atual; onde não é, mantém a versão verdadeira.
  - Passo 3: volta o título de referência "Veja a data da última confirmação" e a primeira frase de referência "Confirmação recente aparece com a data." A segunda frase de referência ("Feira que ninguém confirma há muito tempo mostra o aviso") foi removida: o `MarketCard` não tem aviso de feira sem confirmação recente.
  - "É da Prefeitura?" e "Preciso de conta?" ficam como estão. A referência citava Google Maps e login com Google, que o app não tem.
  - Passo 1 e rodapé: a menção ao Google Maps foi removida, como pedia a correção.
  - Seção "Já foi à feira…": a frase "a pessoa que vem depois já sabe" foi trocada por "o app mostra quando foi a última confirmação neste aparelho".

## Pendências e lacunas de conteúdo (decisão para o usuário)

- **Copy da landing (aprovação pendente)**: as escolhas acima mudaram o texto de referência. Confirmar antes do merge.
- **Feira sugerida**: o modal diz agora que nada é enviado (mesma frase da sheet de confirmação). O selo "Sugerida" no card continua. Ele sugere envio à comunidade, que não existe. Decidir se o texto muda.
- **Deploy e rota `/app`**: o repositório não tem configuração de host (sem `vercel.json`, `netlify.toml`, `_redirects` ou `CNAME`). Por isso não criei nenhuma. Confirmar o host antes de publicar. Regra de reescrita por host: Vercel, `vercel.json` com `{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}`; Netlify, `public/_redirects` com `/* /index.html 200`; Cloudflare Pages, mesma linha do `_redirects`. Em qualquer host, testar `/app` no deploy real. Só foi verificado com `vite preview`, que devolve 200 em `/app`.
- **Ícones PNG**: `public/icon-512.png` (usado no `apple-touch-icon` e como ícone maskable do manifest) é o arquivo antigo. Não foi regenerado. Só o favicon SVG mudou.
- **`start_url: "."`** no manifest agora abre a landing e não o app. Não alterei. Se o app deve abrir direto ao instalar, mudar para `/app`.
- **Mapa do trecho na landing**: usa `tile.openstreetmap.org` direto, sem chave. Para tráfego alto, a política de uso de tiles da OSM exige cuidado.
- **Telas do app**: a seção de três telas está oculta. Para reativar, trocar `MOSTRAR_TELAS` por `true` depois de criar as capturas reais.
- **Fora do escopo, não implementado**: Supabase/backend, Google Maps API, upload de fotos, login. Só aparecem como texto.

## Verificação

- **Rodada de correções** (revisão automática, P1):
  - Privacidade: modal e App corrigidos (ver acima). Nominatim declarado no modal.
  - Landing: promessa de "pessoa que vem depois" removida; menção ao Google Maps removida do passo 1 e do rodapé; seção de telas oculta; passo 3 e FAQ conforme a decisão acima.
  - Mearim: `distanciaAoTrechoMetros` em `src/utils/confirmacoes.js`. Checagem com node: ponto médio do primeiro segmento = 0,00 m; vértice = 0,00 m; ponto do registro oficial = 311,66 m (acima de 150 m, então o pino sozinho não dispara a pergunta, mas o trecho sim).
  - Fontes: o `@import` saiu de `src/index.css` e os links (preconnect + stylesheet de Bricolage Grotesque e Inter 400 a 800) foram para o `<head>` do `index.html`. `dist/index.html` contém `fonts.googleapis`.
  - `/app`: `vite preview` responde 200 em `/`, `/app`, `/favicon.svg` e `/manifest.json`. Nenhum arquivo de host foi criado (ver pendências).
- `npm run lint`: exit 0, sem erros.
- `npm run build`: exit 0. Resta só o aviso de chunk maior que 500 kB, que já existia.
- Scan de emojis em `src/` e `public/`: 0 ocorrências.
- Smoke test da lógica de confirmação com node (`src/utils/confirmacoes.js`): 14 de 14 checks passam (horário, distância, dia, dispensa, repetição no dia, janela de 30 dias, textos). Não reexecutado nesta rodada, além da checagem de distância acima.
- Navegador (dev server, Chrome): `/` em 1440px e 390px sem overflow horizontal e sem erros no console. O mapa do trecho carrega tiles OSM e desenha o trecho da Mearim. `/app` em 390px renderiza lista e cabeçalho sem erros no console. Feito antes desta rodada; não repetido.
- Não testado: a sheet de confirmação ao vivo (depende de GPS e horário reais). A cobertura é a lógica pura acima.
