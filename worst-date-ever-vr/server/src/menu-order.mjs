const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const words = value => normalize(value).replace(/[^a-z0-9]+/g, ' ').trim();
const request = /\b(?:vou querer|vou pedir|vamos de|vamos pedir|vou de|vou ficar com|(?:pode|podia|poderia) (?:me )?(?:trazer|servir|anotar|mandar|pedir)|me (?:ve|traz|serve|manda)|gostaria de|quero|queria|peco|pedir|escolho|traz|traga|pede|anota|para mim|pra mim)\b/g;
const filler = /^(?:(?:por favor|por gentileza|para mim|pra mim|um prato de|uma porcao de|um copo de|uma taca de|um|uma|o|a)\s+)*/;

export function spokenMenuItem(text, items, itemId) {
  const item = items.find(entry => entry.id === itemId);
  const phrase = ` ${words(text)} `;
  return item && [item.name, ...item.aliases].some(name => phrase.includes(` ${words(name)} `)) ? item : null;
}

export function orderFromSpeech(text, items, { allowBareName = false } = {}) {
  const names = items.flatMap(item => [item.name, ...item.aliases].map(name => ({ item, name: words(name) })))
    .sort((a, b) => b.name.length - a.name.length);
  const matchItem = (phrase, exact = false) => {
    const candidate = phrase.trim().replace(filler, '');
    return names.find(({ name }) => candidate === name || !exact && candidate.startsWith(name + ' '))?.item;
  };
  const clauses = normalize(text).split(/[.!?;:,]|\b(?:mas|porem|em vez disso)\b/).map(words).filter(Boolean);
  const plain = words(text);
  if (allowBareName) {
    const named = matchItem(plain.replace(/ (?:por favor|por gentileza)$/, ''), true);
    if (named) return named;
  }
  for (const [index, clause] of clauses.entries()) {
    for (const marker of clause.matchAll(request)) {
      const before = clause.slice(0, marker.index);
      if (/\bnao\b/.test(before) || /\b(?:ela|ele|quem)\s*$/.test(before)) continue;
      if (/\bvoce\s*$/.test(before) && !/^(?:pode|podia|poderia|me |traz|traga|anota)/.test(marker[0])) continue;
      const after = clause.slice(marker.index + marker[0].length).trim();
      const item = matchItem(after || clauses[index + 1] || '');
      if (item) return item;
    }
    if (/^(?:por favor|por gentileza)$/.test(clauses[index + 1] ?? '')) {
      const item = matchItem(clause, true);
      if (item) return item;
    }
  }
  return null;
}
