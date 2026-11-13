# Decisões tomadas na noite (sem o usuário online)

Não commitado. Revisar antes de publicar.

## Corrigido
- ConfirmPrompt: texto do botão "Sim, tem feira" trocado de creme para papel sobre tomate, para contraste acima de 4,5:1.
- FAQ da landing: incluído aviso de que tocar em rota ou Google Maps envia a posição a esses serviços.
- manifest.json: `start_url` passou de `.` para `/app`, para o app instalado abrir a lista.

## Crítica que já estava resolvida (não mexi)
- "Já sabe" / confirmação de outra pessoa: o texto atual diz que as confirmações ficam só neste aparelho.
- Google Maps como fonte de horário: removido da copy da landing e do rodapé.
- Telas com "tela do app": a seção está oculta (`MOSTRAR_TELAS = false` em Landing.jsx).
- Aviso de Nominatim no modal de cadastro: já existe.
- Raio de 150 m do trecho da Mearim: `distanciaAoTrechoMetros` já mede até o trecho, não só o ponto. O alerta estava errado.

## Pendente (decisão sua)
- Horário da Mearim está "A confirmar". Enquanto isso, a Mearim nunca dispara a pergunta "Tem feira aqui agora?". Precisa do horário de fim.
- Tiles do OpenStreetMap na landing: a política de uso proíbe tráfego pesado. Se a landing for para muita gente, usar outro provedor.
- Host: `/app` precisa de rewrite no servidor (ex.: Vercel `rewrites`). Ainda não sei onde o site vai ficar.
- `public/icon-512.png` continua com o ícone antigo. Regenerar com o símbolo do toldo.
- Copy que diz "não são enviadas a ninguém": fica até existir backend. Se o backend entrar, revisar.
- Espaçamento de 8px em componentes antigos do app (gap-3, px-5 etc.). Aceito como exceção por enquanto.

