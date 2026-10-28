#!/usr/bin/env python3
"""
Gera os assets da nave para o Starfall 3D, calibrados para a camera do jogo.

  img/nave_vista.png      matriz de vistas: 8 linhas (elevacao da camera) x 7 colunas (inclinacao lateral)
  img/nave_explosao.png   8 quadros de explosao (4 x 2)
  javascript/nave_atlas.js  constantes lidas pelo jogo (elevacoes, escalas por linha, etc.)

Usa o renderizador de gerar_spritesheet_nave.py (mesmo modelo, mesmo estilo).
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gerar_spritesheet_nave as g

PROJ = os.environ.get("PROJ", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # raiz do jogo (pasta acima de ferramentas/)
IMG = os.path.join(PROJ, "img")
JS = os.path.join(PROJ, "javascript")
os.makedirs(IMG, exist_ok=True)
os.makedirs(JS, exist_ok=True)

FRAME = g.FRAME
GRID = 8
# elevacao da camera sobre a nave (graus). + = camera acima (mostra o dorso), - = abaixo (mostra a barriga)
ELEV = [-36, -24, -12, 0, 12, 24, 36, 48]
# inclinacao lateral (theta > 0 = inclina para a esquerda). Colunas 0..6, neutro = 3
ROLLS = [45, 30, 15, 0, -15, -30, -45]
MARGEM = 18  # px minimos de margem no quadro final (512)


def render_frame(e, th, flame_phase=2):
    hull, R = g.render_hull(roll=th, pitch=-e, yaw=-0.2 * th)
    fx = g.flames(R, flame_phase, "cruise", seed=7)
    fx = g.nav_lights(fx, R)
    return hull, fx


def extent(img):
    a = np.array(img)[..., 3]
    ys, xs = np.where(a > 8)
    c = g.W / 2
    return max(abs(xs.min() - c), abs(xs.max() - c), abs(ys.min() - c), abs(ys.max() - c))


def main():
    # passo 1: mede a extensao de cada linha na escala 1 e define a escala que cabe no quadro
    escalas = []
    for e in ELEV:
        g.F = g.BASE_F
        ext = 0
        for th in ROLLS:
            hull, fx = render_frame(e, th)
            ext = max(ext, extent(g.Image.alpha_composite(hull, fx)))
        s = min(1.0, (g.W / 2 - MARGEM * g.SS) / ext)
        escalas.append(round(s, 4))
        print("elev %4d  extensao %.0f  escala %.3f" % (e, ext, s), flush=True)

    # passo 2: render final
    sheet = Image.new("RGBA", (GRID * FRAME, GRID * FRAME), (0, 0, 0, 0))
    larg_rel = None
    minmargem = 999
    for r, (e, s) in enumerate(zip(ELEV, escalas)):
        g.F = g.BASE_F * s
        for c, th in enumerate(ROLLS):
            hull, fx = render_frame(e, th)
            comp = g.down(g.Image.alpha_composite(hull, fx))
            sheet.paste(comp, (c * FRAME, r * FRAME))
            a = np.array(comp)[..., 3]
            ys, xs = np.where(a > 8)
            minmargem = min(minmargem, xs.min(), FRAME - 1 - xs.max(), ys.min(), FRAME - 1 - ys.max())
            if e == 24 and th == 0:
                ha = np.array(g.down(hull))[..., 3]
                hx_ = np.where(ha > 8)[1]
                larg_rel = (hx_.max() - hx_.min() + 1) / FRAME / s
    g.F = g.BASE_F
    sheet.save(os.path.join(IMG, "nave_vista.png"), optimize=True)
    print("menor margem nos quadros: %d px" % minmargem)

    # explosao (sem casco: a nave some quando explode)
    ex = Image.new("RGBA", (4 * FRAME, 2 * FRAME), (0, 0, 0, 0))
    for i in range(8):
        ex.paste(g.down(g.explosion(i)), ((i % 4) * FRAME, (i // 4) * FRAME))
    ex.save(os.path.join(IMG, "nave_explosao.png"), optimize=True)

    atlas = {
        "quadro": FRAME, "grade": GRID,
        "elevacoes": ELEV, "escalas": escalas,
        "colunasRoll": len(ROLLS),
        "larguraRelativa": round(float(larg_rel), 4),
        "explosao": {"colunas": 4, "linhas": 2, "quadros": 8},
    }
    with open(os.path.join(JS, "nave_atlas.js"), "w", encoding="utf-8", newline="\r\n") as fh:
        fh.write("// Gerado por gerar_nave_jogo.py. Nao edite a mao: rode o script de novo.\n")
        fh.write("// elevacoes: graus da camera sobre a nave. Positivo = camera acima (mostra o dorso);\n")
        fh.write("// negativo = camera abaixo (mostra a barriga). Cada elevacao e uma linha da matriz.\n")
        fh.write("// escalas: fator de render de cada linha (o jogo compensa para a nave manter o mesmo tamanho).\n")
        fh.write("export const ATLAS_NAVE = " + json.dumps(atlas, indent=2) + ";\n")
    print("larguraRelativa", atlas["larguraRelativa"])

    # preview rotulado da matriz
    P = 2048
    cell = P // GRID
    bg = Image.new("RGBA", (P + 150, P + 40), g.hx("#1B1B33") + (255,))
    bg.alpha_composite(sheet.resize((P, P), Image.LANCZOS), (150, 40))
    d = ImageDraw.Draw(bg)
    f = ImageFont.load_default()
    for r, e in enumerate(ELEV):
        d.text((8, 40 + r * cell + cell // 2 - 10), "elev %+d" % e, fill=(190, 190, 230, 255), font=f)
        d.text((8, 40 + r * cell + cell // 2 + 4), "%s" % ("dorso" if e > 0 else ("de tras" if e == 0 else "barriga")),
               fill=(150, 150, 200, 255), font=f)
    for c, th in enumerate(ROLLS):
        lab = "esq %d" % th if th > 0 else ("dir %d" % -th if th < 0 else "neutro")
        d.text((150 + c * cell + 6, 10), lab, fill=(190, 190, 230, 255), font=f)
    os.makedirs(os.path.join(PROJ, "ferramentas"), exist_ok=True)
    bg.convert("RGB").save(os.path.join(PROJ, "ferramentas", "preview_matriz_vista.png"))


if __name__ == "__main__":
    main()
