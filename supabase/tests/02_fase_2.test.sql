-- =============================================================================
-- Olha a Feira — Testes pgTAP (Fase 2: Trecho colaborativo, votação e reversão)
-- Cobre os critérios 2, 3, 4, 5, 6, 14 e 16 (e seção 8) de docs/backend/REQUISITOS.md (v4)
-- =============================================================================

\pset tuples_only on
\pset format unaligned

BEGIN;

SELECT plan(31);

-- =============================================================================
-- Preparação de cenário determinístico para os testes da Fase 2
-- =============================================================================
DO $$
DECLARE
  v_agora_sp timestamp := (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo');
  v_dia_hoje smallint := pg_catalog.date_part('dow', v_agora_sp)::smallint;
BEGIN
  -- Ajusta a Feira 49 (Rua Mearim) e mais 2 feiras auxiliares para funcionarem o dia inteiro hoje
  UPDATE public.feiras
  SET dia = v_dia_hoje,
      inicio = '00:00:00'::time,
      fim = '23:59:59'::time,
      coord_precisa = true
  WHERE id = '49';

  INSERT INTO public.feiras (
    id, endereco, bairro, ra, dia, inicio, fim, lat, lng, coord_precisa, status, origem
  ) VALUES
  (
    'f2_aux_1',
    'Rua Auxiliar Um',
    'Grajaú',
    '09-Vila Isabel',
    v_dia_hoje,
    '00:00:00'::time,
    '23:59:59'::time,
    -22.923883,
    -43.260929,
    true,
    'ativa',
    'prefeitura'
  ),
  (
    'f2_aux_2',
    'Rua Auxiliar Dois',
    'Grajaú',
    '09-Vila Isabel',
    v_dia_hoje,
    '00:00:00'::time,
    '23:59:59'::time,
    -22.923883,
    -43.260929,
    true,
    'ativa',
    'prefeitura'
  ),
  (
    'f2_aux_3',
    'Rua Auxiliar Três',
    'Grajaú',
    '09-Vila Isabel',
    v_dia_hoje,
    '00:00:00'::time,
    '23:59:59'::time,
    -22.923883,
    -43.260929,
    true,
    'ativa',
    'prefeitura'
  )
  ON CONFLICT (id) DO UPDATE SET
    dia = EXCLUDED.dia,
    inicio = EXCLUDED.inicio,
    fim = EXCLUDED.fim,
    coord_precisa = true,
    status = 'ativa';

  PERFORM private.sincronizar_tudo_publico();

  -- Aparelhos de teste:
  -- f2_autor_1..3: >= 7 dias (podem propor trecho)
  -- f2_novo_2d: 2 dias (< 7 dias para propor, mas >= 24h para votar)
  -- f2_novo_23h: 23 horas (< 24h para votar)
  -- f2_votante_1..4: >= 3 dias (elegíveis >= 24h para votar)
  INSERT INTO auth.users (id, created_at)
  VALUES
    ('33333333-3333-4333-8333-000000000001'::uuid, pg_catalog.now() - interval '10 days'),
    ('33333333-3333-4333-8333-000000000002'::uuid, pg_catalog.now() - interval '10 days'),
    ('33333333-3333-4333-8333-000000000003'::uuid, pg_catalog.now() - interval '10 days'),
    ('33333333-3333-4333-8333-000000000010'::uuid, pg_catalog.now() - interval '2 days'),
    ('33333333-3333-4333-8333-000000000011'::uuid, pg_catalog.now() - interval '23 hours'),
    ('33333333-3333-4333-8333-000000000021'::uuid, pg_catalog.now() - interval '4 days'),
    ('33333333-3333-4333-8333-000000000022'::uuid, pg_catalog.now() - interval '4 days'),
    ('33333333-3333-4333-8333-000000000023'::uuid, pg_catalog.now() - interval '4 days'),
    ('33333333-3333-4333-8333-000000000024'::uuid, pg_catalog.now() - interval '4 days')
  ON CONFLICT (id) DO UPDATE SET created_at = EXCLUDED.created_at;

  -- Sessão inicial: autor 1 (>= 7 dias)
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000001', true);
  PERFORM pg_catalog.set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-000000000001","role":"authenticated"}', true);
END
$$;

-- =============================================================================
-- CRITÉRIO 6: Validação da geometria e parâmetros de propor_trecho (seção 6 e 7.2)
-- =============================================================================

-- 1. Confere que SRID 31983 (SIRGAS 2000 / UTM 23S) está disponível no banco
SELECT is(
  (SELECT pg_catalog.count(*)::integer FROM extensions.spatial_ref_sys WHERE srid = 31983),
  1,
  'Critério 6.0: SRID 31983 (SIRGAS 2000 / UTM 23S) existe em spatial_ref_sys'
);

-- 2. Geometria com 13 pontos (> 12) -> invalido
SELECT is(
  public.propor_trecho(
    '49',
    '[
      [-22.923300, -43.260200], [-22.923300, -43.260300], [-22.923300, -43.260400],
      [-22.923300, -43.260500], [-22.923300, -43.260600], [-22.923300, -43.260700],
      [-22.923300, -43.260800], [-22.923300, -43.260900], [-22.923300, -43.261000],
      [-22.923300, -43.261100], [-22.923300, -43.261200], [-22.923300, -43.261300],
      [-22.923300, -43.261400]
    ]'::jsonb,
    'trecho_maior',
    'f2000006-0000-4000-8000-000000000001'::uuid,
    pg_catalog.now(),
    -22.923807,
    -43.259737,
    12.0
  ) ->> 'codigo',
  'invalido',
  'Critério 6.1: propor_trecho com 13 pontos (> 12) devolve invalido'
);

