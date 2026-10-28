import { escolherQuadro, EstadoVista, colunaRoll, elevacaoGeometrica } from '../javascript/nave_vista.js';
import { ATLAS_NAVE as A } from '../javascript/nave_atlas.js';
const cam = { y: 4, z: 16 }, naveZ = 7;
const cenarios = [
  ['repouso (y=0)',                0,    0,   0],
  ['topo da tela, parada (y=7.1)', 7.1,  0,   0],
  ['base da tela, parada (y=-1.7)',-1.7, 0,   0],
  ['subindo rapido do repouso',    1,    11,  0],
  ['subindo, ja no alto',          5,    11,  0],
  ['descendo do alto',             3,   -11,  0],
  ['descendo rapido embaixo',      0,   -11,  0],
  ['indo para a direita',          0,    0,  -0.08],
  ['subindo + esquerda',           4,    11,  0.08],
  ['descendo + direita',           1,   -11, -0.08],
];
const saida = cenarios.map(([nome, y, vy, rotZ]) => {
  const q = escolherQuadro({ camY: cam.y, camZ: cam.z, naveY: y, naveZ, vy, rotZ });
  return { nome, y, vy, rotZ, linha: q.linha, coluna: q.coluna, elevacao: +q.elevacao.toFixed(1), elevLinha: A.elevacoes[q.linha] };
});
// verificacoes
const falhas = [];
for (const s of saida) {
  if (s.linha < 0 || s.linha >= A.grade || s.coluna < 0 || s.coluna >= A.colunasRoll) falhas.push('fora da grade: ' + s.nome);
}
const por = n => saida.find(s => s.nome.startsWith(n));
if (por('repouso').linha !== A.elevacoes.indexOf(24)) falhas.push('repouso deveria usar elev 24');
if (por('repouso').coluna !== 3) falhas.push('repouso deveria ser coluna neutra');
if (por('topo').elevLinha >= 0) falhas.push('topo da tela deveria mostrar a barriga');
if (por('base').elevLinha <= 24) falhas.push('base da tela deveria mostrar mais o dorso que o repouso');
if (por('subindo, ja').elevLinha >= 0) falhas.push('subindo no alto deveria mostrar a barriga');
if (!(por('subindo rapido').elevLinha < por('repouso').elevLinha)) falhas.push('subir deveria reduzir a elevacao');
if (!(por('descendo rapido').elevLinha > por('repouso').elevLinha)) falhas.push('descer deveria aumentar a elevacao');
if (por('indo para a direita').coluna !== 6) falhas.push('direita deveria ser coluna 6');
if (por('subindo + esquerda').coluna !== 0) falhas.push('esquerda deveria ser coluna 0');
// estado: ignora o salto do respawn
const e = new EstadoVista(); e.atualizar(5, .016); let vy = e.atualizar(0, .016);
if (Math.abs(vy) > 2) falhas.push('respawn nao deveria virar velocidade alta: ' + vy);
// estado: convergencia para a velocidade real
const e2 = new EstadoVista(); let y = 0; let v = 0;
for (let i = 0; i < 60; i++) { y += 11 * .016; v = e2.atualizar(y, .016); }
if (v < 9) falhas.push('velocidade suavizada nao convergiu: ' + v);
console.log(JSON.stringify({ saida, falhas, vyConvergida: +v.toFixed(2), vyAposRespawn: +vy.toFixed(2) }, null, 1));
