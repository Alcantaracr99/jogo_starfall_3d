// Logica pura (sem Three.js) que decide QUAL quadro da matriz de vistas mostrar para um inimigo ou chefe.
//
// Os inimigos nunca giram no jogo (nao ha rotation nem lookAt): a ponta do casco (+Z) aponta sempre para a camera.
// Entao a unica coisa que muda a aparencia e a posicao relativa a camera:
//   elevacao = angulo com que a camera enxerga o inimigo (positivo = camera acima, mostra o dorso;
//              negativo = camera abaixo, mostra a barriga)
//   azimute  = positivo quando o inimigo esta a direita da camera (a camera ve o flanco esquerdo dele)
// Cada linha da matriz e uma elevacao e cada coluna um azimute (valores em atlas.elevacoes / atlas.azimutes).

const paraGraus = rad => rad * 180 / Math.PI;

export function elevacaoAzimute(cam, pos) {
  const dx = pos.x - cam.x;
  const dz = cam.z - pos.z;
  return {
    elevacao: paraGraus(Math.atan2(cam.y - pos.y, Math.hypot(dx, dz))),
    azimute: paraGraus(Math.atan2(dx, dz))
  };
}

export function indiceMaisProximo(lista, valor) {
  let melhor = 0;
  for (let indice = 1; indice < lista.length; indice++) {
    if (Math.abs(lista[indice] - valor) < Math.abs(lista[melhor] - valor)) melhor = indice;
  }
  return melhor;
}

export function escolherQuadroInimigo(atlas, cam, pos) {
  const { elevacao, azimute } = elevacaoAzimute(cam, pos);
  return {
    linha: indiceMaisProximo(atlas.elevacoes, elevacao),
    coluna: indiceMaisProximo(atlas.azimutes, azimute),
    elevacao, azimute
  };
}