-- 3. Geometria com comprimento de ~20 m (< 30 m) -> invalido
SELECT is(
  public.propor_trecho(
    '49',
    '[[-22.923300, -43.260900], [-22.923300, -43.261095]]'::jsonb,
    'trecho_menor',
    'f2000006-0000-4000-8000-000000000002'::uuid,
    pg_catalog.now(),
    -22.923807,
    -43.259737,
    12.0
  ) ->> 'codigo',
  'invalido',
  'Critério 6.2: propor_trecho com comprimento de ~20 m (< 30 m) devolve invalido'
);

-- 4. Geometria com comprimento > 800 m (zigue-zague de ~1000 m dentro do raio de 600 m) -> invalido
SELECT is(
  public.propor_trecho(
    '49',
    '[
      [-22.922000, -43.260000],
      [-22.925000, -43.260000],
      [-22.922000, -43.261500],
      [-22.925000, -43.261500]
    ]'::jsonb,
    'trecho_maior',
    'f2000006-0000-4000-8000-000000000003'::uuid,
    pg_catalog.now(),
    -22.923807,
    -43.259737,
    12.0
  ) ->> 'codigo',
  'invalido',
  'Critério 6.3: propor_trecho com comprimento > 800 m devolve invalido'
);

-- 5. Geometria com ponto a ~700 m (> 600 m) do ponto da Prefeitura -> invalido
SELECT is(
  public.propor_trecho(
    '49',
    '[[-22.923883, -43.260929], [-22.917550, -43.260929]]'::jsonb,
    'mudou_de_lugar',
    'f2000006-0000-4000-8000-000000000004'::uuid,
    pg_catalog.now(),
    -22.923807,
    -43.259737,
    12.0
  ) ->> 'codigo',
  'invalido',
  'Critério 6.4: propor_trecho com ponto a ~700 m do ponto da Prefeitura devolve invalido'
);

-- 6. Geometria com ponto repetido seguido -> invalido
SELECT is(
  public.propor_trecho(
    '49',
    '[[-22.923300, -43.260200], [-22.923300, -43.260200], [-22.923300, -43.261600]]'::jsonb,
    'outro',
    'f2000006-0000-4000-8000-000000000005'::uuid,
    pg_catalog.now(),
    -22.923807,
    -43.259737,
    12.0
  ) ->> 'codigo',
  'invalido',
  'Critério 6.5: propor_trecho com ponto repetido seguido devolve invalido'
);

-- 7. Geometria com autointerseção (ST_IsSimple = false em SRID 31983) -> invalido
SELECT is(
  public.propor_trecho(
    '49',
    '[
      [-22.923200, -43.260200],
      [-22.923800, -43.261200],
      [-22.923200, -43.261200],
      [-22.923800, -43.260200]
    ]'::jsonb,
    'outro',
    'f2000006-0000-4000-8000-000000000006'::uuid,
    pg_catalog.now(),
    -22.923807,
    -43.259737,
    12.0
  ) ->> 'codigo',
  'invalido',
  'Critério 6.6: propor_trecho com autointerseção (ST_IsSimple = false) devolve invalido'
);

-- 8. Geometria fora da caixa do Rio ou motivo fora da lista fechada -> invalido
SELECT is(
  (
    public.propor_trecho(
      '49',
      '[[-22.500000, -43.260200], [-22.500500, -43.260200]]'::jsonb,
      'rua_errada',
      'f2000006-0000-4000-8000-000000000007'::uuid,
      pg_catalog.now(),
      -22.923807,
      -43.259737,
      12.0
    ) ->> 'codigo'
  ) || ':' || (
    public.propor_trecho(
      '49',
      '[[-22.923300, -43.260200], [-22.923300, -43.261600]]'::jsonb,
      'motivo_inventado',
      'f2000006-0000-4000-8000-000000000008'::uuid,
      pg_catalog.now(),
      -22.923807,
      -43.259737,
      12.0
    ) ->> 'codigo'
  ),
  'invalido:invalido',
  'Critério 6.7: ponto fora da caixa do Rio e motivo fora da lista fechada devolvem invalido'
);

-- 9. Trecho igual/quase igual ao vigente (Hausdorff < 20 m em SRID 31983) -> duplicado
SELECT is(
  public.propor_trecho(
    '49',
    '[[-22.923815, -43.259737], [-22.924320, -43.261316], [-22.923535, -43.261733]]'::jsonb,
    'outro',
    'f2000006-0000-4000-8000-000000000009'::uuid,
    pg_catalog.now(),
    -22.923807,
    -43.259737,
    12.0
  ) ->> 'codigo',
  'duplicado',
  'Critério 6.8: trecho com distância de Hausdorff < 20 m do vigente devolve duplicado'
);

-- =============================================================================
-- CRITÉRIO 3: O proponente sozinho (aparelho_novo, presença, voto próprio,
--             1 aberta por feira, espera de 14 dias, máximo 2 por semana)
-- =============================================================================

