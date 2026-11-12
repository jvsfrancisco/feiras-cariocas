-- =============================================================================
-- Olha a Feira — Migração 3: Fase 2 (Trecho colaborativo, votação e reversão)
-- Fonte da verdade: docs/backend/REQUISITOS.md (v4), seções 4, 6, 7.2, 7.5, 8, 10, 11
-- =============================================================================

-- 1. Confere que o SRID 31983 (SIRGAS 2000 / UTM zone 23S) existe no PostGIS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM extensions.spatial_ref_sys WHERE srid = 31983
  ) THEN
    RAISE EXCEPTION 'SRID 31983 (SIRGAS 2000 / UTM 23S) não encontrado em extensions.spatial_ref_sys.';
  END IF;
END
$$;

-- 2. Corrige wrap-around de meia-noite em public.verificar_presenca ao aplicar janela de tolerância (±1 h)
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
  v_seg_hora double precision;
  v_seg_ini double precision;
  v_seg_fim double precision;
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

  IF NOT v_feira.coord_precisa THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'sem_coord_precisa', 'dentro_do_raio', false);
  END IF;

  v_ts_sp := p_ts AT TIME ZONE 'America/Sao_Paulo';
  v_dia_sp := pg_catalog.date_part('dow', v_ts_sp)::smallint;
  v_hora_sp := v_ts_sp::time;
  v_tolerancia := CASE
    WHEN COALESCE(p_usar_tolerancia, false) THEN pg_catalog.make_interval(mins => COALESCE(v_cfg.janela_horario_minutos, 60))
    ELSE interval '0 minutes'
  END;

  v_seg_hora := pg_catalog.date_part('epoch', v_hora_sp);
  v_seg_ini := GREATEST(0, pg_catalog.date_part('epoch', v_feira.inicio) - pg_catalog.date_part('epoch', v_tolerancia));
  v_seg_fim := LEAST(86400, pg_catalog.date_part('epoch', v_feira.fim) + pg_catalog.date_part('epoch', v_tolerancia));

  IF v_dia_sp <> v_feira.dia
     OR v_seg_hora < v_seg_ini
     OR v_seg_hora >= v_seg_fim THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'fora_do_horario', 'dentro_do_raio', false);
  END IF;

  IF p_acuracia > COALESCE(v_cfg.acuracia_max_m, 100) THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'fora_do_raio', 'dentro_do_raio', false);
  END IF;

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

-- 2b. Coluna opcional client_uuid em public.trechos para idempotência de propor_trecho
ALTER TABLE public.trechos
  ADD COLUMN IF NOT EXISTS client_uuid uuid UNIQUE;

