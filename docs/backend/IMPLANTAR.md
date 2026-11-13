# Guia de implantação — Back-end do Olha a Feira (Fases 0 e 1)

Este guia descreve o passo a passo para criar e configurar o projeto no Supabase e ativar as **fases 0 (leitura e privacidade)** e **1 (confirmações compartilhadas)** descritas em `docs/backend/REQUISITOS.md` (v4).

---

## 1. Criar o projeto no Supabase (`sa-east-1`)

1. Acesse [https://supabase.com/dashboard](https://supabase.com/dashboard) e crie uma organização/conta (plano **Free**).
2. Clique em **New project**:
   - **Name:** `olha-a-feira-rj`
   - **Database Password:** gere uma senha forte e guarde em local seguro.
   - **Region:** selecione **`South America (São Paulo) — sa-east-1`** (requisito de latência da seção 11, critério 12).
3. Aguarde a provisão concluir (~1–2 minutos).
4. Em **Project Settings → API**, anote:
   - **Project URL** (`https://<project-ref>.supabase.co`)
   - **Project API Keys → `anon` `public`**

---

## 2. Ligar login anônimo, limite por IP e Cloudflare Turnstile

1. **Criar chave no Cloudflare Turnstile:**
   - No painel do Cloudflare, vá em **Turnstile → Add widget**.
   - Adicione os domínios (`olhafeira.tech`, `localhost` para testes) e escolha o modo **Managed** ou **Invisible**.
   - Copie a **Site Key** (vai no `.env` do front-end como `VITE_TURNSTILE_SITE_KEY`) e a **Secret Key** (vai no Supabase).
2. **Ativar Anonymous Sign-Ins no Supabase:**
   - No painel do Supabase, acesse **Authentication → Providers → Anonymous Sign-Ins** (ou **Authentication → Settings → User Signups**).
   - Habilite **Allow anonymous sign-ins**.
3. **Ativar CAPTCHA (Turnstile):**
   - Em **Authentication → Bot and Abuse Protection** (ou **Security and Protection**):
   - Habilite **Enable Captcha protection**, selecione **Cloudflare Turnstile** e cole a **Secret Key**.
4. **Ajustar limite de logins anônimos:**
   - Em **Authentication → Rate Limits**, defina o limite de **Anonymous Sign-Ins** para **`10` requisições por hora por IP** (seção 4).
5. **Desligar Realtime para tabelas privadas:**
   - Em **Database → Publications → `supabase_realtime`**, confirme que nenhuma tabela está marcada (seção 4).
6. **Ligar a extensão `pg_cron` (antes das migrações):**
   - Em **Database → Extensions**, procure **`pg_cron`** e ative a extensão **antes** de rodar as migrações. As migrações exigem `pg_cron` para agendar a limpeza diária de 30 dias (`private.limpar_dados_expirados()`) e falham com erro se a extensão não puder ser criada.

---

## 3. Aplicar as migrações SQL

> **Importante:** Certifique-se de que a extensão `pg_cron` já está ligada em **Database → Extensions** antes de aplicar as migrações.

Você pode aplicar as migrações pela CLI do Supabase ou pelo **SQL Editor** do painel:

### Opção A — Via Supabase CLI (recomendado)
```bash
npx supabase login
npx supabase link --project-ref <SEU_PROJECT_REF>
npx supabase db push
```

### Opção B — Via SQL Editor no painel
Execute na ordem exata de timestamp:
1. `supabase/migrations/20261111000100_esquema_fases_0_e_1.sql`
2. `supabase/migrations/20261111000200_funcoes_e_privs_fases_0_e_1.sql`
3. `supabase/migrations/20261111000300_fase_2_trecho.sql`
4. `supabase/migrations/20261111000400_fase_3_sugestoes.sql`

> **Segredo HMAC do servidor:** A migração 1 gera automaticamente um segredo aleatório em `private.segredos` (`chave = 'hmac_secret'`). Se quiser rotacionar ou definir um valor próprio, rode no SQL Editor:
> ```sql
> UPDATE private.segredos SET valor = '<seu-segredo-forte>' WHERE chave = 'hmac_secret';
> ```

### Conferir que o job de limpeza de 30 dias existe no `pg_cron`
Após rodar as migrações, execute no **SQL Editor** para confirmar que o job `olhafeira-limpeza-diaria` está agendado:
```sql
select jobname, schedule from cron.job;
```
O retorno deve exibir `olhafeira-limpeza-diaria` com `schedule = '15 4 * * *'`.

---

## 4. Gerar e aplicar o seed (`supabase/seed.sql`)

1. Na raiz do repositório, gere o arquivo `supabase/seed.sql` a partir de `src/data/feiras.js`:
   ```bash
   node scripts/importar-feiras.mjs
   ```
2. Aplique o `supabase/seed.sql` no banco (é idempotente e pode ser rodado quantas vezes precisar):
   - Pela CLI (`psql` / `supabase db execute`) ou colando o conteúdo de `supabase/seed.sql` no **SQL Editor** do Supabase e clicando em **Run**.
3. Confira se as 160 feiras e o trecho curado da Rua Mearim (`id = '49'`) estão publicados:
   ```sql
   SELECT (public.ping() ->> 'feiras_ativas')::int AS feiras_ativas;
   ```

---

## 5. Rodar a suíte de testes pgTAP (`supabase/tests/`)

Para validar todas as regras de negócio, privacidade e privilégios (critérios 1, 7, 10, 11 e 16 da seção 11):

```bash
npx supabase test db
```

Ou diretamente via `psql` em um banco de testes com `postgis` e `pgtap`:
```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261111000100_esquema_fases_0_e_1.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261111000200_funcoes_e_privs_fases_0_e_1.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261111000300_fase_2_trecho.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261111000400_fase_3_sugestoes.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261112000500_fase_4_fotos.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/01_fases_0_e_1.test.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/02_fase_2.test.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/03_fase_3.test.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/04_fase_4.test.sql
```

---

## 6. Preencher as variáveis no app e no GitHub Actions

### No front-end (local e hospedagem estática)
1. Copie `.env.example` para `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Preencha:
   ```dotenv
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<sua-anon-key-publica>
   VITE_TURNSTILE_SITE_KEY=<sua-site-key-do-turnstile>
   ```
   > Enquanto `VITE_SUPABASE_URL` ou `VITE_SUPABASE_ANON_KEY` estiverem vazias, o app funciona 100% no modo estático/local antigo sem mudar nenhum texto.

### No GitHub Actions (evitar pausa de 7 dias do plano gratuito)
1. No repositório do GitHub, vá em **Settings → Secrets and variables → Actions → New repository secret**.
2. Adicione:
   - `SUPABASE_URL`: `https://<project-ref>.supabase.co`
   - `SUPABASE_ANON_KEY`: `<sua-anon-key-publica>`
3. O workflow `.github/workflows/ping-supabase.yml` roda automaticamente a cada 3 dias chamando `POST /rest/v1/rpc/ping` e também pode ser testado manualmente na aba **Actions → Ping Supabase → Run workflow**.

---

## 7. Conferência dos limites do plano gratuito (seção 9)

Antes de abrir para o público, confira no painel **Organization → Usage**:
- **Inatividade:** pausa após 7 dias sem requisições (coberto pelo `ping-supabase.yml` a cada 3 dias).
- **Banco de dados:** 500 MB (as 160 feiras, trechos e confirmações de 30 dias ocupam < 5 MB).
- **Egress:** 5 GB/mês no plano gratuito.
- **Storage:** 1 GB (só será utilizado na Fase 4 — fotos).

---

## 8. Fotos (fase 4a)

1. Rode a migração `20261112000500_fase_4_fotos.sql` depois das anteriores e execute os quatro arquivos pgTAP. Para a lógica da função, rode `deno test --config supabase/functions/fotos/deno.json --allow-env supabase/functions/fotos/core_test.ts` e `deno check --config supabase/functions/fotos/deno.json supabase/functions/fotos/index.ts`.
2. Consulte como administrador `SELECT valor FROM private.segredos WHERE chave = 'foto_edge_secret'` e configure o valor como segredo `FOTO_EDGE_SECRET` da Edge Function. Publique com `supabase functions deploy fotos`. A função usa `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `FOTO_EDGE_SECRET`. As chaves privadas ficam só no servidor; o navegador usa apenas a chave pública e o JWT do login anônimo. A RPC `denunciar_foto` recusa chamadas que não venham da Edge Function com esse segredo, embora tenha `EXECUTE` para `authenticated`.
3. O app chama `/functions/v1/fotos/promover` após subir foto e miniatura na fila, `/functions/v1/fotos/denunciar` para denunciar e `/functions/v1/fotos/remover` para o dono apagar a foto. A função move os dois objetos para `fotos_quarentena` antes de responder à denúncia decisiva. Para decisões administrativas, chame `/functions/v1/fotos/ocultar` ou `/functions/v1/fotos/restaurar` com `Authorization: Bearer <service-role-key>`. A rota `/functions/v1/fotos/assinar`, com a mesma chave, devolve URLs assinadas por 60 s para objetos privados. As RPCs SQL `admin.ocultar_foto` e `admin.restaurar_foto` atualizam o banco, mas não movem objetos; use as rotas para a operação completa.
4. O bucket `fotos_arquivo` guarda imagens em revisão e arquivadas. Somente `fotos` é público. Os quatro buckets aceitam `image/jpeg` até 300 KB. A função recodifica os dois arquivos antes de gravá-los no destino.
5. O job SQL `olhafeira-limpeza-diaria` já existente marca para remoção as fotos em revisão e arquivadas com 30 dias. Agende também uma chamada diária `POST https://<project-ref>.supabase.co/functions/v1/fotos/limpar` com `Authorization: Bearer <service-role-key>` e corpo `{}`. Use `pg_cron` + `pg_net` ou um agendador de segredos equivalente; mantenha a chave no Vault do Supabase, nunca no comando visível do cron. A rota apaga os arquivos marcados e confirma cada remoção. Repita a chamada se houver falha parcial.
6. Teste a publicação e as URLs públicas em um projeto Supabase real: o Docker desta suíte tem só o schema SQL de Storage. Confirme o 404 na origem para foto e miniatura após ocultar, o cache de 24 h, o bloqueio de upsert e as URLs assinadas de admin com validade de 60 s. Essas verificações dependem do serviço Storage e não são demonstradas pelos testes locais.
