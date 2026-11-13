import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Trash2, TriangleAlert } from 'lucide-react';
import Fruta from './Frutas';
import { MAX_FOTOS, adicionarFoto, listarFotos, removerFoto } from '../utils/fotos';
import { backendAtivo } from '../api';
import FeiraFotosServidor from './FeiraFotosServidor';

const MSG_LEITURA =
  'Não foi possível abrir as fotos deste aparelho. Isso pode acontecer em aba anônima ou com o armazenamento bloqueado. O resto do cartão continua funcionando.';
const MSG_GRAVAR =
  'Não foi possível salvar a foto neste aparelho. Verifique se há espaço livre e se o navegador permite guardar dados.';
const MSG_REMOVER = 'Não foi possível remover a foto. Tente de novo.';

function formatarData(iso) {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  } catch {
    return '';
  }
}

// Fotos desta feira, guardadas só neste aparelho (IndexedDB). Sem servidor.
export default function FeiraFotos(props) {
  if (backendAtivo) return <FeiraFotosServidor {...props} />;
  return <FeiraFotosLocal {...props} />;
}

function FeiraFotosLocal({ feiraId, bairro }) {
  // fotos: lista de { id, url, data }; estado: 'carregando' | 'pronto' | 'indisponivel'
  const [fotos, setFotos] = useState([]);
  const [estado, setEstado] = useState('carregando');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const entradaRef = useRef(null);
  const urlsRef = useRef([]);

  // Transforma os registros do banco em URLs de objeto e solta as anteriores.
  const mostrar = useCallback((registros) => {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    const novas = registros.map((r) => ({ id: r.id, url: URL.createObjectURL(r.blob), data: r.data }));
    urlsRef.current = novas.map((f) => f.url);
    setFotos(novas);
  }, []);

  useEffect(() => {
    let vivo = true;
    // Cada abertura começa do zero; o estado só muda quando a leitura termina.
    listarFotos(feiraId)
      .then((registros) => {
        if (!vivo) return;
        mostrar(registros);
        setEstado('pronto');
      })
      .catch(() => {
        if (!vivo) return;
        setEstado('indisponivel');
      });
    return () => {
      vivo = false;
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      urlsRef.current = [];
    };
  }, [feiraId, mostrar]);

  const aoEscolher = async (e) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setErro('');
    setOcupado(true);
    try {
      mostrar(await adicionarFoto(feiraId, arquivo));
    } catch (err) {
      setErro(err?.message === 'limite' ? `Esta feira já tem ${MAX_FOTOS} fotos neste aparelho. Remova uma para adicionar outra.` : MSG_GRAVAR);
    } finally {
      setOcupado(false);
    }
  };

  const remover = async (id) => {
    setErro('');
    try {
      mostrar(await removerFoto(feiraId, id));
    } catch {
      setErro(MSG_REMOVER);
    }
  };

  const cheio = fotos.length >= MAX_FOTOS;

  if (estado === 'indisponivel') {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="flex items-start gap-2 text-sm leading-6 text-tomate">
          <TriangleAlert size={16} className="shrink-0 mt-1" aria-hidden="true" />
          <span>{MSG_LEITURA}</span>
        </p>
        <Avisos />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={entradaRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={aoEscolher}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      {erro && (
        <p role="alert" className="flex items-start gap-2 text-sm leading-6 text-tomate">
          <TriangleAlert size={16} className="shrink-0 mt-1" aria-hidden="true" />
          <span>{erro}</span>
        </p>
      )}

      {estado === 'carregando' && (
        <p role="status" className="text-sm leading-6 text-tinta-2 text-center">Abrindo as fotos...</p>
      )}

      {estado === 'pronto' && fotos.length === 0 && (
        <div className="photos-empty flex flex-col items-center gap-1 py-1 text-center">
          <Fruta nome="tomato" className="w-24 h-24 mb-1" />
          <h3 className="font-display font-extrabold text-[19px] leading-[1.1] tracking-[-0.05em] text-tinta mb-1">
            Nenhuma foto neste aparelho ainda.
          </h3>
          <p className="text-xs leading-[1.5] text-tinta-2">
            Uma foto das barracas pode ajudar você a lembrar dessa feira.
          </p>
        </div>
      )}

      {fotos.length > 0 && (
        <ul className="photo-grid grid grid-cols-2 gap-2">
          {fotos.map((f, i) => {
            const data = formatarData(f.data);
            return (
              <li key={f.id} className="relative aspect-square rounded-xl overflow-hidden bg-areia">
                <img
                  src={f.url}
                  alt={`Foto ${i + 1} da feira ${bairro}${data ? `, tirada em ${data}` : ''}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <button
                  type="button"
                  onClick={() => remover(f.id)}
                  aria-label={`Remover foto ${i + 1} da feira ${bairro}`}
                  className="absolute right-2 top-2 w-12 h-12 rounded-full bg-papel text-tomate flex items-center justify-center shadow-[0_4px_8px_rgba(27,42,34,0.25)] active:scale-95 focus-visible:ring-2 focus-visible:ring-verde outline-none"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={() => entradaRef.current?.click()}
        disabled={ocupado || cheio || estado !== 'pronto'}
        className="pill-btn photo-add h-12 min-h-12 w-full rounded-full bg-verde text-papel font-extrabold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 focus-visible:ring-2 focus-visible:ring-verde focus-visible:ring-offset-2 outline-none"
      >
        <Camera size={20} aria-hidden="true" />
        {ocupado ? 'Salvando...' : cheio ? `Limite de ${MAX_FOTOS} fotos` : 'Adicionar foto'}
      </button>
      <Avisos />
    </div>
  );
}

function Avisos() {
  return (
    <div className="flex flex-col gap-2">
      <p className="notice text-[11px] leading-[1.45] text-[#55483B] rounded-xl bg-[#F4EFE5] px-3 py-2.5">
        As fotos ficam só neste aparelho. Ainda não existe servidor para compartilhar com outras pessoas.
      </p>
      <p className="photo-tip text-[11px] leading-[1.45] text-tinta-2">
        Fotografe as barracas de longe, evite pegar rostos.
      </p>
    </div>
  );
}
