import { useState, useEffect } from 'react';
import { INITIAL_FEIRAS } from '../data/feiras';

export function useMarkets() {
  const [markets, setMarkets] = useState([]);

  useEffect(() => {
    // Migration: extract user-added markets from legacy storage key
    const legacyData = localStorage.getItem('feiras_cariocas_data');
    if (legacyData) {
      const parsedLegacy = JSON.parse(legacyData);
      const communityAdded = parsedLegacy.filter(m => m.isCommunityAdded);
      if (communityAdded.length > 0) {
        localStorage.setItem('feiras_cariocas_custom', JSON.stringify(communityAdded));
      }
      localStorage.removeItem('feiras_cariocas_data');
    }

    // Load only community added markets from local storage
    const storedCustom = localStorage.getItem('feiras_cariocas_custom');
    const customMarkets = storedCustom ? JSON.parse(storedCustom) : [];
    
    setMarkets([...INITIAL_FEIRAS, ...customMarkets]);
  }, []);

  const addMarket = (newMarket) => {
    const marketWithMeta = {
      ...newMarket,
      id: Date.now().toString(),
      isCommunityAdded: true
    };
    
    const storedCustom = localStorage.getItem('feiras_cariocas_custom');
    const customMarkets = storedCustom ? JSON.parse(storedCustom) : [];
    const updatedCustom = [...customMarkets, marketWithMeta];
    
    localStorage.setItem('feiras_cariocas_custom', JSON.stringify(updatedCustom));
    setMarkets([...INITIAL_FEIRAS, ...updatedCustom]);
    
    return marketWithMeta;
  };

  const removeMarket = (id) => {
    const storedCustom = localStorage.getItem('feiras_cariocas_custom');
    const customMarkets = storedCustom ? JSON.parse(storedCustom) : [];
    const updatedCustom = customMarkets.filter(m => m.id !== id);
    
    localStorage.setItem('feiras_cariocas_custom', JSON.stringify(updatedCustom));
    setMarkets([...INITIAL_FEIRAS, ...updatedCustom]);
  };

  return { markets, addMarket, removeMarket };
}
