export const candies = Object.freeze({
  pacoca: { name: 'Paçoca', hint: 'Mais coragem para elogiar', color: 0xd6a45a,
    choice: 'Gostei de você. Tinha que dizer.', direction: 'Abre espaço para elogios diretos. Reaja à frase real, ao ritmo do jogador, à personalidade e ao conforto. Se houve um elogio ousado, pode brincar sobre a confiança mais tarde. Se a fala foi cautelosa, acompanhe esse tom.' },
  tamarindo: { name: 'Bala de tamarindo', hint: 'Humor e ideias estranhas', color: 0xba7b51,
    choice: 'E se o cardápio tivesse uma fofoca?', direction: 'Abre espaço para ideias engraçadas e tangentes. Se os dois realmente compartilharam uma piada, retome o detalhe concreto mais tarde. Não invente uma piada compartilhada.' },
  morango: { name: 'Pirulito de morango', hint: 'Carinho e flerte', color: 0xdb7792,
    choice: 'Adorei ficar aqui com você.', direction: 'Abre espaço para carinho e flerte. Faça o mesmo carinho soar bem-vindo ou cedo demais conforme o conforto e os limites já mostrados. Não trate carinho ou reciprocidade como garantidos.' },
  hortela: { name: 'Bala de hortelã', hint: 'Calma para esclarecer', color: 0x8cc9aa,
    choice: 'Vamos por partes. O que você quis dizer?', direction: 'Abre espaço para esclarecer, pedir desculpas e retomar o assunto. Responda à tentativa real do jogador e ao mal-entendido anterior, se houver. Não invente um atrito para usar o efeito.' }
});

export function candyById(id) {
  return typeof id === 'string' && Object.hasOwn(candies, id) ? candies[id] : null;
}

export const candyChoiceId = 'candy-reply';

export function candyReply(id, persona, relationship) {
  const comfortable = relationship.patience >= 56 && relationship.awkwardness <= 36;
  switch (id) {
    case 'pacoca':
      if (!comfortable) return { line: 'Gostei da sinceridade, mas vamos um pouco mais devagar.', delta: { patience: -2 }, gesture: 'nod' };
      return { line: ['rafa', 'luiza'].includes(persona) ? 'Chegou com coragem, hein? Gostei.' : 'Direto assim? Me pegou de surpresa.',
        delta: { interest: 4 }, gesture: 'laugh' };
    case 'tamarindo':
      return comfortable ? { line: 'Com certeza. A sobremesa ia espalhar a fofoca sobre o prato principal.',
        delta: { interest: 3, awkwardness: -2 }, gesture: 'laugh' } :
        { line: 'Que ideia aleatória. Tá, mas qual prato começaria a fofoca?', delta: { awkwardness: -1 }, gesture: 'shrug' };
    case 'morango':
      return comfortable ? { line: 'Eu também. Gosto de como a conversa fica quando a gente relaxa.',
        delta: { interest: 4 }, gesture: 'nod' } :
        { line: 'É gentil, só preciso de um pouco mais de tempo.', delta: { patience: -1 }, gesture: 'nod' };
    case 'hortela':
      return { line: comfortable ? 'Boa. Eu queria saber como você se sentiu com isso.' : 'Valeu por perguntar. Acho que eu entendi de outro jeito.',
        delta: { patience: 4, awkwardness: -4 }, gesture: 'nod' };
    default: return null;
  }
}

export function candyMoment(id, playerSaid, npcSaid) {
  const fold = text => (text ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const line = fold(playerSaid);
  if (/\b(nao|nem)\s+(gostei|adorei|amei|quero|acho)\b/.test(line)) return null;
  if (id === 'pacoca' && /(gostei de voce|voce e (lind|bonit|incrivel)|quero te (beijar|ver de novo)|me atrai)/.test(line))
    return 'aquele elogio direto';
  if (id === 'tamarindo' && /(e se |imagina |parece que )/.test(line) &&
      /(risos?|hahaha|engrac|piada|adorei|fofoca)/.test(fold(npcSaid)))
    return 'aquela piada que a gente inventou';
  if (id === 'morango' && /(gosto de estar|adorei (te|ficar|estar)|me sinto bem|segurar sua mao|carinho)/.test(line))
    return 'aquele momento de carinho';
  if (id === 'hortela' && /(desculpa|entendi errado|vamos com calma|quis dizer|podemos recomecar)/.test(line))
    return 'quando a gente parou para se entender';
  return null;
}

export function candyAtmosphere(id, reduced = false) {
  const strength = reduced ? .32 : 1;
  return {
    amber: id === 'pacoca' ? strength : 0,
    rose: id === 'morango' ? strength : 0,
    clarity: id === 'hortela' ? strength : 0,
    echo: id === 'tamarindo' ? .24 * strength : 0
  };
}

// Used when the browser can transcribe but no conversational service is reachable.
export function localSpokenReply(id, persona, relationship, said, previous) {
  const line = (said ?? '').trim();
  if (!line) return null;
  const tone = line.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  if (/\b(devagar|com calma|ainda nao|prefiro esperar|nao quero)\b/.test(tone))
    return { text: 'Tudo bem. Vamos no seu ritmo.', gesture: 'nod', relationshipDelta: { patience: 2 } };
  if (previous && /\b(antes|daquela|daquele|lembra|retomar)\b/.test(tone))
    return { text: 'Também lembrei. O que ficou com você depois disso?', gesture: 'nod' };
  if (id === 'tamarindo' && /\b(e se|imagina)\b/.test(tone))
    return { text: 'Essa piada daria uma boa história. Como ela acaba?', gesture: 'laugh', relationshipDelta: { awkwardness: -1 } };
  if (candyMoment(id, line, '')) {
    const reply = candyReply(id, persona, relationship);
    return { text: reply.line, gesture: reply.gesture, relationshipDelta: reply.delta };
  }
  if (/\b(desculpa|foi mal|entendi errado)\b/.test(tone))
    return { text: 'Valeu por falar. O que você quis dizer?', gesture: 'nod', relationshipDelta: { awkwardness: -2 } };
  if (/\b(comida|prato|sobremesa|cardapio)\b/.test(tone))
    return { text: 'Também estava pensando no cardápio. O que você pediria?', gesture: 'nod' };
  return { text: line.endsWith('?') ? 'Boa pergunta. Quero saber primeiro o que você acha.' :
    'Entendi. Me conta um pouco mais sobre isso?', gesture: 'nod' };
}
