import { ATLAS_NAVE } from './nave_atlas.js';

// ---------------------------------------------------------------------------
// Selecao pura do quadro visual da nave do jogador.
// ---------------------------------------------------------------------------
//
// A matriz tem uma linha por elevacao da camera sobre a nave e uma coluna por inclinacao lateral:
//   linha  = de que altura a camera "enxerga" a nave (negativo = de baixo, mostra a barriga;
//            positivo = de cima, mostra o dorso)
//   coluna = inclinacao lateral (0 = esquerda total, 3 = neutro, 6 = direita total)

// ---- Parametros calibrados da sensacao de voo ------------------------------
export const GANHO_VELOCIDADE = 2.4;  // graus de elevacao por (unidade/s) de velocidade vertical.
                                      // Subindo a camera "fica para baixo" (barriga); descendo, "para cima" (dorso).
                                      // 0 desliga o efeito e deixa so a perspectiva real da camera.
export const SUAVIZACAO_VY = 7;       // quao rapido a velocidade vertical suavizada acompanha a real
export const ROLL_MAX_RAD = 0.08;     // mesmo valor usado em jogo.js: ship.rotation.z = horizontal * -0.08
export const ROLL_QUADROS = 3;        // 3 usa de -45 a +45 graus; 2 suaviza para -30..+30; 1 para -15..+15
export const VELOCIDADE_MAX = 13;     // ignora saltos (respawn teleporta a nave) acima disso

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const paraGraus = rad => rad * 180 / Math.PI;

// Calcula a perspectiva vertical antes do ajuste causado pela velocidade.
// Angulo (graus) com que a camera enxerga a nave: + = camera acima da nave.
export function elevacaoGeometrica(camY, camZ, naveY, naveZ) {
  return paraGraus(Math.atan2(camY - naveY, camZ - naveZ));
}

export function linhaMaisProxima(elevacao) {
  let melhor = 0;
  ATLAS_NAVE.elevacoes.forEach((valor, indice) => {
    if (Math.abs(valor - elevacao) < Math.abs(ATLAS_NAVE.elevacoes[melhor] - elevacao)) melhor = indice;
  });
  return melhor;
}

// rotZ e o ship.rotation.z do jogo (negativo = movendo para a direita = inclina para a direita).
export function colunaRoll(rotZ) {
  const centro = (ATLAS_NAVE.colunasRoll - 1) / 2;
  const t = clamp(-rotZ / ROLL_MAX_RAD, -1, 1);
  return clamp(centro + Math.round(t * ROLL_QUADROS), 0, ATLAS_NAVE.colunasRoll - 1);
}

// Combina perspectiva, inclinacao lateral e velocidade para escolher o quadro.
export function escolherQuadro({ camY, camZ, naveY, naveZ, vy, rotZ }) {
  const elevacao = elevacaoGeometrica(camY, camZ, naveY, naveZ) - GANHO_VELOCIDADE * vy;
  return { linha: linhaMaisProxima(elevacao), coluna: colunaRoll(rotZ), elevacao };
}

// Guarda a velocidade vertical suavizada da nave entre os quadros.
// O limite evita que um teletransporte de respawn altere a animacao da nave.
export class EstadoVista {
  constructor() { this.ultimoY = null; this.vy = 0; }
  atualizar(naveY, delta) {
    if (this.ultimoY === null || delta < 1e-4) { this.ultimoY = naveY; return this.vy; }
    const instantanea = clamp((naveY - this.ultimoY) / delta, -VELOCIDADE_MAX, VELOCIDADE_MAX);
    this.vy += (instantanea - this.vy) * Math.min(1, delta * SUAVIZACAO_VY);
    this.ultimoY = naveY;
    return this.vy;
  }
}
