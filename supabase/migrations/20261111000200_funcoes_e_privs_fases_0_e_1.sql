-- =============================================================================
-- Olha a Feira — Migração 2: Funções, Visões Admin, Cron e Privilégios (Fases 0 e 1)
-- Fonte da verdade: docs/backend/REQUISITOS.md (v4)
-- =============================================================================

-- 1. Função auxiliar interna: HMAC / hash de dispositivo com segredo do servidor
CREATE OR REPLACE FUNCTION private.hash_dispositivo(p_device_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_segredo text;
BEGIN
  IF p_device_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT s.valor INTO v_segredo
  FROM private.segredos s
  WHERE s.chave = 'hmac_secret';

  IF v_segredo IS NULL THEN
    v_segredo := 'olhafeira-segredo-padrao';
  END IF;

  RETURN pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(v_segredo || ':' || p_device_id::text, 'UTF8')
    ),
    'hex'
  );
END;
$$;

-- 2. Validadores e conversores no servidor (seção 5: dia da semana e horário)
CREATE OR REPLACE FUNCTION private.converter_dia_semana(p_dia_texto text)
RETURNS smallint
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limpo text;
BEGIN
  IF p_dia_texto IS NULL THEN
    RETURN NULL;
  END IF;
  v_limpo := pg_catalog.btrim(p_dia_texto);
  CASE v_limpo
    WHEN 'Domingo' THEN RETURN 0;
    WHEN 'Segunda-Feira' THEN RETURN 1;
    WHEN 'Terça-Feira' THEN RETURN 2;
    WHEN 'Quarta-Feira' THEN RETURN 3;
    WHEN 'Quinta-Feira' THEN RETURN 4;
    WHEN 'Sexta-Feira' THEN RETURN 5;
    WHEN 'Sábado' THEN RETURN 6;
    ELSE RETURN NULL;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION private.converter_horario(
  p_horario_texto text,
  OUT inicio time,
  OUT fim time
)
RETURNS record
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_match text[];
  v_h1 integer;
  v_m1 integer;
  v_h2 integer;
  v_m2 integer;
BEGIN
  inicio := NULL;
  fim := NULL;
  IF p_horario_texto IS NULL THEN
    RETURN;
  END IF;

  -- Aceita hífen (-) ou en-dash (–) conforme seção 5
  v_match := pg_catalog.regexp_match(
    p_horario_texto,
    '^\s*(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})\s*$'
  );
  IF v_match IS NULL THEN
    RETURN;
  END IF;

  v_h1 := v_match[1]::integer;
  v_m1 := v_match[2]::integer;
  v_h2 := v_match[3]::integer;
  v_m2 := v_match[4]::integer;

  IF v_h1 < 0 OR v_h1 > 23 OR v_h2 < 0 OR v_h2 > 23 OR v_m1 < 0 OR v_m1 > 59 OR v_m2 < 0 OR v_m2 > 59 THEN
    RETURN;
  END IF;

  IF (v_h2 * 60 + v_m2) <= (v_h1 * 60 + v_m1) THEN
    RETURN;
  END IF;

  inicio := pg_catalog.make_time(v_h1, v_m1, 0);
  fim := pg_catalog.make_time(v_h2, v_m2, 0);
END;
$$;

-- 3. Conversor de jsonb [[lat,lng],...] para LineString PostGIS (geography)
CREATE OR REPLACE FUNCTION private.pontos_para_linestring(p_pontos jsonb)
RETURNS extensions.geography
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_geoms extensions.geometry[];
  v_elem jsonb;
  v_lat double precision;
  v_lng double precision;
BEGIN
  IF p_pontos IS NULL OR pg_catalog.jsonb_typeof(p_pontos) <> 'array' OR pg_catalog.jsonb_array_length(p_pontos) < 2 THEN
    RETURN NULL;
  END IF;

  v_geoms := ARRAY[]::extensions.geometry[];
  FOR v_elem IN SELECT value FROM pg_catalog.jsonb_array_elements(p_pontos)
  LOOP
    IF pg_catalog.jsonb_typeof(v_elem) <> 'array' OR pg_catalog.jsonb_array_length(v_elem) < 2 THEN
      RETURN NULL;
    END IF;
    v_lat := (v_elem ->> 0)::double precision;
    v_lng := (v_elem ->> 1)::double precision;
    v_geoms := pg_catalog.array_append(
      v_geoms,
      extensions.ST_SetSRID(extensions.ST_MakePoint(v_lng, v_lat), 4326)
    );
  END LOOP;

  RETURN extensions.ST_SetSRID(extensions.ST_MakeLine(v_geoms), 4326)::extensions.geography;
