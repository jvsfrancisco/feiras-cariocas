// Cliente fino para o Supabase (Fases 0 e 1) sem dependências externas.
// Usa fetch contra /rest/v1/... e /auth/v1/... conforme docs/backend/REQUISITOS.md (v4).

const RAW_URL = import.meta.env?.VITE_SUPABASE_URL ?? '';
const RAW_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';
const TURNSTILE_SITE_KEY = import.meta.env?.VITE_TURNSTILE_SITE_KEY ?? '';

export const SUPABASE_URL = typeof RAW_URL === 'string' ? RAW_URL.trim().replace(/\/+$/, '') : '';
export const SUPABASE_ANON_KEY = typeof RAW_KEY === 'string' ? RAW_KEY.trim() : '';
export const backendAtivo = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const CHAVE_SESSAO = 'olhafeira_sessao_supabase';
export const CHAVE_PRIVACIDADE = 'olhafeira_privacidade_aceita';
export const CODIGO_PRIVACIDADE_PENDENTE = 'privacidade_pendente';
export const CODIGO_CAPTCHA = 'captcha';

// Captcha sem token ou recusado pelo login anônimo: não é falta de rede, não vai para a fila
export class ErroCaptcha extends Error {}

export function resultadoDeErro(erro) {
  return erro instanceof ErroCaptcha ? { codigo: CODIGO_CAPTCHA } : null;
}

// Textos para os 11 códigos fixos da seção 4
export const MENSAGENS_CODIGO = {
  ok: 'Confirmação registrada. Obrigado por ajudar!',
  limite: 'Você atingiu o limite de envios por agora. Tente mais tarde.',
  fora_do_raio: 'Você precisa estar a até 150 m da feira com GPS preciso.',
  fora_do_horario: 'Esta feira não está em horário de funcionamento agora.',
  aparelho_novo: 'Este aparelho ainda é muito recente para realizar esta ação.',
  bloqueado: 'Este aparelho está temporariamente impedido de enviar dados.',
  duplicado: 'Este envio já foi registrado anteriormente.',
  invalido: 'Não foi possível validar os dados enviados.',
  sem_coord_precisa: 'Esta feira ainda não tem localização precisa para confirmação.',
  texto_proibido: 'O texto contém termos não permitidos.',
  encerrada: 'Esta votação já foi encerrada.',
  sem_conexao: 'Sem conexão. Tente de novo quando a internet voltar.',
  captcha: 'Não deu para confirmar que você é uma pessoa. Confira a internet e tente de novo.',
};

export const MENSAGENS_POR_ACAO = {
  sugerir_feira: {
    ok: 'Sugestão enviada. Ela aparecerá após um apoio de alguém presente.',
    texto_proibido: 'Esse nome não pode ser usado. Escreva só o nome da feira ou da rua.',
    duplicado: 'Já existe uma feira aqui nesse dia.',
    limite: 'Você já enviou três sugestões nesta semana.',
    fora_do_raio: 'Use um GPS com precisão de até 100 m no local da feira.',
    fora_do_horario: 'Envie a sugestão durante o horário da feira.',
    bloqueado: 'Este aparelho está impedido de enviar sugestões.',
  },
  apoiar_sugestao: {
    ok: 'Seu voto na sugestão foi registrado.',
    encerrada: 'Esta sugestão não está mais em votação.',
    invalido: 'Não é possível votar na sua própria sugestão.',
    bloqueado: 'Este aparelho está impedido de votar.',
  },
  denunciar_sugestao: {
    ok: 'Denúncia registrada. Obrigado por avisar.',
    aparelho_novo: 'Este aparelho precisa ter pelo menos 24 horas para denunciar.',
    encerrada: 'Esta sugestão não aceita mais denúncias.',
    limite: 'Você atingiu o limite de denúncias de hoje.',
  },
  proposta: {
    ok: 'Proposta enviada. Ela aparece tracejada até outras pessoas votarem.',
    duplicado: 'Esse trecho é quase igual ao que já está no mapa.',
    fora_do_raio: 'Você precisa estar na feira para propor o trecho.',
    fora_do_horario: 'Dá para corrigir o trecho durante a feira.',
    aparelho_novo: 'Este aparelho ainda é novo para propor trechos. Tente daqui a alguns dias.',
    limite: 'Agora não dá para propor outro trecho nesta feira.',
    invalido: 'O trecho não passou na conferência. Confira os pontos e tente de novo.',
  },
  voto: {
    ok: 'Voto registrado. Obrigado!',
    invalido: 'Não foi possível registrar o voto.',
  },
  votar_trecho: {
    ok: 'Voto registrado. Obrigado!',
    invalido: 'Não foi possível registrar o voto.',
  },
  foto: {
    ok: 'Foto publicada.',
    limite: 'Esta feira já recebeu as fotos de hoje, ou você chegou ao seu limite. Tente amanhã.',
    fora_do_raio: 'Você precisa estar na feira com GPS preciso para mandar foto.',
    fora_do_horario: 'Dá para mandar foto estando na feira, no horário dela.',
    sem_coord_precisa: 'Esta feira ainda não tem localização precisa para fotos.',
  },
  denunciar_foto: {
    ok: 'Denúncia registrada. Esta foto foi escondida neste aparelho.',
    aparelho_novo: 'Este aparelho precisa ter pelo menos 24 horas para denunciar.',
    limite: 'Você atingiu o limite de denúncias de hoje.',
  },
  apagar_foto: {
    ok: 'Foto apagada.',
  },
};

