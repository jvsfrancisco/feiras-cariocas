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

      <div className="relative z-10 w-full max-w-3xl px-4 text-center mt-4">
        <h2 className="text-4xl md:text-5xl font-black text-white mb-4 drop-shadow-lg tracking-tight">
          Feira fresca, perto de você 🥕
        </h2>
        <p className="text-orange-50 text-lg md:text-xl mb-8 font-medium drop-shadow-md">
          Apoie o produtor local e coma melhor!
        </p>
        
        <div className="relative max-w-xl mx-auto">
          <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
            <Search className="h-6 w-6 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-14 pr-6 py-4 rounded-full border-4 border-white/20 bg-white text-gray-900 placeholder:text-gray-400 focus:border-white focus:ring-0 sm:text-lg font-medium shadow-2xl transition-all"
            placeholder="Qual o seu bairro? Ex: Botafogo"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