END;
$$;

-- 4. Checagens internas de aparelho (elegibilidade ≥ 24 h e bloqueio)
CREATE OR REPLACE FUNCTION private.aparelho_elegivel_24h(
  p_device_id uuid,
  p_ref_ts timestamptz DEFAULT pg_catalog.now()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_created_at timestamptz;
  v_idade_min interval;
BEGIN
  IF p_device_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT u.created_at INTO v_created_at
  FROM auth.users u
  WHERE u.id = p_device_id;

  IF NOT FOUND OR v_created_at IS NULL THEN
    RETURN false;
  END IF;

  SELECT c.idade_min_voto INTO v_idade_min
  FROM public.config c
  WHERE c.id = 1;

  RETURN v_created_at <= (COALESCE(p_ref_ts, pg_catalog.now()) - COALESCE(v_idade_min, interval '24 hours'));
END;
$$;

CREATE OR REPLACE FUNCTION private.dispositivo_bloqueado(p_device_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hash text;
BEGIN
  IF p_device_id IS NULL THEN
    RETURN false;
  END IF;

  v_hash := private.hash_dispositivo(p_device_id);

  RETURN EXISTS (
    SELECT 1
    FROM private.dispositivos_bloqueados b
    WHERE (b.device_id = p_device_id OR b.device_hash = v_hash)
      AND b.expira_em > pg_catalog.now()
      AND (b.permanente = true OR (b.bloqueado_ate IS NOT NULL AND b.bloqueado_ate > pg_catalog.now()))
  );
END;
$$;

-- 5. Sincronização das tabelas públicas de leitura (pub_feiras, pub_trechos, pub_confirmacoes)
CREATE OR REPLACE FUNCTION private.atualizar_pub_confirmacoes(p_feira_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cfg public.config%ROWTYPE;
  v_hoje_sp date;
  v_ultima_sim timestamptz;
  v_contagem_28d integer;
  v_ultimo_sim_hoje timestamptz;
  v_nao_elegiveis_hoje integer;
  v_sem_feira_hoje boolean;
BEGIN
  IF p_feira_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.pub_feiras pf WHERE pf.id = p_feira_id) THEN
    RETURN;
  END IF;

  SELECT * INTO v_cfg FROM public.config WHERE id = 1;
  v_hoje_sp := (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date;

  SELECT
    pg_catalog.max(c.criado_em),
    pg_catalog.count(*)::integer
  INTO v_ultima_sim, v_contagem_28d
  FROM private.confirmacoes c
  WHERE c.feira_id = p_feira_id
    AND c.resposta = 'sim'
    AND c.criado_em >= (pg_catalog.now() - pg_catalog.make_interval(days => COALESCE(v_cfg.janela_confirmacao_dias, 28)));

  SELECT pg_catalog.max(c.criado_em)
  INTO v_ultimo_sim_hoje
  FROM private.confirmacoes c
  WHERE c.feira_id = p_feira_id
    AND c.dia_sp = v_hoje_sp
    AND c.resposta = 'sim';

  -- Seção 7.1: Selo "Pessoas dizem que não teve feira hoje" só com 3 "não" de aparelhos >= 24 h.
  -- Um "sim" posterior apaga um selo "não teve feira" do dia.
  SELECT pg_catalog.count(*)::integer
  INTO v_nao_elegiveis_hoje
  FROM private.confirmacoes c
  WHERE c.feira_id = p_feira_id
    AND c.dia_sp = v_hoje_sp
    AND c.resposta = 'nao'
    AND c.aparelho_elegivel_24h = true
    AND (v_ultimo_sim_hoje IS NULL OR c.criado_em > v_ultimo_sim_hoje);

  v_sem_feira_hoje := (COALESCE(v_nao_elegiveis_hoje, 0) >= COALESCE(v_cfg.quorum_nao_teve_feira, 3));

  INSERT INTO public.pub_confirmacoes (
    feira_id,
    ultima_confirmacao_sim,
    confirmacoes_sim_28d,
    sem_feira_hoje,
    atualizado_em
  ) VALUES (
    p_feira_id,
    v_ultima_sim,
    COALESCE(v_contagem_28d, 0),
    v_sem_feira_hoje,
    pg_catalog.now()
  )
  ON CONFLICT (feira_id) DO UPDATE SET
    ultima_confirmacao_sim = EXCLUDED.ultima_confirmacao_sim,
    confirmacoes_sim_28d = EXCLUDED.confirmacoes_sim_28d,
    sem_feira_hoje = EXCLUDED.sem_feira_hoje,
    atualizado_em = EXCLUDED.atualizado_em;
END;
$$;

CREATE OR REPLACE FUNCTION private.sincronizar_tudo_publico()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expiracao interval;
  v_feira record;
BEGIN
  SELECT c.expiracao_proposta INTO v_expiracao FROM public.config c WHERE c.id = 1;
  v_expiracao := COALESCE(v_expiracao, interval '14 days');

  -- Remove feiras que não estão mais ativas
  DELETE FROM public.pub_feiras pf
  WHERE NOT EXISTS (
    SELECT 1 FROM public.feiras f WHERE f.id = pf.id AND f.status = 'ativa'
  );

  -- Upsert das feiras ativas
  INSERT INTO public.pub_feiras (
    id, endereco, bairro, ra, dia, inicio, fim, lat, lng, coord_precisa, status, trecho_vigente_id, origem, atualizado_em
  )
  SELECT
    f.id, f.endereco, f.bairro, f.ra, f.dia, f.inicio, f.fim, f.lat, f.lng, f.coord_precisa, 'ativa', f.trecho_vigente_id, f.origem, pg_catalog.now()
  FROM public.feiras f
  WHERE f.status = 'ativa'
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
    trecho_vigente_id = EXCLUDED.trecho_vigente_id,
    origem = EXCLUDED.origem,
    atualizado_em = EXCLUDED.atualizado_em;

  -- Sincroniza pub_trechos (apenas vigente aprovada ou aberta não expirada na leitura, sem autor_hash)
  DELETE FROM public.pub_trechos;

  INSERT INTO public.pub_trechos (
    id, feira_id, pontos, origem, estado, criado_em, expira_em
  )
  SELECT
    t.id,
    t.feira_id,
    t.pontos,
    t.origem,
    t.estado,
    t.criado_em,
    CASE WHEN t.estado = 'aberta' THEN t.criado_em + v_expiracao ELSE NULL END
  FROM public.trechos t
  JOIN public.feiras f ON f.id = t.feira_id AND f.status = 'ativa'
  WHERE (t.estado = 'aprovada' AND f.trecho_vigente_id = t.id)
     OR (t.estado = 'aberta' AND t.criado_em + v_expiracao > pg_catalog.now());

  -- Atualiza agregados públicos de confirmações
  FOR v_feira IN SELECT id FROM public.pub_feiras
  LOOP
    PERFORM private.atualizar_pub_confirmacoes(v_feira.id);
  END LOOP;
END;
$$;

-- 6. Função verificar_presenca (seções 7.1 e 7.2)
--Auxiliar interna (sem EXECUTE para anon/authenticated): mede contra o último trecho aprovado/curado
--(ou ponto da feira), nunca contra proposta aberta.
CREATE OR REPLACE FUNCTION public.verificar_presenca(
  p_feira_id text,
  p_lat double precision,
  p_lng double precision,
  p_acuracia double precision,
  p_ts timestamptz DEFAULT pg_catalog.now(),
  p_usar_tolerancia boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cfg public.config%ROWTYPE;
  v_feira public.feiras%ROWTYPE;
  v_trecho_geom extensions.geography;
  v_alvo_geom extensions.geography;
  v_usuario_geom extensions.geography;
  v_ts_sp timestamp;
  v_dia_sp smallint;
  v_hora_sp time;
  v_tolerancia interval;
  v_dist_m double precision;
  v_dist_10m integer;
BEGIN
  IF p_feira_id IS NULL OR p_lat IS NULL OR p_lng IS NULL OR p_acuracia IS NULL OR p_ts IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido', 'dentro_do_raio', false);
  END IF;

  IF p_lat < -90 OR p_lat > 90 OR p_lng < -180 OR p_lng > 180 OR p_acuracia <= 0 THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido', 'dentro_do_raio', false);
  END IF;

  SELECT * INTO v_cfg FROM public.config WHERE id = 1;

  SELECT * INTO v_feira
  FROM public.feiras f
  WHERE f.id = p_feira_id AND f.status = 'ativa';

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido', 'dentro_do_raio', false);
  END IF;

  -- Feira precisa ter coord_precisa (seção 7.1 e critério 1)
  IF NOT v_feira.coord_precisa THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'sem_coord_precisa', 'dentro_do_raio', false);
  END IF;

  -- Verifica dia da semana e horário no fuso America/Sao_Paulo
  v_ts_sp := p_ts AT TIME ZONE 'America/Sao_Paulo';
  v_dia_sp := pg_catalog.date_part('dow', v_ts_sp)::smallint;
  v_hora_sp := v_ts_sp::time;
  v_tolerancia := CASE
    WHEN COALESCE(p_usar_tolerancia, false) THEN pg_catalog.make_interval(mins => COALESCE(v_cfg.janela_horario_minutos, 60))
    ELSE interval '0 minutes'
  END;

  IF v_dia_sp <> v_feira.dia
     OR v_hora_sp < (v_feira.inicio - v_tolerancia)
     OR v_hora_sp >= (v_feira.fim + v_tolerancia) THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'fora_do_horario', 'dentro_do_raio', false);
  END IF;

  -- Verifica precisão do GPS (acuracia <= 100 m em config)
  IF p_acuracia > COALESCE(v_cfg.acuracia_max_m, 100) THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'fora_do_raio', 'dentro_do_raio', false);
  END IF;

  -- Obtém geometria vigente: último trecho aprovado/curado (nunca usa proposta aberta)
  IF v_feira.trecho_vigente_id IS NOT NULL THEN
    SELECT t.geom INTO v_trecho_geom
    FROM public.trechos t
    WHERE t.id = v_feira.trecho_vigente_id
      AND t.feira_id = v_feira.id
      AND t.estado = 'aprovada';
  END IF;

  IF v_trecho_geom IS NOT NULL THEN
    v_alvo_geom := v_trecho_geom;
  ELSIF v_feira.lat IS NOT NULL AND v_feira.lng IS NOT NULL THEN
    v_alvo_geom := extensions.ST_SetSRID(extensions.ST_MakePoint(v_feira.lng, v_feira.lat), 4326)::extensions.geography;
  ELSE
    RETURN pg_catalog.jsonb_build_object('codigo', 'sem_coord_precisa', 'dentro_do_raio', false);
  END IF;

  v_usuario_geom := extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography;
  v_dist_m := extensions.ST_Distance(v_usuario_geom, v_alvo_geom);
  v_dist_10m := (pg_catalog.round(v_dist_m / 10.0) * 10)::integer;

  IF v_dist_m > COALESCE(v_cfg.raio_confirmacao_m, 150) THEN
    RETURN pg_catalog.jsonb_build_object(
      'codigo', 'fora_do_raio',
      'dentro_do_raio', false,
      'distancia_m', v_dist_10m
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'codigo', 'ok',
    'dentro_do_raio', true,
    'distancia_m', v_dist_10m
  );
END;
$$;

-- 7. RPC pública: confirmar (seção 7.1, critérios 1, 7, 10, 11)
CREATE OR REPLACE FUNCTION public.confirmar(
  feira_id text,
  resposta text,
  lat double precision,
  lng double precision,
  acuracia double precision,
  client_uuid uuid,
  client_ts timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_device_id uuid;
  v_cfg public.config%ROWTYPE;
  v_dono_uuid uuid;
  v_presenca jsonb;
  v_codigo text;
  v_dia_sp date;
  v_elegivel boolean;
BEGIN
  -- Identidade obtida exclusivamente por auth.uid() (seção 4)
  v_device_id := auth.uid();
  IF v_device_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_device_id) THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
  END IF;

  -- Aparelho bloqueado não escreve (seção 7.5)
  IF private.dispositivo_bloqueado(v_device_id) THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'bloqueado');
  END IF;

  IF confirmar.feira_id IS NULL
     OR confirmar.resposta IS NULL
     OR confirmar.resposta NOT IN ('sim', 'nao')
     OR confirmar.client_uuid IS NULL
     OR confirmar.client_ts IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
  END IF;

  -- Idempotência por client_uuid (seção 4 e critério 10)
  SELECT c.device_id INTO v_dono_uuid
  FROM private.confirmacoes c
  WHERE c.client_uuid = confirmar.client_uuid;

  IF FOUND THEN
    IF v_dono_uuid = v_device_id THEN
      RETURN pg_catalog.jsonb_build_object('codigo', 'ok');
    ELSE
      RETURN pg_catalog.jsonb_build_object('codigo', 'duplicado');
    END IF;
  END IF;

  SELECT * INTO v_cfg FROM public.config WHERE id = 1;

  -- Janela de 15 min para client_ts; fora disso a confirmação é descartada (seção 4, critérios 1 e 10)
  IF confirmar.client_ts < (pg_catalog.now() - COALESCE(v_cfg.client_ts_janela, interval '15 minutes'))
     OR confirmar.client_ts > (pg_catalog.now() + COALESCE(v_cfg.client_ts_janela, interval '15 minutes')) THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido', 'descartada', true);
  END IF;

  -- Checa presença declarada (horário, coord_precisa, acurácia e raio de 150 m)
  v_presenca := public.verificar_presenca(
    confirmar.feira_id,
    confirmar.lat,
    confirmar.lng,
    confirmar.acuracia,
    confirmar.client_ts,
    false
  );
  v_codigo := v_presenca ->> 'codigo';

  IF v_codigo <> 'ok' THEN
    RETURN pg_catalog.jsonb_build_object('codigo', v_codigo);
  END IF;

  v_dia_sp := (confirmar.client_ts AT TIME ZONE 'America/Sao_Paulo')::date;
  v_elegivel := private.aparelho_elegivel_24h(v_device_id, pg_catalog.now());

  -- Upsert: 1 resposta por aparelho por feira por dia de São Paulo (segunda substitui a primeira)
  INSERT INTO private.confirmacoes (
    feira_id,
    device_id,
    dia_sp,
    resposta,
    dentro_do_raio,
    distancia_m,
    aparelho_elegivel_24h,
    client_uuid,
    client_ts,
    criado_em,
    atualizado_em
  ) VALUES (
    confirmar.feira_id,
    v_device_id,
    v_dia_sp,
    confirmar.resposta,
    true,
    (v_presenca ->> 'distancia_m')::integer,
    v_elegivel,
    confirmar.client_uuid,
    confirmar.client_ts,
    pg_catalog.now(),
    pg_catalog.now()
  )
  ON CONFLICT (device_id, feira_id, dia_sp) DO UPDATE SET
    resposta = EXCLUDED.resposta,
    dentro_do_raio = EXCLUDED.dentro_do_raio,
    distancia_m = EXCLUDED.distancia_m,
    aparelho_elegivel_24h = EXCLUDED.aparelho_elegivel_24h,
    client_uuid = EXCLUDED.client_uuid,
    client_ts = EXCLUDED.client_ts,
    criado_em = pg_catalog.now(),
    atualizado_em = pg_catalog.now();

  -- Sincroniza tabela de leitura pública na mesma transação
  PERFORM private.atualizar_pub_confirmacoes(confirmar.feira_id);

  RETURN pg_catalog.jsonb_build_object('codigo', 'ok');
