// Calculates distance in kilometers using the Haversine formula
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1); 
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}

export function sortMarketsByDistance(markets, userLat, userLon) {
  return [...markets].sort((a, b) => {
    // If a market doesn't have coordinates, push it to the bottom
    if (!a.lat || !a.lng) return 1;
    if (!b.lat || !b.lng) return -1;
    
    const distA = calculateDistance(userLat, userLon, a.lat, a.lng);
    const distB = calculateDistance(userLat, userLon, b.lat, b.lng);
    return distA - distB;
  });
}
