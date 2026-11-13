import { useCallback, useEffect, useState } from 'react';
import { INITIAL_FEIRAS } from '../data/feiras';
import { backendAtivo, carregarDadosPublicos, carregarSugestoesPublicas, minhasSugestoes } from '../api';
import { adaptarSugestao, lerMapaIds } from '../utils/sugestoes';

const CHAVE_CUSTOM = 'feiras_cariocas_custom';

function lerCustom() {
  try {
    const stored = localStorage.getItem(CHAVE_CUSTOM);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Carrega as feiras na primeira renderização (dados locais, sem chamada assíncrona).
function carregarMercados() {
  // Migration: extract user-added markets from legacy storage key
  try {
    const legacyData = localStorage.getItem('feiras_cariocas_data');
    if (legacyData) {
      const parsedLegacy = JSON.parse(legacyData);
      const communityAdded = parsedLegacy.filter(m => m.isCommunityAdded);
      if (communityAdded.length > 0) {
        localStorage.setItem(CHAVE_CUSTOM, JSON.stringify(communityAdded));
      }
      localStorage.removeItem('feiras_cariocas_data');
    }
  } catch {
    // Dados legados inválidos: ignora a migração
  }

  // Load only community added markets from local storage
  return [...INITIAL_FEIRAS, ...lerCustom()];
}

export function useMarkets() {
  const [markets, setMarkets] = useState(carregarMercados);
  const [confirmacoesPublicas, setConfirmacoesPublicas] = useState({});
  const isLoading = false;

  const aplicarDados = useCallback((dados, publicas, minhas) => {
    const base = Array.isArray(dados?.feiras) && dados.feiras.length > 0 ? dados.feiras : INITIAL_FEIRAS;
    const idsBase = new Set(base.map((f) => String(f.id)));
    const minhasPendentes = (Array.isArray(minhas) ? minhas : [])
      .filter((s) => s.status === 'pendente' && !idsBase.has(String(s.id)))
      .map((s) => adaptarSugestao(s, true));
    const idsMinhas = new Set(minhasPendentes.map((s) => s.id));
    const sugestoesPublicas = (Array.isArray(publicas) ? publicas : [])
      .filter((s) => !idsBase.has(String(s.id)) && !idsMinhas.has(String(s.id)))
      .map((s) => adaptarSugestao(s));
    const idsServidor = new Set([...idsBase, ...idsMinhas, ...sugestoesPublicas.map((s) => s.id)]);
    const mapa = lerMapaIds();
    const custom = lerCustom();
    const locais = custom.filter((f) => !mapa[String(f.id)] || !idsServidor.has(mapa[String(f.id)]));
    if (locais.length !== custom.length) localStorage.setItem(CHAVE_CUSTOM, JSON.stringify(locais));
    setMarkets([...base, ...minhasPendentes, ...sugestoesPublicas, ...locais]);
    setConfirmacoesPublicas(dados?.confirmacoesPorFeira ?? {});
  }, []);

  const recarregarPublicos = useCallback(async () => {
    if (!backendAtivo) return;
    try {
      const [dados, publicas, minhas] = await Promise.all([
        carregarDadosPublicos(), carregarSugestoesPublicas().catch(() => []), minhasSugestoes().catch(() => []),
      ]);
      aplicarDados(dados, publicas, minhas);
    } catch {
      // Queda silenciosa para src/data/feiras.js quando a API falha ou está offline
    }
  }, [aplicarDados]);

  useEffect(() => {
    if (!backendAtivo) return undefined;
    let ativo = true;
    Promise.all([
      carregarDadosPublicos(), carregarSugestoesPublicas().catch(() => []), minhasSugestoes().catch(() => []),
    ]).then(([dados, publicas, minhas]) => {
      if (ativo) aplicarDados(dados, publicas, minhas);
    }).catch(() => {});
    return () => { ativo = false; };
  }, [aplicarDados]);

  const addMarket = (newMarket) => {
    const marketWithMeta = {
      ...newMarket,
      id: Date.now().toString(),
      isCommunityAdded: true
    };

    const updatedCustom = [...lerCustom(), marketWithMeta];

    localStorage.setItem(CHAVE_CUSTOM, JSON.stringify(updatedCustom));
    setMarkets((atuais) => {
      const base = atuais.filter((m) => !m.isCommunityAdded);
      return [...base, ...updatedCustom];
    });

    return marketWithMeta;
  };

  const removeMarket = (id) => {
    const updatedCustom = lerCustom().filter(m => m.id !== id);

    localStorage.setItem(CHAVE_CUSTOM, JSON.stringify(updatedCustom));
    setMarkets((atuais) => {
      const base = atuais.filter((m) => !m.isCommunityAdded);
      return [...base, ...updatedCustom];
    });
  };

  return {
    markets,
    isLoading,
    addMarket,
    removeMarket,
    confirmacoesPublicas,
    recarregarPublicos,
  };
}
