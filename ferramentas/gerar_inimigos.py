#!/usr/bin/env python3
"""
Spritesheets das naves inimigas e dos 5 chefes do Starfall 3D.

Os modelos sao portados de entidades.js (createEnemyShip): cada cone, esfera, toro, caixa e extrusao
com a MESMA posicao, rotacao (Euler XYZ), escala e parametros do codigo. Sem rotacao em jogo: a ponta do
casco (+Z) sempre aponta para a camera, entao so a posicao relativa a camera muda a vista.

Eixos da matriz de vistas (calibrados com a simulacao do movimento do jogo):
  elevacao: angulo com que a camera enxerga o inimigo (+ = camera acima, mostra o dorso)
  azimute : + = inimigo a direita da camera (a camera ve o flanco esquerdo dele)

Saidas (relativas a PROJ):
  img/inimigo_vista.png, img/chefe0_vista.png ... chefe4_vista.png
  javascript/inimigos_atlas.js
"""
import itertools, json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

PROJ = os.environ.get("PROJ", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IMG = os.path.join(PROJ, "img")
JS = os.path.join(PROJ, "javascript")
FERR = os.path.join(PROJ, "ferramentas")

FR = 384                 # lado do quadro final
SS = 2                   # supersampling
W = FR * SS
CX = CY = W / 2
D_R = 26.0               # distancia da camera de render (em unidades do modelo)
MARGEM = 16              # px minimos de margem no quadro final

# ---- matriz de vistas ----
ENEMY_ELEV = [-24, -12, 0, 12, 24, 36]
ENEMY_AZIM = [-45, -30, -15, 0, 15, 30, 45]
BOSS_ELEV = [-6, 0, 6]
BOSS_AZIM = [-30, -20, -10, 0, 10, 20, 30]


# ============================================================ utilidades
def hx(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) if isinstance(h, str) else ((h >> 16) & 255, (h >> 8) & 255, h & 255)


def mix(a, b, t):
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3))


def Rx(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def Ry(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def Rz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def euler_xyz(x, y, z):          # mesma convencao do Three.js (ordem 'XYZ')
    return Rx(x) @ Ry(y) @ Rz(z)


class FaceM:
    __slots__ = ("pts", "n", "c", "mat", "part", "lines")

    def __init__(self, pts, n, mat, part, lines=None):
        self.pts, self.n, self.mat, self.part, self.lines = pts, n, mat, part, lines
        self.c = pts.mean(0)


def mkf(pts, ref, mat, part, lines=None):
    pts = np.array(pts, float)
    n = np.zeros(3)
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n += np.array([(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])])
    ln = np.linalg.norm(n)
    if ln < 1e-12:
        return None
    n /= ln
    if np.dot(n, pts.mean(0) - np.asarray(ref, float)) < 0:
        n = -n
    return FaceM(pts, n, mat, part, lines)


# ============================================================ primitivas (espaco local, como no Three.js)
# cada primitiva devolve lista de (pontos Nx3, ponto-de-referencia-interno)
def cone(r, h, n, bands=6):
    out = []

    def ring(t):
        rho = r * t
        y = h / 2 - h * t
        return [(rho * math.sin(2 * math.pi * k / n), y, rho * math.cos(2 * math.pi * k / n)) for k in range(n)]

    ts = [i / bands for i in range(bands + 1)]
    for i in range(bands):
        A, B = ring(ts[i]), ring(ts[i + 1])
        for k in range(n):
            k2 = (k + 1) % n
            y = (A[0][1] + B[0][1]) / 2
            if i > 0:
                out.append(([A[k], A[k2], B[k2], B[k]], (0, y, 0), [1, 3]))
            else:
                out.append(([A[k], B[k2], B[k]], (0, y, 0), [0, 2]))
    out.append((ring(1.0), (0, 0, 0)))
    return out


def cylinder(rt, rb, h, n, bands=3):
    out = []

    def ring(t):
        rho = rt + (rb - rt) * t
        y = h / 2 - h * t
        return [(rho * math.sin(2 * math.pi * k / n), y, rho * math.cos(2 * math.pi * k / n)) for k in range(n)]

    for i in range(bands):
        A, B = ring(i / bands), ring((i + 1) / bands)
        for k in range(n):
            k2 = (k + 1) % n
            out.append(([A[k], A[k2], B[k2], B[k]], (0, (A[0][1] + B[0][1]) / 2, 0), [1, 3]))
    out.append((ring(0.0), (0, 0, 0)))
    out.append((ring(1.0), (0, 0, 0)))
    return out


def box(w, h, d):
    x, y, z = w / 2, h / 2, d / 2
    v = np.array([[sx * x, sy * y, sz * z] for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)])
    quads = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return [([v[i] for i in q], (0, 0, 0)) for q in quads]


