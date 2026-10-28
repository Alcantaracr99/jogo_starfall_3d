import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { criarNaveInimiga as criarInimigoGeometrico } from './entidades.js';
import { INIMIGOS_ATLAS } from './inimigos_atlas.js';
import { escolherQuadroInimigo } from './inimigos_vista.js';

// ---------------------------------------------------------------------------
// Inimigos e chefes baseados em matrizes de vistas.
// ---------------------------------------------------------------------------
// As texturas sao compartilhadas por atlas para reduzir alocacoes na GPU.
// criarNaveInimiga tem a mesma assinatura da versao geometrica: devolve um THREE.Group (frente em +Z) que
// jogo.js posiciona, escala (chefe = 2x) e remove normalmente. A nave geometrica original continua como
// reserva: aparece enquanto a imagem carrega ou se ela falhar.
//
// Cada inimigo tem seu proprio quadro (plano com UVs proprios) e todos compartilham UMA textura e UM material,
// entao inimigos diferentes podem mostrar quadros diferentes ao mesmo tempo sem duplicar a imagem na GPU.

const folhas = new Map();

// Carrega cada folha uma unica vez e conserva o fallback geometrico.
function carregarFolha(chave, atlas) {
  let folha = folhas.get(chave);
  if (folha) return folha;
  const textura = new THREE.TextureLoader().load(new URL(atlas.arquivo, import.meta.url).href, () => {
    folha.material.needsUpdate = true;
    folha.pronta = true;
  }, undefined, () => {
    folha.falhou = true;
    console.warn(`Starfall: nao foi possivel carregar ${atlas.arquivo}; mantendo a nave geometrica.`);
  });
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.minFilter = THREE.LinearMipmapLinearFilter;   // inimigos distantes ficam pequenos na tela
  textura.magFilter = THREE.LinearFilter;
  const material = new THREE.MeshBasicMaterial({ map: textura, transparent: true, toneMapped: false, depthWrite: false });
  folha = { atlas, textura, material, geometria: new THREE.PlaneGeometry(1, 1), pronta: false, falhou: false };
  folhas.set(chave, folha);
  return folha;
}

export function criarNaveInimiga(varianteChefe = -1) {
  const chefe = varianteChefe >= 0;
  const indice = chefe ? varianteChefe % INIMIGOS_ATLAS.chefes.length : 0;
  const atlas = chefe ? INIMIGOS_ATLAS.chefes[indice] : INIMIGOS_ATLAS.inimigo;
  const folha = carregarFolha(chefe ? `chefe${indice}` : 'inimigo', atlas);

  const grupo = new THREE.Group();
  const quadro = new THREE.Mesh(folha.geometria.clone(), folha.material);
  quadro.scale.set(atlas.unidades, atlas.unidades, 1);
  quadro.visible = false;
  grupo.add(quadro);
  grupo.addEventListener('removed', () => quadro.geometry.dispose());   // libera o plano deste inimigo

  let reserva = null;
  if (!folha.pronta) {
    reserva = criarInimigoGeometrico(varianteChefe);
    grupo.add(reserva);
  }
  grupo.userData.vista = { folha, atlas, quadro, reserva, linha: -1, coluna: -1 };
  return grupo;
}

// Atualiza orientacao e UVs apenas quando o quadro visual muda.
// Chame uma vez por quadro para cada inimigo/chefe, depois de mover o objeto.
export function atualizarVistaInimigo(grupo, camera) {
  const vista = grupo.userData.vista;
  if (!vista || !vista.folha.pronta) return;
  if (vista.reserva) {                       // a imagem ja carregou: troca a nave geometrica pelo quadro
    grupo.remove(vista.reserva);
    vista.reserva = null;
  }
  vista.quadro.quaternion.copy(camera.quaternion);   // o quadro sempre encara a camera
  vista.quadro.visible = true;
  const escolha = escolherQuadroInimigo(vista.atlas, camera.position, grupo.position);
  if (escolha.linha === vista.linha && escolha.coluna === vista.coluna) return;
  vista.linha = escolha.linha;
  vista.coluna = escolha.coluna;
  const { colunas, linhas } = vista.atlas;
  const u0 = escolha.coluna / colunas, u1 = (escolha.coluna + 1) / colunas;
  const v0 = 1 - (escolha.linha + 1) / linhas, v1 = 1 - escolha.linha / linhas;
  const uv = vista.quadro.geometry.attributes.uv;
  uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
  uv.needsUpdate = true;
}

carregarFolha('inimigo', INIMIGOS_ATLAS.inimigo);   // comeca a carregar a folha dos inimigos comuns ja na abertura
