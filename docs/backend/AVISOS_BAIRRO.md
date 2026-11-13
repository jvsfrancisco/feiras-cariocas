# Avisos por bairro (notificação web)

Status: proposta aprovada pelo dono, implementação pendente.

## O que faz

- A pessoa ativa o aviso e escolhe **um bairro**.
- Todo dia, às **7h (horário de Brasília)**, o servidor envia uma notificação para quem escolheu o bairro, se houver feira nele naquele dia: "Tem feira no Caju hoje, das 6h às 13h."
- Funciona com o app instalado (PWA). No Android, pelo Chrome. No iPhone, só depois de instalar na tela de início (iOS 16.4 ou mais novo).

## O que não faz

- Não usa localização. Não sabe se a pessoa está perto da feira.
- Não avisa em tempo real. Só o aviso diário.

## Privacidade

- Guarda: identificador anônimo do aparelho (`client_uuid`, o mesmo das confirmações), bairro escolhido, dados da inscrição push (`endpoint`, `p256dh`, `auth`), data de criação.
- Não guarda: coordenadas, IP, nome, e-mail.
- Desativar apaga a linha. Inscrição que o navegador recusou (erro 410/404) é apagada no envio.

## Modelo de dados (Supabase)

Tabela `public.avisos_inscricoes`:

- `client_uuid uuid primary key`
- `bairro text not null` (valor de `bairro` em `src/data/feiras.js`)
- `endpoint text not null unique`
- `p256dh text not null`
- `auth text not null`
- `criado_em timestamptz default now()`

RLS ligado. Sem leitura pública. Escrita só pela RPC `registrar_aviso` (anon) e `cancelar_aviso` (anon), ambas com `security definer`, recebendo `client_uuid` e validando que o bairro existe.

## Envio

- Edge Function `avisos`, rota `POST /avisos/enviar`, chamada só com o segredo `AVISOS_EDGE_SECRET`, no mesmo padrão da função `fotos`.
- Lê as feiras do dia e, para cada bairro com feira, envia a notificação às inscrições desse bairro.
- Chaves VAPID: `VAPID_PUBLIC_KEY` (também vai no front), `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` (`mailto:` do dono) como segredos da função. A chave privada nunca vai ao navegador.
- Agendamento: `pg_cron` às 10:00 UTC (7h de Brasília), com `pg_net`, igual à limpeza de fotos. A chave usada na chamada fica no Vault.

## Front-end

- `public/sw.js`: service worker que mostra a notificação e abre o app ao clicar.
- Registro do service worker e pedido de permissão só quando a pessoa tocar em "Avisar meu bairro". Nunca pedir ao abrir o app.
- Tela: escolher bairro, ativar, desativar. Texto curto, sem jargão.
- Respeitar as regras de UI do projeto: grade de 8 px, tokens de cor, ícones lucide.

## Ordem de entrega (PRs pequenas)

1. Tabela, RLS e RPCs (migração nova, só SQL).
2. Edge Function de envio, com testes locais do formato da mensagem.
3. Service worker e inscrição no front, atrás de uma flag.
4. Agendamento no cron e teste no celular.

## Pendências do dono

- Gerar o par VAPID e guardar `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` e `AVISOS_EDGE_SECRET` nos segredos da função.
- Atualizar `docs/backend/REQUISITOS.md` com esta seção antes do deploy.