export function mensagemParaCodigo(codigo, acao) {
  const porAcao = acao ? MENSAGENS_POR_ACAO[acao] : null;
  if (porAcao && codigo in porAcao) {
    return porAcao[codigo];
  }
  if (codigo && codigo in MENSAGENS_CODIGO) {
    return MENSAGENS_CODIGO[codigo];
  }
  return porAcao?.invalido ?? MENSAGENS_CODIGO.invalido;
}

export function privacidadeAceita() {
  try {
    return localStorage.getItem(CHAVE_PRIVACIDADE) === 'v1';
  } catch {
    return false;
  }
}

export function aceitarPrivacidade() {
  try {
    localStorage.setItem(CHAVE_PRIVACIDADE, 'v1');
    return true;
  } catch {
    return false;
  }
}

export function lerSessao() {
  try {
    const bruto = localStorage.getItem(CHAVE_SESSAO);
    if (!bruto) return null;
    const sessao = JSON.parse(bruto);
    if (!sessao || typeof sessao.access_token !== 'string') return null;
    return sessao;
  } catch {
    return null;
  }
}

export function salvarSessao(dados) {
  if (!dados || typeof dados.access_token !== 'string') return null;
  const agoraSeg = Math.floor(Date.now() / 1000);
  const expiresAt = Number.isFinite(dados.expires_at)
    ? dados.expires_at
    : agoraSeg + (Number(dados.expires_in) || 3600);
  const sessao = {
    access_token: dados.access_token,
    refresh_token: dados.refresh_token ?? null,
    expires_at: expiresAt,
    user_id: dados.user?.id ?? dados.user_id ?? null,
  };
  try {
    localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
  } catch {
    // Armazenamento indisponível: mantém apenas em memória da chamada
  }
  return sessao;
}

export function limparSessao() {
  try {
    localStorage.removeItem(CHAVE_SESSAO);
  } catch {
    // Ignora falha de armazenamento
  }
}

// Obtém token do Cloudflare Turnstile se VITE_TURNSTILE_SITE_KEY estiver configurada.
export async function obterTokenTurnstile() {
  if (!TURNSTILE_SITE_KEY || typeof window === 'undefined' || typeof document === 'undefined') {
    return undefined;
  }

  if (!window.turnstile) {
    await new Promise((resolve) => {
      const existente = document.querySelector('script[data-olhafeira-turnstile]');
      if (existente) {
        existente.addEventListener('load', () => resolve(), { once: true });
        existente.addEventListener('error', () => resolve(), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.olhafeiraTurnstile = '1';
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.head.appendChild(script);
    });
  }

  if (!window.turnstile?.render) return undefined;

  return new Promise((resolve) => {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.bottom = '8px';
    container.style.right = '8px';
    container.style.zIndex = '9999';
    document.body.appendChild(container);

    let finalizado = false;
    const concluir = (token, widgetId) => {
      if (finalizado) return;
      finalizado = true;
      try {
        if (widgetId !== undefined && window.turnstile?.remove) {
          window.turnstile.remove(widgetId);
        }
      } catch {
        // Ignora erro ao limpar widget
      }
      container.remove();
      resolve(token);
    };

    const timer = window.setTimeout(() => concluir(undefined, undefined), 10000);
    try {
      const widgetId = window.turnstile.render(container, {
        sitekey: TURNSTILE_SITE_KEY,
        // O modo invisível é escolhido no painel da Cloudflare ("Widget Mode: Invisible").
        // `size` só aceita normal, flexible ou compact; "invisible" aqui quebra o render.
        language: 'pt-br',
        callback: (token) => {
          window.clearTimeout(timer);
          concluir(token, widgetId);
        },
        'error-callback': () => {
          window.clearTimeout(timer);
          concluir(undefined, widgetId);
        },
      });
    } catch {
      window.clearTimeout(timer);
      concluir(undefined, undefined);
    }
  });
}

// Login anônimo via GoTrue (/auth/v1/signup com corpo vazio + captcha_token opcional)
export async function entrarAnonimo(captchaToken) {
  if (!backendAtivo) return null;
  const tokenCaptcha = captchaToken ?? (await obterTokenTurnstile());
  if (TURNSTILE_SITE_KEY && tokenCaptcha === undefined) {
    throw new ErroCaptcha('Falha ao obter token do captcha');
  }
  const corpo = {
    data: {},
    ...(tokenCaptcha ? { gotrue_meta_security: { captcha_token: tokenCaptcha } } : {}),
  };

  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(corpo),
  });

  if (!res.ok) {
    if ([400, 401, 403, 422].includes(res.status)) {
      throw new ErroCaptcha(`Falha no login anônimo (${res.status})`);
    }
    throw new Error(`Falha no login anônimo (${res.status})`);
  }

  const dados = await res.json();
  return salvarSessao(dados);
}

