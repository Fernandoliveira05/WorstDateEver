# Worst Date Ever

> *Cada escolha antes do encontro muda a noite inteira.*

## Sobre o jogo

Você deu match. A noite promete. Mas o nervosismo bate e só falta decidir como agir no encontro.

**Worst Date Ever** é um jogo de date em realidade virtual em que a outra pessoa é uma IA com personalidade própria, que ouve o que você fala e reage de verdade. Escolha com quem sair, vá ao encontro e tente se dar bem, sabendo que nem tudo sai como planejado: imprevistos aparecem no meio do jantar e a conversa pode virar do avesso.

Antes de sair, você pode apelar para algo que "ajude" a relaxar. Ninguém é obrigado. Mas quem acha que vai se dar bem com uma ajudinha descobre, do jeito difícil, que o barato sai caro.

### Características

- Converse por voz com uma IA que reage ao que você diz e ao seu estado
- Escolha seu match entre pessoas com personalidades diferentes
- Imprevistos que mudam cada encontro
- Decisões antes do date que afetam a noite inteira
- Final com a consequência de cada escolha
- Experiência pensada para conscientizar, com humor e exagero propositais

> **Aviso:** o jogo contém referências a álcool e outras drogas, com representação exagerada para fins educativos. Os efeitos reais variam muito de pessoa para pessoa. Pode causar desconforto em VR, e a experiência pode ser interrompida a qualquer momento.

## Protótipo

O protótipo jogável está em [worst-date-ever-vr](worst-date-ever-vr/README.md), com versões para [navegador](worst-date-ever-vr/README.md#run-the-browser-edition) e [Unity](worst-date-ever-vr/unity/README.md). O [relatório de testes de interação](TESTES-DE-INTERACAO.md) registra os testes físicos executados, seus resultados e o que falta validar no Quest.

## Como rodar a versão inicial
Na raiz do projeto, execute:

```sh
caddy run --config Caddyfile
```

Conecte o headset à mesma rede da máquina e acesse `https://<IP-da-máquina>`.

## IP usado
A preencher

## Dispositivo testado
A preencher

## Estrutura de pastas (resumo)
- `public/`: página e arquivos da experiência A-Frame.
- `server/`: proxy para chamadas de LLM e voz.
- `docs/`: proposta e registros do projeto.
- `Logs/`: pastas de registros dos integrantes.

## Decisões do grupo
A preencher

## Integrantes
Fernando, Pietra, Isadora, Leonardo e Ian