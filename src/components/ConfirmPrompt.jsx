import { useState } from 'react';
import AvisoPrivacidade from './AvisoPrivacidade';
import { aceitarPrivacidade, backendAtivo, privacidadeAceita } from '../api';

export default function ConfirmPrompt({ feira, onAnswer, onDismiss, onApagarDados }) {
  const [respostaPendente, setRespostaPendente] = useState(null);
  const [mostrarPolitica, setMostrarPolitica] = useState(false);

  const escolherResposta = (resposta) => {
    if (!backendAtivo || privacidadeAceita()) {
      onAnswer(resposta);
      return;
    }
    setRespostaPendente(resposta);
    setMostrarPolitica(true);
  };

  const confirmarPolitica = () => {
    if (!aceitarPrivacidade()) return;
    const escolhida = respostaPendente;
    setMostrarPolitica(false);
    setRespostaPendente(null);
    if (escolhida) {
      onAnswer(escolhida);
    }
  };

  if (backendAtivo && mostrarPolitica) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-[120] flex justify-center pointer-events-none">
        <AvisoPrivacidade
          temPendente={Boolean(respostaPendente)}
          onConfirmar={confirmarPolitica}
          onCancelar={() => {
            setMostrarPolitica(false);
            setRespostaPendente(null);
          }}
          onApagarDados={onApagarDados}
          className="shadow-[0_-8px_24px_rgba(59,42,32,0.1)]"
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[120] flex justify-center pointer-events-none">
      <div
        role="dialog"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        className="confirm-sheet pointer-events-auto w-full max-w-md bg-papel rounded-t-[28px] shadow-[0_-8px_24px_rgba(59,42,32,0.1)] pt-4 px-4 pb-6 flex flex-col animate-fade-in"
      >
        <div aria-hidden="true" className="sheet-handle w-12 h-[5px] rounded-lg bg-[#CCBDA9] mx-auto mb-4" />
        <p className="eyebrow text-[11px] font-extrabold tracking-[0.16em] uppercase text-tinta-2 mb-2">
          {backendAtivo ? 'Confirmação compartilhada' : 'Confirmação local'}
        </p>
        <h2
          id="confirm-title"
          className="font-display text-[31px] leading-[1.02] font-extrabold tracking-[-0.05em] text-tinta mt-1 mb-2"
        >
          Tem feira aqui agora?
        </h2>
        <p id="confirm-desc" className="text-[13px] leading-[1.5] text-tinta-2 mb-4">
          Ajude a marcar o que você está vendo em {feira.address} ({feira.bairro}).
        </p>

        <button
          type="button"
          onClick={() => escolherResposta('nao')}
          className="confirm-choice confirm-no w-full h-12 min-h-12 mb-2 px-4 rounded-full font-extrabold text-sm text-verde-escuro bg-papel border-2 border-verde hover:bg-creme transition-colors focus-visible:ring-2 focus-visible:ring-verde outline-none"
        >
          Não, não tem
        </button>
        <button
          type="button"
          onClick={() => escolherResposta('sim')}
          className="confirm-choice confirm-yes w-full h-12 min-h-12 mb-2 px-4 rounded-full font-extrabold text-sm text-papel bg-tomate hover:bg-tomate/90 transition-colors focus-visible:ring-2 focus-visible:ring-verde outline-none"
        >
          Sim, tem feira
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="confirm-choice confirm-later w-full h-12 min-h-12 mt-2 px-4 rounded-full text-sm font-extrabold text-tinta-2 hover:text-tinta focus-visible:ring-2 focus-visible:ring-verde outline-none"
        >
          Agora não
        </button>

        {backendAtivo ? (
          <p className="privacy-note text-[11px] text-center text-tinta-2 mt-2">
            Sem cadastro; ajuda quem vem depois.{' '}
            <button
              type="button"
              onClick={() => setMostrarPolitica(true)}
              className="underline font-bold text-tinta hover:text-verde focus:outline-none"
            >
              Privacidade e dados
            </button>
          </p>
        ) : (
          <p className="privacy-note text-[11px] text-center text-tinta-2 mt-2">
            As respostas ficam só neste aparelho.
          </p>
        )}
      </div>
    </div>
  );
}
