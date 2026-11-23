-- Fotos usam a mesma presença por trecho das confirmações, com a janela de 60 min.
-- Compara timestamps locais para que a janela também atravesse a meia-noite.
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
  v_dias_ate integer;
  v_inicio timestamp;
  v_fim timestamp;
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
  SELECT * INTO v_feira FROM public.feiras f WHERE f.id = p_feira_id AND f.status = 'ativa';
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido', 'dentro_do_raio', false);
  END IF;
  IF NOT v_feira.coord_precisa THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'sem_coord_precisa', 'dentro_do_raio', false);
  END IF;

  v_ts_sp := p_ts AT TIME ZONE 'America/Sao_Paulo';
  v_dia_sp := pg_catalog.date_part('dow', v_ts_sp)::smallint;
  v_dias_ate := (v_dia_sp - v_feira.dia + 7) % 7;
  v_inicio := (v_ts_sp::date - v_dias_ate) + v_feira.inicio;
  v_fim := v_inicio + (v_feira.fim - v_feira.inicio);
  v_tolerancia := CASE
    WHEN COALESCE(p_usar_tolerancia, false) THEN pg_catalog.make_interval(mins => COALESCE(v_cfg.janela_horario_minutos, 60))
    ELSE interval '0 minutes'
  END;
  IF NOT (
    v_ts_sp BETWEEN v_inicio - v_tolerancia AND v_fim + v_tolerancia
    OR v_ts_sp BETWEEN v_inicio + interval '7 days' - v_tolerancia AND v_fim + interval '7 days' + v_tolerancia
  ) THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'fora_do_horario', 'dentro_do_raio', false);
  END IF;

  IF p_acuracia > COALESCE(v_cfg.acuracia_max_m, 100) THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'fora_do_raio', 'dentro_do_raio', false);
  END IF;
  -- É a mesma geometria vigente aprovada que alimenta pub_trechos.
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
    RETURN pg_catalog.jsonb_build_object('codigo', 'fora_do_raio', 'dentro_do_raio', false, 'distancia_m', v_dist_10m);
  END IF;
  RETURN pg_catalog.jsonb_build_object('codigo', 'ok', 'dentro_do_raio', true, 'distancia_m', v_dist_10m);
END;
$$;

CREATE OR REPLACE FUNCTION public.pedir_upload_foto(
  feira_id text, lat double precision, lng double precision, acuracia double precision,
  client_uuid uuid, client_ts timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
DECLARE
  v_device uuid := auth.uid();
  v_cfg public.config%ROWTYPE;
  v_id uuid;
  v_caminho text;
  v_presenca jsonb;
  v_dia timestamptz := date_trunc('day', pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
BEGIN
  IF v_device IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_device)
     OR feira_id IS NULL OR client_uuid IS NULL OR client_ts IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  IF private.dispositivo_bloqueado(v_device) THEN
    RETURN pg_catalog.jsonb_build_object('codigo','bloqueado'); END IF;
  SELECT * INTO v_cfg FROM public.config WHERE id = 1 FOR UPDATE;
  IF client_ts NOT BETWEEN pg_catalog.now() - v_cfg.client_ts_janela AND pg_catalog.now() + v_cfg.client_ts_janela THEN
    RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  IF EXISTS (SELECT 1 FROM private.fotos f WHERE f.device_id = v_device AND f.client_uuid = pedir_upload_foto.client_uuid) THEN
    RETURN pg_catalog.jsonb_build_object('codigo','duplicado'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.feiras f WHERE f.id = feira_id AND f.status = 'ativa') THEN
    RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  v_presenca := public.verificar_presenca(feira_id,lat,lng,acuracia,pg_catalog.now(),true);
  IF v_presenca->>'codigo' <> 'ok' THEN
    RETURN pg_catalog.jsonb_build_object('codigo',v_presenca->>'codigo'); END IF;
  IF (SELECT count(*) FROM private.fotos f WHERE f.feira_id = pedir_upload_foto.feira_id AND f.criado_em >= v_dia) >= v_cfg.limite_fotos_feira_dia
    OR (SELECT count(*) FROM private.fotos f WHERE f.device_id = v_device AND f.criado_em >= v_dia) >= v_cfg.limite_fotos_dia
    OR (SELECT count(*) FROM private.fotos f WHERE f.device_id = v_device AND f.criado_em >= pg_catalog.now() - interval '7 days') >= v_cfg.limite_fotos_semana
    OR (SELECT count(*) FROM private.fotos f WHERE f.criado_em >= v_dia) >= v_cfg.teto_global_fotos_dia THEN
    RETURN pg_catalog.jsonb_build_object('codigo','limite'); END IF;
  v_id := pg_catalog.gen_random_uuid();
  v_caminho := v_device::text || '/' || v_id::text || '.jpg';
  INSERT INTO private.fotos(id,feira_id,device_id,caminho,caminho_mini,client_uuid)
  VALUES (v_id,feira_id,v_device,v_caminho,v_device::text || '/' || v_id::text || '_mini.jpg',client_uuid);
  RETURN pg_catalog.jsonb_build_object('codigo','ok','foto_id',v_id,'caminho',v_caminho,
    'caminho_mini',v_device::text || '/' || v_id::text || '_mini.jpg');
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_promocao_foto(p_foto_id uuid, p_device_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_f private.fotos%ROWTYPE; v_cfg public.config%ROWTYPE; v_antiga private.fotos%ROWTYPE;
BEGIN
  SELECT * INTO v_cfg FROM public.config WHERE id = 1 FOR UPDATE;
  SELECT * INTO v_f FROM private.fotos WHERE id = p_foto_id AND device_id = p_device_id FOR UPDATE;
  IF NOT FOUND OR v_f.estado <> 'fila' THEN RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_device_id) THEN
    RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  UPDATE private.fotos SET estado = 'visivel',
    caminho = id::text || '.jpg',
    caminho_mini = id::text || '_mini.jpg',
    decidido_em = pg_catalog.now()
    WHERE id = p_foto_id RETURNING * INTO v_f;
  INSERT INTO public.pub_fotos(id,feira_id,caminho,caminho_mini,criado_em)
  VALUES (v_f.id,v_f.feira_id,v_f.caminho,v_f.caminho_mini,v_f.criado_em);
  IF (SELECT count(*) FROM private.fotos WHERE feira_id = v_f.feira_id AND estado = 'visivel') > v_cfg.fotos_visiveis_por_feira THEN
    SELECT * INTO v_antiga FROM private.fotos WHERE feira_id = v_f.feira_id AND estado = 'visivel'
      ORDER BY criado_em,id LIMIT 1;
    UPDATE private.fotos SET estado = 'arquivada', decidido_em = pg_catalog.now() WHERE id = v_antiga.id;
    DELETE FROM public.pub_fotos WHERE id = v_antiga.id;
  END IF;
  RETURN pg_catalog.jsonb_build_object('codigo','ok','estado','visivel',
    'arquivada',CASE WHEN v_antiga.id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object('caminho',v_antiga.caminho,'caminho_mini',v_antiga.caminho_mini) END,
    'cache_segundos',v_cfg.foto_cache_segundos);
END;
$$;

-- Conserva os privilégios explícitos das migrações originais.
REVOKE ALL ON FUNCTION public.verificar_presenca(text,double precision,double precision,double precision,timestamptz,boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pedir_upload_foto(text,double precision,double precision,double precision,uuid,timestamptz),
  public.registrar_promocao_foto(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pedir_upload_foto(text,double precision,double precision,double precision,uuid,timestamptz)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_promocao_foto(uuid,uuid) TO service_role;