-- 10. Aparelho com 2 dias (< 7 dias) propondo -> aparelho_novo
DO $$
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000010', true);
END
$$;

SELECT is(
  public.propor_trecho(
    '49',
    '[[-22.923300, -43.260200], [-22.923300, -43.261600]]'::jsonb,
    'rua_errada',
    'f2000003-0000-4000-8000-000000000001'::uuid,
    pg_catalog.now(),
    -22.923807,
    -43.259737,
    12.0
  ) ->> 'codigo',
  'aparelho_novo',
  'Critério 3.1: aparelho com 2 dias (< 7 dias) propondo recebe aparelho_novo'
);

-- 11. Proponente (>= 7 dias) fora do raio (> 150 m) ou client_ts fora de 15 min
DO $$
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000001', true);
END
$$;

SELECT is(
  (
    public.propor_trecho(
      '49',
      '[[-22.923300, -43.260200], [-22.923300, -43.261600]]'::jsonb,
      'rua_errada',
      'f2000003-0000-4000-8000-000000000002'::uuid,
      pg_catalog.now(),
      -22.920000,
      -43.259737,
      12.0
    ) ->> 'codigo'
  ) || ':' || (
    public.propor_trecho(
      '49',
      '[[-22.923300, -43.260200], [-22.923300, -43.261600]]'::jsonb,
      'rua_errada',
      'f2000003-0000-4000-8000-000000000003'::uuid,
      pg_catalog.now() - interval '20 minutes',
      -22.923807,
      -43.259737,
      12.0
    ) ->> 'codigo'
  ),
  'fora_do_raio:invalido',
  'Critério 3.2: propor_trecho fora do raio devolve fora_do_raio e client_ts > 15 min devolve invalido'
);

-- 12. Proposta válida por aparelho >= 7 dias com presença declarada -> ok e publica em pub_trechos com expira_em = criado_em + 14 dias
DO $$
DECLARE
  v_res jsonb;
BEGIN
  v_res := public.propor_trecho(
    '49',
    '[[-22.923300, -43.260200], [-22.923300, -43.261600]]'::jsonb,
    'rua_errada',
    'f2000003-0000-4000-8000-000000000004'::uuid,
    pg_catalog.now(),
    -22.923807,
    -43.259737,
    12.0
  );
  PERFORM pg_catalog.set_config('teste.prop1_codigo', v_res ->> 'codigo', true);
  PERFORM pg_catalog.set_config('teste.prop1_id', v_res ->> 'proposta_id', true);
END
$$;

SELECT is(
  (
    SELECT pg_catalog.current_setting('teste.prop1_codigo', true)
      || '|pub_aberta=' || (
        SELECT pg_catalog.count(*)::text
        FROM public.pub_trechos pt
        WHERE pt.id = pg_catalog.current_setting('teste.prop1_id', true)::uuid
          AND pt.estado = 'aberta'
          AND pt.expira_em = pt.criado_em + interval '14 days'
      )
      || '|pub_vigente=' || (
        SELECT pg_catalog.count(*)::text
        FROM public.pub_trechos pt
        WHERE pt.feira_id = '49' AND pt.estado = 'aprovada'
      )
  ),
  'ok|pub_aberta=1|pub_vigente=1',
  'Critério 3.3: proposta válida cria registro aberto e sincroniza pub_trechos com expira_em = criado_em + 14 dias'
);

-- 13. Proponente votando na própria proposta -> invalido
SELECT is(
  public.votar_trecho(
    pg_catalog.current_setting('teste.prop1_id', true)::uuid,
    'aprovo',
    -22.923807,
    -43.259737,
    12.0,
    'f2000003-0000-4000-8000-000000000005'::uuid,
    pg_catalog.now()
  ) ->> 'codigo',
  'invalido',
  'Critério 3.4: proponente votando na própria proposta recebe invalido'
);

-- 14. Outra proposta enquanto já existe proposta aberta na mesma feira -> limite
DO $$
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000002', true);
END
$$;

SELECT is(
  public.propor_trecho(
    '49',
    '[[-22.923100, -43.260200], [-22.923100, -43.261600]]'::jsonb,
    'mudou_de_lugar',
    'f2000003-0000-4000-8000-000000000006'::uuid,
    pg_catalog.now(),
    -22.923807,
    -43.259737,
    12.0
  ) ->> 'codigo',
  'limite',
  'Critério 3.5: segunda proposta em feira que já tem proposta aberta recebe limite'
);

-- =============================================================================
-- CRITÉRIO 4 (parte 1): Raio de confirmação não usa proposta aberta;
--                       2 votos 'nego' (1 presente) negam a proposta e mantêm o anterior;
--                       14 dias de espera para o mesmo proponente após negação
-- =============================================================================

-- 15. Proposta aberta em [-22.923300, ...] não altera o raio de confirmação: ponto a ~184 m do curado (mas a ~122 m da proposta) dá fora_do_raio
SELECT is(
  public.verificar_presenca('49', -22.922200, -43.260200, 12.0, pg_catalog.now(), false) ->> 'codigo',
  'fora_do_raio',
  'Critério 4.1: proposta aberta nunca altera o raio de verificar_presenca/confirmar'
);

