# Back-end do Olha a Feira: requisitos (v4)

Estado: v3, depois da 1ª rodada de crítica (abuso e implementabilidade) e das respostas do João em 11/11: **trecho tracejado até a aprovação: aceito**; **filtro de ofensas e fechamento de vazamentos: pedidos** (7.6, 7.4, 7.5). 2ª rodada (segurança, Codex) incorporada na v4: 14 achados, marcados **[2ª crítica]**. Próximo: implementação, fase 0 e 1.
**[João]** = o que o João disse. **[Decisão]** = decidido por Claude a pedido dele. **[Muda a regra do João]** = ponto em que a v2 se afasta do que ele disse, com o motivo; ele decide se mantém.

## 1. Por que existe

O app é estático, sem servidor. As feiras vêm de `src/data/feiras.js` (160 feiras da Prefeitura; só a id 49, Mearim, tem `trecho` manual de 3 pontos).
Confirmações, fotos e feiras sugeridas ficam só no aparelho (localStorage e IndexedDB) e o app diz isso. Isso impede o que o app promete: **uma pessoa
ajudar quem vem depois**.

## 2. Objetivos

- Compartilhar confirmações "tem feira aqui agora", feiras sugeridas, fotos e o trecho da rua de cada feira.
- **[João]** Quem conhece a feira pode corrigir o trecho. Se outras pessoas aprovam, a correção continua; se há negação, volta ao trecho anterior.
- **[João]** Sem cadastro, sem nome nem e-mail.
- Custo próximo de zero e nenhum servidor para manter.

## 3. Não objetivos e anti-objetivos

- Não é rede social: sem comentários, perfil, seguidores.
- **Uma pessoa sozinha não pode reescrever o mapa** (nem trocar o trecho que vale, nem derrubar o trecho certo, nem aprovar o próprio).
- O app **não pode quebrar sem servidor**: offline continua funcionando como hoje.
- **Risco aceito [2ª crítica, decorre de "sem cadastro"]:** login anônimo identifica uma sessão, não uma pessoa, e o GPS vem do próprio aparelho (dá para falsificar). Uma pessoa determinada, com 4 navegadores preparados há 7 dias e GPS falso, consegue aprovar um trecho sozinha. As regras deixam isso caro e lento, não impossível. A rede de segurança é o histórico com `admin.reverter_trecho` e a visão `admin.v_trechos_aprovados_7d`, que o João olha. Por isso o documento chama a checagem de **"presença declarada"** (GPS), não "verificada". Se um dia isso não bastar, a saída é revisão humana antes de efetivar, não cadastro.
- Fora do escopo agora: push, contas, equipe de moderação, pagamento, app nativo, peso de voto por presença (volta quando houver dados reais), `contestar_feira`.

## 4. Arquitetura **[Decisão]**

