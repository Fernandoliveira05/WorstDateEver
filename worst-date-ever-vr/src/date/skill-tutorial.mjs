export const SKILL_TUTORIALS_KEY = 'worst-date-ever:skill-tutorials:v1';
export const SKILL_TUTORIALS = Object.freeze({
  balance: Object.freeze({ title: 'EQUILÍBRIO', tagline: 'Um copo. Dois eixos. Nenhuma dignidade garantida.',
    objective: 'Mantenha a bolha no centro até o anel completar.',
    desktop: 'A / D e W / S corrigem a inclinação.',
    vr: 'Incline levemente a cabeça ou use o analógico esquerdo.',
    failure: 'Se a bolha escapar do anel, o copo cai.' }),
  juggle: Object.freeze({ title: 'MALABARES', tagline: 'Três frutas, duas mãos, uma plateia.',
    objective: 'Pegue cada fruta no anel luminoso e relance no ritmo.',
    desktop: 'A / D pegam à esquerda e à direita.',
    vr: 'Gatilhos esquerdo e direito ou analógico esquerdo.',
    failure: 'Errou o lado ou o tempo? A fruta cai.' }),
  dance: Object.freeze({ title: 'DANÇA SENTADA', tagline: 'O restaurante virou pista. Por seis segundos.',
    objective: 'Corte cada bloco na linha de ritmo, no tempo da batida.',
    desktop: 'A / D escolhem a mão; W / S ou as setas definem o golpe. Aperte no portal, na batida.',
    vr: 'Golpeie com o controle da cor indicada na direção da seta quando o bloco cruzar o portal.',
    failure: 'A direção e o tempo precisam combinar para manter o combo.' })
});

export function tutorialSeen(storage, id) {
  if (!SKILL_TUTORIALS[id]) return true;
  try {
    const value = JSON.parse(storage?.getItem(SKILL_TUTORIALS_KEY) ?? '{}');
    return value?.[id] === true;
  } catch { return false; }
}

export function markTutorialSeen(storage, id) {
  if (!SKILL_TUTORIALS[id]) return;
  try {
    const value = JSON.parse(storage?.getItem(SKILL_TUTORIALS_KEY) ?? '{}');
    storage?.setItem(SKILL_TUTORIALS_KEY, JSON.stringify({ ...value, [id]: true }));
  } catch { /* Private browsing may disable storage; the interaction still works. */ }
}