-- 16. 2 votos 'nego' de aparelhos >= 24h (1 presente + 1 remoto) negam a proposta, mantêm o vigente e guardam histórico
DO $$
DECLARE
  v_prop_id uuid := pg_catalog.current_setting('teste.prop1_id', true)::uuid;
  v_r1 jsonb;
  v_r2 jsonb;
BEGIN
  -- Votante 1 (>= 24h, presente)
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000021', true);
  v_r1 := public.votar_trecho(
    v_prop_id,
    'nego',
    -22.923807,
    -43.259737,
    12.0,
    'f2000004-0000-4000-8000-000000000001'::uuid,
    pg_catalog.now()
  );

  -- Votante 2 (>= 24h, remoto: lat/lng/acuracia nulos)
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000022', true);
  v_r2 := public.votar_trecho(
    v_prop_id,
    'nego',
    NULL,
    NULL,
    NULL,
    'f2000004-0000-4000-8000-000000000002'::uuid,
    pg_catalog.now()
  );

  PERFORM pg_catalog.set_config('teste.neg_r1', (v_r1 ->> 'codigo') || ':' || (v_r1 ->> 'estado'), true);
  PERFORM pg_catalog.set_config('teste.neg_r2', (v_r2 ->> 'codigo') || ':' || (v_r2 ->> 'estado'), true);
END
$$;

SELECT is(
  (
    SELECT pg_catalog.current_setting('teste.neg_r1', true)
      || '|' || pg_catalog.current_setting('teste.neg_r2', true)
      || '|estado_bd=' || (SELECT t.estado FROM public.trechos t WHERE t.id = pg_catalog.current_setting('teste.prop1_id', true)::uuid)
      || '|vigente=' || (SELECT f.trecho_vigente_id::text FROM public.feiras f WHERE f.id = '49')
      || '|pub_abertas=' || (SELECT pg_catalog.count(*)::text FROM public.pub_trechos pt WHERE pt.feira_id = '49' AND pt.estado = 'aberta')
  ),
  'ok:aberta|ok:negada|estado_bd=negada|vigente=00000000-0000-4000-8000-000000000049|pub_abertas=0',
  'Critério 4.2: 2 votos nego (1 presente + 1 remoto) negam a proposta, mantêm o vigente e removem a aberta de pub_trechos'
);

-- 17. Mesmo device_id propondo de novo na mesma feira dentro dos 14 dias de espera após negação -> limite (Critério 3)
DO $$
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000001', true);
END
$$;

SELECT is(
  public.propor_trecho(
    '49',
    '[[-22.923300, -43.260200], [-22.923300, -43.261600]]'::jsonb,
    'rua_errada',
    'f2000003-0000-4000-8000-000000000007'::uuid,
    pg_catalog.now(),
    -22.923807,
    -43.259737,
    12.0
  ) ->> 'codigo',
  'limite',
  'Critério 3.6: mesmo device_id propondo de novo na mesma feira dentro dos 14 dias de espera recebe limite'
);

-- 18. Limite de no máximo 2 propostas por semana pelo mesmo aparelho (mesmo em feiras distintas)
DO $$
DECLARE
  v_r_segunda jsonb;
  v_r_terceira jsonb;
BEGIN
  -- Autor 1 já fez 1 proposta nesta semana (na feira 49). Faz a 2ª na f2_aux_1 -> ok
  v_r_segunda := public.propor_trecho(
    'f2_aux_1',
    '[[-22.923300, -43.260200], [-22.923300, -43.261600]]'::jsonb,
    'trecho_maior',
    'f2000003-0000-4000-8000-000000000008'::uuid,
    pg_catalog.now(),
    -22.923883,
    -43.260929,
    12.0
  );

  -- Tenta a 3ª proposta na mesma semana na f2_aux_2 -> limite
  v_r_terceira := public.propor_trecho(
    'f2_aux_2',
    '[[-22.923300, -43.260200], [-22.923300, -43.261600]]'::jsonb,
    'trecho_maior',
    'f2000003-0000-4000-8000-000000000009'::uuid,
    pg_catalog.now(),
    -22.923883,
    -43.260929,
    12.0
  );

  PERFORM pg_catalog.set_config('teste.lim_semana', (v_r_segunda ->> 'codigo') || ':' || (v_r_terceira ->> 'codigo'), true);
END
$$;

SELECT is(
  pg_catalog.current_setting('teste.lim_semana', true),
  'ok:limite',
  'Critério 3.7: aparelho pode propor até 2 vezes na semana e a 3ª proposta devolve limite'
);

-- =============================================================================
-- CRITÉRIO 2 e CRITÉRIO 16 (parte): Aprovação (3 aprovo elegíveis com >= 1 presente;
-- 3 remotos não aprovam) e voto após aprovação devolve encerrada sem mudar estado
-- =============================================================================