def sphere(r, ws, hs):
    def pt(ix, iy):
        u, v = ix / ws, iy / hs
        return (-r * math.cos(u * 2 * math.pi) * math.sin(v * math.pi), r * math.cos(v * math.pi),
                r * math.sin(u * 2 * math.pi) * math.sin(v * math.pi))

    out = []
    for iy in range(hs):
        for ix in range(ws):
            a, b, c, d = pt(ix, iy), pt(ix + 1, iy), pt(ix + 1, iy + 1), pt(ix, iy + 1)
            if iy == 0:
                out.append(([a, c, d], (0, 0, 0), []))
            elif iy == hs - 1:
                out.append(([a, b, d], (0, 0, 0), []))
            else:
                out.append(([a, b, c, d], (0, 0, 0), []))
    return out


def torus(R, r, rseg, tseg):
    def pt(i, j):
        u, v = i / tseg * 2 * math.pi, j / rseg * 2 * math.pi
        return ((R + r * math.cos(v)) * math.cos(u), (R + r * math.cos(v)) * math.sin(u), r * math.sin(v))

    out = []
    for i in range(tseg):
        um = (i + .5) / tseg * 2 * math.pi
        for j in range(rseg):
            out.append(([pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)], (R * math.cos(um), R * math.sin(um), 0), []))
    return out


def poly_sphere_tris(tris, radius, detail):
    """Como PolyhedronGeometry do Three.js: subdivide cada triangulo em (detail+1)^2 e projeta na esfera."""
    cols = detail + 1
    res = []
    for a, b, c in tris:
        a, b, c = (np.array(p, float) for p in (a, b, c))
        v = []
        for i in range(cols + 1):
            aj = a + (c - a) * (i / cols)
            bj = b + (c - b) * (i / cols)
            rows = cols - i
            v.append([aj if (j == 0 and i == cols) else aj + (bj - aj) * (j / rows) for j in range(rows + 1)])
        for i in range(cols):
            for j in range(2 * (cols - i) - 1):
                k = j // 2
                t = (v[i][k + 1], v[i + 1][k], v[i][k]) if j % 2 == 0 else (v[i][k + 1], v[i + 1][k + 1], v[i + 1][k])
                res.append(([p / np.linalg.norm(p) * radius for p in t], (0, 0, 0)))
    return res


def octahedron(radius, detail):
    v = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]
    idx = [(0, 2, 4), (0, 4, 3), (0, 3, 5), (0, 5, 2), (1, 2, 5), (1, 5, 3), (1, 3, 4), (1, 4, 2)]
    tris = [(v[a], v[b], v[c]) for a, b, c in idx]
    return poly_sphere_tris(tris, radius, detail)


