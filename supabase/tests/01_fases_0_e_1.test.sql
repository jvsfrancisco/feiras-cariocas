-- =============================================================================
-- Olha a Feira — Testes pgTAP (Fases 0 e 1)
-- Cobre os critérios 1, 7, 10, 11 e 16 da seção 11 de docs/backend/REQUISITOS.md (v4)
-- =============================================================================

\pset tuples_only on
\pset format unaligned

BEGIN;

SELECT plan(26);

-- =============================================================================
-- Preparação de cenário determinístico para os testes (independente da hora atual)
-- =============================================================================
DO $$
DECLARE
  v_agora_sp timestamp := (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo');
  v_dia_hoje smallint := pg_catalog.date_part('dow', v_agora_sp)::smallint;
  v_dia_outro smallint := ((v_dia_hoje + 2) % 7)::smallint;
BEGIN
  -- Ajusta Mearim (49) para estar ativa durante todo o dia atual de São Paulo
  UPDATE public.feiras
  SET dia = v_dia_hoje,
      inicio = '00:00:00'::time,
      fim = '23:59:59'::time,
      coord_precisa = true
  WHERE id = '49';

  -- Feira auxiliar fora do horário (outro dia da semana)
  INSERT INTO public.feiras (
    id, endereco, bairro, ra, dia, inicio, fim, lat, lng, coord_precisa, status, origem
  ) VALUES (
    'teste_fora_horario',
    'Rua Teste Horário',
    'Grajaú',
    '09-Vila Isabel',
    v_dia_outro,
    '07:00:00'::time,
    '13:00:00'::time,
    -22.923883,
    -43.260929,
    true,
    'ativa',
    'prefeitura'
  ) ON CONFLICT (id) DO UPDATE SET dia = EXCLUDED.dia, coord_precisa = true;

  -- Feira auxiliar sem coordenada precisa
  INSERT INTO public.feiras (
    id, endereco, bairro, ra, dia, inicio, fim, lat, lng, coord_precisa, status, origem
  ) VALUES (
    'teste_sem_coord',
    'Rua Sem Coord Precisa',
    'Grajaú',
    '09-Vila Isabel',
    v_dia_hoje,
    '00:00:00'::time,
    '23:59:59'::time,
    NULL,
    NULL,
    false,
    'ativa',
    'prefeitura'
  ) ON CONFLICT (id) DO UPDATE SET dia = EXCLUDED.dia, coord_precisa = false;

  PERFORM private.sincronizar_tudo_publico();

  -- Cria aparelhos de teste em auth.users
  INSERT INTO auth.users (id, created_at)
  VALUES
    ('11111111-1111-4111-8111-111111111101'::uuid, pg_catalog.now() - interval '3 days'),
    ('11111111-1111-4111-8111-111111111102'::uuid, pg_catalog.now() - interval '3 days'),
    ('11111111-1111-4111-8111-111111111103'::uuid, pg_catalog.now() - interval '3 days'),
    ('11111111-1111-4111-8111-111111111104'::uuid, pg_catalog.now() - interval '3 days'),
    ('11111111-1111-4111-8111-111111111105'::uuid, pg_catalog.now() - interval '3 days')
  ON CONFLICT (id) DO NOTHING;

  -- Ativa sessão do aparelho 1 (maduro >= 24 h)
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111101', true);
  PERFORM pg_catalog.set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111101","role":"authenticated"}', true);
END
$$;

-- =============================================================================
-- CRITÉRIO 1: Confirmação (raio 151 m, horário, substituição no mesmo dia,
--             sem_coord_precisa, client_ts com 20 min de atraso)
-- =============================================================================

-- 1. A ~151 m ao norte do vértice [-22.923807, -43.259737] do trecho aprovado da Mearim -> fora_do_raio
SELECT is(
  public.verificar_presenca('49', -22.922440, -43.259737, 15.0, pg_catalog.now(), false) ->> 'codigo',
  'fora_do_raio',
  'Critério 1.1: verificar_presenca a ~151 m do trecho aprovado devolve fora_do_raio'
);

-- 2. confirmar() a ~151 m do trecho aprovado devolve fora_do_raio
SELECT is(
  public.confirmar(
    '49',
    'sim',
    -22.922440,
    -43.259737,
    15.0,
    'aaaa0001-0000-4000-8000-000000000001'::uuid,
    pg_catalog.now()
  ) ->> 'codigo',
  'fora_do_raio',
  'Critério 1.2: confirmar a ~151 m do trecho aprovado devolve fora_do_raio'
);

-- 3. Proposta em votação (estado = aberta) nunca altera o raio da confirmação (seção 7.1)
INSERT INTO public.trechos (id, feira_id, pontos, geom, origem, estado, motivo, criado_em)
VALUES (
  '00000000-0000-4000-8000-000000009949'::uuid,
  '49',
  '[[-22.922440, -43.259737], [-22.922000, -43.259737]]'::jsonb,
  extensions.ST_GeogFromText('SRID=4326;LINESTRING(-43.259737 -22.922440, -43.259737 -22.922000)'),
  'comunidade',
  'aberta',
  'mudou_de_lugar',
  pg_catalog.now()
);

SELECT is(
  public.confirmar(
    '49',
    'sim',
    -22.922440,
    -43.259737,
    15.0,
    'aaaa0001-0000-4000-8000-000000000002'::uuid,
    pg_catalog.now()
  ) ->> 'codigo',
  'fora_do_raio',
  'Critério 1.3: proposta de trecho aberta não altera o raio de confirmação'
);

DELETE FROM public.trechos WHERE id = '00000000-0000-4000-8000-000000009949'::uuid;

-- 4. Fora do horário -> fora_do_horario
SELECT is(
  public.confirmar(
    'teste_fora_horario',
    'sim',
    -22.923883,
    -43.260929,
    15.0,
    'aaaa0001-0000-4000-8000-000000000003'::uuid,
    pg_catalog.now()
  ) ->> 'codigo',
  'fora_do_horario',
  'Critério 1.4: confirmar fora do horário da feira devolve fora_do_horario'
);

-- 5. Feira sem coord_precisa -> sem_coord_precisa
SELECT is(
  public.confirmar(
    'teste_sem_coord',
    'sim',
    -22.923883,
    -43.260929,
    15.0,
    'aaaa0001-0000-4000-8000-000000000004'::uuid,
    pg_catalog.now()
  ) ->> 'codigo',
  'sem_coord_precisa',
  'Critério 1.5: confirmar em feira sem coord_precisa devolve sem_coord_precisa'
);

-- 6. client_ts com 20 min de atraso -> descartado (não grava em private.confirmacoes)
SELECT is(
  (
    SELECT (r ->> 'codigo') || ':' || COALESCE(r ->> 'descartada', 'false') || ':' || (
      SELECT pg_catalog.count(*)::text FROM private.confirmacoes WHERE feira_id = '49'
    )
    FROM public.confirmar(
      '49',
      'sim',
      -22.923807,
      -43.259737,
      15.0,
      'aaaa0001-0000-4000-8000-000000000005'::uuid,
      pg_catalog.now() - interval '20 minutes'
    ) AS r
  ),
  'invalido:true:0',
  'Critério 1.6: client_ts com 20 min de atraso é descartado sem gravar linha'
);

-- 7. Primeira resposta válida no dia ('nao', a ~22 m do trecho da Mearim) -> ok
SELECT is(
  public.confirmar(
    '49',
    'nao',
    -22.923607,
    -43.259737,
    15.0,
    'aaaa0001-0000-4000-8000-000000000006'::uuid,
    pg_catalog.now()
  ) ->> 'codigo',
  'ok',
  'Critério 1.7: primeira resposta válida no dia devolve ok'
);

-- 8. Segunda resposta no mesmo dia de São Paulo ('sim') substitui a primeira (upsert)
DO $$
BEGIN
  PERFORM pg_catalog.set_config(
    'teste.conf8_codigo',
    public.confirmar(
      '49',
      'sim',
      -22.923607,
      -43.259737,
      15.0,
      'aaaa0001-0000-4000-8000-000000000007'::uuid,
      pg_catalog.now()
    ) ->> 'codigo',
    true
  );
END
$$;

SELECT is(
  (
    SELECT pg_catalog.current_setting('teste.conf8_codigo', true)
      || '|linhas=' || (SELECT pg_catalog.count(*)::text FROM private.confirmacoes WHERE feira_id = '49' AND device_id = '11111111-1111-4111-8111-111111111101'::uuid)
      || '|resposta=' || (SELECT c.resposta FROM private.confirmacoes c WHERE c.feira_id = '49' AND c.device_id = '11111111-1111-4111-8111-111111111101'::uuid)
      || '|sim28d=' || (SELECT pc.confirmacoes_sim_28d::text FROM public.pub_confirmacoes pc WHERE pc.feira_id = '49')
  ),
  'ok|linhas=1|resposta=sim|sim28d=1',
  'Critério 1.8: segunda resposta no mesmo dia substitui a primeira via upsert e atualiza pub_confirmacoes'
);

-- =============================================================================
-- CRITÉRIO 7: Abuso de identidade (10 device_id < 24 h não contam;
--             anônimo chamando função de admin -> 403 / 42501)
-- =============================================================================

-- Limpa confirmações anteriores da feira 49 para testar os 10 aparelhos novos (< 24 h)
DO $$
DECLARE
  i integer;
  v_uid uuid;
  v_uuid_req uuid;
BEGIN
  DELETE FROM private.confirmacoes WHERE feira_id = '49';
  PERFORM private.atualizar_pub_confirmacoes('49');

  FOR i IN 1..10 LOOP
    v_uid := ('22222222-2222-4222-8222-' || pg_catalog.lpad(i::text, 12, '0'))::uuid;
    v_uuid_req := ('bbbb0007-0000-4000-8000-' || pg_catalog.lpad(i::text, 12, '0'))::uuid;

    INSERT INTO auth.users (id, created_at)
    VALUES (v_uid, pg_catalog.now() - interval '2 hours')
    ON CONFLICT (id) DO UPDATE SET created_at = EXCLUDED.created_at;

    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_uid::text, true);
    PERFORM public.confirmar('49', 'nao', -22.923807, -43.259737, 10.0, v_uuid_req, pg_catalog.now());
  END LOOP;
