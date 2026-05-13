import { Search } from 'lucide-react';

export default function Hero({ searchTerm, setSearchTerm }) {
  return (
    <div className="relative h-[320px] w-full flex items-center justify-center overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 w-full h-full bg-cover bg-center transition-transform duration-1000 hover:scale-105"
        style={{ backgroundImage: 'url(/hero.png)' }}
      >
        <div className="absolute inset-0 bg-gradient-vibrant mix-blend-multiply"></div>
      </div>

      <div className="relative z-10 w-full max-w-3xl px-6 text-center animate-fade-in">
        <h2 className="text-4xl md:text-5xl font-black text-white mb-4 drop-shadow-lg tracking-tight">
          Feira fresca, perto de você 🥕
        </h2>
        <p className="text-white/90 text-lg md:text-xl mb-10 font-bold drop-shadow-md">
          Apoie o produtor local e descubra as melhores feiras do Rio!
        </p>
        
        <div className="relative max-w-xl mx-auto group">
          <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
            <Search className="h-6 w-6 text-gray-400 group-focus-within:text-orange-500 transition-colors" />
          </div>
          <input
            type="text"
            aria-label="Buscar feiras pelo nome do bairro"
            className="block w-full pl-16 pr-8 py-4 rounded-full border-none bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-orange-500/20 sm:text-lg font-medium shadow-2xl transition-all duration-300"
            placeholder="Qual o seu bairro? Ex: Botafogo"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <div className="absolute inset-0 rounded-full bg-white/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity -z-10"></div>
        </div>
      </div>
    </div>
  );
}