END;
$$;

-- 8. RPC pública: apagar_meus_dados (seção 8)
CREATE OR REPLACE FUNCTION public.apagar_meus_dados()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_device_id uuid;
  v_hash text;
  v_feiras_afetadas text[];
  v_feira_id text;
BEGIN
  v_device_id := auth.uid();
  IF v_device_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
  END IF;

  v_hash := private.hash_dispositivo(v_device_id);

  -- 1. Confirmações: guarda feiras afetadas e apaga confirmações do aparelho
  SELECT pg_catalog.array_agg(DISTINCT c.feira_id)
  INTO v_feiras_afetadas
  FROM private.confirmacoes c
  WHERE c.device_id = v_device_id;

  DELETE FROM private.confirmacoes c
  WHERE c.device_id = v_device_id;

  -- 2. Votos e apoios: apaga em alvo aberto; anula device_id em alvo fechado
  DELETE FROM public.votos v
  WHERE v.device_id = v_device_id
    AND (
      (v.tipo = 'trecho' AND EXISTS (
        SELECT 1 FROM public.trechos t WHERE t.id::text = v.alvo_id AND t.estado = 'aberta'
      ))
      OR
      (v.tipo = 'sugestao' AND EXISTS (
        SELECT 1 FROM public.feiras f WHERE f.id = v.alvo_id AND f.status = 'pendente'
      ))
    );

  UPDATE public.votos
  SET device_id = NULL
  WHERE device_id = v_device_id;

  -- 3. Propostas de trecho: abertas são canceladas; fechadas ficam com autor_hash nulo
  UPDATE public.trechos
  SET estado = 'cancelada',
      fechado_em = pg_catalog.now(),
      autor_hash = NULL
  WHERE autor_hash = v_hash
    AND estado = 'aberta';

  UPDATE public.trechos
  SET autor_hash = NULL
  WHERE autor_hash = v_hash;

  -- 4. Sugestões de feira: pendentes são apagadas; ativas ficam com autor_hash nulo
  DELETE FROM public.feiras
  WHERE autor_hash = v_hash
    AND status = 'pendente';

  UPDATE public.feiras
  SET autor_hash = NULL
  WHERE autor_hash = v_hash;

  -- 5. Incidentes de ofensa e bloqueio: mantidos por 90 dias apenas com o hash (device_id anulado)
  UPDATE private.dispositivos_bloqueados
  SET device_id = NULL,
      expira_em = GREATEST(expira_em, pg_catalog.now() + interval '90 days')
  WHERE device_id = v_device_id OR device_hash = v_hash;

  -- 6. Atualiza agregados públicos das feiras afetadas
  IF v_feiras_afetadas IS NOT NULL THEN
    FOREACH v_feira_id IN ARRAY v_feiras_afetadas
    LOOP
      PERFORM private.atualizar_pub_confirmacoes(v_feira_id);
    END LOOP;
  END IF;

  DELETE FROM public.pub_trechos pt
  WHERE NOT EXISTS (
    SELECT 1 FROM public.trechos t
    WHERE t.id = pt.id AND t.estado IN ('aprovada', 'aberta')
  );

  -- 7. Por fim apaga o usuário em auth.users
  DELETE FROM auth.users u
  WHERE u.id = v_device_id;

  RETURN pg_catalog.jsonb_build_object('codigo', 'ok');