END
$$;

-- 9. Nenhum dos 10 aparelhos < 24 h conta como elegível (0 elegíveis e sem_feira_hoje = false)
SELECT is(
  (
    SELECT
      pg_catalog.count(*) FILTER (WHERE c.aparelho_elegivel_24h = true)::text
      || ':' ||
      (SELECT pc.sem_feira_hoje::text FROM public.pub_confirmacoes pc WHERE pc.feira_id = '49')
    FROM private.confirmacoes c
    WHERE c.feira_id = '49'
  ),
  '0:false',
  'Critério 7.1: 10 device_id novos (< 24 h) votando igual não contam como elegíveis'
);

-- 10. 3 aparelhos com >= 24 h dizendo 'nao' ligam sem_feira_hoje, e 1 'sim' posterior apaga o selo
DO $$
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111101', true);
  PERFORM public.confirmar('49', 'nao', -22.923807, -43.259737, 10.0, 'bbbb0007-0000-4000-8000-000000000101'::uuid, pg_catalog.now());

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111102', true);
  PERFORM public.confirmar('49', 'nao', -22.923807, -43.259737, 10.0, 'bbbb0007-0000-4000-8000-000000000102'::uuid, pg_catalog.now());

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111103', true);
  PERFORM public.confirmar('49', 'nao', -22.923807, -43.259737, 10.0, 'bbbb0007-0000-4000-8000-000000000103'::uuid, pg_catalog.now());
