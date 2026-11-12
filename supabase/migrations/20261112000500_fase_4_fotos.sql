-- Fase 4a: fotos. Objetos ficam fora da transação SQL; a fila de remoção permite
-- que a Edge Function conclua operações interrompidas sem guardar device_id.
-- A imagem postgres do teste traz um schema Storage reduzido; no Supabase real
-- estas colunas já existem.
ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS public boolean NOT NULL DEFAULT false;
ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS file_size_limit bigint;
ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS allowed_mime_types text[];
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('fotos_fila', 'fotos_fila', false, 307200, ARRAY['image/jpeg']),
  ('fotos', 'fotos', true, 307200, ARRAY['image/jpeg']),
  ('fotos_quarentena', 'fotos_quarentena', false, 307200, ARRAY['image/jpeg']),
  ('fotos_arquivo', 'fotos_arquivo', false, 307200, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- O caminho é uma reserva feita pelo banco. INSERT não pode escolher outro UUID.
CREATE TABLE private.fotos (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  feira_id text NOT NULL REFERENCES public.feiras(id) ON DELETE CASCADE,
  device_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  estado text NOT NULL DEFAULT 'fila' CHECK (estado IN ('fila','revisao','visivel','arquivada','quarentena')),
  caminho text NOT NULL UNIQUE,
  caminho_mini text NOT NULL UNIQUE,
  client_uuid uuid NOT NULL UNIQUE,
  criado_em timestamptz NOT NULL DEFAULT pg_catalog.now(),
  decidido_em timestamptz
);
ALTER TABLE private.fotos ENABLE ROW LEVEL SECURITY;
CREATE INDEX fotos_feira_estado_criado_idx ON private.fotos (feira_id, estado, criado_em);
CREATE INDEX fotos_device_criado_idx ON private.fotos (device_id, criado_em);

CREATE TABLE public.pub_fotos (
  id uuid PRIMARY KEY REFERENCES private.fotos(id) ON DELETE CASCADE,
  feira_id text NOT NULL REFERENCES public.feiras(id) ON DELETE CASCADE,
  caminho text NOT NULL,
  caminho_mini text NOT NULL,
  criado_em timestamptz NOT NULL
);
ALTER TABLE public.pub_fotos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pub_fotos_leitura ON public.pub_fotos FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE private.fotos_para_apagar (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  bucket text NOT NULL CHECK (bucket IN ('fotos_fila','fotos','fotos_quarentena','fotos_arquivo')),
  caminho text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (bucket, caminho)
);
ALTER TABLE private.fotos_para_apagar ENABLE ROW LEVEL SECURITY;

-- A RPC de denúncia é executável pelo papel authenticated, mas só a Edge
-- Function conhece este segredo e pode disparar a transição que exige mover
-- os objetos antes de responder ao cliente.
INSERT INTO private.segredos(chave,valor)
VALUES ('foto_edge_secret',pg_catalog.encode(pg_catalog.sha256(pg_catalog.gen_random_uuid()::text::bytea),'hex'))
ON CONFLICT (chave) DO NOTHING;

-- Storage aceita só inserção do par reservado, sob o prefixo do próprio JWT.
-- REVOKE é deliberado: SELECT exporia owner/device_id mesmo com RLS mal configurado.
CREATE OR REPLACE FUNCTION storage.foto_reservada(p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM private.fotos f WHERE f.device_id = auth.uid()
    AND f.estado = 'fila' AND p_name IN (f.caminho,f.caminho_mini));
$$;
REVOKE ALL ON FUNCTION storage.foto_reservada(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION storage.foto_reservada(text) TO authenticated;
REVOKE ALL ON TABLE storage.objects FROM anon, authenticated;
GRANT INSERT ON TABLE storage.objects TO authenticated;
DROP POLICY IF EXISTS fotos_fila_inserir ON storage.objects;
CREATE POLICY fotos_fila_inserir ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'fotos_fila'
  AND auth.uid() IS NOT NULL
  AND name ~ ('^' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_mini)?[.]jpg$')
  AND storage.foto_reservada(name)
);

REVOKE ALL ON TABLE public.pub_fotos, private.fotos, private.fotos_para_apagar FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.pub_fotos TO anon, authenticated;

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
  -- Foto exige presença durante o horário, não só na janela de tolerância.
  DECLARE v_presenca jsonb;
  BEGIN
    v_presenca := public.verificar_presenca(feira_id,lat,lng,acuracia,pg_catalog.now(),false);
    IF v_presenca->>'codigo' <> 'ok' THEN RETURN pg_catalog.jsonb_build_object('codigo',v_presenca->>'codigo'); END IF;
  END;
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

-- Todas as RPC abaixo são para service_role; o cliente não as alcança.
CREATE OR REPLACE FUNCTION public.foto_para_promover(p_foto_id uuid, p_device_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_f private.fotos%ROWTYPE;
BEGIN
  SELECT * INTO v_f FROM private.fotos WHERE id = p_foto_id AND device_id = p_device_id AND estado = 'fila';
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  RETURN pg_catalog.jsonb_build_object('codigo','ok','foto_id',v_f.id,'caminho',v_f.caminho,'caminho_mini',v_f.caminho_mini);
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_promocao_foto(p_foto_id uuid, p_device_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_f private.fotos%ROWTYPE; v_cfg public.config%ROWTYPE; v_estado text; v_antiga private.fotos%ROWTYPE;
BEGIN
  SELECT * INTO v_cfg FROM public.config WHERE id = 1 FOR UPDATE;
  SELECT * INTO v_f FROM private.fotos WHERE id = p_foto_id AND device_id = p_device_id FOR UPDATE;
  IF NOT FOUND OR v_f.estado <> 'fila' THEN RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  SELECT CASE WHEN u.created_at > pg_catalog.now() - v_cfg.idade_min_propor
    THEN 'revisao' ELSE 'visivel' END INTO v_estado FROM auth.users u WHERE u.id = p_device_id;
  IF v_estado IS NULL THEN RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  UPDATE private.fotos SET estado = v_estado,
    caminho = CASE WHEN v_estado = 'visivel' THEN id::text || '.jpg' ELSE caminho END,
    caminho_mini = CASE WHEN v_estado = 'visivel' THEN id::text || '_mini.jpg' ELSE caminho_mini END,
    decidido_em = CASE WHEN v_estado = 'visivel' THEN pg_catalog.now() ELSE NULL END
    WHERE id = p_foto_id RETURNING * INTO v_f;
  IF v_estado = 'visivel' THEN
    INSERT INTO public.pub_fotos(id,feira_id,caminho,caminho_mini,criado_em)
    VALUES (v_f.id,v_f.feira_id,v_f.caminho,v_f.caminho_mini,v_f.criado_em);
    IF (SELECT count(*) FROM private.fotos WHERE feira_id = v_f.feira_id AND estado = 'visivel') > v_cfg.fotos_visiveis_por_feira THEN
      SELECT * INTO v_antiga FROM private.fotos WHERE feira_id = v_f.feira_id AND estado = 'visivel'
        ORDER BY criado_em,id LIMIT 1;
      UPDATE private.fotos SET estado = 'arquivada', decidido_em = pg_catalog.now() WHERE id = v_antiga.id;
      DELETE FROM public.pub_fotos WHERE id = v_antiga.id;
    END IF;
  END IF;
  RETURN pg_catalog.jsonb_build_object('codigo','ok','estado',v_estado,
    'arquivada',CASE WHEN v_antiga.id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object('caminho',v_antiga.caminho,'caminho_mini',v_antiga.caminho_mini) END,
    'cache_segundos',v_cfg.foto_cache_segundos);
END;
$$;

CREATE OR REPLACE FUNCTION public.denunciar_foto(foto_id uuid, client_uuid uuid, client_ts timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
DECLARE v_device uuid := auth.uid(); v_cfg public.config%ROWTYPE; v_f private.fotos%ROWTYPE; v_n integer;
BEGIN
  IF v_device IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_device)
    OR foto_id IS NULL OR client_uuid IS NULL OR client_ts IS NULL THEN RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  IF COALESCE(NULLIF(pg_catalog.current_setting('request.headers',true),'')::jsonb->>'x-foto-edge-secret','')
    <> (SELECT valor FROM private.segredos WHERE chave = 'foto_edge_secret') THEN
    RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  IF private.dispositivo_bloqueado(v_device) THEN RETURN pg_catalog.jsonb_build_object('codigo','bloqueado'); END IF;
  SELECT * INTO v_cfg FROM public.config WHERE id = 1;
  IF client_ts NOT BETWEEN pg_catalog.now() - v_cfg.client_ts_janela AND pg_catalog.now() + v_cfg.client_ts_janela THEN
    RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  SELECT * INTO v_f FROM private.fotos f WHERE f.id = foto_id FOR UPDATE;
  IF NOT FOUND OR v_f.estado <> 'visivel' THEN RETURN pg_catalog.jsonb_build_object('codigo','encerrada'); END IF;
  IF NOT private.aparelho_elegivel_24h(v_device,pg_catalog.now()) THEN RETURN pg_catalog.jsonb_build_object('codigo','aparelho_novo'); END IF;
  IF EXISTS (SELECT 1 FROM public.votos v WHERE v.tipo = 'denuncia_foto' AND v.alvo_id = foto_id::text AND v.device_id = v_device) THEN
    RETURN pg_catalog.jsonb_build_object('codigo','ok','ocultada',false); END IF;
  IF EXISTS (SELECT 1 FROM public.votos v WHERE v.client_uuid = denunciar_foto.client_uuid) THEN RETURN pg_catalog.jsonb_build_object('codigo','duplicado'); END IF;
  IF (SELECT count(*) FROM public.votos v WHERE v.tipo = 'denuncia_foto' AND v.device_id = v_device AND v.criado_em >= pg_catalog.now() - interval '24 hours') >= v_cfg.limite_denuncias_dia THEN
    RETURN pg_catalog.jsonb_build_object('codigo','limite'); END IF;
  INSERT INTO public.votos(tipo,alvo_id,device_id,voto,elegivel,presente,client_uuid,client_ts)
  VALUES ('denuncia_foto',foto_id::text,v_device,'denuncia',true,false,client_uuid,client_ts);
  SELECT count(*) INTO v_n FROM public.votos v WHERE v.tipo = 'denuncia_foto' AND v.alvo_id = foto_id::text AND v.elegivel AND v.device_id IS NOT NULL;
  IF v_n >= COALESCE((v_cfg.limiares_voto #>> '{denuncia,ocultar}')::integer,3) THEN
    UPDATE private.fotos SET estado = 'quarentena', decidido_em = pg_catalog.now() WHERE id = foto_id;
    DELETE FROM public.pub_fotos WHERE id = foto_id;
    RETURN pg_catalog.jsonb_build_object('codigo','ok','ocultada',true);
  END IF;
  RETURN pg_catalog.jsonb_build_object('codigo','ok','ocultada',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.foto_para_mover(p_foto_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_f private.fotos%ROWTYPE;
BEGIN
  SELECT * INTO v_f FROM private.fotos WHERE id = p_foto_id;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  RETURN pg_catalog.jsonb_build_object('codigo','ok','estado',v_f.estado,'caminho',v_f.caminho,'caminho_mini',v_f.caminho_mini,
    'cache_segundos',(SELECT foto_cache_segundos FROM public.config WHERE id = 1));
END;
$$;

CREATE OR REPLACE FUNCTION public.foto_do_dono(p_foto_id uuid, p_device_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_f private.fotos%ROWTYPE;
BEGIN
  SELECT * INTO v_f FROM private.fotos WHERE id = p_foto_id AND device_id = p_device_id;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  RETURN pg_catalog.jsonb_build_object('codigo','ok','estado',v_f.estado,'caminho',v_f.caminho,'caminho_mini',v_f.caminho_mini);
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_ocultacao_foto(p_foto_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE private.fotos SET estado = 'quarentena', decidido_em = pg_catalog.now() WHERE id = p_foto_id AND estado = 'visivel';
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  DELETE FROM public.pub_fotos WHERE id = p_foto_id;
  RETURN pg_catalog.jsonb_build_object('codigo','ok');
END;
$$;

CREATE OR REPLACE FUNCTION admin.ocultar_foto(foto_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.registrar_ocultacao_foto(foto_id);
$$;

CREATE OR REPLACE FUNCTION public.registrar_restauracao_foto(p_foto_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_f private.fotos%ROWTYPE; v_antiga private.fotos%ROWTYPE; v_cfg public.config%ROWTYPE;
BEGIN
  SELECT * INTO v_cfg FROM public.config WHERE id = 1 FOR UPDATE;
  SELECT * INTO v_f FROM private.fotos WHERE id = p_foto_id AND estado = 'quarentena' FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  UPDATE private.fotos SET estado = 'visivel', decidido_em = pg_catalog.now() WHERE id = p_foto_id;
  INSERT INTO public.pub_fotos(id,feira_id,caminho,caminho_mini,criado_em)
  VALUES (v_f.id,v_f.feira_id,v_f.caminho,v_f.caminho_mini,v_f.criado_em);
  IF (SELECT count(*) FROM private.fotos WHERE feira_id = v_f.feira_id AND estado = 'visivel') > v_cfg.fotos_visiveis_por_feira THEN
    SELECT * INTO v_antiga FROM private.fotos WHERE feira_id = v_f.feira_id AND estado = 'visivel' AND id <> p_foto_id
      ORDER BY criado_em,id LIMIT 1;
    UPDATE private.fotos SET estado = 'arquivada', decidido_em = pg_catalog.now() WHERE id = v_antiga.id;
    DELETE FROM public.pub_fotos WHERE id = v_antiga.id;
  END IF;
  RETURN pg_catalog.jsonb_build_object('codigo','ok','arquivada',CASE WHEN v_antiga.id IS NULL THEN NULL
    ELSE pg_catalog.jsonb_build_object('caminho',v_antiga.caminho,'caminho_mini',v_antiga.caminho_mini) END);
END;
$$;

CREATE OR REPLACE FUNCTION admin.restaurar_foto(foto_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.registrar_restauracao_foto(foto_id);
$$;

CREATE OR REPLACE FUNCTION public.registrar_remocao_foto(p_foto_id uuid, p_device_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_f private.fotos%ROWTYPE; v_bucket text;
BEGIN
  SELECT * INTO v_f FROM private.fotos WHERE id = p_foto_id FOR UPDATE;
  IF NOT FOUND OR (p_device_id IS NOT NULL AND v_f.device_id IS DISTINCT FROM p_device_id) THEN
    RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  v_bucket := CASE v_f.estado WHEN 'fila' THEN 'fotos_fila' WHEN 'quarentena' THEN 'fotos_quarentena' WHEN 'arquivada' THEN 'fotos_arquivo' WHEN 'revisao' THEN 'fotos_arquivo' ELSE 'fotos' END;
  INSERT INTO private.fotos_para_apagar(bucket,caminho) VALUES (v_bucket,v_f.caminho),(v_bucket,v_f.caminho_mini) ON CONFLICT DO NOTHING;
  DELETE FROM public.votos WHERE tipo = 'denuncia_foto' AND alvo_id = p_foto_id::text;
  DELETE FROM public.pub_fotos WHERE id = p_foto_id;
  DELETE FROM private.fotos WHERE id = p_foto_id;
  RETURN pg_catalog.jsonb_build_object('codigo','ok');
END;
$$;

CREATE OR REPLACE FUNCTION public.fotos_pendentes_limpeza()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'bucket',bucket,'caminho',caminho)), '[]'::jsonb)
  FROM (SELECT id,bucket,caminho FROM private.fotos_para_apagar ORDER BY criado_em LIMIT 100) q;
$$;
CREATE OR REPLACE FUNCTION public.confirmar_arquivo_apagado(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM private.fotos_para_apagar WHERE id = p_id;
  RETURN pg_catalog.jsonb_build_object('codigo','ok');
END;
$$;

CREATE OR REPLACE FUNCTION private.marcar_fotos_expiradas()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  FOR v_id IN SELECT id FROM private.fotos WHERE
    (estado = 'arquivada' AND decidido_em <= pg_catalog.now() - interval '30 days')
    OR (estado = 'revisao' AND criado_em <= pg_catalog.now() - interval '30 days') LOOP
    PERFORM public.registrar_remocao_foto(v_id,NULL);
  END LOOP;
END;
$$;

-- Mantém o job anterior e acrescenta a marcação na mesma rotina diária.
CREATE OR REPLACE FUNCTION private.limpar_dados_expirados()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_cfg public.config%ROWTYPE;
BEGIN
  SELECT * INTO v_cfg FROM public.config WHERE id = 1;
  PERFORM private.marcar_fotos_expiradas();
  UPDATE public.trechos SET estado = 'expirada', fechado_em = pg_catalog.now()
    WHERE estado = 'aberta' AND criado_em <= pg_catalog.now() - v_cfg.expiracao_proposta;
  DELETE FROM public.pub_sugestoes WHERE id IN (SELECT id FROM public.feiras WHERE status = 'pendente' AND origem = 'comunidade' AND criado_em <= pg_catalog.now() - v_cfg.expiracao_sugestao);
  DELETE FROM public.votos WHERE tipo IN ('sugestao','denuncia_sugestao') AND alvo_id IN (SELECT id FROM public.feiras WHERE status = 'pendente' AND origem = 'comunidade' AND criado_em <= pg_catalog.now() - v_cfg.expiracao_sugestao);
  DELETE FROM public.feiras WHERE status = 'pendente' AND origem = 'comunidade' AND criado_em <= pg_catalog.now() - v_cfg.expiracao_sugestao;
  DELETE FROM private.confirmacoes WHERE criado_em < pg_catalog.now() - pg_catalog.make_interval(days => v_cfg.retencao_confirmacao_dias);
  DELETE FROM private.incidentes_ofensa WHERE expira_em <= pg_catalog.now();
  DELETE FROM private.dispositivos_bloqueados WHERE expira_em <= pg_catalog.now();
  DELETE FROM auth.users u WHERE COALESCE(u.last_sign_in_at,u.created_at) < pg_catalog.now() - interval '90 days'
    AND NOT EXISTS (SELECT 1 FROM private.confirmacoes c WHERE c.device_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM public.votos v WHERE v.device_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM private.fotos f WHERE f.device_id = u.id);
  PERFORM private.sincronizar_tudo_publico();
END;
$$;

CREATE OR REPLACE FUNCTION public.apagar_meus_dados()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_device uuid := auth.uid(); v_hash text; v_feiras_afetadas text[]; v_feiras_trechos text[]; v_feira_id text; v_foto_id uuid;
BEGIN
  IF v_device IS NULL THEN RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  FOR v_foto_id IN SELECT id FROM private.fotos WHERE device_id = v_device LOOP
    PERFORM public.registrar_remocao_foto(v_foto_id,v_device);
  END LOOP;
  v_hash := private.hash_dispositivo(v_device);
  SELECT pg_catalog.array_agg(DISTINCT feira_id) INTO v_feiras_afetadas FROM private.confirmacoes WHERE device_id = v_device;
  DELETE FROM private.confirmacoes WHERE device_id = v_device;
  DELETE FROM public.votos v WHERE v.device_id = v_device AND (
    (v.tipo = 'trecho' AND EXISTS (SELECT 1 FROM public.trechos t WHERE t.id::text = v.alvo_id AND t.estado = 'aberta'))
    OR (v.tipo IN ('sugestao','denuncia_sugestao') AND EXISTS (SELECT 1 FROM public.feiras f WHERE f.id = v.alvo_id AND f.status = 'pendente')));
  UPDATE public.votos SET device_id = NULL WHERE device_id = v_device;
  SELECT pg_catalog.array_agg(DISTINCT feira_id) INTO v_feiras_trechos FROM public.trechos WHERE autor_hash = v_hash;
  UPDATE public.trechos SET estado = 'cancelada', fechado_em = pg_catalog.now(), autor_hash = NULL, client_uuid = NULL WHERE autor_hash = v_hash AND estado = 'aberta';
  UPDATE public.trechos SET autor_hash = NULL, client_uuid = NULL WHERE autor_hash = v_hash;
  DELETE FROM public.pub_sugestoes WHERE id IN (SELECT id FROM public.feiras WHERE autor_hash = v_hash AND status = 'pendente');
  DELETE FROM public.votos WHERE tipo IN ('sugestao','denuncia_sugestao') AND alvo_id IN (SELECT id FROM public.feiras WHERE autor_hash = v_hash AND status = 'pendente');
  DELETE FROM public.feiras WHERE autor_hash = v_hash AND status = 'pendente';
  UPDATE public.feiras SET autor_hash = NULL, client_uuid = NULL WHERE autor_hash = v_hash;
  UPDATE private.incidentes_ofensa SET expira_em = pg_catalog.now() + interval '90 days' WHERE device_hash = v_hash;
  UPDATE private.dispositivos_bloqueados SET device_id = NULL, expira_em = pg_catalog.now() + interval '90 days' WHERE device_id = v_device OR device_hash = v_hash;
  IF v_feiras_afetadas IS NOT NULL THEN FOREACH v_feira_id IN ARRAY v_feiras_afetadas LOOP PERFORM private.atualizar_pub_confirmacoes(v_feira_id); END LOOP; END IF;
  IF v_feiras_trechos IS NOT NULL THEN FOREACH v_feira_id IN ARRAY v_feiras_trechos LOOP PERFORM private.sincronizar_feira_publica(v_feira_id); END LOOP; END IF;
  DELETE FROM public.pub_trechos pt WHERE NOT EXISTS (SELECT 1 FROM public.trechos t WHERE t.id = pt.id AND t.estado IN ('aprovada','aberta'));
  DELETE FROM auth.users WHERE id = v_device;
  RETURN pg_catalog.jsonb_build_object('codigo','ok');
END;
$$;

REVOKE ALL ON FUNCTION public.pedir_upload_foto(text,double precision,double precision,double precision,uuid,timestamptz), public.denunciar_foto(uuid,uuid,timestamptz), public.foto_para_promover(uuid,uuid), public.registrar_promocao_foto(uuid,uuid), public.foto_para_mover(uuid), public.foto_do_dono(uuid,uuid), public.registrar_ocultacao_foto(uuid), public.registrar_restauracao_foto(uuid), public.registrar_remocao_foto(uuid,uuid), public.fotos_pendentes_limpeza(), public.confirmar_arquivo_apagado(uuid), admin.ocultar_foto(uuid), admin.restaurar_foto(uuid), private.marcar_fotos_expiradas(), private.limpar_dados_expirados(), public.apagar_meus_dados() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pedir_upload_foto(text,double precision,double precision,double precision,uuid,timestamptz), public.denunciar_foto(uuid,uuid,timestamptz), public.apagar_meus_dados() TO authenticated;
GRANT EXECUTE ON FUNCTION public.foto_para_promover(uuid,uuid), public.registrar_promocao_foto(uuid,uuid), public.foto_para_mover(uuid), public.foto_do_dono(uuid,uuid), public.registrar_ocultacao_foto(uuid), public.registrar_restauracao_foto(uuid), public.registrar_remocao_foto(uuid,uuid), public.fotos_pendentes_limpeza(), public.confirmar_arquivo_apagado(uuid) TO service_role;
