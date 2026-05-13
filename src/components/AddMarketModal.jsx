import { useState } from 'react';
import { X } from 'lucide-react';
import confetti from 'canvas-confetti';

const DIAS = ['Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'Sábado', 'Domingo'];

export default function AddMarketModal({ isOpen, onClose, onAdd }) {
  const [formData, setFormData] = useState({
    address: '',
    bairro: '',
    day: 'Sexta-Feira',
    timeStart: '07:00',
    timeEnd: '13:00',
    ra: 'Outra'
  });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    
    onAdd({
      address: formData.address,
      bairro: formData.bairro,
      day: formData.day,
      hours: `${formData.timeStart}–${formData.timeEnd}`,
      ra: formData.ra
    });

    confetti({
      particleCount: 150,
      spread: 90,
      origin: { y: 0.6 },
      colors: ['#22c55e', '#f97316', '#eab308']
    });

    onClose();
    setFormData({
      address: '', bairro: '', day: 'Sexta-Feira', timeStart: '07:00', timeEnd: '13:00', ra: 'Outra'
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-orange-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden ring-4 ring-white/50 animate-in fade-in zoom-in-95 duration-200">
        
        <div className="flex justify-between items-center px-6 py-5 bg-gradient-to-r from-orange-50 to-yellow-50 border-b border-orange-100">
          <div>
            <h2 className="text-xl font-black text-orange-900 flex items-center gap-2">
              <span className="text-2xl">✨</span> Sugerir Feira
            </h2>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 bg-white rounded-full hover:bg-orange-100 text-orange-400 hover:text-orange-600 transition-colors shadow-sm">
            <X size={18} strokeWidth={3} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label htmlFor="market-address" className="block text-sm font-bold text-gray-700 mb-1.5 cursor-pointer">Endereço</label>
            <input 
              id="market-address"
              required
              type="text" 
              className="w-full rounded-xl border-2 border-orange-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-4 focus:ring-orange-500/20 focus:border-orange-400 transition-all placeholder:text-gray-400 font-medium"
              placeholder="Ex: Rua Voluntários da Pátria"
              value={formData.address}
              onChange={e => setFormData({...formData, address: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="market-bairro" className="block text-sm font-bold text-gray-700 mb-1.5 cursor-pointer">Bairro</label>
              <input 
                id="market-bairro"
                required
                type="text" 
                className="w-full rounded-xl border-2 border-orange-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-4 focus:ring-orange-500/20 focus:border-orange-400 transition-all placeholder:text-gray-400 font-medium"
                placeholder="Ex: Botafogo"
                value={formData.bairro}
                onChange={e => setFormData({...formData, bairro: e.target.value})}
              />
            </div>
            <div>
              <label htmlFor="market-day" className="block text-sm font-bold text-gray-700 mb-1.5 cursor-pointer">Dia</label>
              <select 
                id="market-day"
                className="w-full rounded-xl border-2 border-orange-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-4 focus:ring-orange-500/20 focus:border-orange-400 bg-white transition-all text-gray-700 font-bold"
                value={formData.day}
                onChange={e => setFormData({...formData, day: e.target.value})}
              >
                {DIAS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="time-start" className="block text-sm font-bold text-gray-700 mb-1.5 cursor-pointer">Início</label>
              <input 
                id="time-start"
                required
                type="time" 
                className="w-full rounded-xl border-2 border-orange-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-4 focus:ring-orange-500/20 focus:border-orange-400 transition-all text-gray-700 font-medium"
                value={formData.timeStart}
                onChange={e => setFormData({...formData, timeStart: e.target.value})}
              />
            </div>
            <div>
              <label htmlFor="time-end" className="block text-sm font-bold text-gray-700 mb-1.5 cursor-pointer">Fim</label>
              <input 
                id="time-end"
                required
                type="time" 
                className="w-full rounded-xl border-2 border-orange-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-4 focus:ring-orange-500/20 focus:border-orange-400 transition-all text-gray-700 font-medium"
                value={formData.timeEnd}
                onChange={e => setFormData({...formData, timeEnd: e.target.value})}
              />
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button 
              type="button"
              onClick={onClose}
              className="w-1/3 px-4 py-3 text-sm font-bold text-gray-600 bg-white border-2 border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              className="w-2/3 bg-green-500 hover:bg-green-600 text-white font-black py-3 px-4 rounded-xl transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
            >
              Salvar Feira
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