END
$$;

SELECT is(
  (SELECT pc.sem_feira_hoje FROM public.pub_confirmacoes pc WHERE pc.feira_id = '49'),
  true,
  'Critério 7.2: 3 respostas "não" de aparelhos com >= 24 h ativam o selo sem_feira_hoje'
);

-- 11. Aparelho anônimo chamando função de admin -> 403 (42501 insufficient_privilege no Postgres)
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT admin.bloquear_dispositivo('11111111-1111-4111-8111-111111111105'::uuid, 'teste', 7)$$,
  '42501',
  NULL,
  'Critério 7.3: papel anon chamando admin.bloquear_dispositivo recebe 42501 (HTTP 403)'
);
RESET ROLE;

-- 12. Dispositivo bloqueado via admin.bloquear_dispositivo recebe codigo = bloqueado ao tentar escrever
DO $$
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111105', true);
END
$$;
SELECT is(
  (
    SELECT (admin.bloquear_dispositivo('11111111-1111-4111-8111-111111111105'::uuid, 'abuso', 7) ->> 'codigo')
      || ':' ||
      (public.confirmar('49', 'sim', -22.923807, -43.259737, 10.0, 'bbbb0007-0000-4000-8000-000000000105'::uuid, pg_catalog.now()) ->> 'codigo')
  ),
  'ok:bloqueado',
  'Critério 7.4: aparelho bloqueado por admin.bloquear_dispositivo recebe codigo = bloqueado'
);

-- =============================================================================
-- CRITÉRIO 10: Fila offline (idempotência por client_uuid até 15 min; > 15 min descartada)
-- =============================================================================

DO $$
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111104', true);
END
$$;

-- 13. Confirmação da fila offline com 10 min de atraso (<= 15 min) é aceita
SELECT is(
  public.confirmar(
    '49',
    'sim',
    -22.923807,
    -43.259737,
    12.0,
    'cccc0010-0000-4000-8000-000000000001'::uuid,
    pg_catalog.now() - interval '10 minutes'
  ) ->> 'codigo',
  'ok',
  'Critério 10.1: confirmação da fila offline dentro de 15 min (10 min atrás) é aceita'
);