-- 19. Autor 2 propõe novo trecho na feira 49; 3 votos 'aprovo' remotos (0 presentes) NÃO aprovam
DO $$
DECLARE
  v_prop jsonb;
  v_prop_id uuid;
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000002', true);
  v_prop := public.propor_trecho(
    '49',
    '[[-22.923250, -43.260100], [-22.923250, -43.261500]]'::jsonb,
    'mudou_de_lugar',
    'f2000002-0000-4000-8000-000000000001'::uuid,
    pg_catalog.now(),
    -22.923807,
    -43.259737,
    12.0
  );
  v_prop_id := (v_prop ->> 'proposta_id')::uuid;
  PERFORM pg_catalog.set_config('teste.prop2_id', v_prop_id::text, true);

  -- 3 votos remotos (lat/lng/acuracia nulos) de aparelhos >= 24h
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000021', true);
  PERFORM public.votar_trecho(v_prop_id, 'aprovo', NULL, NULL, NULL, 'f2000002-0000-4000-8000-000000000002'::uuid, pg_catalog.now());

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000022', true);
  PERFORM public.votar_trecho(v_prop_id, 'aprovo', NULL, NULL, NULL, 'f2000002-0000-4000-8000-000000000003'::uuid, pg_catalog.now());

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000023', true);
  PERFORM public.votar_trecho(v_prop_id, 'aprovo', NULL, NULL, NULL, 'f2000002-0000-4000-8000-000000000004'::uuid, pg_catalog.now());
END
$$;

SELECT is(
  (
    SELECT t.estado || '|vigente=' || f.trecho_vigente_id::text
    FROM public.trechos t
    JOIN public.feiras f ON f.id = t.feira_id
    WHERE t.id = pg_catalog.current_setting('teste.prop2_id', true)::uuid
  ),
  'aberta|vigente=00000000-0000-4000-8000-000000000049',
  'Critério 2.1: 3 aprovações remotas (0 presentes) não aprovam a proposta'
);

-- 20. Votante 1 reenvia seu voto agora com presença declarada (ON CONFLICT DO UPDATE):
--     passa a ter 3 aprovo elegíveis (1 presente + 2 remotos) -> aprova, substitui anterior e sincroniza pub_*
DO $$
DECLARE
  v_prop_id uuid := pg_catalog.current_setting('teste.prop2_id', true)::uuid;
  v_res jsonb;
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000021', true);
  v_res := public.votar_trecho(
    v_prop_id,
    'aprovo',
    -22.923807,
    -43.259737,
    10.0,
    'f2000002-0000-4000-8000-000000000005'::uuid,
    pg_catalog.now()
  );
  PERFORM pg_catalog.set_config('teste.aprov_res', (v_res ->> 'codigo') || ':' || (v_res ->> 'estado'), true);
END
$$;

SELECT is(
  (
    SELECT pg_catalog.current_setting('teste.aprov_res', true)
      || '|anterior=' || (SELECT t.estado FROM public.trechos t WHERE t.id = '00000000-0000-4000-8000-000000000049'::uuid)
      || '|novo=' || (SELECT t.estado || ':' || (t.fechado_em IS NOT NULL)::text FROM public.trechos t WHERE t.id = pg_catalog.current_setting('teste.prop2_id', true)::uuid)
      || '|pub_feira_vig=' || (SELECT (pf.trecho_vigente_id = pg_catalog.current_setting('teste.prop2_id', true)::uuid)::text FROM public.pub_feiras pf WHERE pf.id = '49')
      || '|pub_trecho_vig=' || (SELECT pg_catalog.count(*)::text FROM public.pub_trechos pt WHERE pt.id = pg_catalog.current_setting('teste.prop2_id', true)::uuid AND pt.estado = 'aprovada')
  ),
  'ok:aprovada|anterior=substituida|novo=aprovada:true|pub_feira_vig=true|pub_trecho_vig=1',
  'Critério 2.2: 3 aprovações elegíveis (1 presente + 2 remotos) aprovam a proposta, marcam o anterior como substituida e atualizam pub_feiras/pub_trechos'
);

-- 21. Critério 16: Depois de a proposta virar aprovada, um voto a mais devolve encerrada e o estado não muda de novo
DO $$
DECLARE
  v_prop_id uuid := pg_catalog.current_setting('teste.prop2_id', true)::uuid;
  v_res jsonb;
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000024', true);
  v_res := public.votar_trecho(
    v_prop_id,
    'nego',
    -22.923250,
    -43.260100,
    10.0,
    'f2000016-0000-4000-8000-000000000001'::uuid,
    pg_catalog.now()
  );
  PERFORM pg_catalog.set_config('teste.voto_pos_aprov', v_res ->> 'codigo', true);
END
$$;

SELECT is(
  pg_catalog.current_setting('teste.voto_pos_aprov', true)
    || ':' || (SELECT t.estado FROM public.trechos t WHERE t.id = pg_catalog.current_setting('teste.prop2_id', true)::uuid),
  'encerrada:aprovada',
  'Critério 16.1: voto adicional após proposta aprovada devolve encerrada e não altera o estado'
);

-- =============================================================================
-- CRITÉRIO 4 (parte 2): admin.reverter_trecho e admin.v_propostas_abertas
-- =============================================================================

-- 22. admin.reverter_trecho volta para versão anterior e cancela proposta aberta; anon/authenticated não têm acesso
DO $$
DECLARE
  v_prop_aberta jsonb;
  v_prop_aberta_id uuid;
  v_rev jsonb;
