# Validação manual das interações físicas

O teste automatizado cobre disponibilidade, cooldown, cálculo mecânico, reações sociais e sincronização com o servidor de voz. A apresentação 3D e o conforto em headset exigem observação humana.

Uma captura por Chrome sem interface carregou o quarto e a HUD, mas não apresentou o salão em um estado representativo. Ela não foi usada para aprovar posicionamento, colisões visuais ou legibilidade das novas cenas.

## Preparação

1. Inicie `npm run dev` e o serviço `npm run date:voice` com um provedor configurado.
2. Entre em cada um dos quatro encontros e espere o date se sentar.
3. Abra **Interagir**. Confirme que apenas as categorias com ações disponíveis aparecem. As escolhas antigas de condução da conversa não devem aparecer.
4. Confirme que **Falar livremente** e **Centralizar** continuam no menu principal e que a legenda inferior não muda.

## Cada interação

- **Brinde:** confira a mão no copo do jogador, o olhar e o braço do date, o encontro dos copos e o som no contato. Verifique aceitação animada, aceitação discreta e recusa com personagens e estados diferentes.
- **Equilíbrio:** deixe o copo cair sem corrigir. Repita usando A/D, setas ou analógico para manter o marcador na faixa central. Confirme que a inclinação do copo responde à correção contínua, que ele cai sobre a mesa quando o equilíbrio se perde, e que a recuperação pode produzir resultado parcial.
- **Malabares:** observe as três frutas. Faça as seis recepções nos lados indicados pelo guia, seguindo a chegada de cada fruta. Erre o lado de propósito e depois deixe o tempo de uma recepção expirar. A fruta correspondente deve cair e quicar; as demais devem continuar seguindo suas trajetórias. O date deve acompanhar a fruta ativa.
- **Comida:** confira o prato e a comida reais, a mão oferecendo, o garfo levando um pedaço à boca quando há aceitação e o gesto de recusa quando não há. A oferta deixa de aparecer quando a porção acaba.
- **Dança:** siga a sequência de lados que pulsa na batida; há repetições do mesmo lado. Compare acertos, erros, tropeços das mãos e reação do date. Não deve haver movimento forçado da câmera.

## Falas e status locais

- Depois de cada ação, confirme que o date fala uma frase curta e que a legenda mostra essa mesma frase. A reação deve aparecer sem aguardar uma resposta da LLM. O navegador usa a síntese de voz local quando não há clipe gravado; confira áudio e legenda separadamente.
- Repita cada ação em diferentes encontros e resultados. Há pelo menos 12 frases gerais distintas para sucesso e falha de cada ação, mais duas frases específicas por personagem para cada caso. Equilíbrio, malabares e dança têm um conjunto adicional para resultado parcial.
- Confira os efeitos fixos por ação e resultado em `PHYSICAL_DELTAS`. Brinde e comida contam como sucesso quando aceitos e falha quando recusados. A partir da terceira tentativa da mesma ação, a penalidade de paciência por repetição é aplicada além do resultado base.
- Após uma ação, inicie uma conversa livre. A próxima requisição deve levar o resultado e a frase já dita como contexto, sem repetir automaticamente essa frase e sem abrir uma chamada de LLM apenas para a ação.

## Fluxo e regressão

- Em cada minigame, confirme que guia e cartões ficam em uma posição fixa à frente do jogador e abaixo da linha dos olhos enquanto copo, frutas e mãos se movem. Afaste e retorne o olhar: os alvos não devem seguir os objetos nem saltar de lugar. Confirme que os cartões **esquerda**, **Cancelar** e **direita** correspondem à posição e aos comandos exibidos.
- Cancele cada minigame com o cartão **Cancelar** ou Escape. Objetos e menu devem voltar a um estado coerente sem alterar os status.
- Execute uma ação perto do horário de um evento aleatório. O evento deve aguardar o fim da interação; o QTE ambiental continua com câmera lenta e opções próprias.
- Em água, cardápio e porta do banheiro, confirme que os cartões do QTE aparecem abaixo da linha dos olhos e dentro do alcance visual, mesmo quando o acontecimento está longe. Eles devem ficar parados no mundo enquanto a cabeça se move. Em desktop, 1/2/3 também selecionam as opções exibidas.
- Resolva cada QTE por escolha e por tempo esgotado. A fala inicial do date deve ser seguida por uma resposta nova da LLM sobre o desfecho, sem exigir outra fala do jogador e sem executar a escolha duas vezes.
- Tente repetir uma ação logo depois e após o cooldown. A repetição deve reduzir a paciência do date.
- Fale depois de cada ação e confirme que a resposta faz referência ao resultado quando for natural, sem apenas descrevê-lo. Confirme que o acontecimento pode voltar à conversa depois.
- Teste com pelo menos um headset: legibilidade, alcance dos cartões, analógico esquerdo, conforto, ausência de colisões visíveis e desempenho. **Esta validação em headset ainda está pendente.**
