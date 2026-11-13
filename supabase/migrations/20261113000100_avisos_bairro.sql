-- =============================================================================
-- Olha a Feira — Migração 5: Avisos diários por bairro (notificação web)
-- Especificação: docs/backend/AVISOS_BAIRRO.md
-- Não guarda coordenadas, IP, nome ou e-mail. Guarda o hash do aparelho.
-- =============================================================================

-- 1. Inscrições push. Sem acesso direto para anon/authenticated (RLS sem políticas).
CREATE TABLE IF NOT EXISTS public.avisos_inscricoes (
  dispositivo_hash text PRIMARY KEY,
  bairro text NOT NULL,
  endpoint text NOT NULL UNIQUE CHECK (char_length(endpoint) <= 2048 AND endpoint LIKE 'https://%'),
  p256dh text NOT NULL CHECK (char_length(p256dh) <= 256),
  auth text NOT NULL CHECK (char_length(auth) <= 256),
  criado_em timestamptz NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE public.avisos_inscricoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.avisos_inscricoes FROM PUBLIC, anon, authenticated;

-- 2. Ativar aviso: valida o bairro contra feiras ativas e grava (ou troca o bairro/endpoint)
CREATE OR REPLACE FUNCTION public.registrar_aviso(
  p_device_id uuid,
  p_bairro text,
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hash text;
BEGIN
  IF p_device_id IS NULL OR p_bairro IS NULL OR p_endpoint IS NULL
     OR p_p256dh IS NULL OR p_auth IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.feiras f
    WHERE f.bairro = p_bairro AND f.status = 'ativa'
  ) THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
  END IF;

  IF p_endpoint NOT LIKE 'https://%' OR char_length(p_endpoint) > 2048
     OR char_length(p_p256dh) > 256 OR char_length(p_auth) > 256 THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
  END IF;

  v_hash := private.hash_dispositivo(p_device_id);

  INSERT INTO public.avisos_inscricoes (dispositivo_hash, bairro, endpoint, p256dh, auth)
  VALUES (v_hash, p_bairro, p_endpoint, p_p256dh, p_auth)
  ON CONFLICT (dispositivo_hash) DO UPDATE
    SET bairro = EXCLUDED.bairro,
        endpoint = EXCLUDED.endpoint,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        criado_em = pg_catalog.now();

  RETURN pg_catalog.jsonb_build_object('codigo', 'ok');
END;
$$;

-- 3. Desativar aviso: apaga a inscrição do aparelho
CREATE OR REPLACE FUNCTION public.cancelar_aviso(p_device_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_device_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('codigo', 'invalido');
  END IF;

  DELETE FROM public.avisos_inscricoes
  WHERE dispositivo_hash = private.hash_dispositivo(p_device_id);

  RETURN pg_catalog.jsonb_build_object('codigo', 'ok');
END;
$$;

-- 4. Envio diário: para cada inscrição cujo bairro tem feira ativa hoje (horário de Brasília).
--    Só o service role (Edge Function) executa.
CREATE OR REPLACE FUNCTION private.avisos_do_dia()
RETURNS TABLE (
  dispositivo_hash text,
  bairro text,
  endpoint text,
  p256dh text,
  auth text,
  feiras jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH hoje AS (
    SELECT EXTRACT(DOW FROM (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo'))::smallint AS dia
  ),
  feiras_bairro AS (
    SELECT f.bairro,
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'endereco', f.endereco,
               'inicio', pg_catalog.to_char(f.inicio, 'HH24:MI'),
               'fim', pg_catalog.to_char(f.fim, 'HH24:MI')
             ) ORDER BY f.inicio
           ) AS feiras
    FROM public.feiras f
    JOIN hoje h ON h.dia = f.dia
    WHERE f.status = 'ativa'
    GROUP BY f.bairro
  )
  SELECT i.dispositivo_hash, i.bairro, i.endpoint, i.p256dh, i.auth, fb.feiras
  FROM public.avisos_inscricoes i
  JOIN feiras_bairro fb ON fb.bairro = i.bairro;
$$;

-- 5. Privilégios: cliente só chama as duas RPCs; envio só o service role
REVOKE ALL ON FUNCTION public.registrar_aviso(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancelar_aviso(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.avisos_do_dia() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.registrar_aviso(uuid, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_aviso(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.avisos_do_dia() TO service_role;
