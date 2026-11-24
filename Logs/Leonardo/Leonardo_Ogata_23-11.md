# Log dia 23-11

## O que aprendi hoje
Hoje entendi melhor o que é o Aframe e como ele facilito desenvolvimento do nosso projeto e fiz alguns testes com ele

## Onde travei
Estou pensando ainda como faremos todas as cenas do jogo conectando elas

## Evidência
Desenvolvi esse código na aula para testar as interações no aframe:

```html 
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Cena A-Frame</title>
    <script src="https://aframe.io/releases/1.6.0/aframe.min.js"></script>
    <script>
      AFRAME.registerComponent('bola-8-jogo', {
        init: function () {
          this.bola = document.querySelector('#bola-8');
          this.indicador = document.querySelector('#progresso-olhar');
          this.mensagem = document.querySelector('#instrucao');
          this.estado = 'chao';
          this.tempoOlhando = 0;
          this.tempoParaPegar = 950;
          this.tempoSegurando = 0;
          this.velocidade = new THREE.Vector3();
          this.direcaoAnterior = new THREE.Vector3();
          this.origemAnterior = new THREE.Vector3();
          this.ultimoTempo = 0;
          this.terminou = false;
          if (this.el.hasLoaded) {
            this.criarPersonagens();
          } else {
            this.el.addEventListener('loaded', () => this.criarPersonagens(), { once: true });
          }
        },

        criarPersonagens: function () {
          const modelo = document.querySelector('#personagem');
          if (!modelo) return;

          const posicoes = [
            [-1.5, 0, -1],
            [1.5, 0, -1],
            [0, 0, -2.5],
            [0, 0, 0.5]
          ];

          posicoes.forEach((posicao, indice) => {
            const personagem = indice === 0 ? modelo : modelo.cloneNode(true);
            personagem.id = `personagem-${indice + 1}`;
            personagem.setAttribute('position', posicao.join(' '));
            personagem.setAttribute(
              'animation__pulo',
              `property: position; to: ${posicao[0]} 0.12 ${posicao[2]}; dir: alternate; dur: 420; delay: ${indice * 90}; loop: true; easing: easeInOutSine`
            );
            if (indice > 0) this.el.appendChild(personagem);
          });
        },

        tick: function (tempo, delta) {
          const camera = this.el.camera;
          if (!camera || !this.bola || !this.bola.object3D) return;

          const dt = Math.min((delta || 16) / 1000, 0.05);
          const origem = new THREE.Vector3();
          const direcao = new THREE.Vector3();
          camera.getWorldPosition(origem);
          camera.getWorldDirection(direcao);

          if (!this.ultimoTempo) {
            this.direcaoAnterior.copy(direcao);
            this.origemAnterior.copy(origem);
            this.ultimoTempo = tempo;
          }

          if (this.estado === 'chao') {
            this.atualizarOlhar(origem, direcao, delta || 0);
          } else if (this.estado === 'segurando') {
            this.tempoSegurando += delta || 0;
            this.seguirOlhar(origem, direcao);
            const giroBrusco = this.direcaoAnterior.angleTo(direcao);
            const deslocamentoBrusco = this.origemAnterior.distanceTo(origem);
            const giroPorSegundo = giroBrusco / Math.max(dt, 0.001);
            if (this.tempoSegurando > 350 && (giroPorSegundo > 6.5 || deslocamentoBrusco > 0.32)) {
              this.arremessar(direcao, giroBrusco, deslocamentoBrusco);
            }
          } else if (this.estado === 'lancada') {
            this.moverBola(dt);
          }

          this.direcaoAnterior.copy(direcao);
          this.origemAnterior.copy(origem);
          this.ultimoTempo = tempo;
        },

        atualizarOlhar: function (origem, direcao, delta) {
          const raio = new THREE.Raycaster(origem, direcao, 0, 7);
          const olhandoParaBola = raio.intersectObject(this.bola.object3D, true).length > 0;
          if (olhandoParaBola) {
            this.tempoOlhando = Math.min(this.tempoOlhando + delta, this.tempoParaPegar);
          } else {
            this.tempoOlhando = Math.max(0, this.tempoOlhando - delta * 2.5);
          }

          const progresso = this.tempoOlhando / this.tempoParaPegar;
          this.indicador.setAttribute('visible', progresso > 0);
          this.indicador.setAttribute('theta-length', Math.max(1, progresso * 360));
          if (olhandoParaBola) this.mensagem.setAttribute('value', 'Mantenha o olhar na bola 8');
          else this.mensagem.setAttribute('value', 'Encontre a bola 8 no chao');

          if (progresso >= 1) this.pegar(origem, direcao);
        },

        pegar: function (origem, direcao) {
          this.estado = 'segurando';
          this.tempoOlhando = 0;
          this.tempoSegurando = 0;
          this.indicador.setAttribute('visible', false);
          this.mensagem.setAttribute('value', 'Bola segura - faca um movimento brusco para arremessar');
          this.seguirOlhar(origem, direcao);
        },

        seguirOlhar: function (origem, direcao) {
          const posicao = origem.clone().add(direcao.multiplyScalar(0.72));
          posicao.y -= 0.18;
          this.bola.object3D.position.copy(posicao);
          this.bola.object3D.rotation.x += 0.16;
          this.bola.object3D.rotation.z += 0.12;
        },

        arremessar: function (direcao, giroBrusco, deslocamentoBrusco) {
          this.estado = 'lancada';
          const forca = 14 + Math.min(8, giroBrusco * 24 + deslocamentoBrusco * 18);
          this.velocidade.copy(direcao).multiplyScalar(forca);
          this.velocidade.y += 1.2;
          this.mensagem.setAttribute('value', 'Bola lancada! Mire nela para pega-la novamente');
        },

        moverBola: function (dt) {
          const inicio = this.bola.object3D.position.clone();
          this.velocidade.y -= 7.5 * dt;
          const proxima = inicio.clone().addScaledVector(this.velocidade, dt);
          const deslocamento = proxima.clone().sub(inicio);
          const distancia = deslocamento.length();

          if (distancia > 0 && this.acertarPersonagem(inicio, deslocamento.normalize(), distancia)) {
            this.velocidade.multiplyScalar(0.62);
          }

          const raio = 0.16;
          if (proxima.y < raio) {
            proxima.y = raio;
            this.velocidade.y = Math.abs(this.velocidade.y) * 0.36;
            this.velocidade.x *= 0.88;
            this.velocidade.z *= 0.88;
          }
          if (proxima.x < -3.26 || proxima.x > 3.26) {
            proxima.x = THREE.MathUtils.clamp(proxima.x, -3.26, 3.26);
            this.velocidade.x *= -0.62;
          }
          if (proxima.z < -13.75 || proxima.z > 1.25) {
            proxima.z = THREE.MathUtils.clamp(proxima.z, -13.75, 1.25);
            this.velocidade.z *= -0.62;
          }

          this.bola.object3D.position.copy(proxima);
          this.bola.object3D.rotation.x += this.velocidade.z * dt * 4;
          this.bola.object3D.rotation.z -= this.velocidade.x * dt * 4;
          if (proxima.y <= raio + 0.005 && this.velocidade.length() < 0.75) {
            this.estado = 'chao';
            this.velocidade.set(0, 0, 0);
            this.mensagem.setAttribute('value', 'Olhe para a bola 8 para pega-la');
          }
        },

        acertarPersonagem: function (origem, direcao, distancia) {
          const raio = new THREE.Raycaster(origem, direcao, 0, distancia + 0.2);
          let personagemAtingido = null;
          let menorDistancia = Infinity;
          document.querySelectorAll('.personagem').forEach((personagem) => {
            if (personagem.dataset.destruido) return;
            const acertos = raio.intersectObject(personagem.object3D, true);
            if (acertos.length && acertos[0].distance < menorDistancia) {
              personagemAtingido = personagem;
              menorDistancia = acertos[0].distance;
            }
          });
          if (!personagemAtingido) return false;
          this.desmontar(personagemAtingido);
          return true;
        },

        desmontar: function (personagem) {
          personagem.dataset.destruido = 'true';
          const cores = ['#F3B333', '#29313D', '#DB5B42', '#F1BE99', '#324B6B'];
          const centro = new THREE.Vector3();
          personagem.object3D.getWorldPosition(centro);
          centro.y += 0.8;
          personagem.setAttribute('visible', 'false');

          for (let i = 0; i < 28; i++) {
            const pedaco = document.createElement(i % 3 ? 'a-box' : 'a-sphere');
            const direcao = new THREE.Vector3(
              (Math.random() - 0.5) * 3.5,
              Math.random() * 2.8 + 0.4,
              (Math.random() - 0.5) * 2
            );
            const destino = centro.clone().add(direcao);
            pedaco.setAttribute('position', `${centro.x} ${centro.y} ${centro.z}`);
            pedaco.setAttribute('color', cores[i % cores.length]);
            pedaco.setAttribute('width', '0.1');
            pedaco.setAttribute('height', '0.1');
            pedaco.setAttribute('depth', '0.1');
            pedaco.setAttribute('radius', '0.07');
            pedaco.setAttribute('animation__voar', {
              property: 'position', to: `${destino.x} ${destino.y} ${destino.z}`, dur: 650, easing: 'easeOutQuad'
            });
            pedaco.setAttribute('animation__girar', {
              property: 'rotation', to: `${Math.random() * 720} ${Math.random() * 720} ${Math.random() * 720}`,
              dur: 650, easing: 'linear'
            });
            this.el.appendChild(pedaco);
            setTimeout(() => pedaco.remove(), 1600);
          }

          this.verificarFim();
        },

        verificarFim: function () {
          const objetivos = document.querySelectorAll('.personagem');
          const todosDestruidos = [...objetivos].every((objetivo) => objetivo.dataset.destruido);
          if (!todosDestruidos || this.terminou) return;

          this.terminou = true;
          const jumpscare = document.querySelector('#jumpscare');
          jumpscare.setAttribute('visible', 'true');
          jumpscare.emit('assustar');
          setTimeout(() => jumpscare.setAttribute('visible', 'false'), 1600);
        }
      });
    </script>
  </head>
  <body>
    <a-scene bola-8-jogo>
      <a-plane rotation="-90 0 0" width="14" height="30" color="#D4D9DC"></a-plane>

      <!-- paredes -->
      <a-box position="-3.5 1 -7" width="0.4" height="2" depth="14" color="#8B95A1"></a-box>
      <a-box position="3.5 1 -7" width="0.4" height="2" depth="14" color="#8B95A1"></a-box>

      <!-- bola de sinuca que pode ser pega apenas com o olhar -->
      <a-entity id="bola-8" position="-0.9 0.16 -0.35">
        <a-sphere radius="0.16" color="#111217" material="roughness: 0.28; metalness: 0.08"></a-sphere>
        <a-circle position="0 0 0.158" radius="0.081" color="#F7F4E8" material="shader: flat"></a-circle>
        <a-text value="8" position="0 -0.032 0.164" width="0.17" align="center" color="#111217" shader="msdf"></a-text>
      </a-entity>

      <!-- montanhista estilizado -->
      <a-entity
        id="personagem"
        class="personagem"
        position="0 0 -1"
        animation__pulo="property: position; to: 0 0.12 -1; dir: alternate; dur: 420; loop: true; easing: easeInOutSine"
        animation__gingado="property: rotation; to: 0 0 7; dir: alternate; dur: 840; loop: true; easing: easeInOutSine"
      >
        <!-- botas e pernas -->
        <a-cylinder
          position="-0.13 0.28 0"
          radius="0.09"
          height="0.42"
          color="#29313D"
          animation="property: rotation; from: 0 0 -14; to: 0 0 14; dir: alternate; dur: 420; loop: true; easing: easeInOutSine"
        ></a-cylinder>
        <a-cylinder
          position="0.13 0.28 0"
          radius="0.09"
          height="0.42"
          color="#29313D"
          animation="property: rotation; from: 0 0 14; to: 0 0 -14; dir: alternate; dur: 420; loop: true; easing: easeInOutSine"
        ></a-cylinder>
        <a-box position="-0.13 0.07 0.08" width="0.2" height="0.12" depth="0.28" color="#202631"></a-box>
        <a-box position="0.13 0.07 0.08" width="0.2" height="0.12" depth="0.28" color="#202631"></a-box>

        <!-- casaco e mochila -->
        <a-cylinder position="0 0.75 0" radius="0.26" height="0.58" color="#F3B333"></a-cylinder>
        <a-box position="0 0.78 -0.22" width="0.42" height="0.48" depth="0.16" color="#324B6B" roughness="0.9"></a-box>
        <a-box position="0 0.78 0.27" width="0.3" height="0.06" depth="0.03" color="#D9872E"></a-box>

        <!-- braços em pose de caminhada -->
        <a-cylinder
          position="-0.32 0.78 0"
          radius="0.07"
          height="0.48"
          color="#F3B333"
          animation="property: rotation; from: 0 0 -62; to: 0 0 18; dir: alternate; dur: 420; loop: true; easing: easeInOutSine"
        ></a-cylinder>
        <a-cylinder
          position="0.32 0.82 0"
          radius="0.07"
          height="0.48"
          color="#F3B333"
          animation="property: rotation; from: 0 0 62; to: 0 0 -18; dir: alternate; dur: 420; loop: true; easing: easeInOutSine"
        ></a-cylinder>
        <a-sphere position="-0.43 0.55 0" radius="0.09" color="#F1BE99"></a-sphere>
        <a-sphere position="0.43 0.62 0" radius="0.09" color="#F1BE99"></a-sphere>

        <!-- rosto e gorro -->
        <a-sphere position="0 1.25 0.02" radius="0.24" color="#F1BE99"></a-sphere>
        <a-sphere position="0 1.39 -0.01" radius="0.25" scale="1 0.52 1" color="#DB5B42"></a-sphere>
        <a-sphere position="0 1.54 -0.01" radius="0.08" color="#DB5B42"></a-sphere>
        <a-sphere position="-0.08 1.27 0.22" radius="0.025" color="#25303B"></a-sphere>
        <a-sphere position="0.08 1.27 0.22" radius="0.025" color="#25303B"></a-sphere>
      </a-entity>

      <a-light type="ambient" color="#FFF" intensity="0.7"></a-light>
      <a-light type="directional" position="2 4 1" intensity="0.6"></a-light>

      <!-- câmera: olhar sustentado pega a bola; uma virada brusca a arremessa -->
      <a-entity position="0 1.1 0">
        <a-camera>
          <a-ring position="0 0 -1" radius-inner="0.012" radius-outer="0.02" material="color: #18232E; shader: flat"></a-ring>
          <a-ring id="progresso-olhar" visible="false" position="0 0 -0.99" radius-inner="0.038" radius-outer="0.052" theta-start="-90" theta-length="1" material="color: #F3B333; shader: flat; side: double"></a-ring>
          <a-text id="instrucao" value="Olhe para a bola 8 no chao" position="-0.55 0.27 -1" width="1.35" color="#17212B" align="center"></a-text>

          <!-- susto exibido após eliminar todos os objetivos -->
          <a-entity id="jumpscare" visible="false" position="0 0 -0.8" animation="startEvents: assustar; property: scale; from: 0.1 0.1 0.1; to: 1.4 1.4 1.4; dur: 180; easing: easeOutElastic">
            <a-circle radius="0.48" color="#48132B" material="shader: flat"></a-circle>
            <a-sphere position="-0.17 0.1 0.04" radius="0.12" color="#F8F1CF"></a-sphere>
            <a-sphere position="0.17 0.1 0.04" radius="0.12" color="#F8F1CF"></a-sphere>
            <a-sphere position="-0.17 0.1 0.15" radius="0.055" color="#151018"></a-sphere>
            <a-sphere position="0.17 0.1 0.15" radius="0.055" color="#151018"></a-sphere>
            <a-circle position="0 -0.18 0.05" radius="0.16" color="#111018" material="shader: flat"></a-circle>
          </a-entity>
        </a-camera>
      </a-entity>

    </a-scene>
  </body>
</html>

```