BEGIN
  -- Autor 3 abre uma nova proposta na feira 49
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000003', true);
  v_prop_aberta := public.propor_trecho(
    '49',
    '[[-22.923600, -43.260000], [-22.923600, -43.261400]]'::jsonb,
    'outro',
    'f2000004-0000-4000-8000-000000000010'::uuid,
    pg_catalog.now(),
    -22.923250,
    -43.260100,
    10.0
  );
  v_prop_aberta_id := (v_prop_aberta ->> 'proposta_id')::uuid;
  PERFORM pg_catalog.set_config('teste.prop_cancelar_id', v_prop_aberta_id::text, true);

  -- Admin reverte a feira 49 de volta para o trecho curado original
  v_rev := admin.reverter_trecho('49', '00000000-0000-4000-8000-000000000049'::uuid);
  PERFORM pg_catalog.set_config('teste.rev_codigo', v_rev ->> 'codigo', true);
END
$$;

SELECT is(
  (
    SELECT pg_catalog.current_setting('teste.rev_codigo', true)
      || '|vigente=' || (SELECT f.trecho_vigente_id::text FROM public.feiras f WHERE f.id = '49')
      || '|curado=' || (SELECT t.estado FROM public.trechos t WHERE t.id = '00000000-0000-4000-8000-000000000049'::uuid)
      || '|substituido=' || (SELECT t.estado FROM public.trechos t WHERE t.id = pg_catalog.current_setting('teste.prop2_id', true)::uuid)
      || '|cancelada=' || (SELECT t.estado FROM public.trechos t WHERE t.id = pg_catalog.current_setting('teste.prop_cancelar_id', true)::uuid)
      || '|pub_abertas=' || (SELECT pg_catalog.count(*)::text FROM public.pub_trechos pt WHERE pt.feira_id = '49' AND pt.estado = 'aberta')
  ),
  'ok|vigente=00000000-0000-4000-8000-000000000049|curado=aprovada|substituido=substituida|cancelada=cancelada|pub_abertas=0',
  'Critério 4.3: admin.reverter_trecho restaura versão anterior, cancela proposta aberta e sincroniza pub_trechos'
);

-- 23. Papel authenticated não pode executar admin.reverter_trecho nem ler admin.v_propostas_abertas
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT admin.reverter_trecho('49', '00000000-0000-4000-8000-000000000049'::uuid)$$,
  '42501',
  NULL,
  'Critério 4.4: papel authenticated recebe 42501 ao chamar admin.reverter_trecho'
);
SELECT throws_ok(
  $$SELECT * FROM admin.v_propostas_abertas$$,
  '42501',
  NULL,
  'Critério 4.5: papel authenticated recebe 42501 ao consultar admin.v_propostas_abertas'
);
RESET ROLE;

-- =============================================================================
-- CRITÉRIO 14: Voto congelado no instante do voto (23 h -> não elegível;
--              aos 25 h continua ignorado; novo voto após 24 h conta)
-- =============================================================================

-- 24. Aparelho com 23 h vota aprovo (elegivel = false); mesmo após passar para 25 h + 2 votos elegíveis (1 presente), não aprova
DO $$
DECLARE
  v_prop_id uuid;
BEGIN
  -- Proposta aberta na feira f2_aux_1 (criada no teste 18)
  SELECT t.id INTO v_prop_id
  FROM public.trechos t
  WHERE t.feira_id = 'f2_aux_1' AND t.estado = 'aberta'
  LIMIT 1;
  PERFORM pg_catalog.set_config('teste.prop_congelado_id', v_prop_id::text, true);

  -- Aparelho de 23 h vota 'aprovo' com presença
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000011', true);
  PERFORM public.votar_trecho(
    v_prop_id,
    'aprovo',
    -22.923883,
    -43.260929,
    10.0,
    'f2000014-0000-4000-8000-000000000001'::uuid,
    pg_catalog.now()
  );

  -- Avança a idade do aparelho para 25 h (simulando a passagem de 2 horas)
  UPDATE auth.users
  SET created_at = pg_catalog.now() - interval '25 hours'
  WHERE id = '33333333-3333-4333-8333-000000000011'::uuid;

  -- Mais 2 aparelhos maduros (>= 24 h) votam 'aprovo' (1 presente, 1 remoto)
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000021', true);
  PERFORM public.votar_trecho(
    v_prop_id,
    'aprovo',
    -22.923883,
    -43.260929,
    10.0,
    'f2000014-0000-4000-8000-000000000002'::uuid,
    pg_catalog.now()
  );

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000022', true);
  PERFORM public.votar_trecho(
    v_prop_id,
    'aprovo',
    NULL,
    NULL,
    NULL,
    'f2000014-0000-4000-8000-000000000003'::uuid,
    pg_catalog.now()
  );
END
$$;

SELECT is(
  (
    SELECT
      (SELECT v.elegivel::text FROM public.votos v WHERE v.alvo_id = pg_catalog.current_setting('teste.prop_congelado_id', true) AND v.device_id = '33333333-3333-4333-8333-000000000011'::uuid)
      || ':' ||
      (SELECT t.estado FROM public.trechos t WHERE t.id = pg_catalog.current_setting('teste.prop_congelado_id', true)::uuid)
  ),
  'false:aberta',
  'Critério 14.1: voto feito aos 23 h fica congelado com elegivel = false e continua ignorado quando o aparelho chega a 25 h'
);

