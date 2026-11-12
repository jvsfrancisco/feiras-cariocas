-- Fase 3a: sugestões, filtro de texto e publicação sem dados do aparelho.
ALTER TABLE public.feiras ADD COLUMN nome text;
ALTER TABLE public.feiras ADD COLUMN ponto_candidato extensions.geography(Point, 4326);
ALTER TABLE public.feiras ADD COLUMN client_uuid uuid UNIQUE;
-- Mantém a contagem total enquanto o aparelho existir; na exclusão da conta,
-- o hash e a contagem expiram juntos em 90 dias.
ALTER TABLE private.dispositivos_bloqueados ADD COLUMN total_incidentes integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION private.ponto_candidato_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.ponto_candidato IS DISTINCT FROM NEW.ponto_candidato
    OR (OLD.ponto_candidato IS NOT NULL AND
      (OLD.lat IS DISTINCT FROM NEW.lat OR OLD.lng IS DISTINCT FROM NEW.lng)) THEN
    RAISE EXCEPTION 'ponto_candidato imutavel';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ponto_candidato_imutavel BEFORE UPDATE ON public.feiras
FOR EACH ROW EXECUTE FUNCTION private.ponto_candidato_imutavel();

CREATE TABLE public.pub_sugestoes (
  id text PRIMARY KEY,
  nome text NOT NULL,
  endereco text NOT NULL,
  bairro text NOT NULL,
  dia smallint NOT NULL,
  inicio time NOT NULL,
  fim time NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  criado_em timestamptz NOT NULL,
  expira_em timestamptz NOT NULL
);
ALTER TABLE public.pub_sugestoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY pub_sugestoes_leitura ON public.pub_sugestoes
FOR SELECT TO anon, authenticated USING (expira_em > pg_catalog.now());

-- Termos longos também são procurados dentro de palavras; os curtos exigem
-- palavra inteira. As grafias permitidas são comparadas após normalização.
ALTER TABLE public.config ADD COLUMN palavras_permitidas text[] NOT NULL DEFAULT ARRAY['porã','matarazzo'];
UPDATE public.config SET palavras_barradas = ARRAY[
  'porra','caralho','puta','putaria','foda','foder','merda','cacete','vadia',
  'vagabundo','arombado','cuzao','buceta','piroca','viado','bicha','macaco',
  'nazista','nazismo','racista','racismo','estupro','estuprar','pedofilo',
  'pedofilia','matar','ameaca','asasinar','asasino','terorista',
  'sexo','sexual','pornografia','penis','vagina','prostituicao','whatsap',
  'cu','fdp','vtnc','tnc','pqp','tomar no cu'
] WHERE id = 1;