def dodecahedron(radius):
    t = (1 + math.sqrt(5)) / 2
    r = 1 / t
    V = np.array([(-1, -1, -1), (-1, -1, 1), (-1, 1, -1), (-1, 1, 1), (1, -1, -1), (1, -1, 1), (1, 1, -1), (1, 1, 1),
                  (0, -r, -t), (0, -r, t), (0, r, -t), (0, r, t), (-r, -t, 0), (-r, t, 0), (r, -t, 0), (r, t, 0),
                  (-t, 0, -r), (t, 0, -r), (-t, 0, r), (t, 0, r)], float)
    V = V / np.linalg.norm(V, axis=1, keepdims=True) * radius
    faces = {}
    for i, j, k in itertools.combinations(range(20), 3):
        n = np.cross(V[j] - V[i], V[k] - V[i])
        ln = np.linalg.norm(n)
        if ln < 1e-9:
            continue
        n /= ln
        d = V @ n - V[i] @ n
        if np.all(d <= 1e-6) or np.all(d >= -1e-6):
            on = tuple(np.where(np.abs(d) < 1e-6)[0])
            if len(on) == 5:
                faces[on] = n
    out = []
    for on, n in faces.items():
        P = V[list(on)]
        c = P.mean(0)
        u = P[0] - c; u /= np.linalg.norm(u)
        w = np.cross(n, u)
        order = np.argsort([math.atan2(np.dot(p - c, w), np.dot(p - c, u)) for p in P])
        out.append(([P[i] for i in order], (0, 0, 0)))
    return out


def extrude(shape, depth):
    """ExtrudeGeometry sem chanfro: forma no plano XY, extrudada de z=0 a z=depth."""
    P = np.array(shape, float)
    area = sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P))) / 2
    out = []
    top = [(x, y, depth) for x, y in P]
    bot = [(x, y, 0.0) for x, y in P]
    ctr = (P[:, 0].mean(), P[:, 1].mean(), depth / 2)
    out.append((top, ctr))
    out.append((bot, ctr))
    for i in range(len(P)):
        j = (i + 1) % len(P)
        dx, dy = P[j][0] - P[i][0], P[j][1] - P[i][1]
        n2 = np.array([dy, -dx]) if area > 0 else np.array([-dy, dx])
        n2 /= np.linalg.norm(n2)
        c = ((P[i][0] + P[j][0]) / 2, (P[i][1] + P[j][1]) / 2, depth / 2)
        ref = (c[0] - n2[0] * 0.05, c[1] - n2[1] * 0.05, c[2])
        out.append(([(P[i][0], P[i][1], 0), (P[j][0], P[j][1], 0), (P[j][0], P[j][1], depth), (P[i][0], P[i][1], depth)], ref))
    return out


