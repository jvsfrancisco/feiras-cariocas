import fs from 'fs/promises';

const feirasText = await fs.readFile('./src/data/feiras.js', 'utf-8');
const feirasMatch = feirasText.match(/export const INITIAL_FEIRAS = (\[[\s\S]*?\]);/);
if (!feirasMatch) {
  console.error("Could not parse feiras.js");
  process.exit(1);
}

const feiras = eval(feirasMatch[1]);

async function geocode(address, bairro) {
  const query = encodeURIComponent(`${address}, ${bairro}, Rio de Janeiro, RJ`);
  const url = `https://photon.komoot.io/api/?q=${query}&limit=1`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.features && data.features.length > 0) {
      const coords = data.features[0].geometry.coordinates; // [lon, lat]
      return { lat: coords[1], lng: coords[0] };
    }
  } catch (err) {
    console.error("Error geocoding", query, err);
  }
  
  console.log(`Fallback for ${address}, ${bairro}`);
  const fallbackQuery = encodeURIComponent(`${bairro}, Rio de Janeiro, RJ`);
  const fallbackUrl = `https://photon.komoot.io/api/?q=${fallbackQuery}&limit=1`;
  try {
    const res = await fetch(fallbackUrl);
    const data = await res.json();
    if (data.features && data.features.length > 0) {
      const coords = data.features[0].geometry.coordinates;
      const randomOffsetLat = (Math.random() - 0.5) * 0.005;
      const randomOffsetLng = (Math.random() - 0.5) * 0.005;
      return { lat: coords[1] + randomOffsetLat, lng: coords[0] + randomOffsetLng };
    }
  } catch (err) {
    console.error("Error fallback geocoding", fallbackQuery, err);
  }
  
  return null;
}

async function run() {
  console.log(`Starting geocoding for ${feiras.length} markets...`);
  const updatedFeiras = [];
  
  for (let i = 0; i < feiras.length; i += 5) {
    const batch = feiras.slice(i, i + 5);
    const promises = batch.map(async (feira) => {
      const cleanAddress = feira.address.split('/')[0].trim();
      const coords = await geocode(cleanAddress, feira.bairro);
      if (coords) {
        return { ...feira, lat: coords.lat, lng: coords.lng };
      } else {
        return feira;
      }
    });
    const results = await Promise.all(promises);
    updatedFeiras.push(...results);
    console.log(`Geocoded ${updatedFeiras.length}/${feiras.length}`);
    await new Promise(r => setTimeout(r, 1000));
  }
  
  const newFileContent = `export const INITIAL_FEIRAS = ${JSON.stringify(updatedFeiras, null, 2)};\n`;
  await fs.writeFile('./src/data/feiras.js', newFileContent, 'utf-8');
  console.log('Finished geocoding and updated feiras.js!');
}

run();
