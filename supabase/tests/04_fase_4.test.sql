\pset tuples_only on
\pset format unaligned
BEGIN;
SELECT plan(30);

CREATE FUNCTION pg_temp.como(p_id uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',p_id::text,true);
  PERFORM pg_catalog.set_config('request.jwt.claims',pg_catalog.jsonb_build_object('sub',p_id,'role','authenticated')::text,true);
  PERFORM pg_catalog.set_config('request.headers',pg_catalog.jsonb_build_object(
    'x-foto-edge-secret',(SELECT valor FROM private.segredos WHERE chave='foto_edge_secret'))::text,true);
END; $$;

INSERT INTO auth.users(id,created_at) VALUES
  ('44444444-4444-4444-8444-000000000001',pg_catalog.now()-interval '2 days'),
  ('44444444-4444-4444-8444-000000000002',pg_catalog.now()-interval '10 days'),
  ('44444444-4444-4444-8444-000000000003',pg_catalog.now()-interval '10 days'),
  ('44444444-4444-4444-8444-000000000004',pg_catalog.now()-interval '10 days');
INSERT INTO public.feiras(id,endereco,bairro,dia,inicio,fim,lat,lng,coord_precisa,status,origem)
SELECT 'foto'||i,'Rua Foto','Grajaú',pg_catalog.date_part('dow',pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::smallint,
  '00:00','23:59',-22.923883,-43.260929,true,'ativa','prefeitura'
FROM pg_catalog.generate_series(1,3) i;

SELECT pg_temp.como('44444444-4444-4444-8444-000000000001');
SELECT is(public.pedir_upload_foto('foto1',-22.923883,-43.260929,10,'44440000-0000-4000-8000-000000000001',pg_catalog.now())->>'codigo','ok','4.1 primeira reserva presente');
SELECT is(public.registrar_promocao_foto((SELECT id FROM private.fotos WHERE client_uuid='44440000-0000-4000-8000-000000000001'),
  '44444444-4444-4444-8444-000000000001')->>'estado','revisao','4.2 aparelho de 2 dias vai à revisão');
SELECT is((SELECT count(*)::integer FROM public.pub_fotos),0,'15.1 revisão não entra em pub_fotos');

-- Quatro fotos jovens: todas em revisão, escolha restritiva para a 4ª.
DO $$ DECLARE i integer; v jsonb; BEGIN
  FOR i IN 2..4 LOOP
    v := public.pedir_upload_foto('foto'||CASE WHEN i <= 3 THEN 1 ELSE 2 END,-22.923883,-43.260929,10,
      ('44440000-0000-4000-8000-'||pg_catalog.lpad(i::text,12,'0'))::uuid,pg_catalog.now());
    PERFORM public.registrar_promocao_foto((v->>'foto_id')::uuid,'44444444-4444-4444-8444-000000000001');
  END LOOP;
END $$;
SELECT is((SELECT count(*)::integer FROM private.fotos WHERE device_id='44444444-4444-4444-8444-000000000001' AND estado='revisao'),4,'9.1 4ª foto jovem continua em revisão');

SELECT is(public.pedir_upload_foto('foto2',-22.923883,-43.260929,10,'44440000-0000-4000-8000-000000000005',pg_catalog.now())->>'codigo','ok','9.2 quinto upload diário aceito');
SELECT is(public.pedir_upload_foto('foto3',-22.923883,-43.260929,10,'44440000-0000-4000-8000-000000000006',pg_catalog.now())->>'codigo','limite','9.3 sexto upload diário recusado');

-- Limite visível e arquivamento, sem depender dos limites de reserva neste cenário.
INSERT INTO private.fotos(id,feira_id,device_id,estado,caminho,caminho_mini,client_uuid,criado_em)
SELECT ('44441000-0000-4000-8000-'||pg_catalog.lpad(i::text,12,'0'))::uuid,'foto3',
 '44444444-4444-4444-8444-000000000002','fila',
 '44444444-4444-4444-8444-000000000002/'||i||'.jpg',
 '44444444-4444-4444-8444-000000000002/'||i||'_mini.jpg',
 ('44442000-0000-4000-8000-'||pg_catalog.lpad(i::text,12,'0'))::uuid,
 pg_catalog.now()-pg_catalog.make_interval(secs => 30-i)
FROM pg_catalog.generate_series(1,13) i;
DO $$ DECLARE i integer; BEGIN
  FOR i IN 1..13 LOOP
    PERFORM public.registrar_promocao_foto(('44441000-0000-4000-8000-'||pg_catalog.lpad(i::text,12,'0'))::uuid,
      '44444444-4444-4444-8444-000000000002');
  END LOOP;
END $$;
SELECT is((SELECT count(*)::integer FROM public.pub_fotos WHERE feira_id='foto3'),12,'4.3 no máximo 12 fotos públicas');
SELECT ok((SELECT bool_and(caminho !~ '/') FROM public.pub_fotos WHERE feira_id='foto3'),'11.1 caminho público não revela o aparelho');
SELECT is((SELECT count(*)::integer FROM private.fotos WHERE feira_id='foto3' AND estado='arquivada'),1,'4.4 mais antiga arquivada');
SELECT is((SELECT estado FROM private.fotos WHERE id='44441000-0000-4000-8000-000000000001'),'arquivada','4.5 arquivada é a mais antiga');

SELECT pg_temp.como('44444444-4444-4444-8444-000000000002');
SELECT pg_catalog.set_config('request.headers','{}',true);
SELECT is(public.denunciar_foto('44441000-0000-4000-8000-000000000002','44443000-0000-4000-8000-000000000009',pg_catalog.now())->>'codigo','invalido','15.4 chamada direta sem segredo não pode ocultar sem mover');
SELECT pg_temp.como('44444444-4444-4444-8444-000000000002');
SELECT is(public.denunciar_foto('44441000-0000-4000-8000-000000000002','44443000-0000-4000-8000-000000000001',pg_catalog.now())->>'codigo','ok','9.4 denúncia elegível');
SELECT is(public.denunciar_foto('44441000-0000-4000-8000-000000000002','44443000-0000-4000-8000-000000000002',pg_catalog.now())->>'codigo','ok','9.5 denúncia repetida é idempotente');
SELECT is(public.denunciar_foto('44441000-0000-4000-8000-000000000002','44443000-0000-4000-8000-000000000005',pg_catalog.now())->>'codigo','ok','9.5b terceira denúncia do mesmo aparelho é idempotente');
SELECT is((SELECT count(*)::integer FROM public.votos WHERE tipo='denuncia_foto' AND alvo_id='44441000-0000-4000-8000-000000000002'),1,'9.6 3 denúncias do mesmo aparelho contam 1');
SELECT pg_temp.como('44444444-4444-4444-8444-000000000003');
SELECT is(public.denunciar_foto('44441000-0000-4000-8000-000000000002','44443000-0000-4000-8000-000000000003',pg_catalog.now())->>'ocultada','false','9.7 duas pessoas não ocultam');
SELECT pg_temp.como('44444444-4444-4444-8444-000000000004');
SELECT is(public.denunciar_foto('44441000-0000-4000-8000-000000000002','44443000-0000-4000-8000-000000000004',pg_catalog.now())->>'ocultada','true','9.8 terceira pessoa oculta');
SELECT is((SELECT count(*)::integer FROM public.pub_fotos WHERE id='44441000-0000-4000-8000-000000000002'),0,'15.2 oculta sai de pub_fotos na transação');
SELECT is((SELECT estado FROM private.fotos WHERE id='44441000-0000-4000-8000-000000000002'),'quarentena','15.3 ocultada permanece em quarentena');

UPDATE private.fotos SET criado_em=pg_catalog.now()-interval '31 days', decidido_em=pg_catalog.now()-interval '31 days' WHERE estado IN ('arquivada','revisao');
SELECT private.marcar_fotos_expiradas();
SELECT is((SELECT count(*)::integer FROM private.fotos WHERE estado IN ('arquivada','revisao')),0,'4.6 revisão e arquivo de 30 dias saem da tabela');
SELECT ok((SELECT count(*) FROM private.fotos_para_apagar) >= 10,'4.7 pares de arquivos entram na fila de limpeza');

SELECT ok(pg_catalog.has_table_privilege('authenticated','storage.objects','INSERT') AND
  NOT pg_catalog.has_table_privilege('authenticated','storage.objects','SELECT') AND
  NOT pg_catalog.has_table_privilege('authenticated','storage.objects','UPDATE') AND
  NOT pg_catalog.has_table_privilege('authenticated','storage.objects','DELETE'),
  '16.1 Storage permite apenas INSERT a authenticated');
SELECT is((SELECT count(*)::integer FROM pg_catalog.pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='fotos_fila_inserir' AND cmd='INSERT'),1,'16.2 política INSERT exclusiva da fila');
SELECT is((SELECT count(*)::integer FROM storage.buckets WHERE id IN ('fotos_fila','fotos','fotos_quarentena','fotos_arquivo')
  AND file_size_limit=307200 AND allowed_mime_types=ARRAY['image/jpeg']),4,'16.3 todos os buckets limitam JPEG a 300 KB');
INSERT INTO private.fotos(id,feira_id,device_id,estado,caminho,caminho_mini,client_uuid)
VALUES ('44444444-4444-4444-8444-000000000003','foto2','44444444-4444-4444-8444-000000000003','fila',
  '44444444-4444-4444-8444-000000000003/44444444-4444-4444-8444-000000000003.jpg',
  '44444444-4444-4444-8444-000000000003/44444444-4444-4444-8444-000000000003_mini.jpg',
  '44444000-0000-4000-8000-000000000003');
SELECT pg_temp.como('44444444-4444-4444-8444-000000000003');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$INSERT INTO storage.objects(bucket_id,name) VALUES
  ('fotos_fila','44444444-4444-4444-8444-000000000003/44444444-4444-4444-8444-000000000003.jpg')$$,
  '16.4 INSERT no prefixo próprio é permitido');
SELECT throws_ok($$INSERT INTO storage.objects(bucket_id,name) VALUES
  ('fotos_fila','44444444-4444-4444-8444-000000000004/44444444-4444-4444-8444-000000000003.jpg')$$,
  '42501',NULL,'16.5 outro prefixo é recusado');
SELECT throws_ok($$INSERT INTO storage.objects(bucket_id,name) VALUES
  ('fotos','44444444-4444-4444-8444-000000000003/44444444-4444-4444-8444-000000000004.jpg')$$,
  '42501',NULL,'16.6 INSERT no bucket público é recusado');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM pg_catalog.pg_policies WHERE schemaname='storage' AND tablename='objects' AND roles @> ARRAY['authenticated']::name[] AND cmd IN ('SELECT','UPDATE','DELETE')),0,'16.7 nenhuma política de leitura, alteração ou remoção para cliente');

SELECT pg_temp.como('44444444-4444-4444-8444-000000000002');
SELECT is(public.apagar_meus_dados()->>'codigo','ok','8.1 apagar_meus_dados conclui com fotos');
SELECT is((SELECT count(*)::integer FROM private.fotos WHERE device_id='44444444-4444-4444-8444-000000000002'),0,'8.2 nenhuma foto do aparelho permanece');

SELECT * FROM finish();
ROLLBACK;