-- 25. O mesmo aparelho (agora com 25 h) vota novamente -> atualiza elegivel = true via ON CONFLICT DO UPDATE e aprova a proposta
DO $$
DECLARE
  v_prop_id uuid := pg_catalog.current_setting('teste.prop_congelado_id', true)::uuid;
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000011', true);
  PERFORM public.votar_trecho(
    v_prop_id,
    'aprovo',
    NULL,
    NULL,
    NULL,
    'f2000014-0000-4000-8000-000000000004'::uuid,
    pg_catalog.now()
  );
END
$$;

SELECT is(
  (
    SELECT
      (SELECT v.elegivel::text FROM public.votos v WHERE v.alvo_id = pg_catalog.current_setting('teste.prop_congelado_id', true) AND v.device_id = '33333333-3333-4333-8333-000000000011'::uuid)
      || ':' ||
      (SELECT t.estado FROM public.trechos t WHERE t.id = pg_catalog.current_setting('teste.prop_congelado_id', true)::uuid)
  ),
  'true:aprovada',
  'Critério 14.2: novo voto enviado após completar 24 h grava elegivel = true e contabiliza na aprovação'
);

-- =============================================================================
-- CRITÉRIO 5 e CRITÉRIO 16: Expiração após 14 dias (voto com 14d 1min e job parado
-- devolve encerrada; limpar_dados_expirados expira e sincroniza pub_trechos)
-- =============================================================================

-- 26. Critério 16: Voto em proposta com 14 dias e 1 min com o job parado (estado ainda 'aberta') -> encerrada
DO $$
DECLARE
  v_prop jsonb;
  v_prop_id uuid;
  v_voto jsonb;
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000002', true);
  v_prop := public.propor_trecho(
    'f2_aux_2',
    '[[-22.923300, -43.260200], [-22.923300, -43.261600]]'::jsonb,
    'rua_errada',
    'f2000005-0000-4000-8000-000000000001'::uuid,
    pg_catalog.now(),
    -22.923883,
    -43.260929,
    10.0
  );
  v_prop_id := (v_prop ->> 'proposta_id')::uuid;
  PERFORM pg_catalog.set_config('teste.prop_14d1m_id', v_prop_id::text, true);

  -- Retroage criado_em para 14 dias e 1 minuto atrás, mantendo estado = 'aberta' (job parado)
  UPDATE public.trechos
  SET criado_em = pg_catalog.now() - interval '14 days 1 minute'
  WHERE id = v_prop_id;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000021', true);
  v_voto := public.votar_trecho(
    v_prop_id,
    'aprovo',
    -22.923883,
    -43.260929,
    10.0,
    'f2000005-0000-4000-8000-000000000002'::uuid,
    pg_catalog.now()
  );
  PERFORM pg_catalog.set_config('teste.voto_14d1m_codigo', v_voto ->> 'codigo', true);
END
$$;

SELECT is(
  pg_catalog.current_setting('teste.voto_14d1m_codigo', true),
  'encerrada',
  'Critério 16.2: voto em proposta com 14 dias e 1 min e job parado devolve encerrada'
);

-- 27. Critério 5: Proposta aberta com > 14 dias sem quórum vira expirada ao rodar limpar_dados_expirados e sai de pub_trechos
DO $$
DECLARE
  v_prop jsonb;
  v_prop_id uuid;
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000003', true);
  v_prop := public.propor_trecho(
    'f2_aux_3',
    '[[-22.923300, -43.260200], [-22.923300, -43.261600]]'::jsonb,
    'outro',
    'f2000005-0000-4000-8000-000000000003'::uuid,
    pg_catalog.now(),
    -22.923883,
    -43.260929,
    10.0
  );
  v_prop_id := (v_prop ->> 'proposta_id')::uuid;
  PERFORM pg_catalog.set_config('teste.prop_exp_job_id', v_prop_id::text, true);

  UPDATE public.trechos
  SET criado_em = pg_catalog.now() - interval '14 days 5 minutes'
  WHERE id = v_prop_id;

  PERFORM private.limpar_dados_expirados();
END
$$;

SELECT is(
  (
    SELECT t.estado
      || '|fechado=' || (t.fechado_em IS NOT NULL)::text
      || '|em_pub=' || (SELECT pg_catalog.count(*)::text FROM public.pub_trechos pt WHERE pt.id = t.id)
    FROM public.trechos t
    WHERE t.id = pg_catalog.current_setting('teste.prop_exp_job_id', true)::uuid
  ),
  'expirada|fechado=true|em_pub=0',
  'Critério 5.1: proposta aberta há mais de 14 dias sem quórum vira expirada e sai de pub_trechos'
);

-- =============================================================================
-- SEÇÃO 8 e 10: Limite de 20 votos/dia e extensão de apagar_meus_dados()
-- =============================================================================

-- 28. Limite de 20 votos por aparelho por dia
DO $$
DECLARE
  v_prop jsonb;
  v_prop_id uuid;
  i integer;
  v_res jsonb;
