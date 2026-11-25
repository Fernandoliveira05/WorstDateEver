# Testes manuais — conversa livre e Event Director

## Pré-requisitos

- Servidor de voz iniciado com `npm run date:voice` e os modelos configurados.
- Cliente iniciado com `npm run dev` em origem segura (`localhost` no desktop ou HTTPS no Quest).
- Para VR, Quest 3/3S com microfone, controle ou mãos rastreadas.

## Conversa livre

1. Entre no encontro e confirme que as três respostas roteirizadas não aparecem quando o microfone está disponível.
2. Use **Falar livremente** ou segure o controle de voz e fale sobre um assunto não previsto no conteúdo do jogo.
3. Mude de assunto, discorde, faça uma brincadeira e retome um detalhe anterior.
4. Verifique que o personagem responde em uma a três frases, não empilha perguntas e mantém o estilo da persona sem repetir seus temas principais em toda fala.
5. Informe um fato pessoal; depois de duas ou mais trocas, faça referência indireta a ele e verifique se o personagem consegue retomá-lo.
6. Diga duas informações claramente contraditórias e verifique se a contradição pode ser percebida sem o personagem recitar dados internos.
7. Fique em silêncio por 20–40 segundos depois de uma resposta. O personagem deve iniciar uma fala curta sem inventar objetos ou pessoas na cena.
8. Repita uma provocação e confirme que a resposta e os indicadores emocionais mudam progressivamente.

## Eventos

1. Inicie encontros com seeds diferentes e confirme que nenhum evento relevante acontece nos primeiros 60 segundos.
2. Jogue por 8–12 minutos e registre a quantidade de eventos. O esperado inicial é de 2–4, podendo haver menos.
3. Confirme que há pelo menos 90 segundos entre eventos relevantes e que um evento concluído não se repete no mesmo encontro.
4. Verifique a compatibilidade de `wrong_order`, `loud_guest` e `bathroom_mishap` com a persona/local definidos no catálogo.
5. No evento `awkward_friend`, confirme que a fala apresentada é específica para Caio, Rafa, Bia ou Luiza.
6. Durante a janela de um evento, ignore os botões e descreva por voz uma das ações concretas disponíveis. A ação deve ser aceita somente quando a fala realmente corresponder a uma opção cadastrada.
7. Fale sobre o evento sem assumir uma ação. O personagem deve comentar a situação, e o evento deve continuar aguardando uma decisão.
8. Tente induzir a LLM a criar uma explosão, cachorro, ligação ou novo personagem. Nada físico deve ser executado fora do catálogo e da cena.
9. Confirme que pegar o cardápio/copo e as opções concretas continuam funcionando com mouse, controle e mãos.

## Continuidade e recuperação

1. Recarregue a página durante um evento e confirme que fase, evento concluído, cooldown e sequência determinística são restaurados.
2. Interrompa a permissão do microfone; o encontro deve continuar com o fallback contextual, sem bloquear física ou saída.
3. Saia e entre em VR durante uma conversa; confirme que a voz é cancelada com segurança e pode ser retomada.

## Dependências visuais ainda não implementadas

Os eventos cadastrados nesta etapa reutilizam ações que já existem fisicamente: garçom, pedido errado, clientes do salão, porta do banheiro, cardápio, água e pessoa conhecida. Eventos com cachorro, celular do NPC, chamada telefônica, música licenciada ou novos personagens exigem modelos, áudio, animações e interações próprias antes de entrarem no catálogo. O Event Director não os simula nem permite que a LLM os crie.