## Redesign do app
- Basemap: CARTO exigia chave (aparecia "API KEY REQUIRED"). Trocado por tiles do OpenStreetMap em MarketMap e AddMarketModal, com atribuição "colaboradores do OpenStreetMap". Não havia filtro vibrant-tiles no código. Atenção: a política de uso do OSM limita tráfego pesado; se o app crescer, usar outro provedor.
- Cabeçalho de 64px: toldo + "Olha a Feira" em verde (também no celular) e botão "+" redondo tomate. Removida a seta de voltar e a busca do cabeçalho.
- Lista: título "Feira fresca, perto de você" em verde, busca em pílula, chips de dia (Hoje selecionado por padrão, depois Todos e os dias a partir de amanhã; rolagem horizontal com esmaecido na borda direita como dica).
- Cards: etiqueta de status (Confirmada há X dias em verde-claro, Sem confirmação recente em manga-claro), título em verde, endereço · distância (distância só quando existe), horário com relógio e um botão "Ver rota". Removidos ícone de legume, rótulos em caixa alta, fileira Carro/A pé/Bike e o texto "Google Maps". O botão escolhe a pé até 2 km e de carro acima disso (regra minha, ajuste se quiser). Abre o Google Maps pelo endereço, como antes.
- Mapa: pinos SVG (verde = confirmada neste aparelho, manga = sem confirmação, tomate = selecionado) no lugar dos ícones de legume. Tocar no pino abre cartão inferior com dia/horário, status, título, endereço, "Ver rota" (traça no mapa, precisa de localização) e "Abrir no Google Maps". Botão de centralizar na posição, busca e alternador lista/mapa flutuantes. Trecho da Mearim continua desenhado. Na visão de mapa o cabeçalho some, então "Sugerir feira" só fica na lista (como no desenho).
- Seletor Carro/A pé/Bike do mapa removido; a rota usa o mesmo critério de 2 km. O servidor público do OSRM costuma ignorar o perfil e rotear de carro.
- Tokens novos: manga-claro (#FBEBC6) e manga-escuro (#7A5200), tirados do desenho, para a etiqueta de aviso.
- Alternador lista/mapa na lista virou botão fixo "Mapa" embaixo (o desenho não mostra onde fica; decisão minha).
- Novos arquivos: src/utils/rotas.js. mapIcons.js reescrito (sem GLIFOS_FEIRA).

## Segunda passada do app
- Motivo: o app ficou bege e verde, sem graça. Agora cada cor significa um dia da semana; movimento só em dado vivo (feira acontecendo agora) e nos olhos do tomatinho.
- Sistema de cor por dia: tokens `--color-dia-*` e `--color-dia-*-suave` em src/index.css e util src/utils/diaCor.js ({ forte, suave, texto, sobreForte }). Contraste medido (WCAG): texto sobre suave de 5,83 a 7,32; texto sobre forte de 4,99 (terça, papel sobre tomate) a 8,82. Quarta usa tinta sobre manga.
- Mapa: pinos na cor forte do dia, miolo papel; selo de check branco com confirmação recente neste aparelho; anel suave pulsando quando a feira está acontecendo agora (dia e horário batem); pino selecionado maior com quique de 360 ms; entrada com queda de 240 ms por pino e atraso de até 480 ms (total abaixo de 800 ms), só quando o conjunto de feiras muda. A legenda dos sete dias é o próprio FilterBar (bolinha + nome curto), flutuante no topo, e filtra ao tocar. Cartão inferior com faixa do dia, etiqueta suave, "Agora", endereço, horário, "Ver rota" e "Abrir no Google Maps" na cor do dia.
- Decisões minhas: (1) ao abrir o mapa o filtro vai para "Todos", senão só apareceria a cor de hoje; (2) o mapa não enquadra mais sozinho o trecho da Mearim ao abrir (aproximava tanto que escondia os pinos); o trecho continua desenhado e é enquadrado ao tocar na feira; sem posição abre na visão do Rio, com posição em zoom 13.
- Lista: hero com fundo na cor suave de hoje, tomatinho (grupo SVG copiado da landing, olhos seguem o cursor, desligado em reduced motion) espiando ao lado da busca; chips com bolinha do dia, selecionado na cor forte (texto papel, tinta na quarta), "Todos" com bolinha das sete cores; cards com faixa de toldo de 8 px, etiqueta do dia, selo "Agora" (manga, com bolinha), botão "Ver rota" na cor do dia, subida de 4 px no hover (200 ms).
- Cabeçalho: tira de toldo de 16 px (manga e papel, estática) acima do toldo + "Olha a Feira"; fundo do cabeçalho agora creme (papel sobre papel sumiria).
- Vazio e carregamento: tomatinho com mensagem curta, sem lupa. A mensagem muda conforme o filtro (hoje, outro dia, bairro sem resultado).
- Limitação: hoje é sexta e todas as feiras de hoje são azuis; a lista em "Hoje" mostra uma cor nos cards (as outras aparecem no hero, nos chips e no mapa). Se quiser a lista colorida logo de cara, o padrão pode virar "Todos".
- Novos arquivos: src/utils/diaCor.js, src/components/Tomatinho.jsx.

## Quarta passada: lista
- Já existia e foi só conferido em 430x900: filtro padrão "Todos"; hero e borda da busca na cor do dia do chip (com "Todos", a de hoje); tomatinho inteiro ao lado da busca (overflow visível, olhos seguem o cursor, desligado em reduced motion); toldo de 32 px nos cards (faixa lisa de 8 px, listras verticais forte/papel de 16 px, escalopes de 8 px, sombra leve, 4 px mais largo de cada lado, estático) e corpo do card começando 16 px abaixo do toldo (pt-12).
- Mudança: ordem das etiquetas do card agora é Agora, confirmação, dia (só com "Todos") e Sugerida, no máximo duas. Com isso a etiqueta do dia aparece quando a feira não está acontecendo agora; quando está, o dia fica na linha do horário e na cor do toldo.
- Não fiz: o tomatinho "sentado na borda do hero" (ficou ao lado da busca, que atende a regra). Screenshot em 1440x900 não conferido: a aba do dev server estava no modo mapa depois do resize.
- Lint e build passam.

## Quarta passada: lista

- Hero, FilterBar, MarketCard, Tomatinho e App já cumpriam os itens 1 a 3: tomatinho inteiro ao lado da busca (olhos seguem o cursor, desligado com reduced motion), filtro padrão "Todos", hero e borda da busca na cor do dia do chip (com "Todos", a de hoje), no máximo duas etiquetas por card (Agora, confirmação; "Sugerida" e o dia só entram se sobrar vaga, o dia só com "Todos").
- Toldo (item 4): já existia com 32 px, listras verticais, escalopes e sombra. Revisão: as listras e os escalopes agora usam `background-repeat: round`, então cabe um número inteiro de listras e as pontas ficam simétricas (antes a última listra era cortada). Sem animação. Corpo do card a 48 px do topo (32 + 16).
- Não houve espera de rede nesta passada.

## Quarta passada: dados
- O que mudou: scripts/gerar-regioes.mjs consulta a Overpass API em lote (uma consulta por ~15 feiras, união de way[highway][name~...](around:300) e amenity=marketplace (around:200), POST com User-Agent "olha-a-feira/0.1 (olhafeira.tech)", timeout:60, pausa de 6 s entre lotes, 2 tentativas com recuo e espelho overpass.kumi.systems). Grava src/data/regioes.json a cada lote e para em 8 minutos. A feira 49 (Mearim, trecho manual) nunca é consultada nem sobrescrita.
- Como regerar: node scripts/gerar-regioes.mjs (todas as feiras sem trecho) ou node scripts/gerar-regioes.mjs 153 154 (só esses ids; o resto do arquivo é preservado). Se o limite de 8 min estourar, rode de novo só com os ids que faltaram.
- Resultado desta rodada: 135 de 159 feiras sem trecho ganharam região (123 de rua, 12 de mercado); 24 não. Arquivo com 22 KB. A primeira execução parou no limite de tempo (os servidores deram 502 várias vezes) e as restantes foram completadas em duas execuções menores; houve um timeout no espelho e uma nova tentativa resolveu.
- Sem região (nada casou no OSM pelo nome da rua perto da coordenada): 1 Rua Livramento; 18 Rua Vicente de Souza; 19 Pça Nicaragua; 29 Av. Epitácio Pessoa; 30 Pça Gal Osório; 31 Praça N. S. Auxiliadora; 33 Rua Frei Leandro; 34 Pça Santos Dumont; 39 Rua Gabriela Prado Maia; 40 Pça Prof Pinheiro Guimarães; 59 Rua Jacuí; 70 Rua Vitor Meireles; 72 Rua Manoel Miranda; 87 Rua Teresa Cavalcanti; 92 Rua Ponta Porã; 100 Rua Valério; 125 Rua Cel Moreira César; 126 Largo do Anil; 131 Rua Edgard Cavaleiro; 133 Rua Araguaia; 136 Ruas Alexandre Ramos e Coronel Tedim; 142 Rua Olímpio de Castro; 158 Rua Campeiro-Mor. A 137 (Rua Barão) não tem coordenada utilizável. Essas ficam só com o pino. Várias são praças, que o OSM costuma mapear como área, não como via.
- Limites: a geometria é a rua inteira (linhas do OSM), não o trecho exato onde a feira monta. O nome é casado sem tipo e sem título (Rua, Av., Praça, Gal., Prof. etc.) e a rua precisa estar a até 300 m da coordenada; coordenada errada ou nome diferente no OSM faz a feira ficar sem região. Linhas simplificadas a ~3 m, no máximo 60 pontos.
- Política de uso: dados dos colaboradores do OpenStreetMap (ODbL), com atribuição obrigatória; a API pública é gratuita e com limite, por isso o lote, a pausa de 6 s, o User-Agent identificado e o teto de 8 min. Rodar sob demanda, não a cada build; o JSON gerado é versionado.

## Quarta passada: mapa
- O que mudou: o mapa saiu do Leaflet com tiles padrão do OpenStreetMap e passou para MapLibre GL com o estilo vetorial positron do OpenFreeMap (https://tiles.openfreemap.org/styles/positron), gratuito e sem chave. O positron vem quase como é; só a água ganhou azul bem clarinho (#D3E5F2) e os parques um verde leve (#E4EEDF), cada camada só é repintada se existir. O Leaflet continua só no mapa pequeno do cadastro (AddMarketModal).
- Pinos (DOM, src/utils/mapPinos.js): cor forte do dia, miolo papel, selo de check com confirmação recente, selecionado maior com quique curto, anel só para feira acontecendo agora, queda escalonada só nos pinos que entram (240 ms cada, total até 720 ms). A legenda dos sete dias é o FilterBar do topo e filtra.
- Regiões: faixa de peso 10 com contorno papel de 4 px, cor do dia, pontas arredondadas, no zoom >= 15 para todas as feiras do filtro; ao tocar numa feira a dela é destacada e enquadrada com fitBounds. Mercado: preenchimento 20% e borda na cor do dia. Sem região: só o pino.
- Mearim (id 49): corredor de cerca de 12 m de cada lado (largura em pixels por zoom), cor de terça, contorno papel e listras suaves; três pinos numerados com etiqueta (1 borda do mato x Gurupi, 2 borda do mato x Mearim, 3 Mearim x Grajaú) e balão no meio do trecho com "Feira da Mearim · terça" e "borda do mato até a esquina da Grajaú". Pinos e balão aparecem no zoom >= 15 ou com a feira selecionada; antes disso, o pino normal. Textos em src/data/trechosInfo.js. Ao tocar, o mapa enquadra só o trecho, com folga lateral para as etiquetas.
- Cartão com abas (FeiraCartao): Sobre (dia e horário, status, endereço, região, Ver rota, Abrir no Google Maps) e Fotos, com role tablist, setas/Home/End. Abre ao tocar no pino (cartão inferior) e no card da lista (folha FeiraSheet, com Esc, toque fora e foco devolvido). Na folha, Ver rota leva ao mapa e traça a rota (precisa de localização).
- Fotos (src/utils/fotos.js): IndexedDB "olhafeira-fotos", chave = id da feira, até 12 por feira, reduzidas a 1024 px em JPEG 0,8 no aparelho, input accept=image/* capture=environment, remover, estado vazio com o tomatinho, aviso de que ficam só neste aparelho, dica de privacidade, try/catch com mensagens de erro (aba anônima). Verificado no navegador: foto de 2000x1500 foi salva como 1024x768 com alt.
- Bundle (JS minificado, sem gzip / gzip): antes 469.206 B / 141.598 B em um arquivo. Depois: entrada 474.232 B / 143.196 B, mais o pedaço do mapa carregado só ao abrir o mapa, 1.083.734 B / 291.861 B (JS) e 71.339 B de CSS. O MapLibre pesa mais que o Leaflet; por isso o mapa é carregado sob demanda (lazy).
- vite.config.js: optimizeDeps.exclude para maplibre-gl, senão o worker não carrega no dev.
- Atribuição obrigatória, sempre visível numa barra fixa embaixo do mapa: OpenFreeMap, (c) OpenMapTiles e (c) colaboradores do OpenStreetMap, com links. Licenças: OpenFreeMap e o código do MapLibre GL (BSD-3-Clause) gratuitos; estilo e esquema OpenMapTiles (BSD/CC-BY 4.0); dados OpenStreetMap em ODbL. Sem chave de API. Verificado: estilo, sprites e tiles .pbf responderam 200, sem 4xx e sem erro no console (só um tile abortado ao mover o mapa).
- Pendências: a localização das feiras (pino) vem dos dados de coordenadas, que o usuário diz estar menos exata que a do Google; isso é tarefa de dados, não foi tocado aqui.

## Correção do trecho da Mearim (mapa)
  - Enquadramento: ao tocar na Mearim, fitBounds com padding inferior igual à altura real do cartão (medida depois de renderizar, + 32 px da margem + 16 px de respiro + 40 px da etiqueta do pino 2), lateral de 160 px à esquerda e 96 px à direita (etiquetas) e 264 px em cima (busca, filtros e balão).
  - Balão ancorado acima do ponto mais ao norte, centrado no meio leste-oeste do trecho, com 32 px de offset: não cobre mais nenhum pino.
  - Etiquetas: pino 1 passou de direita para baixo, para ficar dentro da viewport; pino 3 segue à esquerda; pino 2 embaixo.
  - Verificado em 500x900 (largura mínima do navegador de teste, não 430) e 1440x900. Lint e build passam.
