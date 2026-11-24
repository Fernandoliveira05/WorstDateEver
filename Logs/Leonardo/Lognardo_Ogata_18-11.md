# Log dia 18-11

Hoje a professora fabi pediu para organizarmos as interações, arquitetura (sensores que serão utilizados) e Possíveis erros do jogo

## Interação

O usuário interage com o espaço e com o date dele através de voz.
Ele deve ser capaz de ver o espaço que ele esta e conversar com date dele.  

## Arquitetura 

As entradas vão ser os dados de imagem do ambiente e os dados sonoros.
Os dados sonoros são necessário pois no jogo o usuário vai ser capaz de falar com seu date.
Enquanto os sensores de movimento servem para interagir com o espaço. 

## Limite

No jogo a IA vai interpretar a fala do usuário, caso haja uma falha da detecção de voz o jogo inteiro estará comprometido.
Se houver falha no sensor de movimento, o usuário não vai conseguir interagir com o ambiente e novamente o jogo estará comprometido. 
