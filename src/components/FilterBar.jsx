import { Map, List } from 'lucide-react';

const DAYS = ['Todos', 'Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'Sábado', 'Domingo'];

const DAY_COLORS_CLASSES = {
  'Todos': 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-200',
  'Segunda-Feira': 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200',
  'Terça-Feira': 'bg-orange-100 text-orange-700 hover:bg-orange-200 border-orange-200',
  'Quarta-Feira': 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 border-yellow-200',
  'Quinta-Feira': 'bg-green-100 text-green-700 hover:bg-green-200 border-green-200',
  'Sexta-Feira': 'bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200',
  'Sábado': 'bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-200',
  'Domingo': 'bg-red-100 text-red-700 hover:bg-red-200 border-red-200',
};

const DAY_ACTIVE_CLASSES = {
  'Todos': 'bg-gray-800 text-white border-gray-800 shadow-md',
  'Segunda-Feira': 'bg-slate-600 text-white border-slate-600 shadow-md',
  'Terça-Feira': 'bg-orange-500 text-white border-orange-500 shadow-md',
  'Quarta-Feira': 'bg-yellow-500 text-white border-yellow-500 shadow-md',
  'Quinta-Feira': 'bg-green-500 text-white border-green-500 shadow-md',
  'Sexta-Feira': 'bg-blue-500 text-white border-blue-500 shadow-md',
  'Sábado': 'bg-purple-500 text-white border-purple-500 shadow-md',
  'Domingo': 'bg-red-500 text-white border-red-500 shadow-md',
};

export default function FilterBar({ selectedDay, setSelectedDay, viewMode, setViewMode }) {
  return (
    <div className="bg-white/80 backdrop-blur-md border-b border-orange-100 relative z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-4">
        
        {/* Days Scrollable Row */}
        <div className="flex overflow-x-auto no-scrollbar w-full sm:w-auto gap-2 py-2">
          <div className="w-2 shrink-0" /> {/* Spacer for scaling */}
          {DAYS.map(day => {
            const isActive = selectedDay === day;
            const baseClass = isActive ? DAY_ACTIVE_CLASSES[day] : DAY_COLORS_CLASSES[day];
            
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold transition-all border ${baseClass} ${isActive ? 'scale-105' : ''}`}
              >
                {day}
              </button>
            );
          })}
          <div className="w-2 shrink-0" /> {/* Spacer for scaling */}
        </div>

        {/* View Toggle */}
        <div className="flex bg-orange-50 p-1 rounded-xl shrink-0 border border-orange-100">
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              viewMode === 'list' ? 'bg-white shadow-sm text-orange-600 ring-1 ring-orange-200' : 'text-orange-900/60 hover:text-orange-600'
            }`}
          >
            <List size={18} /> Lista
          </button>
          <button
            onClick={() => setViewMode('map')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              viewMode === 'map' ? 'bg-white shadow-sm text-orange-600 ring-1 ring-orange-200' : 'text-orange-900/60 hover:text-orange-600'
            }`}
          >
            <Map size={18} /> Mapa
          </button>
        </div>

      </div>
    </div>
  );
}
