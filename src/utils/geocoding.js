// Approximate center coordinates for some main neighborhoods/RAs in Rio
// To spread the pins out on the map since the raw data lacks exact coords.
const BAIRRO_COORDS = {
  "Saúde": { lat: -22.8955, lng: -43.1848 },
  "Caju": { lat: -22.8833, lng: -43.2167 },
  "Centro": { lat: -22.9068, lng: -43.1729 },
  "Catumbi": { lat: -22.9197, lng: -43.1930 },
  "Rio Comprido": { lat: -22.9238, lng: -43.2089 },
  "Cidade Nova": { lat: -22.9103, lng: -43.2033 },
  "Estácio": { lat: -22.9150, lng: -43.2006 },
  "São Cristóvão": { lat: -22.8967, lng: -43.2217 },
  "Santa Teresa": { lat: -22.9258, lng: -43.1878 },
  "Flamengo": { lat: -22.9344, lng: -43.1764 },
  "Glória": { lat: -22.9200, lng: -43.1750 },
  "Laranjeiras": { lat: -22.9344, lng: -43.1875 },
  "Botafogo": { lat: -22.9511, lng: -43.1808 },
  "Humaitá": { lat: -22.9558, lng: -43.1978 },
  "Urca": { lat: -22.9536, lng: -43.1656 },
  "Leme": { lat: -22.9633, lng: -43.1653 },
  "Copacabana": { lat: -22.9711, lng: -43.1822 },
  "Ipanema": { lat: -22.9836, lng: -43.2044 },
  "Leblon": { lat: -22.9828, lng: -43.2206 },
  "Lagoa": { lat: -22.9692, lng: -43.2028 },
  "Jardim Botânico": { lat: -22.9667, lng: -43.2239 },
  "Gávea": { lat: -22.9786, lng: -43.2389 },
  "Praça da Bandeira": { lat: -22.9131, lng: -43.2164 },
  "Tijuca": { lat: -22.9314, lng: -43.2383 },
  "Maracanã": { lat: -22.9139, lng: -43.2269 },
  "Vila Isabel": { lat: -22.9150, lng: -43.2450 },
  "Andaraí": { lat: -22.9272, lng: -43.2503 },
  "Grajaú": { lat: -22.9189, lng: -43.2647 },
  "Bonsucesso": { lat: -22.8631, lng: -43.2536 },
  "Ramos": { lat: -22.8500, lng: -43.2547 },
  "Olaria": { lat: -22.8428, lng: -43.2661 },
  "Penha": { lat: -22.8361, lng: -43.2758 },
  "Braz de Pina": { lat: -22.8278, lng: -43.2842 },
  "Vigário Geral": { lat: -22.8097, lng: -43.3086 },
  "Jardim América": { lat: -22.8122, lng: -43.3275 },
  "Maria da Graça": { lat: -22.8833, lng: -43.2650 },
  "Del Castilho": { lat: -22.8803, lng: -43.2736 },
  "Inhaúma": { lat: -22.8753, lng: -43.2831 },
  "Engenho da Rainha": { lat: -22.8625, lng: -43.3000 },
  "Rocha": { lat: -22.9025, lng: -43.2467 },
  "Riachuelo": { lat: -22.9031, lng: -43.2542 },
  "Engenho Novo": { lat: -22.9067, lng: -43.2667 },
  "Lins de Vasconcelos": { lat: -22.9150, lng: -43.2800 },
  "Méier": { lat: -22.8997, lng: -43.2800 },
  "Cachambi": { lat: -22.8911, lng: -43.2736 },
  "Engenho de Dentro": { lat: -22.8953, lng: -43.2981 },
  "Encantado": { lat: -22.8967, lng: -43.3061 },
  "Piedade": { lat: -22.8864, lng: -43.3089 },
  "Pilares": { lat: -22.8789, lng: -43.2953 },
  "Vila Kosmos": { lat: -22.8533, lng: -43.3106 },
  "Vicente de Carvalho": { lat: -22.8528, lng: -43.3158 },
  "Vista Alegre": { lat: -22.8286, lng: -43.3183 },
  "Irajá": { lat: -22.8333, lng: -43.3250 },
  "Campinho": { lat: -22.8850, lng: -43.3500 },
  "Quintino Bocaiúva": { lat: -22.8864, lng: -43.3200 },
  "Cavalcanti": { lat: -22.8667, lng: -43.3167 },
  "Engenheiro Leal": { lat: -22.8731, lng: -43.3258 },
  "Cascadura": { lat: -22.8822, lng: -43.3308 },
  "Madureira": { lat: -22.8725, lng: -43.3364 },
  "Vaz Lobo": { lat: -22.8569, lng: -43.3306 },
  "Rocha Miranda": { lat: -22.8464, lng: -43.3444 },
  "Honório Gurgel": { lat: -22.8447, lng: -43.3514 },
  "Oswaldo Cruz": { lat: -22.8681, lng: -43.3481 },
  "Bento Ribeiro": { lat: -22.8631, lng: -43.3614 },
  "Marechal Hermes": { lat: -22.8617, lng: -43.3719 },
  "Ribeira": { lat: -22.8236, lng: -43.1678 },
  "Cacuia": { lat: -22.8167, lng: -43.1833 },
  "Freguesia (Ilha)": { lat: -22.7933, lng: -43.1700 },
  "Jardim Guanabara": { lat: -22.8106, lng: -43.2008 },
  "Tauá": { lat: -22.8058, lng: -43.1814 },
  "Portuguesa": { lat: -22.8011, lng: -43.2056 },
  "Guadalupe": { lat: -22.8389, lng: -43.3761 },
  "Ricardo de Albuquerque": { lat: -22.8381, lng: -43.3986 },
  "Coelho Neto": { lat: -22.8306, lng: -43.3469 },
  "Costa Barros": { lat: -22.8164, lng: -43.3611 },
  "Jacarepaguá": { lat: -22.9553, lng: -43.3853 },
  "Gardênia Azul": { lat: -22.9583, lng: -43.3467 },
  "Cidade de Deus": { lat: -22.9467, lng: -43.3639 },
  "Freguesia (Jacarepaguá)": { lat: -22.9419, lng: -43.3397 },
  "Taquara": { lat: -22.9233, lng: -43.3711 },
  "Tanque": { lat: -22.9150, lng: -43.3511 },
  "Praça Seca": { lat: -22.8944, lng: -43.3556 },
  "Vila Valqueire": { lat: -22.8839, lng: -43.3672 },
  "Barra da Tijuca": { lat: -23.0003, lng: -43.3659 },
  "Campo dos Afonsos": { lat: -22.8825, lng: -43.3831 },
  "Magalhães Bastos": { lat: -22.8711, lng: -43.4072 },
  "Realengo": { lat: -22.8767, lng: -43.4253 },
  "Padre Miguel": { lat: -22.8808, lng: -43.4428 },
  "Bangu": { lat: -22.8781, lng: -43.4656 },
  "Senador Câmara": { lat: -22.8778, lng: -43.4900 },
  "Campo Grande": { lat: -22.9039, lng: -43.5583 },
  "Santa Cruz": { lat: -22.9167, lng: -43.6833 },
  "Sepetiba": { lat: -22.9733, lng: -43.6992 },
  "Maré": { lat: -22.8614, lng: -43.2425 },
};

export function appendCoordinates(markets) {
  return markets.map(market => {
    if (market.lat && market.lng) return market; // Already has coords

    const coords = BAIRRO_COORDS[market.bairro];
    if (coords) {
      // Add a tiny random offset so pins in the same neighborhood don't overlap perfectly
      const randomOffsetLat = (Math.random() - 0.5) * 0.005;
      const randomOffsetLng = (Math.random() - 0.5) * 0.005;
      return {
        ...market,
        lat: coords.lat + randomOffsetLat,
        lng: coords.lng + randomOffsetLng
      };
    }

    // Default to roughly center of Rio if no match
    return {
      ...market,
      lat: -22.9068,
      lng: -43.1729
    };
  });
}
