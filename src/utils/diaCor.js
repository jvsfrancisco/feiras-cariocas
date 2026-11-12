import { lerHorario, nomeDoDia } from './confirmacoes.js';

const PAPEL = '#FFFDF8';
const TINTA = '#3B2A20';
const CORES = {
  'Segunda-Feira': { rotulo: 'Seg', forte: '#5B7A3A', suave: '#E8EEDB', texto: '#36531E', sobreForte: PAPEL, acao: '#5B7A3A' },
  'Terça-Feira': { rotulo: 'Ter', forte: '#C73A22', suave: '#F8DDD4', texto: '#942A17', sobreForte: PAPEL, acao: '#C73A22' },
  'Quarta-Feira': { rotulo: 'Qua', forte: '#E07A10', suave: '#FBE9CC', texto: '#754000', sobreForte: TINTA, acao: '#E07A10' },
  'Quinta-Feira': { rotulo: 'Qui', forte: '#A8325E', suave: '#F4DCE6', texto: '#842445', sobreForte: PAPEL, acao: '#A8325E' },
  'Sexta-Feira': { rotulo: 'Sex', forte: '#1F8A8A', suave: '#DDEEEA', texto: '#125D5D', sobreForte: '#1A100A', acao: '#156666', sobreAcao: PAPEL },
  'Sábado': { rotulo: 'Sáb', forte: '#D9566C', suave: '#F9E1E5', texto: '#97263B', sobreForte: '#241810', acao: '#9D2A43', sobreAcao: PAPEL },
  'Domingo': { rotulo: 'Dom', forte: '#7C4A92', suave: '#EDDEF2', texto: '#603475', sobreForte: PAPEL, acao: '#7C4A92' },
};

export const DIAS_COM_COR = Object.keys(CORES);
export function diaCor(dia) { return CORES[dia] ?? CORES['Segunda-Feira']; }
export function acontecendoAgora(feira, agora) {
  if (!feira || feira.day !== nomeDoDia(agora)) return false;
  const janela = lerHorario(feira.hours);
  if (!janela) return false;
  const minutos = agora.getHours() * 60 + agora.getMinutes();
  return minutos >= janela.inicio && minutos < janela.fim;
}
