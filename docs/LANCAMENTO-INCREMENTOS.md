# Pontos de incremento para o lançamento

Auditoria de 2026-11-23. Fontes: código, banco real (`olha-a-feira-sp`, só leitura), app rodando no navegador, lint, build e testes de `src/utils` (todos passam; não há script `npm test`).

Legenda: **B** bloqueia o lançamento · **A** alto · **M** médio · **b** baixo.

## 1. Fotos (problema sério)

| # | Nível | Problema | Evidência | Correção sugerida |
|---|---|---|---|---|
| F1 | B | Foto de aparelho novo nunca aparece. Todas as fotos de aparelho com menos de 7 dias vão para o estado `revisao`, não existe tela nem rotina de revisão, e após 30 dias o servidor apaga. | `supabase/migrations/20261112000500_fase_4_fotos.sql` linhas 175 e 329; `pub_fotos` do banco real está vazio (`[]`). | Escolher: (a) publicar direto e confiar na denúncia, ou (b) criar tela/rotina de revisão. Mínimo para lançar: (a) só para as 3 primeiras fotos da feira, com denúncia ativa. |
| F2 | B | A foto exige estar na feira, no dia e no horário exatos, a até 150 m do pino, com GPS de até 100 m. Fora disso o botão só mostra uma frase. Quem quer ajudar de casa ou fora do horário não consegue. | `FeiraFotosServidor.jsx` `presencaValida`; SQL linha 136 (`verificar_presenca`, sem tolerância). | Dar tolerância de 1 h antes e depois; mostrar o motivo exato (longe, fora do horário, GPS fraco) e a distância. |
| F3 | A | O pino do banco é impreciso para várias feiras; a checagem de 150 m usa o pino, não o trecho. A Mearim tem trecho, mas a presença não o usa na foto. | `presencaValida` usa `market.lat/lng`. | Usar distância até o trecho (já existe `distanciaAoTrechoMetros` em `confirmacoes.js`). |
| F4 | A | Qualquer falha de envio vira o mesmo erro `invalido`: upload no Storage, promoção, segredo ausente. O usuário não sabe o que houve. | `src/api/fotos.js` (`subir`, `chamarFuncao` devolvem `invalido`). | Códigos distintos (`upload_falhou`, `servidor`, `sem_conexao`) e mensagem para cada. |
| F5 | A | Passo de painel pendente: `FOTO_EDGE_SECRET` e rota `limpar` agendada. Storage real "não testado" segundo as notas. | Memória do projeto, pendências de 2026-11-12. | Fazer um envio real de ponta a ponta, em uma feira, antes de lançar. |
| F6 | M | `capture="environment"` abre só a câmera no celular; não deixa escolher da galeria. | `FeiraFotosServidor.jsx` linha 207. | Remover `capture` ou oferecer "Câmera" e "Galeria". |
| F7 | M | Foto aberta só mostra "Denunciar" ou "Apagar" em texto pequeno; sem legenda, data ou feira. | Mesmo arquivo, rodapé do visualizador. | Mostrar data e dia da feira. |
| F8 | M | Aparelho que já tinha fotos antigas locais mostra "Só neste aparelho" ao lado das públicas sem explicar a diferença. | `antigas` na mesma tela. | Texto curto explicando, ou botão "Enviar para a comunidade". |
| F9 | b | Interface carrega `FeiraFotos.jsx` (local) e `FeiraFotosServidor.jsx` (servidor): dois caminhos para manter. | `src/components/`. | Remover o local quando a migração acabar. |

## 2. Feira da Mearim e outras do Grajaú

Fatos conferidos no banco real: só existe **uma** Mearim (id 49), com trecho aprovado de 3 pontos. Não há feira "Rua Grajaú" no banco nem sugestões públicas. As três feiras do Grajaú são 48 (Duquesa de Bragança, sábado), 49 (Mearim, terça) e 50 (Av. Júlio Furtado, sexta).