CREATE OR REPLACE FUNCTION private.registrar_texto_proibido(p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_device uuid := auth.uid();
  v_hash text;
  v_cfg jsonb;
  v_24h integer;
  v_total integer;
  v_dias integer;
BEGIN
  IF v_device IS NULL THEN RETURN; END IF;
  v_hash := private.hash_dispositivo(v_device);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_hash));
  INSERT INTO private.incidentes_ofensa(device_hash, motivo)
  VALUES (v_hash, p_motivo);
  SELECT texto_proibido_bloqueio INTO v_cfg FROM public.config WHERE id = 1;
  SELECT count(*)::integer INTO v_24h FROM private.incidentes_ofensa
    WHERE device_hash = v_hash AND criado_em >= pg_catalog.now() - interval '24 hours';
  INSERT INTO private.dispositivos_bloqueados
    (device_hash,device_id,motivo,permanente,bloqueado_ate,expira_em,total_incidentes)
  VALUES (v_hash,v_device,'texto_proibido',false,NULL,'infinity'::timestamptz,1)
  ON CONFLICT (device_hash) DO UPDATE SET
    total_incidentes = private.dispositivos_bloqueados.total_incidentes + 1,
    expira_em = 'infinity'::timestamptz
  RETURNING total_incidentes INTO v_total;
  v_dias := COALESCE((v_cfg->>'dias_bloqueio_temp')::integer, 7);
  IF v_total >= COALESCE((v_cfg->>'ocorrencias_total')::integer, 10) THEN
    UPDATE private.dispositivos_bloqueados SET permanente = true, bloqueado_ate = NULL,
      motivo = 'texto_proibido' WHERE device_hash = v_hash;
  ELSIF v_24h >= COALESCE((v_cfg->>'ocorrencias_24h')::integer, 3) THEN
    UPDATE private.dispositivos_bloqueados SET
      bloqueado_ate = GREATEST(bloqueado_ate, pg_catalog.now() + pg_catalog.make_interval(days => v_dias))
      WHERE device_hash = v_hash AND NOT permanente;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.texto_proibido(p_texto text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_texto text;
  v_sem_acento text;
  v_partes text[];
  v_compacto text;
  v_i integer;
  v_j integer;
  v_motivo text;
  v_lista text[];
  v_permitidas text[];
  v_termo text;
  v_padrao text;
BEGIN
  IF p_texto IS NULL THEN RETURN false; END IF;
  SELECT normalize(p_texto, NFKC) INTO v_texto;
  v_texto := pg_catalog.regexp_replace(v_texto, '[[:cntrl:]]', '', 'g');
  v_texto := pg_catalog.translate(v_texto,
    U&'\200B\200C\200D\2060\FEFF\00AD\200E\200F\202A\202B\202C\202D\202E\2066\2067\2068\2069\FE0F', '');
  IF v_texto ~ '[A-Za-zÀ-ÖØ-öø-ÿ]' AND v_texto ~ U&'[\0370-\03FF\0400-\04FF]' THEN
    v_motivo := 'alfabeto_misto';
  END IF;
  IF v_motivo IS NULL AND pg_catalog.lower(v_texto) ~
    '(://|(^|[^[:alpha:]])www([.]|[^[:alpha:]]|$)|[[:alnum:]-]+([.][[:alnum:]-]+)*[.](com|br|net|org|io|me|info|xyz|app|site|online|link|ly|gg|tv)([^[:alpha:]]|$))' THEN
    v_motivo := 'link';
  END IF;
  IF v_motivo IS NULL AND pg_catalog.length(pg_catalog.regexp_replace(v_texto, '[^0-9]', '', 'g')) >= 8 THEN
    v_motivo := 'telefone';
  END IF;
  IF v_motivo IS NULL THEN
    v_texto := pg_catalog.translate(pg_catalog.lower(v_texto),
      U&'\0430\0435\043E\0440\0441\0443\0445\0456\03B1\03B5\03BF\03C1\03C5\03C7',
      'aeopcyxiaeopyx');
    IF pg_catalog.to_regprocedure('extensions.unaccent(text)') IS NOT NULL THEN
      EXECUTE 'SELECT extensions.unaccent($1)' INTO v_sem_acento USING v_texto;
    ELSIF pg_catalog.to_regprocedure('public.unaccent(text)') IS NOT NULL THEN
      EXECUTE 'SELECT public.unaccent($1)' INTO v_sem_acento USING v_texto;
    ELSE
      v_sem_acento := pg_catalog.translate(v_texto, 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn');
    END IF;
    v_texto := pg_catalog.translate(v_sem_acento, '01345@$', 'oieasas');
    SELECT palavras_barradas, palavras_permitidas INTO v_lista, v_permitidas
      FROM public.config WHERE id = 1;
    SELECT COALESCE(pg_catalog.array_agg(pg_catalog.translate(pg_catalog.lower(palavra),
      'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')), ARRAY[]::text[])
      INTO v_permitidas FROM pg_catalog.unnest(v_permitidas) AS palavra;
    v_partes := pg_catalog.regexp_split_to_array(v_texto, '[^a-z0-9]+');
    FOREACH v_termo IN ARRAY v_lista LOOP
      v_termo := pg_catalog.regexp_replace(v_termo, '[^a-z]', '', 'g');
      IF v_termo = '' THEN CONTINUE; END IF;
      v_padrao := pg_catalog.regexp_replace(v_termo, '([a-z])', '\1+', 'g');
      FOR v_i IN 1..COALESCE(pg_catalog.array_length(v_partes,1),0) LOOP
        IF v_partes[v_i] = '' OR v_partes[v_i] = ANY(v_permitidas) THEN CONTINUE; END IF;
        IF (pg_catalog.length(v_termo) >= 5 AND v_partes[v_i] ~ v_padrao)
          OR v_partes[v_i] ~ ('^' || v_padrao || '$') THEN
          v_motivo := 'termo';
          EXIT;
        END IF;
        v_compacto := v_partes[v_i];
        FOR v_j IN v_i + 1..LEAST(v_i + 20,pg_catalog.array_length(v_partes,1)) LOOP
          IF v_partes[v_j] = '' OR v_partes[v_j] = ANY(v_permitidas) THEN EXIT; END IF;
          v_compacto := v_compacto || v_partes[v_j];
          IF v_compacto ~ ('^' || v_padrao || '$') THEN
            v_motivo := 'termo';
            EXIT;
          END IF;
        END LOOP;
        IF v_motivo IS NOT NULL THEN EXIT; END IF;
      END LOOP;
      IF v_motivo IS NOT NULL THEN EXIT; END IF;
    END LOOP;
  END IF;
  IF v_motivo IS NOT NULL THEN
    PERFORM private.registrar_texto_proibido(v_motivo);
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

-- A visão já existe desde a fase 1 com security_invoker e apenas metadados.
REVOKE ALL ON admin.v_textos_barrados FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.sugestao_no_horario(p_dia smallint, p_inicio time, p_fim time, p_agora timestamptz)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT pg_catalog.date_part('dow', p_agora AT TIME ZONE 'America/Sao_Paulo')::smallint = p_dia
    AND pg_catalog.date_part('epoch', (p_agora AT TIME ZONE 'America/Sao_Paulo')::time)
      >= GREATEST(0, pg_catalog.date_part('epoch', p_inicio) - (SELECT janela_horario_minutos * 60 FROM public.config WHERE id = 1))
    AND pg_catalog.date_part('epoch', (p_agora AT TIME ZONE 'America/Sao_Paulo')::time)
      < LEAST(86400, pg_catalog.date_part('epoch', p_fim) + (SELECT janela_horario_minutos * 60 FROM public.config WHERE id = 1));
$$;

CREATE OR REPLACE FUNCTION public.sugerir_feira(
  nome text, endereco text, bairro text, dia smallint, inicio time, fim time,
  lat double precision, lng double precision, acuracia double precision,
  client_uuid uuid, client_ts timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
DECLARE
  v_device uuid := auth.uid();
  v_hash text;
  v_cfg public.config%ROWTYPE;
  v_id text;
  v_ponto extensions.geography;
BEGIN
  IF v_device IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_device) THEN
    RETURN pg_catalog.jsonb_build_object('codigo','invalido');
  END IF;
  IF private.dispositivo_bloqueado(v_device) THEN RETURN pg_catalog.jsonb_build_object('codigo','bloqueado'); END IF;
  IF nome IS NULL OR endereco IS NULL OR bairro IS NULL OR dia IS NULL OR dia NOT BETWEEN 0 AND 6
    OR inicio IS NULL OR fim IS NULL OR fim <= inicio OR client_uuid IS NULL OR client_ts IS NULL
    OR lat IS NULL OR lng IS NULL OR acuracia IS NULL OR acuracia <= 0
    OR lat NOT BETWEEN -23.15 AND -22.70 OR lng NOT BETWEEN -43.85 AND -43.05
    OR pg_catalog.length(pg_catalog.btrim(nome)) NOT BETWEEN 1 AND 80
    OR pg_catalog.length(pg_catalog.btrim(endereco)) NOT BETWEEN 1 AND 80
    OR pg_catalog.length(pg_catalog.btrim(bairro)) NOT BETWEEN 1 AND 80 THEN
    RETURN pg_catalog.jsonb_build_object('codigo','invalido');
  END IF;
  SELECT * INTO v_cfg FROM public.config WHERE id = 1;
  IF client_ts NOT BETWEEN pg_catalog.now() - v_cfg.client_ts_janela AND pg_catalog.now() + v_cfg.client_ts_janela THEN
    RETURN pg_catalog.jsonb_build_object('codigo','invalido');
  END IF;
  v_hash := private.hash_dispositivo(v_device);
  SELECT f.id INTO v_id FROM public.feiras f WHERE f.client_uuid = sugerir_feira.client_uuid AND f.autor_hash = v_hash;
  IF FOUND THEN RETURN pg_catalog.jsonb_build_object('codigo','ok','sugestao_id',v_id); END IF;
  IF EXISTS (SELECT 1 FROM public.feiras f WHERE f.client_uuid = sugerir_feira.client_uuid) THEN
    RETURN pg_catalog.jsonb_build_object('codigo','duplicado');
  END IF;
  IF private.texto_proibido(nome) OR private.texto_proibido(endereco) OR private.texto_proibido(bairro) THEN
    RETURN pg_catalog.jsonb_build_object('codigo','texto_proibido');
  END IF;
  IF NOT private.sugestao_no_horario(dia,inicio,fim,pg_catalog.now()) THEN
    RETURN pg_catalog.jsonb_build_object('codigo','fora_do_horario');
  END IF;
  IF acuracia > v_cfg.acuracia_max_m THEN RETURN pg_catalog.jsonb_build_object('codigo','fora_do_raio'); END IF;
  v_ponto := extensions.ST_SetSRID(extensions.ST_MakePoint(lng,lat),4326)::extensions.geography;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('sugestao:' || dia::text));
  IF EXISTS (SELECT 1 FROM public.feiras f WHERE f.dia = sugerir_feira.dia
    AND (f.status = 'ativa' OR (f.status = 'pendente' AND f.criado_em + v_cfg.expiracao_sugestao > pg_catalog.now()))
    AND f.lat IS NOT NULL AND f.lng IS NOT NULL
    AND extensions.ST_DWithin(v_ponto,
      extensions.ST_SetSRID(extensions.ST_MakePoint(f.lng,f.lat),4326)::extensions.geography,150)) THEN
    RETURN pg_catalog.jsonb_build_object('codigo','duplicado');
  END IF;
  IF (SELECT count(*) FROM public.feiras f WHERE f.autor_hash = v_hash
    AND f.origem = 'comunidade' AND f.criado_em > pg_catalog.now() - interval '7 days') >= v_cfg.limite_sugestoes_semana THEN
    RETURN pg_catalog.jsonb_build_object('codigo','limite');
  END IF;
  v_id := pg_catalog.gen_random_uuid()::text;
  INSERT INTO public.feiras(id,nome,endereco,bairro,dia,inicio,fim,lat,lng,coord_precisa,status,origem,autor_hash,ponto_candidato,client_uuid)
  VALUES (v_id,pg_catalog.btrim(nome),pg_catalog.btrim(endereco),pg_catalog.btrim(bairro),dia,inicio,fim,lat,lng,true,'pendente','comunidade',v_hash,v_ponto,client_uuid);
  RETURN pg_catalog.jsonb_build_object('codigo','ok','sugestao_id',v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.apoiar_sugestao(
  sugestao_id text, voto text, lat double precision, lng double precision,
  acuracia double precision, client_uuid uuid, client_ts timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
DECLARE
  v_device uuid := auth.uid();
  v_cfg public.config%ROWTYPE;
  v_feira public.feiras%ROWTYPE;
  v_elegivel boolean;
  v_presente boolean := false;
  v_apoios integer;
  v_presentes integer;
  v_negos integer;
  v_estado text := 'pendente';
BEGIN
  IF v_device IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_device) THEN
    RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  IF private.dispositivo_bloqueado(v_device) THEN RETURN pg_catalog.jsonb_build_object('codigo','bloqueado'); END IF;
  IF sugestao_id IS NULL OR voto IS NULL OR voto NOT IN ('apoio','nego') OR client_uuid IS NULL OR client_ts IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  IF (lat IS NOT NULL OR lng IS NOT NULL OR acuracia IS NOT NULL) AND
    (lat IS NULL OR lng IS NULL OR acuracia IS NULL OR lat NOT BETWEEN -90 AND 90
      OR lng NOT BETWEEN -180 AND 180 OR acuracia <= 0) THEN
    RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  SELECT * INTO v_cfg FROM public.config WHERE id = 1;
  IF client_ts NOT BETWEEN pg_catalog.now() - v_cfg.client_ts_janela AND pg_catalog.now() + v_cfg.client_ts_janela THEN
    RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  SELECT * INTO v_feira FROM public.feiras f WHERE f.id = sugestao_id AND f.origem = 'comunidade' FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  IF v_feira.status <> 'pendente' OR v_feira.criado_em + v_cfg.expiracao_sugestao <= pg_catalog.now() THEN
    RETURN pg_catalog.jsonb_build_object('codigo','encerrada'); END IF;
  IF v_feira.autor_hash = private.hash_dispositivo(v_device) THEN
    RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  IF EXISTS (SELECT 1 FROM public.votos v WHERE v.client_uuid = apoiar_sugestao.client_uuid
    AND (v.device_id IS DISTINCT FROM v_device OR v.tipo <> 'sugestao' OR v.alvo_id <> sugestao_id)) THEN
    RETURN pg_catalog.jsonb_build_object('codigo','duplicado'); END IF;
  IF EXISTS (SELECT 1 FROM public.votos v WHERE v.client_uuid = apoiar_sugestao.client_uuid
    AND v.device_id = v_device AND v.tipo = 'sugestao' AND v.alvo_id = sugestao_id) THEN
    RETURN pg_catalog.jsonb_build_object('codigo','ok','estado','pendente'); END IF;
  IF (SELECT count(*) FROM public.votos v WHERE v.device_id = v_device
    AND v.criado_em > pg_catalog.now() - interval '24 hours'
    AND NOT (v.tipo = 'sugestao' AND v.alvo_id = sugestao_id)) >= v_cfg.limite_votos_dia THEN
    RETURN pg_catalog.jsonb_build_object('codigo','limite'); END IF;
  v_elegivel := private.aparelho_elegivel_24h(v_device,pg_catalog.now());
  IF lat IS NOT NULL AND acuracia <= v_cfg.acuracia_max_m
    AND private.sugestao_no_horario(v_feira.dia,v_feira.inicio,v_feira.fim,pg_catalog.now()) THEN
    v_presente := extensions.ST_DWithin(v_feira.ponto_candidato,
      extensions.ST_SetSRID(extensions.ST_MakePoint(lng,lat),4326)::extensions.geography,150);
  END IF;
  INSERT INTO public.votos(tipo,alvo_id,device_id,voto,elegivel,presente,client_uuid,client_ts)
  VALUES ('sugestao',sugestao_id,v_device,voto,v_elegivel,v_presente,client_uuid,client_ts)
  ON CONFLICT (tipo,alvo_id,device_id) DO UPDATE SET voto = EXCLUDED.voto,
    elegivel = EXCLUDED.elegivel, presente = EXCLUDED.presente,
    client_uuid = EXCLUDED.client_uuid, client_ts = EXCLUDED.client_ts, criado_em = pg_catalog.now();
  SELECT count(*) FILTER (WHERE v.voto = 'apoio' AND v.elegivel)::integer,
    count(*) FILTER (WHERE v.voto = 'apoio' AND v.elegivel AND v.presente)::integer,
    count(*) FILTER (WHERE v.voto = 'nego' AND v.elegivel)::integer
  INTO v_apoios,v_presentes,v_negos FROM public.votos v
  WHERE v.tipo = 'sugestao' AND v.alvo_id = sugestao_id;
  IF v_apoios >= COALESCE((v_cfg.limiares_voto #>> '{sugestao,ativar}')::integer,3)
    AND v_presentes >= COALESCE((v_cfg.limiares_voto #>> '{sugestao,publicar_presente}')::integer,1) THEN
    UPDATE public.feiras SET status = 'ativa' WHERE id = sugestao_id;
    DELETE FROM public.pub_sugestoes WHERE id = sugestao_id;
    PERFORM private.sincronizar_feira_publica(sugestao_id);
    v_estado := 'ativa';
  ELSIF v_negos >= COALESCE((v_cfg.limiares_voto #>> '{sugestao,negar}')::integer,3) AND v_negos > v_apoios THEN
    UPDATE public.feiras SET status = 'negada' WHERE id = sugestao_id;
    DELETE FROM public.pub_sugestoes WHERE id = sugestao_id;
    v_estado := 'negada';
  ELSIF v_presentes >= COALESCE((v_cfg.limiares_voto #>> '{sugestao,publicar_presente}')::integer,1) THEN
    INSERT INTO public.pub_sugestoes(id,nome,endereco,bairro,dia,inicio,fim,lat,lng,criado_em,expira_em)
    VALUES (v_feira.id,v_feira.nome,v_feira.endereco,v_feira.bairro,v_feira.dia,v_feira.inicio,v_feira.fim,
      v_feira.lat,v_feira.lng,v_feira.criado_em,v_feira.criado_em + v_cfg.expiracao_sugestao)
      ON CONFLICT (id) DO NOTHING;
  ELSE
    DELETE FROM public.pub_sugestoes WHERE id = sugestao_id;
  END IF;
  RETURN pg_catalog.jsonb_build_object('codigo','ok','estado',v_estado);
END;
$$;

CREATE OR REPLACE FUNCTION public.denunciar_sugestao(sugestao_id text, client_uuid uuid, client_ts timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
DECLARE
  v_device uuid := auth.uid();
  v_cfg public.config%ROWTYPE;
  v_feira public.feiras%ROWTYPE;
BEGIN
  IF v_device IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_device) THEN
    RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  IF private.dispositivo_bloqueado(v_device) THEN RETURN pg_catalog.jsonb_build_object('codigo','bloqueado'); END IF;
  IF sugestao_id IS NULL OR client_uuid IS NULL OR client_ts IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  SELECT * INTO v_cfg FROM public.config WHERE id = 1;
  IF client_ts NOT BETWEEN pg_catalog.now() - v_cfg.client_ts_janela AND pg_catalog.now() + v_cfg.client_ts_janela THEN
    RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  SELECT * INTO v_feira FROM public.feiras f WHERE f.id = sugestao_id AND f.origem = 'comunidade' FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  IF v_feira.status NOT IN ('pendente','ativa')
    OR (v_feira.status = 'pendente' AND v_feira.criado_em + v_cfg.expiracao_sugestao <= pg_catalog.now()) THEN
    RETURN pg_catalog.jsonb_build_object('codigo','encerrada'); END IF;
  IF v_feira.autor_hash = private.hash_dispositivo(v_device) THEN
    RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  IF NOT private.aparelho_elegivel_24h(v_device,pg_catalog.now()) THEN
    RETURN pg_catalog.jsonb_build_object('codigo','aparelho_novo'); END IF;
  IF EXISTS (SELECT 1 FROM public.votos v WHERE v.tipo = 'denuncia_sugestao'
    AND v.alvo_id = sugestao_id AND v.device_id = v_device) THEN
    RETURN pg_catalog.jsonb_build_object('codigo','ok'); END IF;
  IF EXISTS (SELECT 1 FROM public.votos v WHERE v.client_uuid = denunciar_sugestao.client_uuid) THEN
    RETURN pg_catalog.jsonb_build_object('codigo','duplicado'); END IF;
  IF (SELECT count(*) FROM public.votos v WHERE v.tipo = 'denuncia_sugestao'
    AND v.device_id = v_device AND v.criado_em > pg_catalog.now() - interval '24 hours') >= v_cfg.limite_denuncias_dia THEN
    RETURN pg_catalog.jsonb_build_object('codigo','limite'); END IF;
  INSERT INTO public.votos(tipo,alvo_id,device_id,voto,elegivel,presente,client_uuid,client_ts)
  VALUES ('denuncia_sugestao',sugestao_id,v_device,'denuncia',true,false,client_uuid,client_ts);
  IF (SELECT count(*) FROM public.votos v WHERE v.tipo = 'denuncia_sugestao'
    AND v.alvo_id = sugestao_id AND v.elegivel) >= COALESCE((v_cfg.limiares_voto #>> '{denuncia,ocultar}')::integer,3) THEN
    UPDATE public.feiras SET status = 'oculta' WHERE id = sugestao_id;
    DELETE FROM public.pub_sugestoes WHERE id = sugestao_id;
    PERFORM private.sincronizar_feira_publica(sugestao_id);
  END IF;
  RETURN pg_catalog.jsonb_build_object('codigo','ok');
END;
$$;

CREATE OR REPLACE FUNCTION public.minhas_sugestoes()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_device uuid := auth.uid();
BEGIN
  IF v_device IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',f.id,'nome',f.nome,'endereco',f.endereco,'bairro',f.bairro,
    'dia',f.dia,'inicio',f.inicio,'fim',f.fim,'lat',f.lat,'lng',f.lng,
    'status',f.status,'criado_em',f.criado_em) ORDER BY f.criado_em DESC)
    FROM public.feiras f WHERE f.origem = 'comunidade'
      AND f.autor_hash = private.hash_dispositivo(v_device)), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.apagar_meus_dados()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_device uuid := auth.uid();
  v_hash text;
  v_feiras_afetadas text[];
  v_feiras_trechos text[];
  v_feira_id text;
BEGIN
  IF v_device IS NULL THEN RETURN pg_catalog.jsonb_build_object('codigo','invalido'); END IF;
  v_hash := private.hash_dispositivo(v_device);
  SELECT pg_catalog.array_agg(DISTINCT feira_id) INTO v_feiras_afetadas
    FROM private.confirmacoes WHERE device_id = v_device;
  DELETE FROM private.confirmacoes WHERE device_id = v_device;
  DELETE FROM public.votos v WHERE v.device_id = v_device AND (
    (v.tipo = 'trecho' AND EXISTS (SELECT 1 FROM public.trechos t WHERE t.id::text = v.alvo_id AND t.estado = 'aberta'))
    OR (v.tipo IN ('sugestao','denuncia_sugestao') AND EXISTS
      (SELECT 1 FROM public.feiras f WHERE f.id = v.alvo_id AND f.status = 'pendente')));
  UPDATE public.votos SET device_id = NULL WHERE device_id = v_device;
  SELECT pg_catalog.array_agg(DISTINCT feira_id) INTO v_feiras_trechos FROM public.trechos WHERE autor_hash = v_hash;
  UPDATE public.trechos SET estado = 'cancelada', fechado_em = pg_catalog.now(),
    autor_hash = NULL, client_uuid = NULL WHERE autor_hash = v_hash AND estado = 'aberta';
  UPDATE public.trechos SET autor_hash = NULL, client_uuid = NULL WHERE autor_hash = v_hash;
  DELETE FROM public.pub_sugestoes WHERE id IN (SELECT id FROM public.feiras WHERE autor_hash = v_hash AND status = 'pendente');
  DELETE FROM public.votos WHERE tipo IN ('sugestao','denuncia_sugestao') AND alvo_id IN
    (SELECT id FROM public.feiras WHERE autor_hash = v_hash AND status = 'pendente');
  DELETE FROM public.feiras WHERE autor_hash = v_hash AND status = 'pendente';
  UPDATE public.feiras SET autor_hash = NULL, client_uuid = NULL WHERE autor_hash = v_hash;
  UPDATE private.incidentes_ofensa SET expira_em = pg_catalog.now() + interval '90 days'
    WHERE device_hash = v_hash;
  UPDATE private.dispositivos_bloqueados SET device_id = NULL,
    expira_em = pg_catalog.now() + interval '90 days'
    WHERE device_id = v_device OR device_hash = v_hash;
  IF v_feiras_afetadas IS NOT NULL THEN
    FOREACH v_feira_id IN ARRAY v_feiras_afetadas LOOP
      PERFORM private.atualizar_pub_confirmacoes(v_feira_id);
    END LOOP;
  END IF;
  IF v_feiras_trechos IS NOT NULL THEN
    FOREACH v_feira_id IN ARRAY v_feiras_trechos LOOP
      PERFORM private.sincronizar_feira_publica(v_feira_id);
    END LOOP;
  END IF;
  DELETE FROM public.pub_trechos pt WHERE NOT EXISTS
    (SELECT 1 FROM public.trechos t WHERE t.id = pt.id AND t.estado IN ('aprovada','aberta'));
  DELETE FROM auth.users WHERE id = v_device;
  RETURN pg_catalog.jsonb_build_object('codigo','ok');
END;
$$;

CREATE OR REPLACE FUNCTION private.limpar_dados_expirados()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_cfg public.config%ROWTYPE;
BEGIN
  SELECT * INTO v_cfg FROM public.config WHERE id = 1;
  UPDATE public.trechos SET estado = 'expirada', fechado_em = pg_catalog.now()
    WHERE estado = 'aberta' AND criado_em <= pg_catalog.now() - v_cfg.expiracao_proposta;
  DELETE FROM public.pub_sugestoes WHERE id IN
    (SELECT id FROM public.feiras WHERE status = 'pendente' AND origem = 'comunidade'
      AND criado_em <= pg_catalog.now() - v_cfg.expiracao_sugestao);
  DELETE FROM public.votos WHERE tipo IN ('sugestao','denuncia_sugestao') AND alvo_id IN
    (SELECT id FROM public.feiras WHERE status = 'pendente' AND origem = 'comunidade'
      AND criado_em <= pg_catalog.now() - v_cfg.expiracao_sugestao);
  DELETE FROM public.feiras WHERE status = 'pendente' AND origem = 'comunidade'
    AND criado_em <= pg_catalog.now() - v_cfg.expiracao_sugestao;
  DELETE FROM private.confirmacoes WHERE criado_em < pg_catalog.now() -
    pg_catalog.make_interval(days => v_cfg.retencao_confirmacao_dias);
  DELETE FROM private.incidentes_ofensa WHERE expira_em <= pg_catalog.now();
  DELETE FROM private.dispositivos_bloqueados WHERE expira_em <= pg_catalog.now();
  DELETE FROM auth.users u WHERE COALESCE(u.last_sign_in_at,u.created_at) < pg_catalog.now() - interval '90 days'
    AND NOT EXISTS (SELECT 1 FROM private.confirmacoes c WHERE c.device_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM public.votos v WHERE v.device_id = u.id);
  PERFORM private.sincronizar_tudo_publico();
END;
$$;

REVOKE ALL ON TABLE public.pub_sugestoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.pub_sugestoes TO anon, authenticated;
REVOKE ALL ON FUNCTION private.ponto_candidato_imutavel(), private.registrar_texto_proibido(text),
  private.texto_proibido(text), private.sugestao_no_horario(smallint,time,time,timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sugerir_feira(text,text,text,smallint,time,time,double precision,double precision,double precision,uuid,timestamptz),
  public.apoiar_sugestao(text,text,double precision,double precision,double precision,uuid,timestamptz),
  public.denunciar_sugestao(text,uuid,timestamptz), public.minhas_sugestoes()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sugerir_feira(text,text,text,smallint,time,time,double precision,double precision,double precision,uuid,timestamptz),
  public.apoiar_sugestao(text,text,double precision,double precision,double precision,uuid,timestamptz),
  public.denunciar_sugestao(text,uuid,timestamptz), public.minhas_sugestoes()
  TO authenticated;