BEGIN
  -- Cria uma proposta aberta na feira 49 usando um novo autor (>= 7 dias)
  INSERT INTO auth.users (id, created_at)
  VALUES ('33333333-3333-4333-8333-000000000099'::uuid, pg_catalog.now() - interval '10 days')
  ON CONFLICT (id) DO NOTHING;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000099', true);
  v_prop := public.propor_trecho(
    '49',
    '[[-22.923400, -43.260200], [-22.923400, -43.261600]]'::jsonb,
    'rua_errada',
    'f2000010-0000-4000-8000-000000000001'::uuid,
    pg_catalog.now(),
    -22.923807,
    -43.259737,
    10.0
  );
  v_prop_id := (v_prop ->> 'proposta_id')::uuid;
  PERFORM pg_catalog.set_config('teste.prop_20votos_id', v_prop_id::text, true);

  -- Cria um votante com 20 votos já registrados nas últimas 24 h
  INSERT INTO auth.users (id, created_at)
  VALUES ('33333333-3333-4333-8333-000000000088'::uuid, pg_catalog.now() - interval '5 days')
  ON CONFLICT (id) DO NOTHING;

  FOR i IN 1..20 LOOP
    INSERT INTO public.votos (
      tipo, alvo_id, device_id, voto, elegivel, presente, client_uuid, client_ts, criado_em
    ) VALUES (
      'trecho',
      'alvo-ficticio-' || i::text,
      '33333333-3333-4333-8333-000000000088'::uuid,
      'aprovo',
      true,
      false,
      ('f2000020-0000-4000-8000-' || pg_catalog.lpad(i::text, 12, '0'))::uuid,
      pg_catalog.now(),
      pg_catalog.now()
    );
  END LOOP;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000088', true);
  v_res := public.votar_trecho(
    v_prop_id,
    'aprovo',
    NULL,
    NULL,
    NULL,
    'f2000010-0000-4000-8000-000000000099'::uuid,
    pg_catalog.now()
  );
  PERFORM pg_catalog.set_config('teste.voto_21_codigo', v_res ->> 'codigo', true);
END
$$;

SELECT is(
  pg_catalog.current_setting('teste.voto_21_codigo', true),
  'limite',
  'Seção 10: 21º voto do mesmo aparelho no mesmo dia devolve limite'
);

-- 29. Seção 8: apagar_meus_dados() apaga voto em proposta aberta e anula device_id em proposta fechada
DO $$
DECLARE
  v_prop_aberta_id uuid := pg_catalog.current_setting('teste.prop_20votos_id', true)::uuid;
  v_prop_fechada_id uuid := pg_catalog.current_setting('teste.prop_congelado_id', true)::uuid;
BEGIN
  -- Votante 21 tem voto na proposta fechada (v_prop_fechada_id) e agora vota na proposta aberta (v_prop_aberta_id)
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000021', true);
  PERFORM public.votar_trecho(
    v_prop_aberta_id,
    'aprovo',
    NULL,
    NULL,
    NULL,
    'f2000008-0000-4000-8000-000000000001'::uuid,
    pg_catalog.now()
  );

  PERFORM public.apagar_meus_dados();
END
$$;

SELECT is(
  (
    SELECT
      'voto_aberto=' || (
        SELECT pg_catalog.count(*)::text
        FROM public.votos v
        WHERE v.alvo_id = pg_catalog.current_setting('teste.prop_20votos_id', true)
      )
      || '|voto_fechado_anon=' || (
        SELECT pg_catalog.count(*)::text
        FROM public.votos v
        WHERE v.alvo_id = pg_catalog.current_setting('teste.prop_congelado_id', true)
          AND v.device_id IS NULL
      )
  ),
  'voto_aberto=0|voto_fechado_anon=1',
  'Seção 8.1: apagar_meus_dados remove votos em propostas abertas e anula device_id em propostas fechadas'
);

-- 30. Seção 8: apagar_meus_dados() cancela proposta aberta do autor, anula autor_hash em propostas fechadas e sincroniza pub_trechos
DO $$
DECLARE
  v_hash_99 text;
  v_hash_01 text;
BEGIN
  v_hash_99 := private.hash_dispositivo('33333333-3333-4333-8333-000000000099'::uuid);
  v_hash_01 := private.hash_dispositivo('33333333-3333-4333-8333-000000000001'::uuid);
  PERFORM pg_catalog.set_config('teste.hash_99', v_hash_99, true);
  PERFORM pg_catalog.set_config('teste.hash_01', v_hash_01, true);

  -- Autor 99 tem proposta aberta na feira 49
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000099', true);
  PERFORM public.apagar_meus_dados();

  -- Autor 01 tem propostas fechadas (negada na 49 e aprovada na f2_aux_1)
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-000000000001', true);
  PERFORM public.apagar_meus_dados();
END
$$;

SELECT is(
  (
    SELECT
      'estado_aberta=' || (
        SELECT t.estado FROM public.trechos t WHERE t.id = pg_catalog.current_setting('teste.prop_20votos_id', true)::uuid
      )
      || '|hash_restantes=' || (
        SELECT pg_catalog.count(*)::text
        FROM public.trechos t
        WHERE t.autor_hash IN (
          pg_catalog.current_setting('teste.hash_99', true),
          pg_catalog.current_setting('teste.hash_01', true)
        )
      )
      || '|pub_aberta_49=' || (
        SELECT pg_catalog.count(*)::text
        FROM public.pub_trechos pt
        WHERE pt.id = pg_catalog.current_setting('teste.prop_20votos_id', true)::uuid
      )
  ),
  'estado_aberta=cancelada|hash_restantes=0|pub_aberta_49=0',
  'Seção 8.2: apagar_meus_dados cancela propostas abertas do autor, anula autor_hash nas fechadas e limpa pub_trechos'
);

SELECT * FROM finish();

ROLLBACK;
