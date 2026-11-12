import { nomeDoDia } from '../utils/confirmacoes';
import { DIAS_COM_COR, diaCor } from '../utils/diaCor';
import { LocateFixed } from 'lucide-react';

const ROTULOS = {
  'Segunda-Feira': 'Seg',
  'Terça-Feira': 'Ter',
  'Quarta-Feira': 'Qua',
  'Quinta-Feira': 'Qui',
  'Sexta-Feira': 'Sex',
  'Sábado': 'Sáb',
  'Domingo': 'Dom',
};

function opcoes(hoje) {
  const indice = DIAS_COM_COR.indexOf(hoje);
  // Depois de "Hoje" e "Todos", os outros dias seguem a ordem a partir de amanhã.
  const seguintes = [...DIAS_COM_COR.slice(indice + 1), ...DIAS_COM_COR.slice(0, indice)];
  return [
    { valor: hoje, rotulo: `Hoje · ${ROTULOS[hoje]}`, aria: `Hoje, ${hoje}` },
    { valor: 'Todos', rotulo: 'Todos', aria: 'Todos os dias' },
    ...seguintes.map((d) => ({ valor: d, rotulo: ROTULOS[d], aria: d })),
  ];
}

// Chips de dia com rolagem horizontal. "Perto de mim" é o primeiro item quando ainda não há
// localização; depois vem o chip selecionado e os demais. Máscara de 32 px na borda direita.
export default function FilterBar({
  selectedDay,
  setSelectedDay,
  className = '',
  onNear,
  noMapa = false,
  agora = new Date(),
}) {
  const hoje = nomeDoDia(agora);
  const todas = opcoes(hoje);
  const selecionada = todas.find((opcao) => opcao.valor === selectedDay);
  const ordenadas = selecionada ? [selecionada, ...todas.filter((opcao) => opcao !== selecionada)] : todas;

  return (
    <nav aria-label="Filtrar por dia da semana" className={`w-full max-w-7xl mx-auto ${className}`}>
      <div
        className="flex gap-2 overflow-x-auto no-scrollbar touch-pan-x px-4 [-webkit-mask-image:linear-gradient(to_right,#3B2A20_0,#3B2A20_calc(100%-32px),transparent_100%)] [mask-image:linear-gradient(to_right,#3B2A20_0,#3B2A20_calc(100%-32px),transparent_100%)]"
        onTouchStart={(e) => e.stopPropagation()}
      >
        {onNear && (
          <button
            type="button"
            onClick={onNear}
            className="near-btn shrink-0 whitespace-nowrap h-12 min-h-12 px-4 rounded-full bg-verde text-papel border-2 border-verde font-extrabold text-sm inline-flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-verde"
          >
            <LocateFixed size={20} aria-hidden="true" />
            Perto de mim
          </button>
        )}
        {ordenadas.map(({ valor, rotulo, aria }) => {
          const ativo = selectedDay === valor;
          const cor = valor === 'Todos' ? null : diaCor(valor);
          const fundo = cor ? cor.acao : '#5B7A3A';
          const textoAtivo = cor ? (cor.sobreAcao ?? cor.sobreForte) : '#FFFDF8';
          return (
            <button
              key={valor}
              type="button"
              aria-pressed={ativo}
              aria-label={ativo ? `${aria}, filtro selecionado` : `Filtrar por ${aria}`}
              onClick={() => setSelectedDay(valor)}
              className={`chip shrink-0 whitespace-nowrap h-12 min-h-12 px-4 rounded-full font-extrabold border-2 inline-flex items-center gap-2 transition-colors focus-visible:ring-2 focus-visible:ring-verde focus-visible:ring-offset-2 outline-none ${
                noMapa ? 'text-xs shadow-[0_1px_3px_rgba(74,49,29,0.08)]' : 'text-[13px]'
              } ${ativo ? '' : 'bg-papel text-tinta'}`}
              style={ativo
                ? { backgroundColor: fundo, borderColor: fundo, color: textoAtivo }
                : { borderColor: '#E6D8C5' }}
            >
              <span
                aria-hidden="true"
                className="chip-dot w-3.5 h-3.5 rounded-full shrink-0"
                style={{
                  background: ativo ? textoAtivo : (cor ? cor.forte : '#5B7A3A'),
                }}
              />
              {rotulo}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
