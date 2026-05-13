import { Plus, Search } from 'lucide-react';

export default function Header({ onAddClick, searchTerm, setSearchTerm, viewMode }) {
  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md shadow-sm border-b border-orange-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 cursor-pointer group shrink-0">
          <span className="text-3xl group-hover:rotate-12 transition-transform duration-300">🍉</span>
          <h1 className="hidden sm:block text-2xl font-extrabold bg-gradient-to-r from-orange-500 to-green-500 bg-clip-text text-transparent tracking-tight">
            Feiras Cariocas
          </h1>
        </div>
        
        {/* Search Bar (Only visible in Map view with animation) */}
        {viewMode === 'map' ? (
          <div className="flex-1 max-w-md relative transition-all animate-slide-down">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              aria-label="Buscar feiras por bairro"
              className="block w-full pl-10 pr-4 py-2.5 rounded-full border-2 border-orange-100 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-orange-500/20 focus:border-orange-400 text-sm font-medium shadow-sm transition-all duration-300"
              placeholder="Buscar por bairro..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        ) : (
          <div className="flex-1"></div>
        )}
        
        <button 
          onClick={onAddClick}
          aria-label="Sugerir uma nova feira"
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 md:px-6 py-2.5 rounded-full font-bold transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 shrink-0"
        >
          <Plus size={18} strokeWidth={3} />
          <span className="hidden md:inline">Adicionar</span>
        </button>
      </div>
    </header>
  );
}