END;
$$;

-- 9. Função administrativa: admin.bloquear_dispositivo (seções 4, 7.5, 7.6)
CREATE OR REPLACE FUNCTION admin.bloquear_dispositivo(
  p_device_id uuid,
  p_motivo text DEFAULT 'manual',
  p_dias integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hash text;
  v_permanente boolean;
  v_bloqueado_ate timestamptz;
BEGIN
  IF p_device_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
  END IF;

  v_hash := private.hash_dispositivo(p_device_id);
  v_permanente := (p_dias IS NULL OR p_dias <= 0);
  v_bloqueado_ate := CASE
    WHEN v_permanente THEN NULL
    ELSE pg_catalog.now() + pg_catalog.make_interval(days => p_dias)
  END;

  INSERT INTO private.dispositivos_bloqueados (
    device_hash,
    device_id,
    motivo,
    permanente,
    bloqueado_ate,
    criado_em,
    expira_em
  ) VALUES (
    v_hash,
    p_device_id,
    COALESCE(NULLIF(pg_catalog.btrim(p_motivo), ''), 'manual'),
    v_permanente,
    v_bloqueado_ate,
    pg_catalog.now(),
    pg_catalog.now() + interval '90 days'
  )
  ON CONFLICT (device_hash) DO UPDATE SET
    device_id = EXCLUDED.device_id,
    motivo = EXCLUDED.motivo,
    permanente = EXCLUDED.permanente,
    bloqueado_ate = EXCLUDED.bloqueado_ate,
    expira_em = GREATEST(private.dispositivos_bloqueados.expira_em, EXCLUDED.expira_em);

  RETURN pg_catalog.jsonb_build_object('codigo', 'ok');
END;
$$;

-- 10. RPC pública: ping() para o agendador a cada 3 dias (seção 9)
CREATE OR REPLACE FUNCTION public.ping()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total integer;
BEGIN
  SELECT pg_catalog.count(*)::integer INTO v_total FROM public.pub_feiras;
  RETURN pg_catalog.jsonb_build_object(
    'codigo', 'ok',
    'feiras_ativas', COALESCE(v_total, 0)
  );
END;
$$;

-- 11. Job interno de limpeza periódica (seções 4, 7.1, 7.2, 8)
CREATE OR REPLACE FUNCTION private.limpar_dados_expirados()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cfg public.config%ROWTYPE;
BEGIN
  SELECT * INTO v_cfg FROM public.config WHERE id = 1;

  -- Expira propostas de trecho abertas há mais de 14 dias
  UPDATE public.trechos
  SET estado = 'expirada',
      fechado_em = pg_catalog.now()
  WHERE estado = 'aberta'
    AND criado_em <= (pg_catalog.now() - COALESCE(v_cfg.expiracao_proposta, interval '14 days'));

  -- Remove confirmações com mais de 30 dias
  DELETE FROM private.confirmacoes
  WHERE criado_em < (pg_catalog.now() - pg_catalog.make_interval(days => COALESCE(v_cfg.retencao_confirmacao_dias, 30)));

  -- Remove incidentes de ofensa e bloqueios após 90 dias
  DELETE FROM private.incidentes_ofensa
  WHERE expira_em <= pg_catalog.now();

  DELETE FROM private.dispositivos_bloqueados
  WHERE expira_em <= pg_catalog.now()
    AND permanente = false;

  -- Limpa contas anônimas sem atividade há 90 dias (seção 4)
  DELETE FROM auth.users u
  WHERE COALESCE(u.last_sign_in_at, u.created_at) < (pg_catalog.now() - interval '90 days')
    AND NOT EXISTS (SELECT 1 FROM private.confirmacoes c WHERE c.device_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM public.votos v WHERE v.device_id = u.id);

  PERFORM private.sincronizar_tudo_publico();
END;
$$;

-- 12. Visões administrativas no schema admin (security_invoker = true, seção 3 e 7.5)
CREATE OR REPLACE VIEW admin.v_propostas_abertas
WITH (security_invoker = true)
AS
SELECT
  t.id,
  t.feira_id,
  f.bairro,
  f.endereco,
  t.pontos,
  t.motivo,
  t.criado_em
FROM public.trechos t
JOIN public.feiras f ON f.id = t.feira_id
WHERE t.estado = 'aberta';

CREATE OR REPLACE VIEW admin.v_trechos_aprovados_7d
WITH (security_invoker = true)
AS
SELECT
  t.id,
  t.feira_id,
  f.bairro,
  f.endereco,
  t.pontos,
  t.anterior_id,
  t.criado_em,
  t.fechado_em
FROM public.trechos t
JOIN public.feiras f ON f.id = t.feira_id
WHERE t.estado = 'aprovada'
  AND COALESCE(t.fechado_em, t.criado_em) >= (pg_catalog.now() - interval '7 days');

CREATE OR REPLACE VIEW admin.v_textos_barrados
WITH (security_invoker = true)
AS
SELECT
  i.id,
  i.device_hash,
  i.motivo,
  i.criado_em
FROM private.incidentes_ofensa i
ORDER BY i.criado_em DESC;

CREATE OR REPLACE VIEW admin.v_fila_denuncias
WITH (security_invoker = true)
AS
SELECT
  v.tipo,
  v.alvo_id,
  pg_catalog.count(*) FILTER (WHERE v.elegivel = true) AS denuncias_elegiveis,
  pg_catalog.max(v.criado_em) AS ultima_denuncia_em
FROM public.votos v
WHERE v.tipo IN ('denuncia_foto', 'denuncia_sugestao')
GROUP BY v.tipo, v.alvo_id;

-- 13. Sincroniza dados iniciais (Mearim) nas tabelas públicas
SELECT private.sincronizar_tudo_publico();

-- 14. Agenda job obrigatório e idempotente no pg_cron (limpeza de 30 dias)
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace n
    JOIN pg_catalog.pg_proc p ON p.pronamespace = n.oid
    WHERE n.nspname = 'cron' AND p.proname = 'schedule'
  ) THEN
    RAISE EXCEPTION 'pg_cron (cron.schedule) indisponível: a limpeza automática de 30 dias não pode falhar em silêncio. Ligue pg_cron em Database -> Extensions antes de rodar as migrações.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'olhafeira-limpeza-diaria'
  ) THEN
    PERFORM cron.unschedule('olhafeira-limpeza-diaria');
  END IF;

  PERFORM cron.schedule(
    'olhafeira-limpeza-diaria',
    '15 4 * * *',
    'SELECT private.limpar_dados_expirados();'
  );
