// Original fictional characters; consistent venue hooks for phase 2.
export const profiles = Object.freeze([
  {
    id: 'caio', name: 'Caio', gender: 'male', age: 27,
    archetype: 'Esquerdomacho', location: 'Cafeteria', color: '#7ba891',
    bio: 'Filosofia, livros, kombucha e discursos apaixonados.'
  },
  {
    id: 'rafa', name: 'Rafa', gender: 'male', age: 24,
    archetype: 'Menzinho', location: 'Restaurante japones', color: '#74a6d7',
    bio: 'Tenis, carros, negocios, e talvez ainda a ex.'
  },
  {
    id: 'bia', name: 'Bia', gender: 'female', age: 24,
    archetype: 'Paty', location: 'Bistro', color: '#eda6cf',
    bio: 'Trends, fofocas, estetica e um feed impecavel.'
  },
  {
    id: 'luiza', name: 'Luiza', gender: 'female', age: 26,
    archetype: 'Boiadeira', location: 'Barzinho', color: '#dab27e',
    bio: 'Musica sertaneja, rodeio, cavalos e risadas.'
  }
]);

export function eligibleProfiles(preference) {
  if (preference === 'all') return profiles;
  if (preference === 'men') return profiles.filter(p => p.gender === 'male');
  if (preference === 'women') return profiles.filter(p => p.gender === 'female');
  return [];
}
