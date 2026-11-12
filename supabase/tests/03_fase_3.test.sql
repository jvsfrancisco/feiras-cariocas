-- Fase 3a: critérios 8, 13 e 16; executado após as fases anteriores.
\pset tuples_only on
\pset format unaligned
BEGIN;
SELECT plan(81);

CREATE FUNCTION pg_temp.como(p_id uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',p_id::text,true);
  PERFORM pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub',p_id,'role','authenticated')::text,true);
END; $$;

CREATE TABLE pg_temp.cenarios(chave text PRIMARY KEY, id text NOT NULL);
DO $$
DECLARE v_dia smallint := pg_catalog.date_part('dow',pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::smallint;
BEGIN
  INSERT INTO auth.users(id,created_at) SELECT
    ('33333333-3333-4333-8333-' || pg_catalog.lpad(i::text,12,'0'))::uuid,
    pg_catalog.now() - interval '3 days' FROM pg_catalog.generate_series(1,9) i;
  UPDATE public.feiras SET dia = v_dia WHERE id = '49';
  PERFORM pg_temp.como('33333333-3333-4333-8333-000000000001');
END $$;

-- 1. Autor presente cria sugestão, ainda privada.
SELECT is(public.sugerir_feira('Feira do Poente','Rua do Poente','Santa Cruz',
  pg_catalog.date_part('dow',pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::smallint,
  '00:00','23:59',-22.75,-43.70,10,
  '33330000-0000-4000-8000-000000000001',pg_catalog.now())->>'codigo','ok',
  'Critério 8.1: autor presente cria sugestão');
INSERT INTO pg_temp.cenarios SELECT 'principal',id FROM public.feiras WHERE nome = 'Feira do Poente';
SELECT is((SELECT count(*)::integer FROM public.pub_sugestoes WHERE id =
  (SELECT id FROM pg_temp.cenarios WHERE chave = 'principal')),0,
  'Critério 8.2: sugestão sem apoio ainda não é pública');
SELECT is(pg_catalog.jsonb_array_length(public.minhas_sugestoes()),1,
  'Critério 8.3: autor vê a própria sugestão aguardando');
SELECT is(public.apoiar_sugestao((SELECT id FROM pg_temp.cenarios WHERE chave = 'principal'),
  'apoio',-22.75,-43.70,10,'33330000-0000-4000-8000-000000000002',pg_catalog.now())->>'codigo',
  'invalido','Critério 8.4: autor não vota');
SELECT is(public.confirmar((SELECT id FROM pg_temp.cenarios WHERE chave = 'principal'),
  'sim',-22.75,-43.70,10,'33330000-0000-4000-8000-000000000003',pg_catalog.now())->>'codigo',
  'invalido','Critério 8.5: confirmar recusa feira pendente');
SELECT is(public.propor_trecho((SELECT id FROM pg_temp.cenarios WHERE chave = 'principal'),
  '[[-22.75,-43.70],[-22.7505,-43.70]]'::jsonb,'outro',
  '33330000-0000-4000-8000-000000000004',pg_catalog.now(),-22.75,-43.70,10)->>'codigo',
  'invalido','Critério 8.6: propor_trecho recusa feira pendente');

DO $$ BEGIN PERFORM pg_temp.como('33333333-3333-4333-8333-000000000002'); END $$;
SELECT is(public.apoiar_sugestao((SELECT id FROM pg_temp.cenarios WHERE chave = 'principal'),
  'apoio',-22.75,-43.70,10,'33330000-0000-4000-8000-000000000005',pg_catalog.now())->>'estado',
  'pendente','Critério 8.7: primeiro apoio presente ainda deixa pendente');
SELECT is((SELECT count(*)::integer FROM public.pub_sugestoes WHERE id =
  (SELECT id FROM pg_temp.cenarios WHERE chave = 'principal')),1,
  'Critério 8.8: um apoio presente publica para outros');
SELECT is((SELECT count(*)::integer FROM public.pub_feiras WHERE id =
  (SELECT id FROM pg_temp.cenarios WHERE chave = 'principal')),0,
  'Critério 8.9: ainda não entra em pub_feiras');
DO $$ BEGIN PERFORM pg_temp.como('33333333-3333-4333-8333-000000000003'); END $$;
SELECT is(public.apoiar_sugestao((SELECT id FROM pg_temp.cenarios WHERE chave = 'principal'),
  'apoio',NULL,NULL,NULL,'33330000-0000-4000-8000-000000000006',pg_catalog.now())->>'estado',
  'pendente','Critério 8.10: dois apoios não ativam');
DO $$ BEGIN PERFORM pg_temp.como('33333333-3333-4333-8333-000000000004'); END $$;
SELECT is(public.apoiar_sugestao((SELECT id FROM pg_temp.cenarios WHERE chave = 'principal'),
  'apoio',NULL,NULL,NULL,'33330000-0000-4000-8000-000000000007',pg_catalog.now())->>'estado',
  'ativa','Critério 8.11: três apoios elegíveis ativam');
SELECT is((SELECT count(*)::integer FROM public.pub_feiras WHERE id =
  (SELECT id FROM pg_temp.cenarios WHERE chave = 'principal')),1,
  'Critério 8.12: ativada entra em pub_feiras');
SELECT is((SELECT count(*)::integer FROM public.pub_sugestoes WHERE id =
  (SELECT id FROM pg_temp.cenarios WHERE chave = 'principal')),0,
  'Critério 8.13: ativada sai de pub_sugestoes');
DO $$ BEGIN PERFORM pg_temp.como('33333333-3333-4333-8333-000000000001'); END $$;
SELECT is(public.sugerir_feira('Feira Vizinha','Rua Vizinha','Santa Cruz',
  pg_catalog.date_part('dow',pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::smallint,
  '00:00','23:59',-22.7491,-43.70,10,
  '33330000-0000-4000-8000-000000000008',pg_catalog.now())->>'codigo','duplicado',
  'Critério 8.14: duplicata a 100 m é recusada');

-- 15-17: limpeza e denúncia com o motor genérico de votos.
INSERT INTO public.feiras(id,nome,endereco,bairro,dia,inicio,fim,lat,lng,coord_precisa,status,origem,
  autor_hash,ponto_candidato,criado_em)
VALUES ('teste_expirada_3','Feira Velha','Rua Velha','Santa Cruz',0,'07:00','13:00',
  -22.76,-43.69,true,'pendente','comunidade',private.hash_dispositivo('33333333-3333-4333-8333-000000000001'),
  extensions.ST_SetSRID(extensions.ST_MakePoint(-43.69,-22.76),4326)::extensions.geography,
  pg_catalog.now() - interval '31 days');
SELECT is((SELECT count(*)::integer FROM public.feiras WHERE id = 'teste_expirada_3'),1,
  'Critério 8.15: cenário pendente vencido existe antes da limpeza');
SELECT private.limpar_dados_expirados();
SELECT is((SELECT count(*)::integer FROM public.feiras WHERE id = 'teste_expirada_3'),0,
  'Critério 8.16: pendente há 30 dias some no job');

SELECT is(public.sugerir_feira('Feira das Dunas','Rua das Dunas','Santa Cruz',
  pg_catalog.date_part('dow',pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::smallint,
  '00:00','23:59',-22.78,-43.72,10,
  '33330000-0000-4000-8000-000000000009',pg_catalog.now())->>'codigo','ok',
  'Critério 8.17: cria cenário para denúncias');
INSERT INTO pg_temp.cenarios SELECT 'denuncia',id FROM public.feiras WHERE nome = 'Feira das Dunas';
DO $$ BEGIN PERFORM pg_temp.como('33333333-3333-4333-8333-000000000002'); END $$;
SELECT is(public.denunciar_sugestao((SELECT id FROM pg_temp.cenarios WHERE chave = 'denuncia'),
  '33330000-0000-4000-8000-000000000010',pg_catalog.now())->>'codigo','ok',
  'Critério 8.18: primeira denúncia registrada');
SELECT is(public.denunciar_sugestao((SELECT id FROM pg_temp.cenarios WHERE chave = 'denuncia'),
  '33330000-0000-4000-8000-000000000011',pg_catalog.now())->>'codigo','ok',
  'Critério 8.19: segunda denúncia do mesmo aparelho é idempotente');
SELECT is(public.denunciar_sugestao((SELECT id FROM pg_temp.cenarios WHERE chave = 'denuncia'),
  '33330000-0000-4000-8000-000000000019',pg_catalog.now())->>'codigo','ok',
  'Critério 8.19b: terceira denúncia do mesmo aparelho é idempotente');
SELECT is((SELECT count(*)::integer FROM public.votos WHERE tipo = 'denuncia_sugestao'
  AND alvo_id = (SELECT id FROM pg_temp.cenarios WHERE chave = 'denuncia')),1,
  'Critério 8.20: mesmo aparelho conta uma vez');
DO $$ BEGIN PERFORM pg_temp.como('33333333-3333-4333-8333-000000000003'); END $$;
SELECT is(public.denunciar_sugestao((SELECT id FROM pg_temp.cenarios WHERE chave = 'denuncia'),
  '33330000-0000-4000-8000-000000000012',pg_catalog.now())->>'codigo','ok',
  'Critério 8.21: segundo aparelho denuncia');
DO $$ BEGIN PERFORM pg_temp.como('33333333-3333-4333-8333-000000000004'); END $$;
SELECT is(public.denunciar_sugestao((SELECT id FROM pg_temp.cenarios WHERE chave = 'denuncia'),
  '33330000-0000-4000-8000-000000000013',pg_catalog.now())->>'codigo','ok',
  'Critério 8.22: terceiro aparelho denuncia');
SELECT is((SELECT status FROM public.feiras WHERE id =
  (SELECT id FROM pg_temp.cenarios WHERE chave = 'denuncia')),'oculta',
  'Critério 8.23: três aparelhos distintos ocultam');

-- 24-27: normalização e bloqueio; o texto recusado nunca é persistido.
DO $$ BEGIN PERFORM pg_temp.como('33333333-3333-4333-8333-000000000006'); END $$;
SELECT is(public.sugerir_feira('p0rr4','Rua Teste','Santa Cruz',0::smallint,'00:00','23:59',-22.79,-43.73,10,
  '33330000-0000-4000-8000-000000000014',pg_catalog.now())->>'codigo','texto_proibido',
  'Critério 13.1: leetspeak p0rr4 barrado');
SELECT is(public.sugerir_feira('p o r r a','Rua Teste','Santa Cruz',0::smallint,'00:00','23:59',-22.79,-43.73,10,
  '33330000-0000-4000-8000-000000000015',pg_catalog.now())->>'codigo','texto_proibido',
  'Critério 13.2: letras separadas barradas');
SELECT is(public.sugerir_feira('pooorra','Rua Teste','Santa Cruz',0::smallint,'00:00','23:59',-22.79,-43.73,10,
  '33330000-0000-4000-8000-000000000016',pg_catalog.now())->>'codigo','texto_proibido',
  'Critério 13.3: letras repetidas barradas');
SELECT is(private.dispositivo_bloqueado('33333333-3333-4333-8333-000000000006'),true,
  'Critério 13.4: três incidentes em 24 h bloqueiam por 7 dias');
SELECT is((SELECT bloqueado_ate > pg_catalog.now() + interval '6 days' FROM private.dispositivos_bloqueados
  WHERE device_hash = private.hash_dispositivo('33333333-3333-4333-8333-000000000006')),true,
  'Critério 13.5: bloqueio temporário dura 7 dias');
SELECT is(public.sugerir_feira('Feira Limpa','Rua Teste','Santa Cruz',0::smallint,'00:00','23:59',-22.79,-43.73,10,
  '33330000-0000-4000-8000-000000000017',pg_catalog.now())->>'codigo','bloqueado',
  'Critério 13.6: escrita seguinte devolve bloqueado');
UPDATE private.incidentes_ofensa SET criado_em = pg_catalog.now() - interval '91 days',
  expira_em = pg_catalog.now() - interval '1 day'
  WHERE device_hash = private.hash_dispositivo('33333333-3333-4333-8333-000000000006');
SELECT private.limpar_dados_expirados();
DO $$ BEGIN
  FOR i IN 1..7 LOOP PERFORM private.texto_proibido('p0rr4'); END LOOP;
END $$;
SELECT is((SELECT total_incidentes FROM private.dispositivos_bloqueados
  WHERE device_hash = private.hash_dispositivo('33333333-3333-4333-8333-000000000006')),10,
  'Critério 13.6b: contagem total sobrevive à janela de 24 h');
SELECT is((SELECT permanente FROM private.dispositivos_bloqueados
  WHERE device_hash = private.hash_dispositivo('33333333-3333-4333-8333-000000000006')),true,
  'Critério 13.6c: dez incidentes dão bloqueio permanente');
SELECT is(public.apagar_meus_dados()->>'codigo','ok',
  'Seção 8.0: titular bloqueado consegue apagar os dados');
SELECT is((SELECT device_id IS NULL AND expira_em > pg_catalog.now() + interval '89 days'
  FROM private.dispositivos_bloqueados WHERE device_hash =
  private.hash_dispositivo('33333333-3333-4333-8333-000000000006')),true,
  'Seção 8.0b: bloqueio fica só com hash por 90 dias após exclusão');
DO $$ BEGIN PERFORM pg_temp.como('33333333-3333-4333-8333-000000000007'); END $$;
SELECT is(public.sugerir_feira(U&'p\043Erra','Rua Teste','Santa Cruz',0::smallint,'00:00','23:59',-22.79,-43.73,10,
  '33330000-0000-4000-8000-000000000018',pg_catalog.now())->>'codigo','texto_proibido',
  'Critério 13.7: homóglifo cirílico misturado barrado');

-- Todo texto/jsonb de tabelas e visões do app é percorrido, sem procurar só em feiras.
CREATE FUNCTION pg_temp.sem_texto_recusado(p_texto text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v_col record; v_achou boolean;
BEGIN
  FOR v_col IN SELECT n.nspname, c.relname, a.attname
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
      AND c.relkind IN ('r','p')
      AND a.attnum > 0 AND NOT a.attisdropped AND a.atttypid IN ('text'::regtype,'jsonb'::regtype)
  LOOP
    EXECUTE pg_catalog.format('SELECT EXISTS (SELECT 1 FROM %I.%I WHERE %I::text LIKE %L)',
      v_col.nspname,v_col.relname,v_col.attname,'%' || p_texto || '%') INTO v_achou;
    IF v_achou THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END; $$;
SELECT is(pg_temp.sem_texto_recusado('p0rr4') AND pg_temp.sem_texto_recusado('p o r r a')
  AND pg_temp.sem_texto_recusado('pooorra') AND pg_temp.sem_texto_recusado(U&'p\043Erra'),true,
  'Critério 13.8: texto recusado ausente de toda coluna texto/jsonb do app');
SELECT is((SELECT count(*)::integer FROM private.incidentes_ofensa WHERE
  device_hash = private.hash_dispositivo('33333333-3333-4333-8333-000000000006')),7,
  'Critério 13.9: incidentes ficam por 90 dias sem texto recusado');
SELECT is(ARRAY(SELECT private.texto_proibido(x) FROM unnest(ARRAY[
  'Rua Mearim','Cascadura','Rua Sacadura Cabral','Rua Bom Pastor',
  'Rua Cuba','Rua Conde de Bonfim','Rua Pirapora','Praça Saens Peña']) x),
  ARRAY[false,false,false,false,false,false,false,false],
  'Critério 13.10: oito nomes reais de rua e bairro passam');
SELECT is(private.texto_proibido('Ligue 21 99999-9999'),true,
  'Critério 13.11: telefone com separadores é barrado');
SELECT is(private.texto_proibido('Acesse feira.example.com'),true,
  'Critério 13.12: domínio com ponto é barrado');
SELECT is(private.texto_proibido('www.exemplo.com'),true,
  'Critério 13.13: www é barrado');
SELECT is(private.texto_proibido('www'),true,
  'Critério 13.14: marcador www isolado é barrado');
SELECT is(private.texto_proibido('po.rra'),true,
  'Critério 13.15: ponto dentro da palavra é removido');
SELECT is(private.texto_proibido('p-o_r.r.a'),true,
  'Critério 13.16: hífen e sublinhado dentro da palavra são removidos');

-- Apagar: pendente do autor sai; ativa conserva a feira, sem autor.
DO $$ BEGIN PERFORM pg_temp.como('33333333-3333-4333-8333-000000000001'); END $$;
SELECT is(public.sugerir_feira('Feira para apagar','Rua para apagar','Santa Cruz',
  pg_catalog.date_part('dow',pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::smallint,
  '00:00','23:59',-22.80,-43.75,10,
  '33330000-0000-4000-8000-000000000020',pg_catalog.now())->>'codigo','ok',
  'Seção 8.1: cria pendente que o autor vai apagar');
INSERT INTO pg_temp.cenarios SELECT 'apagar',id FROM public.feiras WHERE nome = 'Feira para apagar';
SELECT is(public.apagar_meus_dados()->>'codigo','ok','Seção 8.2: apagar_meus_dados conclui');
SELECT is((SELECT count(*)::integer FROM public.feiras WHERE id =
  (SELECT id FROM pg_temp.cenarios WHERE chave = 'apagar')),0,
  'Seção 8.3: pendente do aparelho é apagada');
SELECT is((SELECT autor_hash IS NULL FROM public.feiras WHERE id =
  (SELECT id FROM pg_temp.cenarios WHERE chave = 'principal')),true,
  'Seção 8.4: feira ativa permanece sem autor');

-- Uma feira ativada também pode ser ocultada por denúncias distintas.
DO $$ BEGIN PERFORM pg_temp.como('33333333-3333-4333-8333-000000000002'); END $$;
SELECT is(public.denunciar_sugestao((SELECT id FROM pg_temp.cenarios WHERE chave = 'principal'),
  '33330000-0000-4000-8000-000000000021',pg_catalog.now())->>'codigo','ok',
  'Critério 8.24: feira ativada aceita denúncia');
DO $$ BEGIN PERFORM pg_temp.como('33333333-3333-4333-8333-000000000003'); END $$;
SELECT is(public.denunciar_sugestao((SELECT id FROM pg_temp.cenarios WHERE chave = 'principal'),
  '33330000-0000-4000-8000-000000000022',pg_catalog.now())->>'codigo','ok',
  'Critério 8.25: segundo aparelho denuncia feira ativada');
DO $$ BEGIN PERFORM pg_temp.como('33333333-3333-4333-8333-000000000004'); END $$;
SELECT is(public.denunciar_sugestao((SELECT id FROM pg_temp.cenarios WHERE chave = 'principal'),
  '33330000-0000-4000-8000-000000000023',pg_catalog.now())->>'codigo','ok',
  'Critério 8.26: terceiro aparelho denuncia feira ativada');
SELECT is((SELECT count(*)::integer FROM public.pub_feiras WHERE id =
  (SELECT id FROM pg_temp.cenarios WHERE chave = 'principal')),0,
  'Critério 8.27: feira oculta sai de pub_feiras');

-- Voto em sugestão guarda a elegibilidade no instante, mesmo após o aparelho amadurecer.
INSERT INTO auth.users(id,created_at) VALUES
  ('33333333-3333-4333-8333-000000000010',pg_catalog.now() - interval '23 hours');
DO $$ BEGIN PERFORM pg_temp.como('33333333-3333-4333-8333-000000000005'); END $$;
SELECT is(public.sugerir_feira('Feira do Voto Novo','Rua Nova','Santa Cruz',
  pg_catalog.date_part('dow',pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::smallint,
  '00:00','23:59',-22.81,-43.77,10,
  '33330000-0000-4000-8000-000000000024',pg_catalog.now())->>'codigo','ok',
  'Critério 14.1: cria sugestão para voto de aparelho novo');
INSERT INTO pg_temp.cenarios SELECT 'congelado',id FROM public.feiras WHERE nome = 'Feira do Voto Novo';
DO $$ BEGIN PERFORM pg_temp.como('33333333-3333-4333-8333-000000000010'); END $$;
SELECT is(public.apoiar_sugestao((SELECT id FROM pg_temp.cenarios WHERE chave = 'congelado'),
  'apoio',-22.81,-43.77,10,'33330000-0000-4000-8000-000000000025',pg_catalog.now())->>'codigo',
  'ok','Critério 14.2: apoio de aparelho com 23 h é gravado');
SELECT is((SELECT elegivel FROM public.votos WHERE tipo = 'sugestao' AND alvo_id =
  (SELECT id FROM pg_temp.cenarios WHERE chave = 'congelado')),false,
  'Critério 14.3: voto de 23 h fica inelegível');
UPDATE auth.users SET created_at = pg_catalog.now() - interval '25 hours'
  WHERE id = '33333333-3333-4333-8333-000000000010';
SELECT is((SELECT elegivel FROM public.votos WHERE tipo = 'sugestao' AND alvo_id =
  (SELECT id FROM pg_temp.cenarios WHERE chave = 'congelado')),false,
  'Critério 14.4: voto permanece inelegível aos 25 h');

-- A varredura não tem aparelho autenticado, portanto não registra incidente.
SELECT pg_catalog.set_config('request.jwt.claim.sub','',true);
SELECT pg_catalog.set_config('request.jwt.claims','{}',true);
SELECT is((SELECT count(*)::integer FROM public.feiras f
  CROSS JOIN LATERAL (VALUES (f.endereco), (f.bairro), (f.ra)) AS campo(texto)
  WHERE campo.texto IS NOT NULL AND private.texto_proibido(campo.texto)),0,
  'Filtro: nenhum endereço, bairro ou RA de feiras é barrado');

SELECT is(private.texto_proibido('Av.Brasil'),false,'Filtro: Av.Brasil permitido');
SELECT is(private.texto_proibido('R.Dias da Cruz'),false,'Filtro: R.Dias da Cruz permitido');
SELECT is(private.texto_proibido('Pça.XV de Novembro'),false,'Filtro: Pça.XV de Novembro permitido');
SELECT is(private.texto_proibido('Estr. dos Bandeirantes'),false,'Filtro: Estr. dos Bandeirantes permitido');
SELECT is(private.texto_proibido('Rua Ponta Porã'),false,'Filtro: Rua Ponta Porã permitido');
SELECT is(private.texto_proibido('Rua Cuba'),false,'Filtro: Rua Cuba permitido');
SELECT is(private.texto_proibido('Rua Pirapora'),false,'Filtro: Rua Pirapora permitido');
SELECT is(private.texto_proibido('Cascadura'),false,'Filtro: Cascadura permitido');
SELECT is(private.texto_proibido('Rua Sacadura Cabral'),false,'Filtro: Rua Sacadura Cabral permitido');
SELECT is(private.texto_proibido('Feira do Cachambi'),false,'Filtro: Feira do Cachambi permitido');
SELECT is(private.texto_proibido('Estrada do Cacuia'),false,'Filtro: Estrada do Cacuia permitido');
SELECT is(private.texto_proibido('Rua Matarazzo'),false,'Filtro: palavra permitida com termo longo');

SELECT is(private.texto_proibido('feiradaporra'),true,'Filtro: ofensa dentro de palavra barrada');
SELECT is(private.texto_proibido('fdp'),true,'Filtro: fdp barrado');
SELECT is(private.texto_proibido('f.d.p'),true,'Filtro: f.d.p barrado');
SELECT is(private.texto_proibido('vai tomar no cu'),true,'Filtro: expressão tomar no cu barrada');
SELECT is(private.texto_proibido('c u z a o'),true,'Filtro: letras de cuzao separadas barradas');
SELECT is(private.texto_proibido('p0rr4'),true,'Filtro: leetspeak barrado');
SELECT is(private.texto_proibido('p o r r a'),true,'Filtro: letras de porra separadas barradas');
SELECT is(private.texto_proibido('pooorra'),true,'Filtro: letras repetidas barradas');
SELECT is(private.texto_proibido(U&'p\043Erra'),true,'Filtro: homóglifo cirílico barrado');
SELECT is(private.texto_proibido('feira.com.br'),true,'Filtro: domínio barrado');
SELECT is(private.texto_proibido('www feira'),true,'Filtro: www separado barrado');
SELECT is(private.texto_proibido('(21) 99999-8888'),true,'Filtro: telefone com separadores barrado');

SELECT * FROM finish();
ROLLBACK;