END
$$;

-- 15. Fechamento estrito de privilégios em todos os objetos dos schemas do app (seção 4 e critério 16)
REVOKE ALL ON SCHEMA private, admin FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname, c.relkind
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'private', 'admin')
      AND c.relkind IN ('r', 'v', 'm', 'f', 'p', 'S')
  LOOP
    BEGIN
      IF r.relkind = 'S' THEN
        EXECUTE pg_catalog.format(
          'REVOKE ALL ON SEQUENCE %I.%I FROM PUBLIC, anon, authenticated',
          r.nspname, r.relname
        );
      ELSE
        EXECUTE pg_catalog.format(
          'REVOKE ALL ON TABLE %I.%I FROM PUBLIC, anon, authenticated',
          r.nspname, r.relname
        );
      END IF;

      IF r.relkind = 'r' THEN
        EXECUTE pg_catalog.format(
          'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
          r.nspname, r.relname
        );
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Aviso ao fechar privilegios de %I.%I: %', r.nspname, r.relname, SQLERRM;
    END;
  END LOOP;

  FOR r IN
    SELECT p.oid::pg_catalog.regprocedure AS proc_sig
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private', 'admin')
  LOOP
    BEGIN
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
        r.proc_sig
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Aviso ao fechar privilegios de funcao %s: %', r.proc_sig, SQLERRM;
    END;
  END LOOP;
END
$$;

-- Políticas RLS exclusivamente para leitura nas 3 tabelas públicas (seção 7.5)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'pub_feiras' AND policyname = 'pub_feiras_leitura_publica'
  ) THEN
    CREATE POLICY pub_feiras_leitura_publica
      ON public.pub_feiras
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'pub_trechos' AND policyname = 'pub_trechos_leitura_publica'
  ) THEN
    CREATE POLICY pub_trechos_leitura_publica
      ON public.pub_trechos
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'pub_confirmacoes' AND policyname = 'pub_confirmacoes_leitura_publica'
  ) THEN
    CREATE POLICY pub_confirmacoes_leitura_publica
      ON public.pub_confirmacoes
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END
$$;

-- Concessões explícitas mínimas (lista fechada da seção 4 e 7.5, fases 0 e 1)
GRANT SELECT ON TABLE public.pub_feiras TO anon, authenticated;
GRANT SELECT ON TABLE public.pub_trechos TO anon, authenticated;
GRANT SELECT ON TABLE public.pub_confirmacoes TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ping() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar(text, text, double precision, double precision, double precision, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apagar_meus_dados() TO authenticated;
