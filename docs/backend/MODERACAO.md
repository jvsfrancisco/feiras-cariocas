# Revisão manual no SQL Editor

Execute cada consulta separadamente no SQL Editor do Supabase, com uma conta autorizada a ler os esquemas `public` e `private`. Todas as consultas abaixo são somente leitura. Os nomes e estados vêm das migrations das fases 0–4; nenhuma consulta altera dados.

## Fotos denunciadas e em quarentena

Mostra fotos com denúncias, fotos em revisão e fotos em quarentena; confira a imagem e o movimento dos arquivos no Storage antes de usar `admin.ocultar_foto(uuid)` ou `admin.restaurar_foto(uuid)`, que só mudam o estado no banco.

```sql
SELECT f.id AS foto_id, f.feira_id, feira.endereco, feira.dia,
       f.estado, f.criado_em, f.decidido_em,
       count(v.id) FILTER (WHERE v.voto = 'denuncia') AS denuncias,
       max(v.criado_em) FILTER (WHERE v.voto = 'denuncia') AS ultima_denuncia_em
FROM private.fotos AS f
JOIN public.feiras AS feira ON feira.id = f.feira_id
LEFT JOIN public.votos AS v
  ON v.tipo = 'denuncia_foto' AND v.alvo_id = f.id::text
WHERE f.estado IN ('revisao', 'quarentena')
   OR EXISTS (
     SELECT 1 FROM public.votos AS d
     WHERE d.tipo = 'denuncia_foto' AND d.alvo_id = f.id::text AND d.voto = 'denuncia'
   )
GROUP BY f.id, f.feira_id, feira.endereco, feira.dia,
         f.estado, f.criado_em, f.decidido_em
ORDER BY ultima_denuncia_em DESC NULLS LAST, f.criado_em DESC;
```

## Sugestões recentes e denunciadas

Mostra sugestões comunitárias pendentes dos últimos 30 dias ou com denúncia; compare endereço, dia e localização antes de decidir, pois não há função `admin.*` de aprovação de sugestão nas migrations.

```sql
SELECT f.id, f.nome, f.endereco, f.bairro, f.dia, f.inicio, f.fim,
       f.lat, f.lng, f.status, f.criado_em,
       count(v.id) FILTER (WHERE v.tipo = 'sugestao' AND v.voto = 'apoio') AS apoios,
       count(v.id) FILTER (WHERE v.tipo = 'denuncia_sugestao' AND v.voto = 'denuncia') AS denuncias,
       max(v.criado_em) FILTER (WHERE v.tipo = 'denuncia_sugestao' AND v.voto = 'denuncia') AS ultima_denuncia_em
FROM public.feiras AS f
LEFT JOIN public.votos AS v
  ON v.alvo_id = f.id AND v.tipo IN ('sugestao', 'denuncia_sugestao')
WHERE f.origem = 'comunidade' AND f.status = 'pendente'
GROUP BY f.id, f.nome, f.endereco, f.bairro, f.dia, f.inicio, f.fim,
         f.lat, f.lng, f.status, f.criado_em
HAVING f.criado_em >= now() - interval '30 days'
    OR count(v.id) FILTER (WHERE v.tipo = 'denuncia_sugestao' AND v.voto = 'denuncia') > 0
ORDER BY denuncias DESC, f.criado_em DESC;
```

## Trechos propostos em votação

Lista trechos abertos com votos elegíveis; confira os pontos e o trecho vigente antes de qualquer decisão e use `admin.reverter_trecho` somente para reverter uma decisão anterior, se necessário.

```sql
SELECT t.id AS trecho_id, t.feira_id, f.endereco, f.dia,
       t.pontos, t.motivo, t.anterior_id, t.criado_em,
       count(v.id) FILTER (WHERE v.voto = 'aprovo' AND v.elegivel) AS aprovacoes_elegiveis,
       count(v.id) FILTER (WHERE v.voto = 'nego' AND v.elegivel) AS negacoes_elegiveis
FROM public.trechos AS t
JOIN public.feiras AS f ON f.id = t.feira_id
LEFT JOIN public.votos AS v ON v.tipo = 'trecho' AND v.alvo_id = t.id::text
WHERE t.estado = 'aberta'
GROUP BY t.id, t.feira_id, f.endereco, f.dia,
         t.pontos, t.motivo, t.anterior_id, t.criado_em
ORDER BY t.criado_em DESC;
```

## Bloqueios e incidentes de ofensa

Agrupa bloqueios e incidentes pelo hash já armazenado, sem expor `device_id` nem o texto ofensivo; revise recorrência e prazo antes de eventual bloqueio manual com `admin.bloquear_dispositivo(uuid, text, integer)`.

```sql
SELECT b.device_hash, b.motivo AS motivo_bloqueio, b.permanente,
       b.bloqueado_ate, b.criado_em AS bloqueado_em, b.expira_em,
       b.total_incidentes,
       count(i.id) AS incidentes_retidos,
       max(i.criado_em) AS ultimo_incidente_em,
       array_remove(array_agg(DISTINCT i.motivo), NULL) AS motivos_incidentes
FROM private.dispositivos_bloqueados AS b
LEFT JOIN private.incidentes_ofensa AS i ON i.device_hash = b.device_hash
WHERE b.expira_em > now() AND (b.permanente OR b.bloqueado_ate > now())
GROUP BY b.device_hash, b.motivo, b.permanente, b.bloqueado_ate,
         b.criado_em, b.expira_em, b.total_incidentes
ORDER BY ultimo_incidente_em DESC NULLS LAST, b.criado_em DESC;
```

Mostra incidentes de aparelhos ainda sem registro de bloqueio para acompanhar reincidência; se a decisão for bloquear e o `device_id` estiver disponível por via autorizada, use `admin.bloquear_dispositivo(uuid, text, integer)`.

```sql
SELECT i.device_hash, count(*) AS incidentes_retidos,
       min(i.criado_em) AS primeiro_incidente_em,
       max(i.criado_em) AS ultimo_incidente_em,
       array_agg(DISTINCT i.motivo) AS motivos
FROM private.incidentes_ofensa AS i
WHERE NOT EXISTS (
  SELECT 1 FROM private.dispositivos_bloqueados AS b
  WHERE b.device_hash = i.device_hash
    AND b.expira_em > now() AND (b.permanente OR b.bloqueado_ate > now())
)
GROUP BY i.device_hash
ORDER BY ultimo_incidente_em DESC;
```