// Renovação de sessão via GoTrue (/auth/v1/token?grant_type=refresh_token)
export async function renovarSessao(refreshToken) {
  if (!backendAtivo || !refreshToken) return null;

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!res.ok) {
    limparSessao();
    return null;
  }

  const dados = await res.json();
  return salvarSessao(dados);
}

let promessaSessao = null;

export async function garantirSessao(captchaToken) {
  if (!backendAtivo) return null;
  if (promessaSessao) return promessaSessao;

  promessaSessao = (async () => {
    const atual = lerSessao();
    const agoraSeg = Math.floor(Date.now() / 1000);

    if (atual && atual.expires_at && atual.expires_at > agoraSeg + 60) {
      return atual;
    }

    if (atual?.refresh_token) {
      const renovada = await renovarSessao(atual.refresh_token);
      if (renovada) return renovada;
    }

    return entrarAnonimo(captchaToken);
  })();

  try {
    return await promessaSessao;
  } finally {
    promessaSessao = null;
  }
}

export async function lerTabelaPublica(tabela, params = '') {
  if (!backendAtivo) return null;
  const sufixo = params ? `?${params}` : '';
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}${sufixo}`, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Erro ao ler ${tabela} (${res.status})`);
  }

  return res.json();
}

export async function chamarRpc(
  nomeFuncao,
  payload = {},
  { autenticado = true, captchaToken } = {},
) {
  if (!backendAtivo) {
    return { codigo: 'invalido', offline: true };
  }

  if (!privacidadeAceita()) {
    return { codigo: CODIGO_PRIVACIDADE_PENDENTE };
  }

  let bearer = SUPABASE_ANON_KEY;
  if (autenticado) {
    let sessao;
    try {
      sessao = await garantirSessao(captchaToken);
    } catch (erro) {
      // Captcha recusado vira código próprio; erro de rede segue como exceção
      const resultado = resultadoDeErro(erro);
      if (resultado) return resultado;
      throw erro;
    }
    if (!sessao?.access_token) {
      return { codigo: 'invalido' };
    }
    bearer = sessao.access_token;
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nomeFuncao}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 401 && autenticado) {
    limparSessao();
  }

  if (!res.ok) {
    throw new Error(`Erro na RPC ${nomeFuncao} (${res.status})`);
  }

  const dados = await res.json();
  if (typeof dados === 'string') {
    return { codigo: dados };
  }
  return dados && typeof dados === 'object' ? dados : { codigo: 'invalido' };
}

export async function apagarMeusDados() {
  if (!backendAtivo) return { codigo: 'ok' };
  const sessao = lerSessao();
  if (sessao?.access_token) {
    const resultado = await chamarRpc('apagar_meus_dados', {}, { autenticado: true });
    if (resultado.codigo !== 'ok') return resultado;
  }
  limparSessao();
  try {
    localStorage.removeItem('olhafeira_fila_confirmacoes');
    localStorage.removeItem('olhafeira_confirmacoes');
    localStorage.removeItem('olhafeira_votos_trecho');
    localStorage.removeItem('olhafeira_propostas_trecho');
    localStorage.removeItem('olhafeira_ids_sugestoes');
    localStorage.removeItem('olhafeira_votos_sugestao');
    localStorage.removeItem(CHAVE_PRIVACIDADE);
  } catch {
    // Ignora falha ao limpar armazenamento local
  }
  return { codigo: 'ok' };
}
