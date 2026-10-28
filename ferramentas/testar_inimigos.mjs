// Teste da logica de escolha de quadro dos inimigos/chefes.
// Rode com: node ferramentas/testar_inimigos.mjs
// Os cenarios validam limites, perspectiva e simetria sem abrir um navegador.
import { escolherQuadroInimigo } from '../javascript/inimigos_vista.js';
import { INIMIGOS_ATLAS as A } from '../javascript/inimigos_atlas.js';

const cam = { x: 0, y: 4, z: 16 };
const inimigo = A.inimigo;
const cenarios = [
  ['inimigo nasce longe, centro',          'inimigo', 0, -4.7, -55],
  ['inimigo longe, na direita',            'inimigo', 25, -3, -50],
  ['inimigo no meio do caminho',           'inimigo', 2, 0, -20],
  ['inimigo perto, direita (z da nave)',   'inimigo', 8, 2, 0],
  ['inimigo perto, esquerda e no alto',    'inimigo', -6, 8, 5],
  ['inimigo que passou da nave (z=12)',    'inimigo', 1, 1, 12],
  ['chefe no destino, centro',             'chefe', 1, 2, -48],
  ['chefe no destino, alto e a direita',   'chefe', 9, 8.5, -48],
  ['chefe entrando (spawn)',               'chefe', -30, -4.7, -48],
];

// Gera um relatorio legivel para facilitar a deteccao de uma matriz incorreta.
const saida = cenarios.map(([nome, tipo, x, y, z]) => {
  const atlas = tipo === 'chefe' ? A.chefes[0] : inimigo;
  const q = escolherQuadroInimigo(atlas, cam, { x, y, z });
  return { nome, tipo, x, y, z, linha: q.linha, coluna: q.coluna, elevacao: +q.elevacao.toFixed(1), azimute: +q.azimute.toFixed(1),
           elevLinha: atlas.elevacoes[q.linha], azimColuna: atlas.azimutes[q.coluna] };
});
const falhas = [];
const por = n => saida.find(s => s.nome.startsWith(n));
for (const s of saida) {
  const atlas = s.tipo === 'chefe' ? A.chefes[0] : inimigo;
  if (s.linha < 0 || s.linha >= atlas.linhas || s.coluna < 0 || s.coluna >= atlas.colunas) falhas.push('fora da grade: ' + s.nome);
}
if (por('inimigo nasce').azimColuna !== 0) falhas.push('centro deveria ser azimute 0');
if (por('inimigo perto, direita').azimColuna <= 0) falhas.push('inimigo a direita deveria ter azimute positivo');
if (por('inimigo perto, esquerda').azimColuna >= 0) falhas.push('inimigo a esquerda deveria ter azimute negativo');
if (por('inimigo perto, esquerda').elevLinha >= por('inimigo nasce').elevLinha) falhas.push('inimigo no alto deveria ter elevacao menor');
if (por('inimigo que passou').elevLinha <= por('inimigo no meio').elevLinha) falhas.push('inimigo perto da camera deveria ser visto mais de cima');
if (por('chefe no destino, centro').azimColuna !== 0) falhas.push('chefe no centro deveria ser azimute 0');
if (Math.abs(por('chefe entrando').azimute) < 20) falhas.push('spawn do chefe deveria ter azimute grande');
// simetria: x e -x devem dar colunas espelhadas
const d = escolherQuadroInimigo(inimigo, cam, { x: 7, y: 2, z: 0 }), e = escolherQuadroInimigo(inimigo, cam, { x: -7, y: 2, z: 0 });
if (inimigo.azimutes[d.coluna] !== -inimigo.azimutes[e.coluna] || d.linha !== e.linha) falhas.push('x e -x deveriam ser espelhados');
console.log(JSON.stringify({ saida, falhas }, null, 1));
if (falhas.length) process.exitCode = 1;
