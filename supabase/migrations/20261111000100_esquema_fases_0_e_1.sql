-- =============================================================================
-- Olha a Feira — Migração 1: Esquema base (Fases 0 e 1 + estrutura compatível)
-- Fonte da verdade: docs/backend/REQUISITOS.md (v4)
-- =============================================================================

-- 1. Schemas internos da aplicação (auth, storage e extensions já existem no Supabase)
CREATE SCHEMA IF NOT EXISTS private;
CREATE SCHEMA IF NOT EXISTS admin;

-- 2. Extensões obrigatórias: PostGIS no schema extensions e pg_cron (limpeza de 30 dias)
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Não foi possível criar a extensão obrigatória pg_cron (necessária para a limpeza de 30 dias da política de privacidade). Ligue pg_cron em Database -> Extensions antes de rodar as migrações. Detalhe: %', SQLERRM;
END
$$;

-- 3. Privilégios padrão fechados (seção 4)
REVOKE ALL ON SCHEMA private, admin FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA admin REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA admin REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA admin REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- 4. Segredo interno do servidor para HMAC/hash de autor e dispositivo (nunca legível pelo cliente)
CREATE TABLE IF NOT EXISTS private.segredos (
  chave text PRIMARY KEY,
  valor text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE private.segredos ENABLE ROW LEVEL SECURITY;

INSERT INTO private.segredos (chave, valor)
VALUES ('hmac_secret', pg_catalog.encode(pg_catalog.sha256(pg_catalog.gen_random_uuid()::text::bytea), 'hex'))
ON CONFLICT (chave) DO NOTHING;

-- 5. Tabela config com todos os parâmetros da seção 10
CREATE TABLE IF NOT EXISTS public.config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  raio_confirmacao_m double precision NOT NULL DEFAULT 150,
  raio_presenca_remota_m double precision NOT NULL DEFAULT 300,
  raio_max_prefeitura_m double precision NOT NULL DEFAULT 600,
  janela_horario_minutos integer NOT NULL DEFAULT 60,
  acuracia_max_m double precision NOT NULL DEFAULT 100,
  trecho_comprimento_min_m double precision NOT NULL DEFAULT 30,
  trecho_comprimento_max_m double precision NOT NULL DEFAULT 800,
  trecho_pontos_min integer NOT NULL DEFAULT 2,
  trecho_pontos_max integer NOT NULL DEFAULT 12,
  hausdorff_min_m double precision NOT NULL DEFAULT 20,
  idade_min_voto interval NOT NULL DEFAULT '24 hours',
  idade_min_propor interval NOT NULL DEFAULT '7 days',
  quorum_aprovacao integer NOT NULL DEFAULT 3,
  quorum_negacao_presente integer NOT NULL DEFAULT 2,
  quorum_negacao_remoto integer NOT NULL DEFAULT 3,
  quorum_nao_teve_feira integer NOT NULL DEFAULT 3,
  expiracao_proposta interval NOT NULL DEFAULT '14 days',
  espera_proposta interval NOT NULL DEFAULT '14 days',
  expiracao_sugestao interval NOT NULL DEFAULT '30 days',
  janela_confirmacao_dias integer NOT NULL DEFAULT 28,
  retencao_confirmacao_dias integer NOT NULL DEFAULT 30,
  limite_propostas_semana integer NOT NULL DEFAULT 2,
  limite_sugestoes_semana integer NOT NULL DEFAULT 3,
  limite_votos_dia integer NOT NULL DEFAULT 20,
  limite_fotos_dia integer NOT NULL DEFAULT 5,
  limite_fotos_semana integer NOT NULL DEFAULT 20,
  limite_fotos_feira_dia integer NOT NULL DEFAULT 3,
  limite_denuncias_dia integer NOT NULL DEFAULT 10,
  teto_global_fotos_dia integer NOT NULL DEFAULT 200,
  fotos_visiveis_por_feira integer NOT NULL DEFAULT 12,
  client_ts_janela interval NOT NULL DEFAULT '15 minutes',
  trecho_efeito_imediato boolean NOT NULL DEFAULT false,
  palavras_barradas text[] NOT NULL DEFAULT ARRAY[
    'porra', 'caralho', 'puta', 'foda', 'merda', 'cacete', 'vadia', 'vagabundo',
    'arrombado', 'cuzao', 'buceta', 'piroca', 'viado', 'bicha', 'macaco',
    'nazista', 'estupro', 'matar', 'morte', 'http', 'https', 'www', 'whatsapp'
  ],
  texto_proibido_bloqueio jsonb NOT NULL DEFAULT '{"ocorrencias_24h": 3, "dias_bloqueio_temp": 7, "ocorrencias_total": 10}'::jsonb,
  limiares_voto jsonb NOT NULL DEFAULT '{"trecho": {"aprovar": 3, "negar_presente": 2, "negar_remoto": 3}, "sugestao": {"publicar_presente": 1, "ativar": 3, "negar": 3}, "denuncia": {"ocultar": 3}}'::jsonb,
  foto_cache_segundos integer NOT NULL DEFAULT 86400,
  atualizado_em timestamptz NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;

INSERT INTO public.config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 6. Tabelas de base: feiras, trechos, votos (seções 4, 5, 6)
CREATE TABLE IF NOT EXISTS public.feiras (
  id text PRIMARY KEY,
  endereco text NOT NULL,
  bairro text NOT NULL,
  ra text,
  dia smallint NOT NULL CHECK (dia BETWEEN 0 AND 6),
  inicio time NOT NULL,
  fim time NOT NULL CHECK (fim > inicio),
  lat double precision CHECK (lat IS NULL OR (lat BETWEEN -23.15 AND -22.70)),
  lng double precision CHECK (lng IS NULL OR (lng BETWEEN -43.85 AND -43.05)),
  coord_precisa boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'pendente', 'negada', 'oculta')),
  trecho_vigente_id uuid,
  origem text NOT NULL DEFAULT 'prefeitura' CHECK (origem IN ('prefeitura', 'comunidade')),
  autor_hash text,
  criado_em timestamptz NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE public.feiras ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.trechos (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  feira_id text NOT NULL REFERENCES public.feiras(id) ON DELETE CASCADE,
  pontos jsonb NOT NULL,
  geom extensions.geography(LineString, 4326) NOT NULL,
  origem text NOT NULL CHECK (origem IN ('curado', 'comunidade')),
  estado text NOT NULL CHECK (estado IN ('aberta', 'aprovada', 'negada', 'expirada', 'cancelada', 'substituida')),
  motivo text CHECK (motivo IS NULL OR motivo IN ('rua_errada', 'trecho_maior', 'trecho_menor', 'mudou_de_lugar', 'outro')),
  anterior_id uuid REFERENCES public.trechos(id) ON DELETE SET NULL,
  autor_hash text,
  criado_em timestamptz NOT NULL DEFAULT pg_catalog.now(),
  fechado_em timestamptz
);

