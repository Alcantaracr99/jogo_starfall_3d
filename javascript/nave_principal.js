import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { createPlayerShip as criarNaveReserva } from './entidades.js';
import { ATLAS_NAVE } from './nave_atlas.js';
import { EstadoVista, escolherQuadro } from './nave_vista.js';

// Nave principal baseada na matriz de vistas (img/nave_vista.png).
// Mantem o mesmo contrato da nave anterior: devolve um THREE.Group com a frente em -Z,
// entao jogo.js continua usando ship.position, ship.rotation.z, ship.visible, ship.add(target) etc.
// A nave anterior fica como reserva: aparece enquanto a imagem carrega ou se ela falhar.

const LARGURA_ALVO = 5.9;                  // envergadura da nave geometrica original (antes da escala .65)
const TAMANHO_SPRITE = LARGURA_ALVO / ATLAS_NAVE.larguraRelativa;
const TAMANHO_EXPLOSAO = 7.5;              // lado do quadro de explosao, em unidades do mundo
const FPS_EXPLOSAO = 14;

function carregarTextura(caminho, aoCarregar, aoFalhar) {
  const textura = new THREE.TextureLoader().load(new URL(caminho, import.meta.url).href, aoCarregar, undefined, aoFalhar);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.generateMipmaps = false;          // evita "vazar" quadros vizinhos da grade
  textura.minFilter = THREE.LinearFilter;
  textura.magFilter = THREE.LinearFilter;
  return textura;
}

function mostrarQuadro(textura, coluna, linha, colunas, linhas) {
  textura.repeat.set(1 / colunas, 1 / linhas);
  textura.offset.set(coluna / colunas, 1 - (linha + 1) / linhas);
}

export function createPlayerShip() {
  const ship = new THREE.Group();
  const reserva = criarNaveReserva();
  ship.add(reserva);
  ship.userData.setMovement = (horizontal, vertical, delta) => {
    if (typeof reserva.userData.setMovement === 'function') {
      reserva.userData.setMovement(horizontal, vertical, delta);
    }
  };

  const material = new THREE.SpriteMaterial({ transparent: true, toneMapped: false, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(TAMANHO_SPRITE, TAMANHO_SPRITE, 1);
  sprite.visible = false;
  ship.add(sprite);

  // Luzes no lugar das da nave geometrica (que se apagam junto com ela): ciano nos motores e magenta lateral.
  const brilho = new THREE.PointLight(0x1fd1b5, 12, 13); brilho.position.z = 1.7; brilho.visible = false; ship.add(brilho);
  const lateral = new THREE.PointLight(0xff3d81, 3, 5); lateral.position.set(1.2, .1, .2); lateral.visible = false; ship.add(lateral);

  const vista = { sprite, material, pronta: false, estado: new EstadoVista(), linha: -1, coluna: -1 };
  ship.userData.vista = vista;

  material.map = carregarTextura('../img/nave_vista.png', () => {
    const linhaInicial = ATLAS_NAVE.elevacoes.indexOf(24);
    const colunaInicial = (ATLAS_NAVE.colunasRoll - 1) / 2;
    mostrarQuadro(material.map, colunaInicial, linhaInicial, ATLAS_NAVE.grade, ATLAS_NAVE.grade);
    vista.linha = linhaInicial;
    vista.coluna = colunaInicial;
    material.needsUpdate = true;
    vista.pronta = true;
    reserva.visible = false;
    sprite.visible = true;
    brilho.visible = true;
    lateral.visible = true;
  }, () => console.warn('Starfall: nao foi possivel carregar img/nave_vista.png; mantendo a nave reserva.'));

  prepararExplosao();
  return ship;
}

// Chame uma vez por quadro, depois de mover/inclinar a nave.
export function updatePlayerShipView(ship, camera, delta) {
  const vista = ship.userData.vista;
  if (!vista) return;
  const vy = vista.estado.atualizar(ship.position.y, delta);   // acompanha a velocidade mesmo durante o pisca de dano
  if (!vista.pronta) return;
  const quadro = escolherQuadro({
    camY: camera.position.y, camZ: camera.position.z,
    naveY: ship.position.y, naveZ: ship.position.z,
    vy, rotZ: ship.rotation.z
  });
  if (quadro.linha === vista.linha && quadro.coluna === vista.coluna) return;
  vista.linha = quadro.linha; vista.coluna = quadro.coluna;
  mostrarQuadro(vista.material.map, quadro.coluna, quadro.linha, ATLAS_NAVE.grade, ATLAS_NAVE.grade);
  const lado = TAMANHO_SPRITE / ATLAS_NAVE.escalas[quadro.linha];   // compensa a escala usada ao renderizar a linha
  vista.sprite.scale.set(lado, lado, 1);
}

// ---- Explosao da nave (img/nave_explosao.png, 4 x 2 quadros) ----
const explosao = { sprite: null, material: null, tempo: 0, ativa: false };

function prepararExplosao() {
  if (explosao.sprite) return;
  explosao.material = new THREE.SpriteMaterial({ transparent: true, toneMapped: false, depthWrite: false });
  explosao.material.map = carregarTextura('../img/nave_explosao.png', () => { explosao.material.needsUpdate = true; });
  mostrarQuadro(explosao.material.map, 0, 0, ATLAS_NAVE.explosao.colunas, ATLAS_NAVE.explosao.linhas);
  explosao.sprite = new THREE.Sprite(explosao.material);
  explosao.sprite.visible = false;
}

export function spawnShipExplosion(scene, position, final = false) {
  prepararExplosao();
  if (explosao.sprite.parent !== scene) scene.add(explosao.sprite);
  const lado = TAMANHO_EXPLOSAO * (final ? 1.35 : 1);
  explosao.sprite.scale.set(lado, lado, 1);
  explosao.sprite.position.copy(position);
  explosao.sprite.position.z += .3;
  explosao.tempo = 0;
  explosao.ativa = true;
  explosao.sprite.visible = true;
  mostrarQuadro(explosao.material.map, 0, 0, ATLAS_NAVE.explosao.colunas, ATLAS_NAVE.explosao.linhas);
}

export function updateShipExplosions(delta) {
  if (!explosao.ativa) return;
  explosao.tempo += delta;
  const indice = Math.floor(explosao.tempo * FPS_EXPLOSAO);
  if (indice >= ATLAS_NAVE.explosao.quadros) {
    explosao.ativa = false;
    explosao.sprite.visible = false;
    return;
  }
  const { colunas, linhas } = ATLAS_NAVE.explosao;
  mostrarQuadro(explosao.material.map, indice % colunas, Math.floor(indice / colunas), colunas, linhas);
}