-- 3. Auxiliar interna: sincroniza pub_feiras e pub_trechos para uma feira na mesma transação
CREATE OR REPLACE FUNCTION private.sincronizar_feira_publica(p_feira_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expiracao interval;
BEGIN
  IF p_feira_id IS NULL THEN
    PERFORM private.sincronizar_tudo_publico();
    RETURN;
  END IF;

  SELECT c.expiracao_proposta INTO v_expiracao FROM public.config c WHERE c.id = 1;
  v_expiracao := COALESCE(v_expiracao, interval '14 days');

  IF NOT EXISTS (
    SELECT 1 FROM public.feiras f WHERE f.id = p_feira_id AND f.status = 'ativa'
  ) THEN
    DELETE FROM public.pub_feiras pf WHERE pf.id = p_feira_id;
    RETURN;
  END IF;

  INSERT INTO public.pub_feiras (
    id, endereco, bairro, ra, dia, inicio, fim, lat, lng, coord_precisa, status, trecho_vigente_id, origem, atualizado_em
  )
  SELECT
    f.id, f.endereco, f.bairro, f.ra, f.dia, f.inicio, f.fim, f.lat, f.lng, f.coord_precisa, 'ativa', f.trecho_vigente_id, f.origem, pg_catalog.now()
  FROM public.feiras f
  WHERE f.id = p_feira_id AND f.status = 'ativa'
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

  DELETE FROM public.pub_trechos pt WHERE pt.feira_id = p_feira_id;

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
  WHERE t.feira_id = p_feira_id
    AND (
      (t.estado = 'aprovada' AND f.trecho_vigente_id = t.id)
      OR (t.estado = 'aberta' AND t.criado_em + v_expiracao > pg_catalog.now())
    );
END;
$$;

-- 4. RPC pública: propor_trecho (seções 6 e 7.2, critérios 2, 3, 6)
CREATE OR REPLACE FUNCTION public.propor_trecho(
  feira_id text,
  pontos jsonb,
  motivo text,
  client_uuid uuid,
  client_ts timestamptz,
  lat double precision,
  lng double precision,
  acuracia double precision
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_device_id uuid;
  v_user_created_at timestamptz;
  v_autor_hash text;
  v_cfg public.config%ROWTYPE;
  v_existente_id uuid;
  v_existente_hash text;
  v_feira public.feiras%ROWTYPE;
  v_presenca jsonb;
  v_codigo_presenca text;
  v_propostas_semana integer;
  v_num_pontos integer;
  v_elem jsonb;
  v_pt_lat double precision;
  v_pt_lng double precision;
  v_ant_lat double precision;
  v_ant_lng double precision;
  v_tem_ant boolean := false;
  v_pontos_norm jsonb := '[]'::jsonb;
  v_ponto_prefeitura extensions.geography;
  v_pt_geog extensions.geography;
  v_geom extensions.geography;
  v_geom_utm extensions.geometry;
  v_comprimento_m double precision;
  v_vigente_geom extensions.geography;
  v_hausdorff_m double precision;
  v_novo_id uuid;
BEGIN
  -- Identidade exclusivamente via auth.uid() (seção 4)
  v_device_id := auth.uid();
  IF v_device_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
  END IF;

  SELECT u.created_at INTO v_user_created_at
  FROM auth.users u
  WHERE u.id = v_device_id;

  IF NOT FOUND OR v_user_created_at IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
  END IF;

  -- Aparelho bloqueado não escreve (seção 7.5)
  IF private.dispositivo_bloqueado(v_device_id) THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'bloqueado');
  END IF;

  -- Parâmetros obrigatórios e lista fechada de motivos (seções 7.2 e 7.6)
  IF propor_trecho.feira_id IS NULL
     OR propor_trecho.pontos IS NULL
     OR propor_trecho.motivo IS NULL
     OR propor_trecho.motivo NOT IN ('rua_errada', 'trecho_maior', 'trecho_menor', 'mudou_de_lugar', 'outro')
     OR propor_trecho.client_uuid IS NULL
     OR propor_trecho.client_ts IS NULL
     OR propor_trecho.lat IS NULL
     OR propor_trecho.lng IS NULL
     OR propor_trecho.acuracia IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
  END IF;

  SELECT * INTO v_cfg FROM public.config WHERE id = 1;

  -- Janela de até 15 min para client_ts (seção 4)
  IF propor_trecho.client_ts < (pg_catalog.now() - COALESCE(v_cfg.client_ts_janela, interval '15 minutes'))
     OR propor_trecho.client_ts > (pg_catalog.now() + COALESCE(v_cfg.client_ts_janela, interval '15 minutes')) THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
  END IF;

  v_autor_hash := private.hash_dispositivo(v_device_id);

  -- Idempotência por client_uuid
  SELECT t.id, t.autor_hash INTO v_existente_id, v_existente_hash
  FROM public.trechos t
  WHERE t.client_uuid = propor_trecho.client_uuid;

  IF FOUND THEN
    IF v_existente_hash = v_autor_hash THEN
      RETURN pg_catalog.jsonb_build_object('codigo', 'ok', 'proposta_id', v_existente_id);
    ELSE
      RETURN pg_catalog.jsonb_build_object('codigo', 'duplicado');
    END IF;
  END IF;

  -- Trava a feira ativa para serializar propostas concorrentes na mesma feira
  SELECT * INTO v_feira
  FROM public.feiras f
  WHERE f.id = propor_trecho.feira_id
    AND f.status = 'ativa'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
  END IF;

  -- Aparelho precisa ter >= 7 dias (seção 7.2, critério 3)
  IF v_user_created_at > (pg_catalog.now() - COALESCE(v_cfg.idade_min_propor, interval '7 days')) THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'aparelho_novo');
  END IF;

  -- Presença declarada medida contra o trecho vigente ou o ponto (seção 7.2)
  v_presenca := public.verificar_presenca(
    propor_trecho.feira_id,
    propor_trecho.lat,
    propor_trecho.lng,
    propor_trecho.acuracia,
    propor_trecho.client_ts,
    true
  );
  v_codigo_presenca := v_presenca ->> 'codigo';

  IF v_codigo_presenca <> 'ok' THEN
    RETURN pg_catalog.jsonb_build_object('codigo', v_codigo_presenca);
  END IF;

  -- Se houver proposta aberta cujo prazo de 14 dias já venceu, marca como expirada antes de checar limites
  UPDATE public.trechos
  SET estado = 'expirada',
      fechado_em = criado_em + COALESCE(v_cfg.expiracao_proposta, interval '14 days')
  WHERE feira_id = propor_trecho.feira_id
    AND estado = 'aberta'
    AND criado_em <= (pg_catalog.now() - COALESCE(v_cfg.expiracao_proposta, interval '14 days'));

  -- Uma proposta aberta por feira (seção 7.2)
  IF EXISTS (
    SELECT 1
    FROM public.trechos t
    WHERE t.feira_id = propor_trecho.feira_id
      AND t.estado = 'aberta'
  ) THEN
    PERFORM private.sincronizar_feira_publica(propor_trecho.feira_id);
    RETURN pg_catalog.jsonb_build_object('codigo', 'limite');
  END IF;

  -- 14 dias de espera depois de proposta negada ou expirada do mesmo aparelho na mesma feira (seção 7.2, critério 3)
  IF EXISTS (
    SELECT 1
    FROM public.trechos t
    WHERE t.feira_id = propor_trecho.feira_id
      AND t.autor_hash = v_autor_hash
      AND t.estado IN ('negada', 'expirada')
      AND COALESCE(t.fechado_em, t.criado_em) > (pg_catalog.now() - COALESCE(v_cfg.espera_proposta, interval '14 days'))
  ) THEN
    PERFORM private.sincronizar_feira_publica(propor_trecho.feira_id);
    RETURN pg_catalog.jsonb_build_object('codigo', 'limite');
  END IF;

  -- No máximo 2 propostas por aparelho por semana (seção 7.2, config.limite_propostas_semana)
  SELECT pg_catalog.count(*)::integer INTO v_propostas_semana
  FROM public.trechos t
  WHERE t.autor_hash = v_autor_hash
    AND t.criado_em > (pg_catalog.now() - interval '7 days');

  IF v_propostas_semana >= COALESCE(v_cfg.limite_propostas_semana, 2) THEN
    PERFORM private.sincronizar_feira_publica(propor_trecho.feira_id);
    RETURN pg_catalog.jsonb_build_object('codigo', 'limite');
  END IF;

  -- Validação da geometria (seção 6 e critério 6)
  IF pg_catalog.jsonb_typeof(propor_trecho.pontos) <> 'array' THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
  END IF;

  v_num_pontos := pg_catalog.jsonb_array_length(propor_trecho.pontos);
  IF v_num_pontos < COALESCE(v_cfg.trecho_pontos_min, 2)
     OR v_num_pontos > COALESCE(v_cfg.trecho_pontos_max, 12) THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
  END IF;

  IF v_feira.lat IS NULL OR v_feira.lng IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'sem_coord_precisa');
  END IF;

  v_ponto_prefeitura := extensions.ST_SetSRID(
    extensions.ST_MakePoint(v_feira.lng, v_feira.lat),
    4326
  )::extensions.geography;

  FOR v_elem IN SELECT value FROM pg_catalog.jsonb_array_elements(propor_trecho.pontos)
  LOOP
    IF pg_catalog.jsonb_typeof(v_elem) <> 'array'
       OR pg_catalog.jsonb_array_length(v_elem) <> 2
       OR pg_catalog.jsonb_typeof(v_elem -> 0) <> 'number'
       OR pg_catalog.jsonb_typeof(v_elem -> 1) <> 'number' THEN
      RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
    END IF;

    v_pt_lat := pg_catalog.round(((v_elem ->> 0)::numeric), 6)::double precision;
    v_pt_lng := pg_catalog.round(((v_elem ->> 1)::numeric), 6)::double precision;

    -- Dentro da caixa do Rio
    IF v_pt_lat < -23.15 OR v_pt_lat > -22.70 OR v_pt_lng < -43.85 OR v_pt_lng > -43.05 THEN
      RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
    END IF;

    -- Sem ponto repetido seguido
    IF v_tem_ant AND v_pt_lat = v_ant_lat AND v_pt_lng = v_ant_lng THEN
      RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
    END IF;
    v_ant_lat := v_pt_lat;
    v_ant_lng := v_pt_lng;
    v_tem_ant := true;

    -- Todos os pontos a até 600 m do ponto original da Prefeitura
    v_pt_geog := extensions.ST_SetSRID(extensions.ST_MakePoint(v_pt_lng, v_pt_lat), 4326)::extensions.geography;
    IF extensions.ST_Distance(v_pt_geog, v_ponto_prefeitura) > COALESCE(v_cfg.raio_max_prefeitura_m, 600) THEN
      RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
    END IF;

    v_pontos_norm := v_pontos_norm || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_array(v_pt_lat, v_pt_lng)
    );
  END LOOP;

  v_geom := private.pontos_para_linestring(v_pontos_norm);
  IF v_geom IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
  END IF;

  -- Projeção métrica SIRGAS 2000 / UTM 23S (SRID 31983) para autointerseção e Hausdorff
  v_geom_utm := extensions.ST_Transform(v_geom::extensions.geometry, 31983);

  -- Sem autointerseção (ST_IsSimple e não fechado em anel)
  IF NOT extensions.ST_IsSimple(v_geom_utm)
     OR NOT extensions.ST_IsValid(v_geom_utm)
     OR extensions.ST_IsClosed(v_geom_utm) THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
  END IF;

  -- Comprimento total entre 30 m e 800 m
  v_comprimento_m := extensions.ST_Length(v_geom);
  IF v_comprimento_m < COALESCE(v_cfg.trecho_comprimento_min_m, 30)
     OR v_comprimento_m > COALESCE(v_cfg.trecho_comprimento_max_m, 800) THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
  END IF;

  -- Distância de Hausdorff >= 20 m do trecho vigente (senão duplicado)
  IF v_feira.trecho_vigente_id IS NOT NULL THEN
    SELECT t.geom INTO v_vigente_geom
    FROM public.trechos t
    WHERE t.id = v_feira.trecho_vigente_id
      AND t.feira_id = v_feira.id
      AND t.estado = 'aprovada';

    IF v_vigente_geom IS NOT NULL THEN
      v_hausdorff_m := extensions.ST_HausdorffDistance(
        v_geom_utm,
        extensions.ST_Transform(v_vigente_geom::extensions.geometry, 31983)
      );
      IF v_hausdorff_m < COALESCE(v_cfg.hausdorff_min_m, 20) THEN
        RETURN pg_catalog.jsonb_build_object('codigo', 'duplicado');
      END IF;
    END IF;
  END IF;

  INSERT INTO public.trechos (
    feira_id,
    pontos,
    geom,
    origem,
    estado,
    motivo,
    anterior_id,
    autor_hash,
    client_uuid,
    criado_em,
    fechado_em
  ) VALUES (
    propor_trecho.feira_id,
    v_pontos_norm,
    v_geom,
    'comunidade',
    'aberta',
    propor_trecho.motivo,
    v_feira.trecho_vigente_id,
    v_autor_hash,
    propor_trecho.client_uuid,
    pg_catalog.now(),
    NULL
  )
  RETURNING id INTO v_novo_id;

  PERFORM private.sincronizar_feira_publica(propor_trecho.feira_id);

  RETURN pg_catalog.jsonb_build_object('codigo', 'ok', 'proposta_id', v_novo_id);