ALTER TABLE public.trechos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'feiras_trecho_vigente_id_fkey'
  ) THEN
    ALTER TABLE public.feiras
      ADD CONSTRAINT feiras_trecho_vigente_id_fkey
      FOREIGN KEY (trecho_vigente_id) REFERENCES public.trechos(id)
      ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_trechos_feira_estado ON public.trechos (feira_id, estado);

-- Motor genérico de votos (seção 4 e 7.2; pronto para as próximas fases)
CREATE TABLE IF NOT EXISTS public.votos (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('trecho', 'sugestao', 'denuncia_foto', 'denuncia_sugestao')),
  alvo_id text NOT NULL,
  device_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  voto text NOT NULL CHECK (voto IN ('aprovo', 'nego', 'apoio', 'denuncia')),
  elegivel boolean NOT NULL DEFAULT false,
  presente boolean NOT NULL DEFAULT false,
  client_uuid uuid NOT NULL UNIQUE,
  client_ts timestamptz NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (tipo, alvo_id, device_id)
);

ALTER TABLE public.votos ENABLE ROW LEVEL SECURITY;

-- 7. Tabelas públicas de leitura sem identificador (seção 7.5)
CREATE TABLE IF NOT EXISTS public.pub_feiras (
  id text PRIMARY KEY,
  endereco text NOT NULL,
  bairro text NOT NULL,
  ra text,
  dia smallint NOT NULL CHECK (dia BETWEEN 0 AND 6),
  inicio time NOT NULL,
  fim time NOT NULL CHECK (fim > inicio),
  lat double precision,
  lng double precision,
  coord_precisa boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ativa' CHECK (status = 'ativa'),
  trecho_vigente_id uuid,
  origem text NOT NULL DEFAULT 'prefeitura' CHECK (origem IN ('prefeitura', 'comunidade')),
  atualizado_em timestamptz NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE public.pub_feiras ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.pub_trechos (
  id uuid PRIMARY KEY,
  feira_id text NOT NULL REFERENCES public.pub_feiras(id) ON DELETE CASCADE,
  pontos jsonb NOT NULL,
  origem text NOT NULL CHECK (origem IN ('curado', 'comunidade')),
  estado text NOT NULL CHECK (estado IN ('aprovada', 'aberta')),
  criado_em timestamptz NOT NULL DEFAULT pg_catalog.now(),
  expira_em timestamptz
);

ALTER TABLE public.pub_trechos ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.pub_confirmacoes (
  feira_id text PRIMARY KEY REFERENCES public.pub_feiras(id) ON DELETE CASCADE,
  ultima_confirmacao_sim timestamptz,
  confirmacoes_sim_28d integer NOT NULL DEFAULT 0 CHECK (confirmacoes_sim_28d >= 0),
  sem_feira_hoje boolean NOT NULL DEFAULT false,
  atualizado_em timestamptz NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE public.pub_confirmacoes ENABLE ROW LEVEL SECURITY;

-- 8. Tabelas privadas (dados brutos, sem coordenada e sem IP; seção 7.1, 7.5, 7.6, 8)
CREATE TABLE IF NOT EXISTS private.confirmacoes (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  feira_id text NOT NULL REFERENCES public.feiras(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dia_sp date NOT NULL,
  resposta text NOT NULL CHECK (resposta IN ('sim', 'nao')),
  dentro_do_raio boolean NOT NULL CHECK (dentro_do_raio = true),
  distancia_m integer NOT NULL CHECK (distancia_m >= 0 AND distancia_m % 10 = 0),
  aparelho_elegivel_24h boolean NOT NULL DEFAULT false,
  client_uuid uuid NOT NULL UNIQUE,
  client_ts timestamptz NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT pg_catalog.now(),
  atualizado_em timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (device_id, feira_id, dia_sp)
);

ALTER TABLE private.confirmacoes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_priv_confirmacoes_feira_dia ON private.confirmacoes (feira_id, dia_sp);
CREATE INDEX IF NOT EXISTS idx_priv_confirmacoes_feira_criado ON private.confirmacoes (feira_id, criado_em DESC);

CREATE TABLE IF NOT EXISTS private.dispositivos_bloqueados (
  device_hash text PRIMARY KEY,
  device_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  motivo text NOT NULL DEFAULT 'manual',
  permanente boolean NOT NULL DEFAULT true,
  bloqueado_ate timestamptz,
  criado_em timestamptz NOT NULL DEFAULT pg_catalog.now(),
  expira_em timestamptz NOT NULL DEFAULT (pg_catalog.now() + interval '90 days')
);

ALTER TABLE private.dispositivos_bloqueados ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS private.incidentes_ofensa (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  device_hash text NOT NULL,
  motivo text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT pg_catalog.now(),
  expira_em timestamptz NOT NULL DEFAULT (pg_catalog.now() + interval '90 days')
);

ALTER TABLE private.incidentes_ofensa ENABLE ROW LEVEL SECURITY;

-- 9. Feira 49 (Rua Mearim) e seu trecho curado aprovado já garantidos na migração (seção 6)
INSERT INTO public.feiras (
  id, endereco, bairro, ra, dia, inicio, fim, lat, lng, coord_precisa, status, trecho_vigente_id, origem
) VALUES (
  '49',
  'Rua Mearim',
  'Grajaú',
  '09-Vila Isabel',
  2,
  '07:00:00',
  '13:00:00',
  -22.923883,
  -43.260929,
  true,
  'ativa',
  NULL,
  'prefeitura'
)
ON CONFLICT (id) DO UPDATE SET
  endereco = EXCLUDED.endereco,
  bairro = EXCLUDED.bairro,
  ra = EXCLUDED.ra,
  dia = EXCLUDED.dia,
  inicio = EXCLUDED.inicio,
  fim = EXCLUDED.fim,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  coord_precisa = EXCLUDED.coord_precisa,
  status = EXCLUDED.status,
  origem = EXCLUDED.origem;

INSERT INTO public.trechos (
  id, feira_id, pontos, geom, origem, estado, motivo, anterior_id, autor_hash, criado_em, fechado_em
) VALUES (
  '00000000-0000-4000-8000-000000000049'::uuid,
  '49',
  '[[-22.923807, -43.259737], [-22.924313, -43.261316], [-22.923528, -43.261733]]'::jsonb,
  extensions.ST_GeogFromText('SRID=4326;LINESTRING(-43.259737 -22.923807, -43.261316 -22.924313, -43.261733 -22.923528)'),
  'curado',
  'aprovada',
  NULL,
  NULL,
  NULL,
  pg_catalog.now(),
  pg_catalog.now()
)
ON CONFLICT (id) DO UPDATE SET
  feira_id = EXCLUDED.feira_id,
  pontos = EXCLUDED.pontos,
  geom = EXCLUDED.geom,
  origem = EXCLUDED.origem,
  estado = EXCLUDED.estado;

UPDATE public.feiras
SET trecho_vigente_id = '00000000-0000-4000-8000-000000000049'::uuid
WHERE id = '49';