- **Supabase** (Postgres + PostGIS + RLS + Storage + Edge Functions). Descartados: Firebase (votação e reversão em documentos é ruim), servidor próprio (manutenção).
- App continua estático. Cliente fino em `src/api/`, ligado por `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. **Sem as chaves, o app roda como hoje, só local.**
- **Identidade:** login anônimo do Supabase gera `device_id`. Não é conta. Limpar o navegador (e o Safari apaga o armazenamento de sites não instalados em ~7 dias)
  cria outro `device_id`. É um **risco aceito**; mitigação: o app sugere instalar como PWA antes de ligar fotos, e quase todos os limites dependem da idade do aparelho.
- **Captcha** (Cloudflare Turnstile) no login anônimo e limite de 10 logins anônimos por hora por IP. Limpeza de contas anônimas sem atividade há 90 dias.
- **Regras no banco.** Toda escrita passa por funções SQL `security definer` com `SET search_path = ''`. Tabelas não aceitam escrita direta. Funções de administração ficam
  em um schema `admin` fora da API, com `REVOKE EXECUTE ... FROM public, anon, authenticated`. Nenhuma política `to authenticated` sem checar a regra de dono.
- **Um motor de votos genérico** (`votos` com `tipo`, `alvo_id`, `device_id`, `voto`), com limiares por tipo em `config`, usado por trecho, sugestão e denúncia, em vez de três conjuntos de regras.
- **Erros fixos:** toda função devolve um `codigo` entre `ok, limite, fora_do_raio, fora_do_horario, aparelho_novo, bloqueado, duplicado, invalido, sem_coord_precisa, texto_proibido, encerrada`. O app mapeia cada código para um texto. **Recusa é retorno, não exceção:** a função devolve o código e faz `commit` do que precisa ficar registrado (incidente de ofensa, bloqueio); exceção desfaria esses registros. Mensagens de erro nunca trazem coordenada, texto recebido, token ou identificador.
- **Privilégios por padrão fechados [2ª crítica]:** toda migração habilita RLS em toda tabela e revoga `ALL` de `public`, `anon` e `authenticated` em tabelas, sequências e funções (`ALTER DEFAULT PRIVILEGES` nos schemas do app). Concede-se só: `EXECUTE` nas RPC públicas listadas neste documento e `SELECT` nas tabelas de leitura pública (7.5). Funções auxiliares internas ficam sem `EXECUTE` para o cliente. Cada RPC obtém a identidade só por `auth.uid()`, nunca por parâmetro. Um teste automatizado percorre `pg_class` e `pg_proc` e falha se algo além da lista estiver acessível a `anon` ou `authenticated`.
- **Voto e transição atômicos:** `votar_trecho` e os apoios, na mesma transação: `SELECT ... FOR UPDATE` na proposta; recusa com `encerrada` se o estado não for `aberta` **ou** se `now() >= criado_em + 14 dias` (independe do job); grava o voto sob `UNIQUE (alvo_id, device_id)` com `ON CONFLICT DO UPDATE`; apura; grava a transição de estado.
- **Realtime e logs:** nenhuma tabela com `device_id` entra na publicação Realtime (na v1, nenhuma entra). Edge Functions não registram corpo de requisição, coordenada, texto nem token.
- **Idempotência:** toda escrita recebe `client_uuid` (único) e `client_ts`. O servidor aceita `client_ts` só se estiver a até 15 min do recebimento; fora disso a escrita é descartada
  (confirmação) ou recusada (voto). Votos de trecho não entram na fila offline.

## 5. Dados de base

- `feiras`: id (o `id` atual, texto), endereço, bairro, ra, `dia smallint` (0=dom), `inicio time`, `fim time` (a importação converte "07:00–13:00" com hífen ou en-dash e "Terça-Feira"; os mesmos validadores existem no servidor),
  `lat`, `lng` **anuláveis**, `coord_precisa boolean` (falso quando a coordenada do app é aproximada por `appendCoordinates`), `status` (`ativa`, `pendente`, `negada`, `oculta`), `trecho_vigente_id`, `origem` (`prefeitura`, `comunidade`).
- Importação idempotente (`scripts/importar-feiras`). Se a API falha, o app usa o `src/data/feiras.js` embutido.
- **A camada OSM não entra no banco.** `src/data/regioes.json` (rua inteira, "região aproximada") continua só no cliente.
- Distância e geometria no servidor com PostGIS (`geography`); a função plana `distanciaAoTrechoMetros` do app serve de teste de conformidade.

## 6. Trecho: precedência e modelo

**Precedência de exibição e de cálculo:** trecho aprovado pela comunidade > trecho curado (manual, hoje só a Mearim) > região OSM (só desenho, "região aproximada") > ponto. O servidor ganha do `feiras.js` quando a API responde.

`trechos` (uma tabela, sem `propostas_trecho` separada): id, feira_id, `pontos jsonb` em **[lat,lng] com 6 casas** (como `feiras.js`; o MapLibre usa [lng,lat], o cliente converte), `geom` PostGIS, `origem` (`curado`, `comunidade`),
`estado`, `anterior_id`, `autor_hash` (HMAC com segredo do servidor, nunca legível pelo cliente), criado_em, fechado_em.

**Estados:** `aberta` → `aprovada` | `negada` | `expirada` | `cancelada` (admin) ; `aprovada` → `substituida` (quando outra aprovada assume). Transições fora disso são recusadas. Voto em proposta fechada é recusado.
Primeira proposta de feira sem trecho: `anterior_id` nulo; reverter significa voltar ao ponto (e à região OSM).

**Validação da geometria:** 2 a 12 pontos; dentro da caixa do Rio; sem pontos repetidos seguidos; sem autointerseção; comprimento total entre 30 m e 800 m; distância de Hausdorff ≥ 20 m do trecho vigente (mover um ponto 1 m não vale); todos os pontos a até 600 m do **ponto original da Prefeitura**.

## 7. Módulos e regras

### 7.1 Confirmações ("Tem feira aqui agora?")
- `confirmar(feira_id, resposta, lat, lng, acuracia, client_uuid, client_ts)`.
- Regras (mesma função `verificar_presenca`, limites em `config`): feira com `coord_precisa`; agora dentro do horário da feira (fuso America/Sao_Paulo, no dia certo da semana); distância ≤ 150 m do **último trecho aprovado/curado**
  (ou do ponto) e `acuracia` ≤ 100 m. **O raio nunca usa trecho em votação.** O cliente usa o mesmo trecho que o servidor (hoje `feiraParaConfirmar` só conhece `feira.trecho`; passa a ler o trecho vigente da API).
- **1 resposta por aparelho por feira por dia (data de São Paulo), com `upsert`:** a segunda resposta no mesmo dia substitui a primeira (corrige o toque errado). Um "sim" posterior apaga um selo "não teve feira" do dia.
- Não grava coordenada nem geohash: grava `dentro_do_raio` e a distância arredondada a 10 m. Sem IP.
- Resultado público: `ultima_confirmacao_sim`, contagem de 28 dias, selo "Confirmada há N dias". Selo "Pessoas dizem que não teve feira hoje" só com 3 "não" de aparelhos com ≥ 24 h.
- **Migração:** não migrar as confirmações locais antigas (sem posição nem precisão não passam nas regras e abririam brecha para forjar histórico). A janela é de 30 dias.

### 7.2 Trecho colaborativo **[João]**
- `propor_trecho(feira_id, pontos, motivo, client_uuid, client_ts, lat, lng, acuracia)`, com `motivo` **de uma lista fechada** (`rua_errada`, `trecho_maior`, `trecho_menor`, `mudou_de_lugar`, `outro`). **Sem texto livre** (ver 7.6). O proponente precisa de **presença declarada** (7.1) num aparelho com **≥ 7 dias**. Uma proposta aberta por feira; o aparelho: no máximo 2 propostas por semana; depois de uma proposta negada ou expirada da mesma feira, **14 dias de espera** para o mesmo aparelho.
- **[Muda a regra do João] Efeito:** a proposta aparece para todos, **tracejada, com a marca "Trecho em votação · termina em N dias"**, sobre o trecho vigente. O trecho que vale para a confirmação, a rota e o selo continua sendo o último aprovado até a aprovação. Motivo: se a proposta
  valesse como vigente já na criação, uma pessoa sozinha reescreveria o mapa por 14 dias e travaria correções legítimas. Para o João: o mapa já "muda" de forma visível na hora; só passa a valer quando outras pessoas aprovam. Se ele quiser o efeito pleno imediato, é um parâmetro (`trecho_efeito_imediato`) e a regra de risco acima passa a ser aceita por ele.
- **Votos:** `votar_trecho(proposta_id, voto, lat, lng, acuracia, client_uuid, client_ts)`, voto `aprovo` ou `nego`, um por aparelho por proposta, pode trocar enquanto aberta. Aparelho com < 24 h não vota. O proponente não vota na própria proposta.
  **Peso: não há.** Cada voto vale 1 ou 0. O que se decide é se o voto é **elegível**, e isso é **congelado no instante do voto**: a função grava junto do voto `elegivel` (aparelho com ≥ 24 h naquele momento) e `presente` (presença declarada naquele momento). A apuração só soma esses campos, nunca recalcula com a idade ou a posição de depois. Trocar o voto grava um novo registro congelado e invalida o anterior. Motivo: recalcular na apuração deixaria um voto remoto virar "elegível" só por esperar, e faria o resultado mudar sem ninguém votar.
- **Aprova** quando há **3 aparelhos distintos** (≥ 24 h, sem contar o proponente) votando `aprovo`, **pelo menos 1 deles com presença declarada** e no máximo 2 remotos. Vira `aprovada`, o trecho anterior vira `substituida`.
- **Nega e volta** quando há **2 `nego` de aparelhos distintos (≥ 24 h), pelo menos 1 com presença declarada**, ou **3 `nego` de qualquer aparelho com ≥ 24 h**, e `nego` > `aprovo`. Vira `negada`; o trecho anterior segue vigente.
  [Muda a regra do João em intensidade] O João disse "se houver negação, volta": a v2 exige 2 a 3 negações de aparelhos diferentes para evitar que um só aparelho derrube um trecho certo.
- **Expira em 14 dias** sem quórum: `expirada`, volta ao anterior (a feira acontece uma vez por semana; 7 dias dá uma ocorrência só). **A expiração vale na leitura:** a visão pública trata proposta com `criado_em` há mais de 14 dias como expirada mesmo que o job agendado (`pg_cron`) ainda não tenha rodado; o job só grava o estado depois.
- **Histórico:** toda versão fica em `trechos`; `admin.reverter_trecho` volta para qualquer versão anterior (cancela proposta aberta).
- **Presença:** `verificar_presenca(feira, lat, lng, acuracia, ts)` com raio, janela de horário (±1 h) e precisão em `config`. A presença do voto é medida só contra o **último trecho aprovado ou o ponto**, nunca contra o trecho proposto.
- **Tela:** no cartão, "Corrigir trecho" abre o mapa para desenhar. Enquanto há proposta aberta: "Em votação · termina em N dias" e os botões "Está certo" e "Não é aqui". Não mostrar contagem nem pesos (vira jogo). O autor vê o resultado ao reabrir o app (sem push).
- Texto do cartão sobre o trecho: a frase fixa "da borda do mato até a esquina da Grajaú" só vale enquanto o trecho for o curado v1; depois da primeira correção aprovada, o cartão usa texto genérico ("Trecho marcado pela comunidade").
- **Cliente com trecho dinâmico:** hoje `FeiraCartao` tem o texto fixo da Mearim, `trechosInfo.js` tem rótulos por feira e `COR_MEARIM` é uma constante. Isso passa a vir do trecho vigente da API (cor por dia da feira, rótulo genérico). Entra na fase 2, antes da tela "Corrigir trecho".

### 7.3 Feiras sugeridas (fase 3)
- `sugerir_feira(...)` cria `pendente`. Os textos (nome, endereço) passam pelo filtro de 7.6 e têm no máximo 80 caracteres.
- **Ponto da sugestão [2ª crítica]:** o autor precisa de presença declarada no local; o servidor grava como `ponto_candidato` **a posição medida do autor** (não um ponto digitado), imutável depois. Apoio "presente" = apoiador a ≤ 150 m desse ponto, no mesmo dia da semana e janela de horário sugeridos. O apoiador nunca escolhe o ponto contra o qual é medido. **Só aparece para os outros depois de 1 apoio de aparelho ≥ 24 h com presença declarada** (evita encher o mapa de pinos falsos); antes disso só o autor vê ("aguardando").
- Vira `ativa` com **3 apoios** (aparelhos ≥ 24 h, sem contar o autor). Negada com 3 negações e mais negações que apoios. Pendente sem quórum por 30 dias some.
- Duplicata (feira existente a < 150 m no mesmo dia): **recusada** com link "Corrigir o trecho desta feira". Feira `pendente` aceita só apoio (nada de foto, confirmação ou trecho).
- Limite: 3 sugestões por aparelho por semana.
- **Migração:** ao ligar a API, enviar cada feira local como `sugerir_feira` e guardar o mapa `idLocal → idServidor` no localStorage; a local some da lista quando o servidor a devolve. Re-chavear fotos (IndexedDB, chave `String(feiraId)`) e confirmações locais ligadas a ela. Ids locais são `Date.now()`, os do `INITIAL_FEIRAS` são números; o mapa cuida da diferença.

### 7.4 Fotos (fase 4, por último)
- **Só depois de política de privacidade e presença declarada** (foto exige estar na feira).
- Upload para o bucket **privado** `fotos_fila` (≤ 300 KB, só `image/jpeg`, miniatura de ~320 px gerada no cliente junto). Uma Edge Function confere os bytes mágicos de JPEG, **recodifica a foto e a miniatura** (as duas: tira EXIF e arquivo disfarçado) e só então move para o bucket público `fotos`, **e só se a foto for para exibição**. Foto em revisão (aparelho novo) e foto arquivada ficam no privado até a decisão. Upload só no caminho `fotos_fila/<auth.uid()>/<uuid>.jpg`, sem sobrescrita (`upsert` negado); a função confere no servidor dono, feira e presença antes de promover.
  Sem política de SELECT em `storage.objects` (a coluna `owner` expõe o `device_id`). Nome do arquivo = UUID aleatório (não adivinhável).
- **Foto escondida some de verdade:** ao esconder, a função **move** foto e miniatura do bucket público para o privado `fotos_quarentena` (na origem, a URL antiga passa a dar 404). **Foto escondida por denúncia só volta por decisão explícita do admin**, nunca por prazo. Só o admin lê, por URL assinada de 60 s. Resíduo aceito: cópia em cache de CDN por até 24 h, por isso o `Cache-Control` das fotos é de 1 dia, não de 1 ano.
- Limites: 3 fotos novas por feira por dia (global), 5 por aparelho por dia, 20 por semana, **teto global de 200 uploads por dia** (em `config`). Aparelho com < 7 dias: as 3 primeiras vão para revisão e não aparecem.
- **12 visíveis por feira**; as demais ficam arquivadas (no privado) e **apagadas após 30 dias** (job agendado). Foto em revisão de aparelho novo sem decisão em 30 dias é **apagada**, não publicada.
- **Denúncia:** só conta de aparelho com ≥ 24 h (até 10 por dia). 3 denúncias de aparelhos diferentes escondem.
- Exibição: miniaturas na grade e foto inteira só ao tocar (egress do plano gratuito, 5 GB/mês, é o gargalo, não o espaço); `Cache-Control: max-age=86400` (um só valor, em `config`).
- O dono apaga a própria foto enquanto tiver o mesmo `device_id`.

### 7.5 Moderação mínima
- Sem painel: visões `admin.v_fila_denuncias`, `admin.v_propostas_abertas`, `admin.v_textos_barrados`, **no schema `admin`** (fora da API), todas com `security_invoker = true` e `REVOKE ALL ... FROM public, anon, authenticated`. **Leitura pública não é visão sobre tabela bruta [2ª crítica]:** com `security_invoker`, a visão exigiria `SELECT` na tabela bruta, e isso exporia `device_id`. Então o público lê tabelas próprias, sem identificador: `pub_feiras`, `pub_trechos` (vigente e em votação, sem `autor_hash`), `pub_confirmacoes` (agregados por feira), `pub_fotos`. Elas são escritas pelas mesmas funções `security definer` na transação que muda o dado bruto. Só essas tabelas têm `SELECT` para `anon`. Funções admin só em `admin`: `reverter_trecho`, `ocultar_foto`, `bloquear_dispositivo`. Aparelho bloqueado não escreve, mas lê.
- Sem `sinais_abuso` automático na v1 (não há equipe para liberar a fila e o critério "mesma rede" exige IP). Fica para quando houver dados.

### 7.6 Ofensas e texto livre **[João pediu: filtro, sem ofensa em fila nenhuma, bloquear o comportamento]**
**Princípio [Decisão]:** filtro de palavras sozinho não segura ofensa (troca de letra, espaço no meio, sinônimo, indireta). Então a defesa é em camadas, e a primeira é **não ter texto livre**.
1. **Menos texto:** trecho, voto, denúncia e confirmação não têm campo de texto (só listas fechadas). Sobra só `sugerir_feira` (nome e endereço) e, na fase 4, nada (foto não tem legenda).
2. **Filtro no servidor** (não no app, que se contorna): em toda escrita com texto, a função normaliza (Unicode NFKC, remove caracteres invisíveis e de controle, troca letras de outros alfabetos parecidas com latinas pela latina, recusa texto com mistura de alfabetos, minúsculas, sem acento, `0→o 1→i 3→e 4→a 5→s @→a $→s`, tira espaço, ponto e hífen no meio, reduz letras repetidas) e confere contra a lista `config.palavras_barradas` (PT-BR: xingamento, ódio, sexual, ameaça, número de telefone e link). Achou: recusa com `texto_proibido`. A lista cresce sem nova versão do app.
3. **Comportamento:** cada `texto_proibido` vai para `admin.v_textos_barrados` (só o hash do aparelho, o motivo e a hora, **sem guardar o texto**). 3 em 24 h: aparelho bloqueado para escrita por 7 dias; 10 no total: bloqueio permanente (`bloquear_dispositivo`). Chega a ser um limite de `config`.
4. **Nada público antes de quórum:** sugestão só aparece para os outros depois de 1 apoio presente (7.3). Texto ofensivo que passar pelo filtro fica visível só para o autor até lá.
5. **Denúncia de sugestão** com os mesmos 3 aparelhos distintos que escondem foto (7.4); escondida volta a `oculta`.
6. **Limite honesto:** isto reduz, não zera. Imagem ofensiva não é pega por lista de palavras; só pela quarentena, pela revisão das 3 primeiras fotos de aparelho novo e pela denúncia (7.4), e fica a lacuna se um dia houver volume. Sem equipe, quem revisa é o João por `admin.*`.

## 8. Privacidade e LGPD

- **`device_id` + local aproximado + horário é dado pessoal** (pseudonimizado ainda é pessoal). Por isso: tabelas com `device_id` não têm SELECT para o cliente, só visões agregadas; `autor_hash` com HMAC e segredo do servidor; não se grava geohash nem coordenada; só `dentro_do_raio` e distância arredondada.
- Sem IP guardado pelo app. (O Supabase registra IP em logs de infraestrutura; declarar na política.)
- **Política de privacidade curta dentro do app**, publicada **antes de qualquer escrita** (não só antes das fotos): o que sai do aparelho, o que é público (fotos, trechos propostos, apoios), prazos, como apagar.
- `apagar_meus_dados()` **[2ª crítica: lista completa]**, na mesma transação:
  - fotos (públicas, fila, quarentena, arquivadas, com miniaturas): apaga os objetos e as linhas;
  - confirmações: apaga;
  - votos e apoios em alvo **aberto**: apaga; em alvo fechado: anula `device_id` e mantém o resultado;
  - propostas de trecho: abertas são canceladas; fechadas ficam com `autor_hash` nulo;
  - sugestões `pendente`: apaga; `ativa`: autor nulo (a feira continua);
  - incidentes de ofensa e bloqueio: **mantidos por 90 dias** com o hash, para o bloqueio não ser contornado apagando dados; depois apagados;
  - por fim apaga o usuário em `auth.users`. Nenhum hash restante é derivável de outro identificador que sobreviva.
- **Checklist de textos que mudam no mesmo release de cada módulo** (a flag da API liga ou desliga todos juntos): confirmação ("ficam só neste aparelho", "não há backend"), fotos (aviso e dica), cartão ("neste aparelho"), rodapé e perguntas da landing.

## 9. Plano gratuito do Supabase: limites reais

- O projeto **pausa depois de 7 dias sem atividade**: ping agendado (GitHub Actions a cada 3 dias).
- Sem backup diário: export semanal das tabelas.
- Sem transformação de imagem (Pro): miniatura gerada no cliente.
- Egress 5 GB/mês e storage 1 GB (conferir valores atuais antes de ligar): foto inteira só ao tocar; teto de uploads; alerta em 70%; apagar arquivadas em 30 dias. Pior caso visível: 160 feiras × 12 fotos já passa de 1 GB com 600 KB, por isso o limite de 300 KB e a miniatura.
- PostGIS está disponível no gratuito.

## 10. Config (`config`, sem nova versão do app)

Raios (150, 300 se voltar o peso, 600), janela de horário (±1 h), precisão (100 m), comprimento (30 e 800 m), Hausdorff (20 m), idade mínima do aparelho (24 h votar, 7 dias propor/foto sem revisão),
quóruns (3 aprovações, 2 ou 3 negações), expiração (14 dias), espera (14 dias), limites por aparelho (propostas 2/semana, sugestões 3/semana, votos 20/dia, fotos 5/dia e 20/semana, denúncias 10/dia), teto global de fotos (200/dia), `client_ts` (15 min), `trecho_efeito_imediato` (falso), `palavras_barradas` (lista), `texto_proibido_bloqueio` (3 em 24 h → 7 dias; 10 no total → permanente), `foto_cache_segundos` (86400).

## 11. Critérios de aceite (casos felizes e de abuso)

1. **Confirmação:** a 151 m do trecho aprovado, `fora_do_raio`. Fora do horário, `fora_do_horario`. Segunda resposta no mesmo dia **substitui** a primeira. Feira sem `coord_precisa`, `sem_coord_precisa`. `client_ts` com 20 min de atraso, descartado.
2. **Trecho, aprovação:** proponente (presente, ≥ 7 dias) + 3 aprovações de aparelhos ≥ 24 h, 1 presente, 2 remotos → `aprovada`. Só aprovações remotas (3 remotas, 0 presentes) → não aprova.
3. **Trecho, o proponente sozinho:** o mesmo `device_id` propondo de novo a mesma feira dentro dos 14 dias de espera → `limite`. Aparelho com 2 dias propondo → `aparelho_novo`. Proponente votando na própria proposta → `invalido`. (Outro `device_id` da mesma pessoa não é detectável: risco aceito, seção 3.)
4. **Trecho, reversão:** 2 `nego` (1 presente) → `negada`, o anterior continua vigente e o recusado fica no histórico. Proposta aberta não altera o raio da confirmação nem a rota.
5. **Trecho, expiração:** 14 dias sem quórum → `expirada`.
6. **Geometria:** 13 pontos, `invalido`; 20 m, `invalido`; ponto a 700 m do ponto da Prefeitura, `invalido`; trecho igual ao vigente (Hausdorff < 20 m), `duplicado`.
7. **Abuso de identidade:** 10 `device_id` novos (< 24 h) votando igual → nenhum voto conta. Aparelho anônimo chamando função de `admin` → 403.
8. **Sugestão:** autor + 1 apoio presente publica; 2 apoios não ativam; 3 ativam; duplicata a 100 m é `duplicado`.
9. **Foto:** não-JPEG, 301 KB, 6º upload no dia, e aparelho de 2 dias com 4ª foto, todos recusados ou em revisão; 3 denúncias de um aparelho só contam 1.
10. **Offline:** confirmar sem rede entra na fila e envia depois sem duplicar (`client_uuid`) se o horário do cliente estiver a até 15 min; senão descartada.
11. **Privacidade:** nenhuma chamada do cliente retorna `device_id`, `autor_hash` ou coordenada de terceiros.
12. **p95 de leitura** da lista (160 feiras + trecho vigente) ≤ 800 ms em "Fast 4G" do Lighthouse, região sa-east-1.
13. **Ofensa:** nome de feira sugerida com "p0rr4", "p o r r a" ou "pooorra" → `texto_proibido`; 3 em 24 h → aparelho bloqueado para escrita 7 dias. Texto recusado não aparece em nenhuma tabela nem log (só o hash e o motivo).
14. **Voto congelado:** aparelho com 23 h vota `aprovo` (não elegível); com 25 h, a apuração continua ignorando esse voto. Só um novo voto, feito depois das 24 h, conta.
15. **Foto escondida:** depois de `ocultar_foto`, a URL antiga devolve 404 **na origem** (sem CDN) para foto e miniatura, e só abre por URL assinada de admin. Foto de aparelho novo em revisão nunca tem URL pública.
16. **Vazamento:** um teste lista tudo que `anon` e `authenticated` alcançam (tabelas, visões, funções, buckets) e falha se houver algo fora da lista permitida; nenhuma resposta traz `device_id`, `autor_hash` ou coordenada. Voto em proposta com 14 dias e 1 min, com o job parado → `encerrada`. Dois votos simultâneos na mesma proposta → um só resultado.

## 12. Fases

0. **Leitura e privacidade:** importar `feiras`, ligar leitura no app por flag, tela de política de privacidade, ping agendado. Nenhuma escrita.
1. **Confirmações compartilhadas** (login anônimo, captcha, `verificar_presenca`, fila offline).
2. **Trecho colaborativo** (propor, votar, aprovar, reverter, `admin.reverter_trecho`, tela "Corrigir trecho").
3. **Feiras sugeridas** (com migração de ids locais).
4. **Fotos** (por último: rosto, LGPD e moderação sem equipe).

## 13. O que fica para quem constrói

Nomes de tabelas e funções (seguir os de cima), fórmula exata de Hausdorff/PostGIS e da autointerseção, estrutura do job de limpeza, textos finais dos códigos de erro, e a conferência dos limites atuais do plano gratuito.