END;
$$;

-- 5. RPC pública: votar_trecho (seções 4 e 7.2, critérios 2, 3, 4, 14, 16)
CREATE OR REPLACE FUNCTION public.votar_trecho(
  proposta_id uuid,
  voto text,
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
  v_autor_hash text;
  v_cfg public.config%ROWTYPE;
  v_proposta public.trechos%ROWTYPE;
  v_feira public.feiras%ROWTYPE;
  v_expiracao interval;
  v_dono_uuid uuid;
  v_alvo_uuid text;
  v_votos_hoje integer;
  v_elegivel boolean;
  v_presente boolean := false;
  v_presenca jsonb;
  v_limiar_aprovar integer;
  v_limiar_negar_pres integer;
  v_limiar_negar_rem integer;
  v_aprovo_elegiveis integer;
  v_aprovo_presentes integer;
  v_nego_elegiveis integer;
  v_nego_presentes integer;
  v_novo_estado text := 'aberta';
BEGIN
  -- Identidade exclusivamente via auth.uid() (seção 4)
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

  IF votar_trecho.proposta_id IS NULL
     OR votar_trecho.voto IS NULL
     OR votar_trecho.voto NOT IN ('aprovo', 'nego')
     OR votar_trecho.client_uuid IS NULL
     OR votar_trecho.client_ts IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
  END IF;

  -- Validação de coordenadas quando fornecidas (nulas = voto remoto)
  IF (votar_trecho.lat IS NOT NULL OR votar_trecho.lng IS NOT NULL OR votar_trecho.acuracia IS NOT NULL) THEN
    IF votar_trecho.lat IS NULL
       OR votar_trecho.lng IS NULL
       OR votar_trecho.acuracia IS NULL
       OR votar_trecho.lat < -90 OR votar_trecho.lat > 90
       OR votar_trecho.lng < -180 OR votar_trecho.lng > 180
       OR votar_trecho.acuracia <= 0 THEN
      RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
    END IF;
  END IF;

  SELECT * INTO v_cfg FROM public.config WHERE id = 1;

  -- Janela de até 15 min para client_ts (seção 4: fora disso o voto é recusado)
  IF votar_trecho.client_ts < (pg_catalog.now() - COALESCE(v_cfg.client_ts_janela, interval '15 minutes'))
     OR votar_trecho.client_ts > (pg_catalog.now() + COALESCE(v_cfg.client_ts_janela, interval '15 minutes')) THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
  END IF;

  -- SELECT ... FOR UPDATE na proposta (seção 4: voto e transição atômicos)
  SELECT * INTO v_proposta
  FROM public.trechos t
  WHERE t.id = votar_trecho.proposta_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
  END IF;

  v_expiracao := COALESCE(v_cfg.expiracao_proposta, interval '14 days');

  -- Recusa com encerrada se não estiver aberta OU se now() >= criado_em + 14 dias (independe do job)
  IF v_proposta.estado <> 'aberta' THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'encerrada');
  END IF;

  IF pg_catalog.now() >= (v_proposta.criado_em + v_expiracao) THEN
    UPDATE public.trechos
    SET estado = 'expirada',
        fechado_em = COALESCE(fechado_em, pg_catalog.now())
    WHERE id = v_proposta.id
      AND estado = 'aberta';

    PERFORM private.sincronizar_feira_publica(v_proposta.feira_id);
    RETURN pg_catalog.jsonb_build_object('codigo', 'encerrada');
  END IF;

  -- Proponente não vota na própria proposta (seção 7.2, critério 3)
  v_autor_hash := private.hash_dispositivo(v_device_id);
  IF v_proposta.autor_hash IS NOT NULL AND v_proposta.autor_hash = v_autor_hash THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
  END IF;

  -- Idempotência por client_uuid
  SELECT v.device_id, v.alvo_id INTO v_dono_uuid, v_alvo_uuid
  FROM public.votos v
  WHERE v.client_uuid = votar_trecho.client_uuid;

  IF FOUND THEN
    IF v_dono_uuid = v_device_id AND v_alvo_uuid = votar_trecho.proposta_id::text THEN
      RETURN pg_catalog.jsonb_build_object('codigo', 'ok');
    ELSE
      RETURN pg_catalog.jsonb_build_object('codigo', 'duplicado');
    END IF;
  END IF;

  -- Limite de 20 votos por aparelho por dia (seção 10: config.limite_votos_dia)
  SELECT pg_catalog.count(*)::integer INTO v_votos_hoje
  FROM public.votos v
  WHERE v.device_id = v_device_id
    AND v.criado_em >= (pg_catalog.now() - interval '24 hours')
    AND NOT (v.tipo = 'trecho' AND v.alvo_id = votar_trecho.proposta_id::text);

  IF v_votos_hoje >= COALESCE(v_cfg.limite_votos_dia, 20) THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'limite');
  END IF;

  -- Congela elegibilidade (>= 24 h) e presença declarada no instante do voto (seção 7.2, critério 14)
  v_elegivel := private.aparelho_elegivel_24h(v_device_id, pg_catalog.now());

  IF votar_trecho.lat IS NOT NULL AND votar_trecho.lng IS NOT NULL AND votar_trecho.acuracia IS NOT NULL THEN
    v_presenca := public.verificar_presenca(
      v_proposta.feira_id,
      votar_trecho.lat,
      votar_trecho.lng,
      votar_trecho.acuracia,
      votar_trecho.client_ts,
      true
    );
    v_presente := (
      (v_presenca ->> 'codigo') = 'ok'
      AND COALESCE((v_presenca ->> 'dentro_do_raio')::boolean, false) = true
    );
  ELSE
    v_presente := false;
  END IF;

  -- Grava ou substitui o voto do aparelho na proposta com os valores congelados de agora
  INSERT INTO public.votos (
    tipo,
    alvo_id,
    device_id,
    voto,
    elegivel,
    presente,
    client_uuid,
    client_ts,
    criado_em
  ) VALUES (
    'trecho',
    votar_trecho.proposta_id::text,
    v_device_id,
    votar_trecho.voto,
    v_elegivel,
    v_presente,
    votar_trecho.client_uuid,
    votar_trecho.client_ts,
    pg_catalog.now()
  )
  ON CONFLICT (tipo, alvo_id, device_id) DO UPDATE SET
    voto = EXCLUDED.voto,
    elegivel = EXCLUDED.elegivel,
    presente = EXCLUDED.presente,
    client_uuid = EXCLUDED.client_uuid,
    client_ts = EXCLUDED.client_ts,
    criado_em = pg_catalog.now();

  -- Apuração na mesma transação usando apenas os campos congelados (elegivel, presente)
  v_limiar_aprovar := COALESCE((v_cfg.limiares_voto #>> '{trecho,aprovar}')::integer, v_cfg.quorum_aprovacao, 3);
  v_limiar_negar_pres := COALESCE((v_cfg.limiares_voto #>> '{trecho,negar_presente}')::integer, v_cfg.quorum_negacao_presente, 2);
  v_limiar_negar_rem := COALESCE((v_cfg.limiares_voto #>> '{trecho,negar_remoto}')::integer, v_cfg.quorum_negacao_remoto, 3);

  SELECT
    pg_catalog.count(*) FILTER (WHERE v.voto = 'aprovo' AND v.elegivel = true)::integer,
    pg_catalog.count(*) FILTER (WHERE v.voto = 'aprovo' AND v.elegivel = true AND v.presente = true)::integer,
    pg_catalog.count(*) FILTER (WHERE v.voto = 'nego' AND v.elegivel = true)::integer,
    pg_catalog.count(*) FILTER (WHERE v.voto = 'nego' AND v.elegivel = true AND v.presente = true)::integer
  INTO
    v_aprovo_elegiveis,
    v_aprovo_presentes,
    v_nego_elegiveis,
    v_nego_presentes
  FROM public.votos v
  WHERE v.tipo = 'trecho'
    AND v.alvo_id = votar_trecho.proposta_id::text;

  IF v_aprovo_elegiveis >= v_limiar_aprovar AND v_aprovo_presentes >= 1 THEN
    SELECT * INTO v_feira
    FROM public.feiras f
    WHERE f.id = v_proposta.feira_id
    FOR UPDATE;

    IF v_feira.trecho_vigente_id IS NOT NULL AND v_feira.trecho_vigente_id <> v_proposta.id THEN
      UPDATE public.trechos
      SET estado = 'substituida',
          fechado_em = COALESCE(fechado_em, pg_catalog.now())
      WHERE id = v_feira.trecho_vigente_id
        AND estado = 'aprovada';
    END IF;

    UPDATE public.trechos
    SET estado = 'aprovada',
        anterior_id = COALESCE(anterior_id, v_feira.trecho_vigente_id),
        fechado_em = pg_catalog.now()
    WHERE id = v_proposta.id;

    UPDATE public.feiras
    SET trecho_vigente_id = v_proposta.id
    WHERE id = v_proposta.feira_id;

    v_novo_estado := 'aprovada';
    PERFORM private.sincronizar_feira_publica(v_proposta.feira_id);

  ELSIF (
    (v_nego_elegiveis >= v_limiar_negar_pres AND v_nego_presentes >= 1)
    OR (v_nego_elegiveis >= v_limiar_negar_rem)
  ) AND (v_nego_elegiveis > v_aprovo_elegiveis) THEN
    UPDATE public.trechos
    SET estado = 'negada',
        fechado_em = pg_catalog.now()
    WHERE id = v_proposta.id;

    v_novo_estado := 'negada';
    PERFORM private.sincronizar_feira_publica(v_proposta.feira_id);
  END IF;

  RETURN pg_catalog.jsonb_build_object('codigo', 'ok', 'estado', v_novo_estado);
END;
$$;

-- 6. Função administrativa: admin.reverter_trecho(feira_id, trecho_id) (seções 6 e 7.2, critério 4)
CREATE OR REPLACE FUNCTION admin.reverter_trecho(
  feira_id text,
  trecho_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_feira public.feiras%ROWTYPE;
  v_alvo public.trechos%ROWTYPE;
BEGIN
  IF reverter_trecho.feira_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
  END IF;

  SELECT * INTO v_feira
  FROM public.feiras f
  WHERE f.id = reverter_trecho.feira_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
  END IF;

  IF reverter_trecho.trecho_id IS NOT NULL THEN
    SELECT * INTO v_alvo
    FROM public.trechos t
    WHERE t.id = reverter_trecho.trecho_id
      AND t.feira_id = reverter_trecho.feira_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
    END IF;
  END IF;

  -- Cancela qualquer proposta aberta da feira
  UPDATE public.trechos
  SET estado = 'cancelada',
      fechado_em = pg_catalog.now()
  WHERE public.trechos.feira_id = reverter_trecho.feira_id
    AND estado = 'aberta'
    AND (reverter_trecho.trecho_id IS NULL OR id <> reverter_trecho.trecho_id);

  -- Marca o vigente anterior (se diferente do alvo) como substituida
  UPDATE public.trechos
  SET estado = 'substituida',
      fechado_em = COALESCE(fechado_em, pg_catalog.now())
  WHERE public.trechos.feira_id = reverter_trecho.feira_id
    AND estado = 'aprovada'
    AND (reverter_trecho.trecho_id IS NULL OR id <> reverter_trecho.trecho_id);

  IF reverter_trecho.trecho_id IS NOT NULL THEN
    UPDATE public.trechos
    SET estado = 'aprovada',
        fechado_em = COALESCE(fechado_em, pg_catalog.now())
    WHERE id = reverter_trecho.trecho_id
      AND public.trechos.feira_id = reverter_trecho.feira_id;

    UPDATE public.feiras
    SET trecho_vigente_id = reverter_trecho.trecho_id
    WHERE id = reverter_trecho.feira_id;
  ELSE
    UPDATE public.feiras
    SET trecho_vigente_id = NULL
    WHERE id = reverter_trecho.feira_id;
  END IF;

  PERFORM private.sincronizar_feira_publica(reverter_trecho.feira_id);

  RETURN pg_catalog.jsonb_build_object('codigo', 'ok');
END;
$$;

-- 7. Visão administrativa admin.v_propostas_abertas (security_invoker = true, seção 7.5)
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

-- 8. Atualiza apagar_meus_dados (seção 8: votos abertos/fechados, propostas abertas/fechadas e sincronização de pub_trechos)
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
  v_feiras_trechos text[];
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
  SELECT pg_catalog.array_agg(DISTINCT t.feira_id)
  INTO v_feiras_trechos
  FROM public.trechos t
  WHERE t.autor_hash = v_hash;

  UPDATE public.trechos
  SET estado = 'cancelada',
      fechado_em = pg_catalog.now(),
      autor_hash = NULL,
      client_uuid = NULL
  WHERE autor_hash = v_hash
    AND estado = 'aberta';

  UPDATE public.trechos
  SET autor_hash = NULL,
      client_uuid = NULL
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

  -- 6. Sincroniza tabelas públicas das feiras afetadas
  IF v_feiras_afetadas IS NOT NULL THEN
    FOREACH v_feira_id IN ARRAY v_feiras_afetadas
    LOOP
      PERFORM private.atualizar_pub_confirmacoes(v_feira_id);
    END LOOP;
  END IF;

  IF v_feiras_trechos IS NOT NULL THEN
    FOREACH v_feira_id IN ARRAY v_feiras_trechos
    LOOP
      PERFORM private.sincronizar_feira_publica(v_feira_id);
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

-- 9. Garante que limpar_dados_expirados expira propostas > 14 dias e sincroniza pub_trechos
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

-- 10. Privilégios estritos (seção 4 e critério 16)
REVOKE ALL ON SCHEMA private, admin FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE admin.v_propostas_abertas FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verificar_presenca(text, double precision, double precision, double precision, timestamptz, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sincronizar_feira_publica(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.limpar_dados_expirados() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin.reverter_trecho(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apagar_meus_dados() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.propor_trecho(text, jsonb, text, uuid, timestamptz, double precision, double precision, double precision) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.votar_trecho(uuid, text, double precision, double precision, double precision, uuid, timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apagar_meus_dados() TO authenticated;
GRANT EXECUTE ON FUNCTION public.propor_trecho(text, jsonb, text, uuid, timestamptz, double precision, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.votar_trecho(uuid, text, double precision, double precision, double precision, uuid, timestamptz) TO authenticated;
