import type { Adaptador, Caminhos, Resultado } from './core.ts';

const url = Deno.env.get('SUPABASE_URL')?.replace(/\/+$/, '') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const edgeSecret = Deno.env.get('FOTO_EDGE_SECRET') ?? '';

async function json<T>(path: string, method: string, body: unknown, bearer = serviceKey, extraHeaders: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { apikey: serviceKey, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error('interno');
  return await res.json() as T;
}

async function objeto(bucket: string, caminho: string, method: string, bytes?: Uint8Array, cache = 0): Promise<Response> {
  return fetch(`${url}/storage/v1/object/${bucket}/${caminho}`, {
    method,
    headers: {
      apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
      ...(bytes ? { 'Content-Type': 'image/jpeg', 'Cache-Control': `max-age=${cache}`, 'x-upsert': 'false' } : {}),
    },
    body: bytes ? new Uint8Array(bytes).buffer : undefined,
  });
}

export const adaptador: Adaptador = {
  async usuario(token) {
    if (!token) return null;
    try {
      const u = await json<{ id?: string }>('/auth/v1/user', 'GET', undefined, token);
      return u.id ?? null;
    } catch { return null; }
  },
  fotoParaPromover: (p_foto_id, p_device_id) => json<(Caminhos & Resultado) | null>('/rest/v1/rpc/foto_para_promover', 'POST', { p_foto_id, p_device_id }),
  registrarPromocao: (p_foto_id, p_device_id) => json('/rest/v1/rpc/registrar_promocao_foto', 'POST', { p_foto_id, p_device_id }),
  registrarRemocao: (p_foto_id, p_device_id) => json('/rest/v1/rpc/registrar_remocao_foto', 'POST', { p_foto_id, p_device_id }),
  denunciar: (foto_id, client_uuid, client_ts, token) => json('/rest/v1/rpc/denunciar_foto', 'POST', { foto_id, client_uuid, client_ts }, token,
    { 'x-foto-edge-secret': edgeSecret }),
  fotoParaMover: (p_foto_id) => json('/rest/v1/rpc/foto_para_mover', 'POST', { p_foto_id }),
  fotoDoDono: (p_foto_id, p_device_id) => json('/rest/v1/rpc/foto_do_dono', 'POST', { p_foto_id, p_device_id }),
  registrarOcultacao: (p_foto_id) => json('/rest/v1/rpc/registrar_ocultacao_foto', 'POST', { p_foto_id }),
  registrarRestauracao: (p_foto_id) => json('/rest/v1/rpc/registrar_restauracao_foto', 'POST', { p_foto_id }),
  pendentes: () => json('/rest/v1/rpc/fotos_pendentes_limpeza', 'POST', {}),
  confirmarApagado: async (p_id) => { await json('/rest/v1/rpc/confirmar_arquivo_apagado', 'POST', { p_id }); },
  async baixar(bucket, caminho) {
    const res = await objeto(bucket, caminho, 'GET');
    if (!res.ok) throw new Error('interno');
    return new Uint8Array(await res.arrayBuffer());
  },
  async gravar(bucket, caminho, bytes, cache) {
    const res = await objeto(bucket, caminho, 'POST', bytes, cache);
    if (!res.ok) throw new Error('interno');
  },
  async apagar(bucket, caminho) {
    const res = await fetch(`${url}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [caminho] }),
    });
    if (!res.ok) throw new Error('interno');
  },
  async mover(origem, destino, caminho, cache = 0) {
    let bytes: Uint8Array;
    try { bytes = await this.baixar(origem, caminho); }
    catch {
      await this.baixar(destino, caminho); // retry após cópia já concluída
      return;
    }
    await this.gravar(destino, caminho, bytes, cache);
    await this.apagar(origem, caminho);
  },
  async assinar(bucket, caminho, segundos) {
    const res = await json<{ signedURL?: string; signedUrl?: string }>(
      `/storage/v1/object/sign/${bucket}/${caminho}`, 'POST', { expiresIn: segundos });
    const signed = res.signedURL ?? res.signedUrl;
    if (!signed) throw new Error('interno');
    if (signed.startsWith('http')) return signed;
    return signed.startsWith('/storage/v1/') ? `${url}${signed}` : `${url}/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}`;
  },
};
