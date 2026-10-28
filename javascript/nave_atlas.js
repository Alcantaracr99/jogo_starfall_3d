// Gerado por gerar_nave_jogo.py. Nao edite a mao: rode o script de novo.
// Este arquivo e somente configuracao de leitura da matriz da nave.
// elevacoes: graus da camera sobre a nave. Positivo = camera acima (mostra o dorso);
// negativo = camera abaixo (mostra a barriga). Cada elevacao e uma linha da matriz.
// escalas: fator de render de cada linha (o jogo compensa para a nave manter o mesmo tamanho).
export const ATLAS_NAVE = {
  "quadro": 512,
  "grade": 8,
  "elevacoes": [
    -36,
    -24,
    -12,
    0,
    12,
    24,
    36,
    48
  ],
  "escalas": [
    0.9597,
    0.952,
    0.952,
    0.9577,
    0.9501,
    0.9501,
    0.9558,
    0.9315
  ],
  "colunasRoll": 7,
  "larguraRelativa": 0.9374,
  "explosao": {
    "colunas": 4,
    "linhas": 2,
    "quadros": 8
  }
};
