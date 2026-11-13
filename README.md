# Olha a Feira

Mapa colaborativo das feiras livres do Rio de Janeiro. Mostra onde e em que horário cada feira acontece, com a origem de cada dado, e deixa quem está na feira confirmar que ela está funcionando.

## O que o app faz

- **Lista por dia:** feiras da semana, com horário e bairro.
- **Mapa:** cada feira aparece como um trecho de rua, não como um ponto.
- **Tem feira aqui agora?** Quem está perto e dentro do horário confirma com Sim ou Não. Pode enviar uma foto.
- **Fotos:** a comunidade envia fotos das feiras. As de aparelhos novos passam por revisão antes de aparecer.
- **Trechos e sugestões:** a comunidade pode propor um trecho novo ou sugerir uma feira que não está na lista.
- **Privacidade:** o app não guarda coordenadas nem IP junto das confirmações, e a localização nunca fica ligada ao nome de quem a enviou. Os detalhes estão na tela "Privacidade e dados" e em `docs/backend/REQUISITOS.md`.

Fontes dos dados:

- Lista oficial de feiras livres da Prefeitura do Rio (PDF).
- Horários e notas do Google Maps. São informações de terceiros e podem estar desatualizadas.
- Confirmações de quem esteve na feira.

## Tecnologias

- React 19 e Vite 8
- Tailwind CSS 4
- MapLibre GL para o mapa
- lucide-react para ícones
- Supabase: banco Postgres, autenticação anônima, RPCs e uma Edge Function para fotos
- Cloudflare Turnstile como captcha antes do login anônimo

## Como rodar localmente

Requisitos: Node.js na versão LTS atual e npm.

```bash
git clone https://github.com/jvsfrancisco/feiras-cariocas.git
cd feiras-cariocas
npm install
cp .env.example .env.local   # preencha as variáveis abaixo
npm run dev
```

Abra o endereço que o Vite mostrar no terminal (normalmente `http://localhost:5173`).

### Variáveis de ambiente

| Variável | Para que serve |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase (`https://<project-ref>.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Chave pública `anon` do Supabase |
| `VITE_TURNSTILE_SITE_KEY` | Site key do widget Cloudflare Turnstile |

Essas três são públicas por natureza e vão para o navegador. **Nunca** coloque no front-end a `service_role` do Supabase, a Secret Key do Turnstile ou qualquer segredo de `private.segredos`.

Sem `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, o app não usa o backend. Sem `VITE_TURNSTILE_SITE_KEY`, o login anônimo não tem captcha e o Supabase pode recusá-lo se o captcha estiver ligado no projeto.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento com recarga automática |
| `npm run build` | Gera a versão de produção em `dist/` |
| `npm run preview` | Sobe localmente o conteúdo de `dist/` |
| `npm run lint` | Roda o ESLint no projeto |

Antes de abrir um pull request, rode `npm run lint` e `npm run build`.

## Back-end

O back-end fica no Supabase e está documentado em `docs/backend/`:

- `REQUISITOS.md`: regras de privacidade, limites de envio e o que conta como confirmação válida.
- `IMPLANTAR.md`: passo a passo para criar o projeto, aplicar as migrações e configurar captcha, cron e segredos.

Estrutura relevante:

```
supabase/
  migrations/        migrações SQL, na ordem do timestamp
  functions/fotos/   Edge Function de fotos (upload, denúncia, limpeza)
  seed.sql           feiras carregadas no banco
  tests/             testes SQL
scripts/
  importar-feiras.mjs  gera o seed a partir de src/data/feiras.js
  gerar-regioes.mjs    script auxiliar de regiões
.github/workflows/
  ping-supabase.yml    ping periódico para o projeto gratuito não pausar
```

## Estrutura do front-end

```
src/
  api/        cliente fino do Supabase, fila de confirmações e fotos
  components/ telas e componentes (mapa, cartões, avisos, carregamento)
  data/       lista de feiras
```

## Contribuir

- Trabalhe em uma branch a partir de `main`, com commits pequenos e mensagens no formato `tipo(escopo): descrição`.
- Não faça push direto em `main`.
- Mudanças de visual seguem a grade de 8 px e os tokens de cor do projeto (`creme`, `papel`, `tinta`, `verde`, `tomate`, `manga`).
- Animações respeitam `prefers-reduced-motion`.

## Licença

Sem licença definida. Todos os direitos são reservados ao autor até que uma licença seja escolhida.
