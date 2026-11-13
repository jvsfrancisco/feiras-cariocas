import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, Trash2, TriangleAlert, X } from 'lucide-react';
import AvisoPrivacidade from './AvisoPrivacidade';
import Fruta from './Frutas';
import { aceitarPrivacidade, apagarFoto, denunciarFoto, enviarFoto, lerFotos, mensagemParaCodigo, pedirUpload, privacidadeAceita } from '../api';
import { calculateDistance } from '../utils/distance';
import { dentroDoHorarioDaFeira } from '../utils/confirmacoes';
import { listarFotos, removerFoto } from '../utils/fotos';
import { localizacaoAtual } from '../utils/sugestoes';
import { prepararFoto } from '../utils/comprimirFoto';
import { apagarMiniatura, esquecerMinhaFoto, lerFotosOcultas, lerMiniatura, lerMinhasFotos, ocultarFoto, salvarMiniatura, salvarMinhaFoto } from '../utils/fotosServidor';

const SEM_REDE = 'Sem conexão. Tente de novo quando a internet voltar.';
const EXPLICACAO = 'Dá para mandar foto estando na feira, no horário dela.';
const BOTAO = 'min-h-12 px-4 rounded-full font-extrabold text-sm focus-visible:ring-2 focus-visible:ring-verde focus-visible:ring-offset-2 outline-none';

function mensagem(res, acao) {
  return res?.offline || res?.codigo === 'sem_conexao' ? SEM_REDE : mensagemParaCodigo(res?.codigo, acao);
}

function presencaValida(market, posicao) {
  return market?.status === 'ativa' && market.coord_precisa
    && dentroDoHorarioDaFeira(market, new Date(), 0)
    && Number.isFinite(posicao?.lat) && Number.isFinite(posicao?.lng)
    && Number.isFinite(posicao?.accuracy) && posicao.accuracy <= 100
    && Number.isFinite(market.lat) && Number.isFinite(market.lng)
    && calculateDistance(posicao.lat, posicao.lng, market.lat, market.lng) <= 0.15;
}

