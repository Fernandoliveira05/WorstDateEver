const feedback = {
  water_spill: {
    help: {
      caio: ['Um copo em queda e você já tinha uma resposta. Invejo essa clareza.', 'laugh'],
      rafa: ['Caramba, pegou no ar! Eu ia fazer isso. Talvez.', 'laugh'],
      bia: ['Você segurou antes de cair? Tá, isso foi muito bonito de ver.', 'nod'],
      luiza: ['Boa mão! Salvou a mesa inteira sem fazer cena.', 'laugh']
    },
    protect: {
      caio: ['Você me protegeu de um copo d’água. Dramático, mas eu gostei.', 'nod'],
      rafa: ['Me protegeu? Tá querendo ganhar pontos comigo, né?', 'laugh'],
      bia: ['Você pensou em mim antes do copo. Eu reparei.', 'nod'],
      luiza: ['Água na mesa eu aguento. Gostei de você ter lembrado de mim.', 'nod']
    },
    ignore: {
      caio: ['Essa foi uma experiência de abandono surpreendentemente molhada.', 'look_away'],
      rafa: ['Nossa, você ficou só olhando? Beleza, então.', 'shrug'],
      bia: ['A água veio pra cima de mim e você nem se mexeu. Entendi.', 'look_away'],
      luiza: ['Podia ter avisado pelo menos. Agora eu tô encharcada.', 'look_away']
    }
  },
  wrong_order: {
    clarify: ['Obrigada por falar com calma. Era mesmo outro pedido.', 'nod'],
    accept: ['Você aceitou? Então agora quero saber se é bom.', 'laugh']
  },
  loud_guest: {
    joke: ['Tá, essa piada ganhou da gargalhada dele.', 'laugh'],
    ignore: ['Vamos continuar. Não vou disputar volume com aquela mesa.', 'shrug']
  },
  bathroom_mishap: {
    help: {
      caio: ['Você salvou alguém de uma crise bem literal de confinamento.', 'nod'],
      rafa: ['Boa! Eu já tava indo, mas você foi mais rápido.', 'laugh'],
      bia: ['Ainda bem que você segurou a porta. A pessoa tava apavorada.', 'nod'],
      luiza: ['Boa! Porta teimosa dessas só abre com alguém ajudando.', 'laugh']
    },
    ignore: {
      caio: ['Talvez alguém devesse ajudar. Essa porta não vai refletir e se abrir.', 'look_away'],
      rafa: ['A gente vai mesmo fingir que não ouviu? Tá.', 'shrug'],
      bia: ['Você ouviu a pessoa chamar e ficou parado? Sério?', 'look_away'],
      luiza: ['Eu vou ajudar. Não dá pra deixar alguém preso ali.', 'look_away']
    }
  },
  dropped_menu: {
    grab: {
      caio: ['Você salvou o cardápio de uma crise existencial no chão. Obrigado.', 'laugh'],
      rafa: ['Boa! Eu ia pegar, juro. Você chegou primeiro.', 'laugh'],
      bia: ['Obrigada. Cair bem na hora que eu ia escolher é muito a cara desse lugar.', 'nod'],
      luiza: ['Boa! Gosto de gente que resolve as coisas sem fazer alarde.', 'nod']
    },
    ignore: {
      caio: ['Parece que o chão vai escolher a sobremesa por nós.', 'look_away'],
      rafa: ['Sério que a gente vai deixar o cardápio lá? Tá bom.', 'shrug'],
      bia: ['O cardápio caiu e ficou por isso mesmo? Entendi.', 'look_away'],
      luiza: ['Eu pego então. Mas achei que você tinha visto.', 'shrug']
    }
  },
  awkward_friend: {
    introduce: ['Obrigada por me incluir. Assim fica menos esquisito.', 'nod'],
    change_topic: ['Mudar de assunto assim ficou um pouco estranho, né?', 'look_away']
  }
};

export function eventFeedback(eventId, choiceId, personaId) {
  const entry = feedback[eventId]?.[choiceId];
  const response = Array.isArray(entry) ? entry : entry?.[personaId];
  return response ? { line: response[0], gesture: response[1] } : null;
}
