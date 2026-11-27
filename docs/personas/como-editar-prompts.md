# Como editar as personas do Worst Date Ever

As fichas que alimentam a conversa ficam em `worst-date-ever-vr/content/shared/personas.json`.

- `prompt`: direção completa de personalidade, voz, contradições, paquera, limites e assuntos pessoais. Edite o texto diretamente para ajustar o comportamento da LLM.
- `openingLine`: fala roteirizada que inicia o encontro. Ela aparece na chegada e também é enviada no histórico da conversa para a LLM não ignorar nem repetir a abertura.
- `displayName`: nome usado na instrução da persona; `id` continua sendo o identificador interno e não deve mudar.
- `bio`, `contradiction` e os campos de estilo: resumo legível da ficha usado por outros sistemas do jogo.

Mantenha o JSON válido. Depois de editar, reinicie o servidor de voz para recarregar as fichas e atualize/reinicie o cliente para recarregar a abertura. As instruções são enviadas pelo servidor ao provedor; o cliente não escolhe nem sobrescreve o prompt.