export default function FeiraFotosServidor({ market, userLat, userLon, userAccuracy, onPedirLocal }) {
  const [publicas, setPublicas] = useState([]);
  const [antigas, setAntigas] = useState([]);
  const [minhas, setMinhas] = useState([]);
  const [ocultas, setOcultas] = useState(() => lerFotosOcultas());
  const [estado, setEstado] = useState('carregando');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [politica, setPolitica] = useState(false);
  const [confirmacao, setConfirmacao] = useState(null);
  const [indice, setIndice] = useState(null);
  const entradaRef = useRef(null);
  const adicionarRef = useRef(null);
  const urlsRef = useRef([]);
  const aberturaRef = useRef(null);
  const acaoRef = useRef(null);
  const fecharRef = useRef(null);
  const confirmacaoRef = useRef(null);
  const politicaRef = useRef(null);
  const idsMeus = new Set(minhas.map((foto) => foto.id));
  const visiveis = publicas.filter((foto) => !ocultas.includes(foto.id));
  const idsPublicos = new Set(publicas.map((foto) => foto.id));
  const minhasSemPublico = minhas.filter((foto) => !idsPublicos.has(foto.id));
  const fotoAberta = indice === null ? null : visiveis[indice];
  const posicaoConhecida = { lat: userLat, lng: userLon, accuracy: userAccuracy };
  const podeEnviar = presencaValida(market, posicaoConhecida);

  const criarUrl = useCallback((blob) => {
    const url = URL.createObjectURL(blob);
    urlsRef.current.push(url);
    return url;
  }, []);

  const lerLocais = useCallback(async () => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current = [];
    const registros = await listarFotos(market.id).catch(() => []);
    setAntigas(registros.map((foto) => ({ ...foto, url: criarUrl(foto.blob) })));
    const minhasDaFeira = lerMinhasFotos().filter((foto) => String(foto.feiraId) === String(market.id));
    const comMini = await Promise.all(minhasDaFeira.map(async (foto) => {
      try {
        const blob = await lerMiniatura(foto.id);
        return { ...foto, miniaturaUrl: blob ? criarUrl(blob) : null };
      } catch { return { ...foto, miniaturaUrl: null }; }
    }));
    setMinhas(comMini);
  }, [market.id, criarUrl]);

  const atualizarPublicas = useCallback(async () => {
    try { setPublicas(await lerFotos(market.id)); }
    catch { setErro(SEM_REDE); }
  }, [market.id]);

  useEffect(() => {
    let ativo = true;
    queueMicrotask(() => Promise.allSettled([lerFotos(market.id), lerLocais()]).then(([resultado]) => {
      if (!ativo) return;
      if (resultado.status === 'fulfilled') setPublicas(resultado.value);
      else setErro(SEM_REDE);
      setEstado('pronto');
    }));
    return () => {
      ativo = false;
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      urlsRef.current = [];
    };
  }, [market.id, lerLocais]);

  useEffect(() => {
    if (indice === null) return undefined;
    const anterior = aberturaRef.current;
    fecharRef.current?.focus();
    const aoTeclar = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setIndice(null); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setIndice((i) => (i + 1) % visiveis.length); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setIndice((i) => (i - 1 + visiveis.length) % visiveis.length); }
      if (e.key === 'Tab') {
        e.stopPropagation();
        const botoes = [fecharRef.current, ...document.querySelectorAll('[data-foto-navegar], [data-foto-acao]')].filter(Boolean);
        const atual = botoes.indexOf(document.activeElement);
        if (atual >= 0) {
          e.preventDefault();
          botoes[(atual + (e.shiftKey ? botoes.length - 1 : 1)) % botoes.length].focus();
        }
      }
    };
    document.addEventListener('keydown', aoTeclar, true);
    return () => { document.removeEventListener('keydown', aoTeclar, true); anterior?.focus(); };
  // A navegação precisa acompanhar só a quantidade, sem devolver o foco em cada seta.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indice === null, publicas.length, ocultas.length]);

  useEffect(() => { if (confirmacao) confirmacaoRef.current?.focus(); }, [confirmacao]);
  useEffect(() => { if (politica) politicaRef.current?.querySelector('h2')?.focus(); }, [politica]);

  const iniciarEnvio = () => {
    setErro(''); setAviso('');
    if (!podeEnviar) {
      if (!Number.isFinite(userLat) || !Number.isFinite(userLon)) onPedirLocal?.();
      setAviso(EXPLICACAO);
      return;
    }
    if (!privacidadeAceita()) { setPolitica(true); return; }
    entradaRef.current?.click();
  };

  const aoEscolher = async (e) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setOcupado(true); setErro(''); setAviso('');
    try {
      const posicao = await localizacaoAtual();
      if (!presencaValida(market, posicao)) { setErro(EXPLICACAO); return; }
      let foto;
      let miniatura;
      try { ({ foto, miniatura } = await prepararFoto(arquivo)); }
      catch { setErro('Não foi possível preparar esta imagem. Escolha outra foto.'); return; }
      const pedido = await pedirUpload({ feiraId: market.id, lat: posicao.lat, lng: posicao.lng, acuracia: posicao.accuracy });
      if (pedido?.codigo !== 'ok') { setErro(mensagem(pedido, 'foto')); return; }
      const resposta = await enviarFoto({ fotoId: pedido.foto_id, caminho: pedido.caminho, caminhoMini: pedido.caminho_mini, foto, miniatura });
      if (resposta?.codigo !== 'ok') { setErro(mensagem(resposta, 'foto')); return; }
      const registro = { id: pedido.foto_id, feiraId: market.id, estado: resposta.estado, data: new Date().toISOString() };
      let copiaFalhou = false;
      try { salvarMinhaFoto(registro); } catch { copiaFalhou = true; }
      try { await salvarMiniatura(registro.id, miniatura); } catch { copiaFalhou = true; }
      await lerLocais();
      if (copiaFalhou) setErro('A foto foi enviada, mas não foi possível guardar sua cópia neste aparelho.');
      if (resposta.estado === 'visivel') {
        setAviso('Foto publicada.');
        await atualizarPublicas();
      } else if (resposta.estado === 'revisao') setAviso('Sua foto vai aparecer depois de uma conferência.');
      else setAviso(mensagem(resposta, 'foto'));
    } catch (falha) {
      setErro(falha?.message?.startsWith('Ative sua localização')
        ? 'Ative sua localização para mandar foto estando na feira.' : SEM_REDE);
    } finally { setOcupado(false); }
  };

  const pedirConfirmacao = (tipo, foto, evento, retorno = evento.currentTarget) => {
    acaoRef.current = retorno;
    setConfirmacao({ tipo, foto });
    setErro(''); setAviso('');
  };
  const cancelarConfirmacao = () => { setConfirmacao(null); acaoRef.current?.focus(); };
  const executarConfirmacao = async () => {
    if (!confirmacao || ocupado) return;
    const { tipo, foto } = confirmacao;
    setOcupado(true);
    try {
      if (tipo === 'denunciar') {
        const resposta = await denunciarFoto({ fotoId: foto.id });
        if (resposta?.codigo !== 'ok') { setErro(mensagem(resposta, 'denunciar_foto')); return; }
        setOcultas((atuais) => [...new Set([...atuais, foto.id])]);
        try { ocultarFoto(foto.id); }
        catch { setErro('A denúncia foi enviada, mas não foi possível lembrar neste aparelho que você ocultou a foto.'); }
        setAviso(mensagem(resposta, 'denunciar_foto'));
      } else if (tipo === 'apagar') {
        const resposta = await apagarFoto({ fotoId: foto.id });
        if (resposta?.codigo !== 'ok') { setErro(mensagem(resposta, 'apagar_foto')); return; }
        esquecerMinhaFoto(foto.id);
        try { await apagarMiniatura(foto.id); } catch { /* foto já foi apagada no servidor */ }
        await lerLocais();
        await atualizarPublicas();
        setAviso('Foto apagada.');
      } else {
        await removerFoto(market.id, foto.id);
        await lerLocais();
        setAviso('Foto removida deste aparelho.');
      }
    } catch { setErro(SEM_REDE); }
    finally { setOcupado(false); setConfirmacao(null); acaoRef.current?.focus(); }
  };

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <input ref={entradaRef} type="file" accept="image/*" capture="environment" onChange={aoEscolher} className="sr-only" tabIndex={-1} aria-hidden="true" />
      {erro && <p role="alert" className="text-sm leading-6 text-tomate flex items-start gap-2"><TriangleAlert size={16} className="shrink-0 mt-1" aria-hidden="true" />{erro}</p>}
      {aviso && <p role="status" className="text-sm leading-6 text-verde-escuro">{aviso}</p>}
      {estado === 'carregando' && <p role="status" className="text-sm leading-6 text-tinta-2 text-center">Abrindo as fotos...</p>}
      {estado === 'pronto' && visiveis.length === 0 && minhasSemPublico.length === 0 && antigas.length === 0 && (
        <div className="photos-empty flex flex-col items-center gap-2 py-2 text-center">
          <Fruta nome="tomato" className="w-24 h-24" />
          <h3 className="font-display font-extrabold text-[19px] leading-[1.1] tracking-[-0.05em] text-tinta">Ninguém mandou foto desta feira ainda.</h3>
          <p className="text-xs leading-[1.5] text-tinta-2">Uma foto das barracas pode ajudar outras pessoas a conhecer a feira.</p>
        </div>
      )}
      {visiveis.length > 0 && (
        <ul className="photo-grid grid grid-cols-2 gap-2 min-w-0">
          {visiveis.map((foto, i) => (
            <li key={foto.id} className="min-w-0">
              <button type="button" onClick={(e) => { aberturaRef.current = e.currentTarget; setIndice(i); }} aria-label={`Abrir foto ${i + 1} da feira de ${market.bairro}`} className="w-full aspect-square rounded-xl overflow-hidden bg-areia focus-visible:ring-2 focus-visible:ring-verde outline-none">
                <img src={foto.miniaturaUrl} alt={`Foto da feira de ${market.bairro}`} width="320" height="320" loading="lazy" className="w-full h-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {minhasSemPublico.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="font-display font-extrabold text-tinta">Suas fotos</h3>
          <ul className="grid grid-cols-2 gap-2 min-w-0">
            {minhasSemPublico.map((foto) => <li key={foto.id} className="min-w-0 flex flex-col gap-2">
              {foto.miniaturaUrl && <img src={foto.miniaturaUrl} alt={`Foto da feira de ${market.bairro}`} width="320" height="320" loading="lazy" className="w-full aspect-square object-cover rounded-xl bg-areia" />}
              <span className="text-xs font-extrabold text-tinta-2">{foto.estado === 'revisao' ? 'Em conferência' : 'Enviada'}</span>
              <button type="button" disabled={ocupado} onClick={(e) => pedirConfirmacao('apagar', foto, e)} className={`${BOTAO} border border-linha text-tinta inline-flex items-center justify-center gap-2`}><Trash2 size={16} aria-hidden="true" />Apagar</button>
            </li>)}</ul>
        </section>
      )}
      {antigas.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="font-display font-extrabold text-tinta">Só neste aparelho</h3>
          <ul className="grid grid-cols-2 gap-2 min-w-0">{antigas.map((foto) => <li key={foto.id} className="min-w-0 flex flex-col gap-2">
            <img src={foto.url} alt={`Foto da feira de ${market.bairro}`} width="320" height="320" loading="lazy" className="w-full aspect-square object-cover rounded-xl bg-areia" />
            <button type="button" disabled={ocupado} onClick={(e) => pedirConfirmacao('local', foto, e)} className={`${BOTAO} border border-linha text-tinta inline-flex items-center justify-center gap-2`}><Trash2 size={16} aria-hidden="true" />Apagar</button>
          </li>)}</ul>
        </section>
      )}
      {confirmacao && <section role="alertdialog" aria-labelledby="foto-confirmar" className="rounded-xl bg-areia p-4 flex flex-col gap-4">
        <p id="foto-confirmar" ref={confirmacaoRef} tabIndex={-1} className="text-sm text-tinta focus-visible:ring-2 focus-visible:ring-verde outline-none">
          {confirmacao.tipo === 'denunciar' ? 'Denunciar esta foto? Use para rosto, placa, conteúdo ofensivo ou foto de outro lugar.' : 'Apagar esta foto?'}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={ocupado} onClick={cancelarConfirmacao} className={`${BOTAO} border border-linha bg-papel text-tinta`}>Cancelar</button>
          <button type="button" disabled={ocupado} onClick={executarConfirmacao} className={`${BOTAO} bg-tomate text-papel disabled:opacity-50`}>{ocupado ? 'Aguarde…' : confirmacao.tipo === 'denunciar' ? 'Denunciar' : 'Apagar'}</button>
        </div>
      </section>}
      {politica && <div ref={politicaRef}><AvisoPrivacidade acao="foto" temPendente mostrarAlca={false} className="rounded-xl border border-linha" onConfirmar={() => { if (aceitarPrivacidade()) { setPolitica(false); entradaRef.current?.click(); } }} onCancelar={() => { setPolitica(false); queueMicrotask(() => adicionarRef.current?.focus()); }} /></div>}
      <button ref={adicionarRef} type="button" disabled={ocupado || estado === 'carregando'} onClick={iniciarEnvio} className={`${BOTAO} photo-add w-full bg-verde text-papel inline-flex items-center justify-center gap-2 disabled:opacity-50`}>
        <Camera size={20} aria-hidden="true" />{ocupado ? 'Enviando…' : 'Adicionar foto'}
      </button>
      {!podeEnviar && <p className="text-xs leading-5 text-tinta-2">{EXPLICACAO}</p>}
      <p className="photo-tip text-[11px] leading-[1.45] text-tinta-2">Fotografe as barracas de longe, evite rostos e placas de carro.</p>
      {fotoAberta && <div className="fixed inset-0 z-[300] bg-tinta/90 p-4 flex flex-col items-center justify-center gap-4" role="dialog" aria-modal="true" aria-label={`Foto ${indice + 1} da feira de ${market.bairro}`}>
        <button ref={fecharRef} type="button" onClick={() => setIndice(null)} aria-label="Fechar foto" className={`${BOTAO} self-end bg-papel text-tinta inline-flex items-center gap-2`}><X size={20} aria-hidden="true" />Fechar</button>
        <img src={fotoAberta.url} alt={`Foto da feira de ${market.bairro}`} width="1600" height="1600" className="max-w-full max-h-[70dvh] object-contain" />
        <div className="flex gap-2 w-full max-w-md justify-between">
          <button data-foto-navegar type="button" onClick={() => setIndice((i) => (i - 1 + visiveis.length) % visiveis.length)} className={`${BOTAO} bg-papel text-tinta inline-flex items-center gap-2`}><ChevronLeft size={20} aria-hidden="true" />Anterior</button>
          <button data-foto-navegar type="button" onClick={() => setIndice((i) => (i + 1) % visiveis.length)} className={`${BOTAO} bg-papel text-tinta inline-flex items-center gap-2`}>Próxima<ChevronRight size={20} aria-hidden="true" /></button>
        </div>
        <button data-foto-acao type="button" disabled={ocupado} onClick={(e) => { pedirConfirmacao(idsMeus.has(fotoAberta.id) ? 'apagar' : 'denunciar', fotoAberta, e, aberturaRef.current); setIndice(null); }} className="text-sm text-papel/75 underline underline-offset-4 hover:text-papel focus-visible:text-papel focus-visible:ring-2 focus-visible:ring-papel outline-none disabled:opacity-50">
          {idsMeus.has(fotoAberta.id) ? 'Apagar' : 'Denunciar esta foto'}
        </button>
      </div>}
    </div>
  );
}