# ============================================================ montagem do modelo (espelha createEnemyShip)
class Modelo:
    def __init__(self, variante):
        self.faces, self.glows = [], []
        self.pid = 0
        pal = None
        if variante >= 0:
            pal = [
                dict(armor=0x174d77, edge=0x31e6ff, dark=0x10283e, glow=0x20cfff, core=0x83f7ff),
                dict(armor=0x5b235f, edge=0xff70e1, dark=0x311842, glow=0xff45c7, core=0xffb7f0),
                dict(armor=0x67501b, edge=0xffdf55, dark=0x392a12, glow=0xffae24, core=0xfff39a),
                dict(armor=0x25532f, edge=0x7dff74, dark=0x18331e, glow=0x4eff68, core=0xc1ff8f),
                dict(armor=0x67301d, edge=0xff7652, dark=0x3c1c19, glow=0xff433e, core=0xffc278),
            ][variante % 5]
        g = lambda k, d: hx(pal[k]) if pal else hx(d)
        self.cores = dict(
            armor=g("armor", 0x421c68), edge=g("edge", 0xff3f75), dark=g("dark", 0x16132f),
            orange=g("core", 0xffc247), red=g("glow", 0xff315f), core=g("core", 0xff7d55))
        self.emis = dict(armor=g("dark", 0x5e0d75), edge=g("glow", 0xb90b61), dark=g("dark", 0x250d47))
        self.glow_cor = g("glow", 0xff315f)
        self.rim = self.cores["edge"]
        self.outline = mix(self.cores["dark"], (0, 0, 0), .55)
        self.build(variante)

    def add(self, prim, mat, pos=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), glow=None):
        R = euler_xyz(*rot)
        S = np.array(scale, float)
        p = np.array(pos, float)
        pid = self.pid
        self.pid += 1
        for item in prim:
            pts, ref = item[0], item[1]
            lines = item[2] if len(item) > 2 else None
            P = (np.array(pts, float) * S) @ R.T + p
            ref = (np.array(ref, float) * S) @ R.T + p
            f = mkf(P, ref, mat, pid, lines)
            if f:
                self.faces.append(f)
        if glow:
            self.glows.append(dict(part=pid, center=p, radius=glow, color=self.glow_cor if mat in ("red", "core") else self.cores[mat]))

    def build(self, variante):
        A = self.add
        # casco: ConeGeometry(.84, 3.15, 8), rotation.x = +pi/2 (ponta para +Z, para a camera)
        A(cone(.84, 3.15, 8), "armor", rot=(math.pi / 2, 0, 0))
        # dorsal: ConeGeometry(.3, 1.35, 5), rotation.x = -pi/2
        A(cone(.3, 1.35, 5), "edge", pos=(0, .38, .15), rot=(-math.pi / 2, 0, 0))
        # nucleo: Sphere(.42) escala (1,.4,1.35)
        A(sphere(.42, 20, 12), "core", pos=(0, .28, -.48), scale=(1, .4, 1.35), glow=.42)
        # asas: Extrude da forma, profundidade .18 (esquerda normal, direita escala.x = -1)
        wing = [(0, .2), (2.15, .26), (1.25, -.18), (.2, -.55), (0, -.15)]
        A(extrude(wing, .18), "edge", pos=(.15, 0, .45))
        A(extrude(wing, .18), "edge", pos=(-.15, 0, .45), scale=(-1, 1, 1))
        for side in (-1, 1):
            A(cylinder(.1, .15, .7, 8), "dark", pos=(side * 1.1, .12, -.15), rot=(math.pi / 2, 0, 0))
            A(sphere(.1, 10, 8), "red", pos=(side * 1.1, .12, -.53), glow=.12)
        # painel inferior
        A(box(.62, .08, 1.1), "dark", pos=(0, -.38, .35), rot=(.12, 0, 0))
        # aneis dos motores: Torus(.28, .075, 8, 18), rotation.x = pi/2
        for x in (-.34, .34):
            A(torus(.28, .075, 8, 18), "orange", pos=(x, 0, 1.62), rot=(math.pi / 2, 0, 0), glow=.36)
        A(sphere(.08, 8, 6), "orange", pos=(0, .45, .65), glow=.1)
        if variante < 0:
            return
        pi = math.pi
        if variante == 0:
            for d in (-1, 1):
                A(cone(.65, 2.1, 5), "edge", pos=(d * 1.65, .2, .2), rot=(0, 0, d * -.55))
        elif variante == 1:
            for d in (-1, 1):
                A(octahedron(.9, 0), "edge", pos=(d * 2.15, 0, .1), rot=(0, 0, pi / 4))
            A(torus(1.15, .1, 8, 24), "orange", pos=(0, .1, -.25), rot=(pi / 2, 0, 0), scale=(1.7, 1, 1))
        elif variante == 2:
            for d in (-1, 1):
                A(box(1.35, .3, 2.1), "edge", pos=(d * 2, -.15, .3), rot=(0, d * .3, d * -.2))
            A(octahedron(.7, 1), "orange", pos=(0, .35, -.7), glow=.72)
        elif variante == 3:
            for d in (-1, 1):
                A(cone(.38, 2.8, 4), "edge", pos=(d * 1.55, .15, .15), rot=(0, 0, d * -.8))
                A(torus(.42, .09, 8, 18), "orange", pos=(d * .6, .1, .25), rot=(pi / 2, 0, 0), glow=.5)
        else:
            for d in (-1, 1):
                A(dodecahedron(.72), "edge", pos=(d * 2, .1, .1))
                A(cone(.36, 1.7, 5), "dark", pos=(d * 1.15, .45, -.35), rot=(0, 0, d * -.35))
            A(torus(1.1, .12, 8, 24), "edge", pos=(0, 0, .55), rot=(pi / 2, 0, 0), scale=(1.5, 1, 1))


# ============================================================ renderizacao
LIGHT = np.array([-0.45, 0.75, -0.5]); LIGHT /= np.linalg.norm(LIGHT)
RIM = np.array([0.7, 0.55, 0.45]); RIM /= np.linalg.norm(RIM)


