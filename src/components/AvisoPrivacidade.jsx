export default function AvisoPrivacidade({
  temPendente = false,
  acao = 'confirmação',
  onConfirmar,
  onCancelar,
  onApagarDados,
  mostrarAlca = true,
  dentroDeDialogo = false,
  className = '',
}) {
  return (
    <div
      role={dentroDeDialogo ? undefined : 'dialog'}
      aria-labelledby={dentroDeDialogo ? undefined : 'privacy-title'}
      aria-describedby={dentroDeDialogo ? undefined : 'privacy-desc'}
      className={`confirm-sheet pointer-events-auto w-full max-w-md bg-papel rounded-t-[28px] pt-4 px-4 pb-6 flex flex-col animate-fade-in motion-reduce:animate-none ${className}`.trim()}
    >
      {mostrarAlca && (
        <div aria-hidden="true" className="sheet-handle w-12 h-[5px] rounded-lg bg-[#CCBDA9] mx-auto mb-4" />
      )}
      <p className="eyebrow text-[11px] font-extrabold tracking-[0.16em] uppercase text-tinta-2 mb-2">
        Privacidade e LGPD
      </p>
      <h2
        id="privacy-title"
        tabIndex={-1}
        className="font-display text-[24px] leading-[1.08] font-extrabold tracking-[-0.04em] text-tinta mt-1 mb-2"
      >
        Antes de compartilhar {acao === 'voto' ? 'seu voto' : acao === 'proposta' ? 'sua proposta' : acao === 'sugestão' ? 'sua sugestão' : acao === 'apoio' ? 'seu apoio' : acao === 'denúncia' ? 'sua denúncia' : 'sua confirmação'}
      </h2>
      <div id="privacy-desc" className="text-[12px] leading-[1.5] text-tinta-2 space-y-2 mb-4">
        <p className="m-0">
          <strong className="text-tinta">O que sai do aparelho:</strong> {acao === 'sugestão'
            ? 'código anônimo de sessão, nome, endereço, bairro, dia, horário e a posição medida. O ponto da sugestão fica público quando ela é publicada.'
            : acao === 'denúncia'
              ? 'código anônimo de sessão e a sugestão denunciada.'
              : acao === 'apoio'
                ? 'código anônimo de sessão, seu voto e, se disponível, sua posição para verificar presença. A coordenada do apoio não é salva.'
                : 'código anônimo de sessão (sem nome nem e-mail), sua resposta e a distância aproximada arredondada a 10 m. Sua coordenada exata não é salva.'} O Supabase registra IP apenas em logs técnicos de infraestrutura.
        </p>
        <p className="m-0">
          <strong className="text-tinta">O que é público:</strong> {acao === 'sugestão'
            ? 'nome, endereço, bairro, dia, horário e ponto da sugestão após apoio presencial, sem identificador do seu aparelho.'
            : acao === 'apoio'
              ? 'a sugestão já publicada; seu voto entra no resultado sem identificador do seu aparelho.'
              : acao === 'denúncia'
                ? 'a denúncia não mostra seu aparelho nem seu nome.'
            : 'o agregado de confirmações da feira (e, quando ativos, trechos propostos, apoios e fotos), sem identificador do seu aparelho.'}
        </p>
        <p className="m-0">
          <strong className="text-tinta">Prazos e exclusão:</strong> {acao === 'sugestão'
            ? 'sugestões pendentes sem apoio suficiente somem após 30 dias.'
            : 'confirmações duram 30 dias e sessões sem uso somem em 90 dias.'} Você pode apagar seus dados enviados.
        </p>
      </div>

      <button
        type="button"
        onClick={onConfirmar}
        className="confirm-choice confirm-yes w-full h-12 min-h-12 mb-2 px-4 rounded-full font-extrabold text-sm text-papel bg-tomate hover:bg-tomate/90 transition-colors focus-visible:ring-2 focus-visible:ring-verde outline-none"
      >
        {temPendente ? (acao === 'voto' || acao === 'proposta' || acao === 'sugestão' || acao === 'apoio' || acao === 'denúncia' ? 'Concordar e enviar' : 'Concordar e enviar resposta') : 'Entendi e concordo'}
      </button>

      {onApagarDados && (
        <button
          type="button"
          onClick={onApagarDados}
          className="confirm-choice w-full h-12 min-h-12 mb-2 px-4 rounded-full font-extrabold text-xs text-verde-escuro bg-papel border border-linha hover:bg-creme transition-colors focus-visible:ring-2 focus-visible:ring-verde outline-none"
        >
          Apagar meus dados enviados
        </button>
      )}

      <button
        type="button"
        onClick={onCancelar}
        className="confirm-choice confirm-later w-full h-12 min-h-12 mt-2 px-4 rounded-full text-xs font-extrabold text-tinta-2 hover:text-tinta focus-visible:ring-2 focus-visible:ring-verde outline-none"
      >
        Cancelar
      </button>
    </div>
  );
}