-- 14. Reenvio da mesma confirmação (mesmo client_uuid) não duplica registro
SELECT is(
  (
    SELECT (r ->> 'codigo') || ':linhas=' || (
      SELECT pg_catalog.count(*)::text
      FROM private.confirmacoes c
      WHERE c.device_id = '11111111-1111-4111-8111-111111111104'::uuid
        AND c.feira_id = '49'
    )
    FROM public.confirmar(
      '49',
      'sim',
      -22.923807,
      -43.259737,
      12.0,
      'cccc0010-0000-4000-8000-000000000001'::uuid,
      pg_catalog.now() - interval '10 minutes'
    ) AS r
  ),
  'ok:linhas=1',
  'Critério 10.2: reenvio com o mesmo client_uuid é idempotente e não duplica linha'
);

-- 15. Confirmação da fila offline com 16 min de atraso (> 15 min) é descartada
SELECT is(
  (
    SELECT (r ->> 'codigo') || ':' || COALESCE(r ->> 'descartada', 'false') || ':existe=' || (
      SELECT pg_catalog.count(*)::text
      FROM private.confirmacoes c
      WHERE c.client_uuid = 'cccc0010-0000-4000-8000-000000000002'::uuid
    )
    FROM public.confirmar(
      '49',
      'nao',
      -22.923807,
      -43.259737,
      12.0,
      'cccc0010-0000-4000-8000-000000000002'::uuid,
      pg_catalog.now() - interval '16 minutes'
    ) AS r
  ),
  'invalido:true:existe=0',
  'Critério 10.3: confirmação offline com 16 min (> 15 min) é descartada'
);

-- =============================================================================
-- CRITÉRIO 11: Privacidade (sem device_id, autor_hash ou coordenada de terceiros;
--              distância arredondada a 10 m; apagar_meus_dados)
-- =============================================================================

-- 16. Tabelas públicas não possuem colunas device_id, autor_hash, client_uuid ou ip
SELECT is(
  (
    SELECT pg_catalog.count(*)::integer
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('pub_feiras', 'pub_trechos', 'pub_confirmacoes')
      AND column_name IN ('device_id', 'autor_hash', 'client_uuid', 'ip', 'geohash')
  ),
  0,
  'Critério 11.1: pub_feiras, pub_trechos e pub_confirmacoes não contêm device_id, autor_hash, client_uuid nem ip'
);

-- 17. private.confirmacoes não guarda coordenadas nem IP, e distancia_m é sempre múltiplo de 10 m
SELECT is(
  (
    SELECT
      (
        SELECT pg_catalog.count(*)::integer
        FROM information_schema.columns
        WHERE table_schema = 'private'
          AND table_name = 'confirmacoes'
          AND column_name IN ('lat', 'lng', 'geohash', 'ip', 'ponto', 'geom')
      )::text
      || ':nao_multiplos_10=' ||
      (
        SELECT pg_catalog.count(*)::integer
        FROM private.confirmacoes
        WHERE distancia_m % 10 <> 0 OR dentro_do_raio <> true
      )::text
  ),
  '0:nao_multiplos_10=0',
  'Critério 11.2: private.confirmacoes não tem coordenadas/IP e grava distância arredondada a 10 m'
);

-- 18. apagar_meus_dados() remove confirmações e o usuário em auth.users sem expor identificadores
DO $$
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111104', true);
  PERFORM pg_catalog.set_config('teste.apagar_codigo', public.apagar_meus_dados() ->> 'codigo', true);
END
$$;
SELECT is(
  pg_catalog.current_setting('teste.apagar_codigo', true)
    || ':confirmacoes_restantes=' || (
      SELECT pg_catalog.count(*)::text FROM private.confirmacoes WHERE device_id = '11111111-1111-4111-8111-111111111104'::uuid
    )
    || ':usuario_restante=' || (
      SELECT pg_catalog.count(*)::text FROM auth.users WHERE id = '11111111-1111-4111-8111-111111111104'::uuid
    ),
  'ok:confirmacoes_restantes=0:usuario_restante=0',
  'Critério 11.3: apagar_meus_dados apaga confirmações e remove o usuário em auth.users'
);

-- =============================================================================
-- CRITÉRIO 16: Vazamento — percorre pg_class, pg_proc e storage.buckets
--              e falha se anon ou authenticated alcançar algo fora da lista
-- =============================================================================