def ramp(model, mat):
    base = model.cores[mat]
    if mat in model.emis:
        base = mix(base, model.emis[mat], .3)
    if mat in ("orange", "red", "core"):          # materiais que brilham: sem sombra escura
        return [mix(base, (0, 0, 0), .2), base, mix(base, (255, 255, 255), .55)], 1
    return [mix(base, (6, 4, 22), .55), base, mix(base, (255, 255, 255), .32)], 0


def render(model, elev, azim, F):
    """Gera (casco, fx) RGBA em W x W. elev/azim em graus. F = focal em px (2x)."""
    R = Rx(math.radians(elev)) @ Ry(math.radians(azim))
    cam = np.array([0.0, 0.0, -D_R])
    vis = []
    for f in model.faces:
        n = R @ f.n
        c = R @ f.c
        n = np.array([n[0], n[1], -n[2]])           # espaco do Three.js -> espaco do renderizador (z invertido)
        c = np.array([c[0], c[1], -c[2]])
        if np.dot(n, cam - c) <= 1e-6:
            continue
        vis.append((c[2], f, n))
    vis.sort(key=lambda t: -t[0])
    body = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(body)
    mask = Image.new("L", (W, W), 0)
    md = ImageDraw.Draw(mask)
    visparts = set()
    for _, f, n in vis:
        P = f.pts @ R.T
        P = np.stack([P[:, 0], P[:, 1], -P[:, 2]], axis=1)
        dep = P[:, 2] + D_R
        xy = np.stack([CX + F * P[:, 0] / dep, CY - F * P[:, 1] / dep], axis=1)
        poly = [(float(a), float(b)) for a, b in xy]
        cols, offs = ramp(model, f.mat)
        ndl = float(np.dot(n, LIGHT))
        tone = 2 if ndl > 0.55 else (1 if ndl > 0.12 else 0)
        tone = min(2, tone + offs)
        col = cols[tone]
        if offs == 0 and tone < 2 and float(np.dot(n, RIM)) > 0.5:
            col = mix(col, model.rim, 0.45)
        d.polygon(poly, fill=col + (255,))
        md.polygon(poly, fill=255)
        idxs = range(len(poly)) if f.lines is None else f.lines
        for i in idxs:
            d.line([poly[i], poly[(i + 1) % len(poly)]], fill=model.outline + (255,), width=3)
        visparts.add(f.part)
    dil = mask.filter(ImageFilter.MaxFilter(9))
    hull = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    hull.paste(Image.new("RGBA", (W, W), model.outline + (255,)), (0, 0), dil)
    hull = Image.alpha_composite(hull, body)
    # brilho (halos) das partes emissivas visiveis
    fx = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    for g in model.glows:
        if g["part"] not in visparts:
            continue
        c = R @ g["center"]
        c = np.array([c[0], c[1], -c[2]])
        dep = c[2] + D_R
        sx, sy = CX + F * c[0] / dep, CY - F * c[1] / dep
        rp = F / dep * g["radius"]
        for k, al in ((1.7, 30), (1.3, 50)):
            tmp = Image.new("RGBA", (W, W), (0, 0, 0, 0))
            ImageDraw.Draw(tmp).ellipse([sx - rp * k, sy - rp * k, sx + rp * k, sy + rp * k], fill=g["color"] + (al,))
            fx = Image.alpha_composite(fx, tmp)
    return hull, fx


def extent(img):
    a = np.array(img)[..., 3]
    ys, xs = np.where(a > 8)
    return max(abs(xs.min() - CX), abs(xs.max() - CX), abs(ys.min() - CY), abs(ys.max() - CY))


def down(img):
    return img.resize((FR, FR), Image.LANCZOS)


