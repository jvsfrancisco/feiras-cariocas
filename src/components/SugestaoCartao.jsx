import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import AvisoPrivacidade from './AvisoPrivacidade';
import {
  aceitarPrivacidade, apoiarSugestao, denunciarSugestao, lerVotoSugestao,
  mensagemParaCodigo, privacidadeAceita, salvarVotoSugestao,
} from '../api';

const BOTAO = 'min-h-12 px-4 rounded-full border-2 font-extrabold text-sm focus-visible:ring-2 focus-visible:ring-verde focus-visible:ring-offset-2 outline-none disabled:opacity-50';

export default function SugestaoCartao({ market, onFechar, onAviso, onVotoRegistrado, onApagarDados,
  userLat, userLon, userAccuracy, tituloRef, dentroDeDialogo = false }) {
  const minha = market.sugestao === 'minha';
  const [voto, setVoto] = useState(() => lerVotoSugestao(market.id));
  const [ocupado, setOcupado] = useState(false);
  const [politica, setPolitica] = useState(null);
  const [mensagem, setMensagem] = useState('');
  const [confirmandoDenuncia, setConfirmandoDenuncia] = useState(false);
  const botaoRef = useRef(null);
  const denunciaRef = useRef(null);
  const cancelarDenunciaRef = useRef(null);

  useEffect(() => {
    if (politica) requestAnimationFrame(() => document.getElementById('privacy-title')?.focus());
  }, [politica]);

  useEffect(() => {
    if (confirmandoDenuncia) requestAnimationFrame(() => cancelarDenunciaRef.current?.focus());
  }, [confirmandoDenuncia]);

  const avisar = (texto) => { setMensagem(texto); onAviso?.(texto); };
  const executar = async (acao) => {
    if (ocupado) return;
    setOcupado(true);
    setMensagem('');
    try {
      if (acao === 'denúncia') {
        const res = await denunciarSugestao({ sugestaoId: market.id });
        avisar(mensagemParaCodigo(res?.codigo, 'denunciar_sugestao'));
        if (res?.codigo === 'ok') onVotoRegistrado?.();
      } else {
        const posicao = Number.isFinite(userLat) && Number.isFinite(userLon)
          ? { lat: userLat, lng: userLon, accuracy: userAccuracy } : null;
        const res = await apoiarSugestao({ sugestaoId: market.id, voto: acao, local: posicao });
        if (res?.codigo === 'ok') {
          salvarVotoSugestao(market.id, acao);
          setVoto(acao);
          onVotoRegistrado?.();
        }
        avisar(mensagemParaCodigo(res?.codigo, 'apoiar_sugestao'));
      }
    } catch (erro) {
      avisar(erro?.message || mensagemParaCodigo('sem_conexao'));
    } finally { setOcupado(false); }
  };

  const agir = (acao) => {
    if (!privacidadeAceita()) { setPolitica(acao); return; }
    executar(acao);
  };

  if (politica) return <AvisoPrivacidade acao={politica === 'apoio' || politica === 'nego' ? 'apoio' : politica}
    temPendente mostrarAlca={false} dentroDeDialogo={dentroDeDialogo} onApagarDados={onApagarDados}
    onCancelar={() => { const alvo = politica === 'denúncia' ? denunciaRef : botaoRef; setPolitica(null); requestAnimationFrame(() => alvo.current?.focus()); }}
    onConfirmar={() => { aceitarPrivacidade(); const acao = politica; const alvo = acao === 'denúncia' ? denunciaRef : botaoRef; setPolitica(null); executar(acao); requestAnimationFrame(() => alvo.current?.focus()); }} />;

  return <div className="flex min-h-0 flex-col px-4 pb-6">
    <div className="flex items-start justify-between gap-2">
      <div>
        <h2 ref={tituloRef} tabIndex={-1} className="font-display text-[27px] font-extrabold leading-tight text-tinta outline-none">
          {market.nome || `Feira ${market.bairro}`}
        </h2>
        <span className="mt-2 inline-flex rounded-lg bg-areia px-2 py-1 text-xs font-extrabold text-tinta">
          {minha ? 'Aguardando confirmação' : 'Sugerida pela comunidade'}
        </span>
      </div>
      <button type="button" onClick={onFechar} aria-label="Fechar cartão"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-tinta focus-visible:ring-2 focus-visible:ring-verde">
        <X size={20} aria-hidden="true" />
      </button>
    </div>
    <div className="min-h-0 overflow-y-auto pt-4">
      <p className="m-0 text-sm text-tinta">{market.day} · {market.hours}</p>
      <p className="mt-2 text-sm text-tinta-2">{market.address} · {market.bairro}</p>
      {minha && <p className="mt-4 rounded-xl bg-creme p-4 text-sm text-tinta-2">Ela aparece para os outros quando alguém na feira confirmar.</p>}
      {!minha && <div className="mt-4 rounded-xl bg-creme p-4">
        <p className="m-0 mb-3 text-sm font-bold text-tinta">Tem feira aqui?</p>
        <div className="grid grid-cols-2 gap-2">
          <button ref={botaoRef} type="button" disabled={ocupado} aria-pressed={voto === 'apoio'} onClick={() => agir('apoio')}
            className={`${BOTAO} ${voto === 'apoio' ? 'border-verde bg-verde text-papel' : 'border-verde bg-papel text-verde-escuro'}`}>Sim, tem</button>
          <button type="button" disabled={ocupado} aria-pressed={voto === 'nego'} onClick={() => agir('nego')}
            className={`${BOTAO} ${voto === 'nego' ? 'border-tomate bg-tomate text-papel' : 'border-linha bg-papel text-tinta'}`}>Não tem</button>
        </div>
        {voto && <p role="status" className="mb-0 text-xs text-tinta-2">Seu voto: <strong>{voto === 'apoio' ? 'Sim, tem' : 'Não tem'}</strong>. Toque no outro botão para trocar.</p>}
        {confirmandoDenuncia ? <div className="mt-2">
          <p className="m-0 text-sm text-tinta">Denunciar esta sugestão? Use para nome ofensivo ou feira falsa.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" disabled={ocupado} onClick={() => { setConfirmandoDenuncia(false); agir('denúncia'); }}
              className={`${BOTAO} border-tomate bg-papel text-tinta`}>Denunciar</button>
            <button ref={cancelarDenunciaRef} type="button" onClick={() => { setConfirmandoDenuncia(false); requestAnimationFrame(() => denunciaRef.current?.focus()); }}
              className={`${BOTAO} border-linha bg-papel text-tinta`}>Cancelar</button>
          </div>
        </div> : <button ref={denunciaRef} type="button" disabled={ocupado} onClick={() => setConfirmandoDenuncia(true)}
          className="mt-2 min-h-12 px-2 text-xs font-bold text-tinta-2 underline focus-visible:ring-2 focus-visible:ring-verde">Denunciar</button>}
      </div>}
      {mensagem && <p role="alert" className="mt-4 text-sm text-tinta">{mensagem}</p>}
    </div>
  </div>;
}