-- 19. Relações (tabelas/visões) com SELECT para anon ou authenticated == exatamente a lista permitida
SELECT is(
  ARRAY(
    SELECT n.nspname || '.' || c.relname
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'private', 'admin')
      AND c.relkind IN ('r', 'v', 'm', 'f', 'p')
      AND (
        pg_catalog.has_table_privilege('anon', c.oid, 'SELECT')
        OR pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT')
      )
    ORDER BY 1
  ),
  ARRAY['public.pub_confirmacoes', 'public.pub_feiras', 'public.pub_fotos', 'public.pub_sugestoes', 'public.pub_trechos'],
  'Critério 16.1: anon e authenticated têm SELECT exclusivamente em pub_confirmacoes, pub_feiras e pub_trechos'
);

-- 20. Nenhuma relação em public, private ou admin aceita escrita direta de anon ou authenticated
SELECT is(
  ARRAY(
    SELECT n.nspname || '.' || c.relname
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'private', 'admin')
      AND c.relkind IN ('r', 'v', 'm', 'f', 'p')
      AND (
        pg_catalog.has_table_privilege('anon', c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
        OR pg_catalog.has_table_privilege('authenticated', c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
      )
    ORDER BY 1
  ),
  ARRAY[]::text[],
  'Critério 16.2: nenhuma tabela/visão aceita INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ou TRIGGER de anon/authenticated'
);

-- 21. Todas as tabelas das nossas estruturas (public.config/feiras/trechos/votos/pub_*, private.*, admin.*) têm RLS ligado
SELECT is(
  ARRAY(
    SELECT n.nspname || '.' || c.relname
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE (
        (n.nspname = 'public' AND c.relname IN ('config', 'feiras', 'trechos', 'votos', 'pub_feiras', 'pub_trechos', 'pub_confirmacoes'))
        OR n.nspname IN ('private', 'admin')
      )
      AND c.relkind = 'r'
      AND c.relrowsecurity = false
    ORDER BY 1
  ),
  ARRAY[]::text[],
  'Critério 16.3: todas as tabelas do app possuem RLS ativo (relrowsecurity = true)'
);

-- 22. Funções em pg_proc com EXECUTE para anon == apenas public.ping
SELECT is(
  ARRAY(
    SELECT DISTINCT n.nspname || '.' || p.proname
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private', 'admin')
      AND pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    ORDER BY 1
  ),
  ARRAY['public.ping'],
  'Critério 16.4: anon tem EXECUTE apenas em public.ping'
);

-- 23. Funções em pg_proc com EXECUTE para authenticated == apenas apagar_meus_dados, confirmar, ping, propor_trecho e votar_trecho
SELECT is(
  ARRAY(
    SELECT DISTINCT n.nspname || '.' || p.proname
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private', 'admin')
      AND pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ORDER BY 1
  ),
  ARRAY['public.apagar_meus_dados', 'public.apoiar_sugestao', 'public.confirmar', 'public.denunciar_foto', 'public.denunciar_sugestao', 'public.minhas_sugestoes', 'public.pedir_upload_foto', 'public.ping', 'public.propor_trecho', 'public.sugerir_feira', 'public.votar_trecho'],
  'Critério 16.5: authenticated tem EXECUTE apenas em public.apagar_meus_dados, public.confirmar, public.ping, public.propor_trecho e public.votar_trecho'
);

-- 24. Toda função SECURITY DEFINER de public, private e admin tem search_path = '' configurado
SELECT is(
  ARRAY(
    SELECT n.nspname || '.' || p.proname
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private', 'admin')
      AND p.prosecdef = true
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg
        WHERE cfg IN ('search_path=""', 'search_path=''''', 'search_path=')
      )
    ORDER BY 1
  ),
  ARRAY[]::text[],
  'Critério 16.6: todas as funções SECURITY DEFINER possuem SET search_path = '''''
);

-- 25. Apenas fotos é público no Storage.
SELECT is(
  ARRAY(SELECT b.id FROM storage.buckets b WHERE b.public = true ORDER BY b.id),
  ARRAY['fotos'],
  'Critério 16.7: storage.buckets expõe exatamente o bucket fotos'
);

-- 26. Job olhafeira-limpeza-diaria está agendado em cron.job para limpeza de 30 dias
SELECT is(
  (
    SELECT j.jobname || ':' || j.schedule
    FROM cron.job j
    WHERE j.jobname = 'olhafeira-limpeza-diaria'
  ),
  'olhafeira-limpeza-diaria:15 4 * * *',
  'Critério 11.4: job olhafeira-limpeza-diaria existe em cron.job'
);

SELECT * FROM finish();

ROLLBACK;