def gerar_folha(nome, model, elevs, azims, arquivo):
    F0 = 143.0 * D_R * (W / 768.0)
    ext = 0
    for e in elevs:
        for a in azims:
            h, fx = render(model, e, a, F0 * 0.5)       # mede em escala menor para nao saturar no limite do quadro
            ext = max(ext, extent(Image.alpha_composite(h, fx)))
    ext *= 2                                              # a projecao e linear em F
    s = min(1.0, (W / 2 - (MARGEM + 2) * SS) / ext)
    F = F0 * s
    cols, rows = len(azims), len(elevs)
    sheet = Image.new("RGBA", (cols * FR, rows * FR), (0, 0, 0, 0))
    minm = 999
    for r, e in enumerate(elevs):
        for c, a in enumerate(azims):
            h, fx = render(model, e, a, F)
            fr = down(Image.alpha_composite(h, fx))
            sheet.paste(fr, (c * FR, r * FR))
            al = np.array(fr)[..., 3]
            ys, xs = np.where(al > 8)
            minm = min(minm, xs.min(), FR - 1 - xs.max(), ys.min(), FR - 1 - ys.max())
    sheet.save(os.path.join(IMG, arquivo), optimize=True)
    unidades = W * D_R / F        # lado do quadro em unidades do modelo (no plano da origem)
    print("%-8s escala %.3f  margem min %d px  unidades/quadro %.3f" % (nome, s, minm, unidades), flush=True)
    return dict(arquivo="../img/" + arquivo, quadro=FR, colunas=cols, linhas=rows,
                elevacoes=elevs, azimutes=azims, unidades=round(unidades, 4)), sheet


def main():
    os.makedirs(IMG, exist_ok=True)
    os.makedirs(JS, exist_ok=True)
    os.makedirs(FERR, exist_ok=True)
    atlas = {}
    sheets = {}
    atlas["inimigo"], sheets["inimigo"] = gerar_folha("inimigo", Modelo(-1), ENEMY_ELEV, ENEMY_AZIM, "inimigo_vista.png")
    atlas["chefes"] = []
    for v in range(5):
        a, s = gerar_folha("chefe%d" % v, Modelo(v), BOSS_ELEV, BOSS_AZIM, "chefe%d_vista.png" % v)
        atlas["chefes"].append(a)
        sheets["chefe%d" % v] = s
    with open(os.path.join(JS, "inimigos_atlas.js"), "w", encoding="utf-8", newline="\r\n") as fh:
        fh.write("// Gerado por gerar_inimigos.py. Nao edite a mao: rode o script de novo.\n")
        fh.write("// elevacoes: graus com que a camera enxerga o inimigo (+ = camera acima, mostra o dorso).\n")
        fh.write("// azimutes: + = inimigo a direita da camera. unidades: lado do quadro em unidades do modelo.\n")
        fh.write("export const INIMIGOS_ATLAS = " + json.dumps(atlas, indent=2) + ";\n")

    # preview: matriz do inimigo + quadro central de cada chefe
    f = ImageFont.load_default()
    cell = 200
    sh = sheets["inimigo"]
    pw = 110 + len(ENEMY_AZIM) * cell
    ph = 24 + len(ENEMY_ELEV) * cell + 24 + 2 * 30 + (cell + 24)
    bg = Image.new("RGBA", (pw, ph), (27, 27, 51, 255))
    d = ImageDraw.Draw(bg)
    for c, a in enumerate(ENEMY_AZIM):
        d.text((110 + c * cell + 6, 6), "azim %+d" % a, fill=(190, 190, 230, 255), font=f)
    for r, e in enumerate(ENEMY_ELEV):
        d.text((8, 24 + r * cell + cell // 2), "elev %+d" % e, fill=(190, 190, 230, 255), font=f)
        for c in range(len(ENEMY_AZIM)):
            fr = sh.crop((c * FR, r * FR, (c + 1) * FR, (r + 1) * FR)).resize((cell, cell), Image.LANCZOS)
            bg.alpha_composite(fr, (110 + c * cell, 24 + r * cell))
    y0 = 24 + len(ENEMY_ELEV) * cell + 8
    d.text((8, y0), "chefes 0-4 (elev 0, azim 0)", fill=(190, 190, 230, 255), font=f)
    for v in range(5):
        s = sheets["chefe%d" % v]
        fr = s.crop((3 * FR, 1 * FR, 4 * FR, 2 * FR)).resize((cell, cell), Image.LANCZOS)
        bg.alpha_composite(fr, (110 + v * cell, y0 + 14))
    bg.convert("RGB").save(os.path.join(FERR, "preview_inimigos.png"))


if __name__ == "__main__":
    main()