| # | Nível | Problema | Evidência | Correção sugerida |
|---|---|---|---|---|
| G1 | A | As três feiras do Grajaú têm o mesmo título "Feira Grajaú". O que parece "outra feira na rua Grajaú" provavelmente é a 50 (teal, sexta), a ~300 m, que o mapa mistura com a Mearim em um agrupamento "2". | Lista filtrada por "Grajaú" e mapa, hoje. | Título deve incluir a rua ("Feira da Mearim", "Feira da Júlio Furtado"). Usar `trechosInfo.titulo` quando existir. |
| G2 | A | Na Mearim, o agrupamento do mapa esconde as duas feiras próximas até dar zoom; só ao aproximar aparecem o trecho vermelho e os pinos 1 a 3. Por isso parece "parada" e sem identidade. | Mapa: grupo "2" na visão do bairro. | `clusterMaxZoom` menor, ou tirar do agrupamento feiras que têm trecho. |
| G3 | A | O trecho vermelho aparece diagonal e fora do traçado da rua no zoom do bairro; o pino central e os três pinos numerados se sobrepõem. | Captura do mapa em zoom ~15. | Conferir os 3 pontos contra a rua real; mostrar pinos numerados só no zoom ≥ 16. |
| G4 | M | Possível feira duplicada **só neste seu aparelho**: o cadastro local (`feiras_cariocas_custom`) e sugestões pendentes entram na lista. Não consegui ver o seu navegador. | `useMarkets.js` linhas 43 a 60. | Abrir o app no aparelho, rodar `localStorage.getItem('feiras_cariocas_custom')` e mandar o resultado, ou limpar a chave. Evitar cadastro local a menos de 150 m de feira existente do mesmo dia. |
| G5 | M | Horário da Mearim: notas antigas dizem "A confirmar"; o banco já tem 07:00–13:00. Conferir se a feira realmente termina às 13:00. | `DECISOES.md`; banco. | Você confirma o horário real. |

## 3. Lançamento e produto

| # | Nível | Item | Ação |
|---|---|---|---|
| L1 | B | Sem script `npm test`; testes só rodam com `node --test`. | Adicionar `"test": "node --test src/utils/"` ao `package.json`. |
| L2 | A | JS do mapa tem ~1,08 MB (292 KB gzip); entrada 474 KB. Em 3G isso pesa. | Medir Lighthouse no celular; avaliar mapa só quando abre. |
| L3 | A | Tiles e API Overpass públicos: política de uso limita tráfego. OpenFreeMap é gratuito, mas sem garantia. | Plano B de provedor se passar de milhares de acessos por dia. |
| L4 | A | Passos de painel pendentes: segredos do GitHub para o ping, apagar projeto antigo `olha-a-feira` (Oregon), Turnstile em produção. | Fazer antes do domínio final. |
| L5 | A | Moderação: filtro de ofensas no servidor existe, mas não há fila para você ler denúncias de feira e de foto. | Consulta SQL salva ou painel simples. |
| L6 | M | 24 feiras sem região desenhada (só pino) e ruas inteiras desenhadas, não o trecho real. | Aceitar no lançamento; abrir para a comunidade corrigir. |
| L7 | M | `public/icon-512.png` ainda com o ícone antigo (nota de DECISOES). | Regenerar. |
| L8 | M | Espaçamentos fora do grid de 8 em componentes antigos (`gap-3`, `px-5`). | Passada de ajuste, sem pressa. |
| L9 | M | A copy diz "não são enviadas a ninguém" enquanto o backend já envia confirmações e fotos. | Revisar Landing, FAQ e aviso de privacidade. |
| L10 | b | Banner de instalação cobre os cartões em tela larga. | Posicionar abaixo ou só em telas pequenas. |
| L11 | b | Nenhuma medição de uso (visitas, feiras abertas, fotos). | Contador simples sem cookie. |

## 4. Ordem sugerida até o lançamento

1. F1, F2, F4, F5: fazer uma foto real funcionar de ponta a ponta.
2. G1, G2, G3: tirar a confusão do Grajaú.
3. L1, L4, L9: higiene mínima.
4. L2, L5, F3, F6.
5. O resto depois do lançamento.
