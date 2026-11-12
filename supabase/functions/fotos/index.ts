import { adaptador } from './adapter.ts';
import { denunciar, limpar, ocultar, promover, remover, restaurar, urlsAdmin } from './core.ts';

const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
function resposta(codigo: string, extra: Record<string, unknown> = {}, status = 200) {
  return new Response(JSON.stringify({ codigo, ...extra }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return resposta('invalido', {}, 405);
  const route = new URL(req.url).pathname.split('/').pop();
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token) return resposta('invalido', {}, 401);
  try {
    const body = await req.json();
    if (route === 'promover' && typeof body?.foto_id === 'string') {
      const r = await promover(adaptador, token, body.foto_id);
      return resposta(r.codigo, { estado: r.estado });
    }
    if (route === 'denunciar' && typeof body?.foto_id === 'string' && typeof body?.client_uuid === 'string' && typeof body?.client_ts === 'string') {
      const r = await denunciar(adaptador, token, body.foto_id, body.client_uuid, body.client_ts);
      return resposta(r.codigo, { ocultada: r.ocultada });
    }
    if (route === 'remover' && typeof body?.foto_id === 'string') {
      const r = await remover(adaptador, token, body.foto_id);
      return resposta(r.codigo);
    }
    if (token !== serviceKey) return resposta('invalido', {}, 403);
    if (route === 'ocultar' && typeof body?.foto_id === 'string') {
      const r = await ocultar(adaptador, body.foto_id);
      return resposta(r.codigo);
    }
    if (route === 'restaurar' && typeof body?.foto_id === 'string') {
      const r = await restaurar(adaptador, body.foto_id);
      return resposta(r.codigo);
    }
    if (route === 'assinar' && typeof body?.foto_id === 'string') {
      const r = await urlsAdmin(adaptador, body.foto_id);
      return resposta(r.codigo, { url: r.url, miniatura_url: r.miniatura_url });
    }
    if (route === 'limpar') {
      const r = await limpar(adaptador);
      return resposta(r.codigo);
    }
    return resposta('invalido', {}, 404);
  } catch {
    // Sem corpo, coordenadas, token, caminho ou detalhe interno em logs/resposta.
    return resposta('invalido', {}, 500);
  }
});
