import { Map, List } from 'lucide-react';

const DAYS = ['Todos', 'Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'Sábado', 'Domingo'];

const DAY_COLORS_CLASSES = {
  'Todos': 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  'Segunda-Feira': 'bg-slate-100 text-slate-700 hover:bg-slate-200',
  'Terça-Feira': 'bg-orange-100 text-orange-700 hover:bg-orange-200',
  'Quarta-Feira': 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200',
  'Quinta-Feira': 'bg-green-100 text-green-700 hover:bg-green-200',
  'Sexta-Feira': 'bg-blue-100 text-blue-700 hover:bg-blue-200',
  'Sábado': 'bg-purple-100 text-purple-700 hover:bg-purple-200',
  'Domingo': 'bg-red-100 text-red-700 hover:bg-red-200',
};

const DAY_ACTIVE_CLASSES = {
  'Todos': 'bg-gray-800 text-white shadow-md',
  'Segunda-Feira': 'bg-slate-700 text-white shadow-md',
  'Terça-Feira': 'bg-orange-600 text-white shadow-md',
  'Quarta-Feira': 'bg-yellow-500 text-orange-950 shadow-md',
  'Quinta-Feira': 'bg-green-600 text-white shadow-md',
  'Sexta-Feira': 'bg-blue-600 text-white shadow-md',
  'Sábado': 'bg-purple-600 text-white shadow-md',
  'Domingo': 'bg-red-600 text-white shadow-md',
};

export default function FilterBar({ selectedDay, setSelectedDay, viewMode, setViewMode }) {
  return (
    <nav className="bg-white/90 backdrop-blur-md border-b border-orange-100 relative z-40 shadow-sm" aria-label="Filtros e Visualização">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-4">
        
        {/* Days Scrollable Row with Fade Mask */}
        <div className="relative w-full sm:w-auto group">
          <div className="flex overflow-x-auto no-scrollbar gap-2 py-2 px-2 scroll-smooth" role="tablist" aria-label="Filtrar por dia da semana">
            <div className="w-2 shrink-0" />
            {DAYS.map(day => {
              const isActive = selectedDay === day;
              const baseClass = isActive ? DAY_ACTIVE_CLASSES[day] : DAY_COLORS_CLASSES[day];
              
              return (
                <button
                  key={day}
                  role="tab"
                  aria-selected={isActive}
                  aria-label={isActive ? `${day}, filtro selecionado` : `Filtrar por ${day}`}
                  onClick={() => setSelectedDay(day)}
                  className={`whitespace-nowrap px-[1.25rem] py-[0.625rem] rounded-full text-sm font-bold transition-all border-2 ${isActive ? `${baseClass} border-transparent scale-105 shadow-md z-10` : `border-transparent ${baseClass} opacity-80 hover:opacity-100`} focus-visible:ring-2 focus-visible:ring-orange-500 outline-none`}
                >
                  {day}
                  {isActive && <span className="sr-only"> (Selecionado)</span>}
                </button>
              );
            })}
            <div className="w-2 shrink-0" />
          </div>
          
          <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white/90 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white/90 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"></div>
        </div>

        {/* View Toggle */}
        <div className="flex bg-gray-100/80 p-[0.25rem] rounded-xl shrink-0 border border-gray-200" role="tablist" aria-label="Alternar modo de exibição">
          <button
            role="tab"
            aria-selected={viewMode === 'list'}
            aria-label="Ver feiras em formato de lista"
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-2 px-[1rem] py-[0.5rem] rounded-lg text-sm font-black transition-all focus-visible:ring-2 focus-visible:ring-orange-500 outline-none ${
              viewMode === 'list' ? 'bg-white shadow-md text-orange-700' : 'text-gray-700 hover:text-orange-700'
            }`}
          >
            <List size={18} aria-hidden="true" /> 
            <span>Lista</span>
            {viewMode === 'list' && <span className="sr-only"> (Ativo)</span>}
          </button>
          <button
            role="tab"
            aria-selected={viewMode === 'map'}
            aria-label="Ver feiras no mapa interativo"
            onClick={() => setViewMode('map')}
            className={`flex items-center gap-2 px-[1rem] py-[0.5rem] rounded-lg text-sm font-black transition-all focus-visible:ring-2 focus-visible:ring-orange-500 outline-none ${
              viewMode === 'map' ? 'bg-white shadow-md text-orange-700' : 'text-gray-700 hover:text-orange-700'
            }`}
          >
            <Map size={18} aria-hidden="true" /> 
            <span>Mapa</span>
            {viewMode === 'map' && <span className="sr-only"> (Ativo)</span>}
          </button>
        </div>

      </div>
    </nav>
  );
}
