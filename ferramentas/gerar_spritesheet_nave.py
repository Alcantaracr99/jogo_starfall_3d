#!/usr/bin/env python3
"""
Gerador procedural da spritesheet da nave (vista traseira, camera 3a pessoa).
Estilo: cel-shaded cinematografico (3 tons, contorno, luz de recorte turquesa).

Saidas (pasta OUT):
  spritesheet_nave.png        composicao final 4096x4096 (8x8 frames de 512)
  spritesheet_nave_casco.png  so o casco (sem chamas/efeitos)
  spritesheet_nave_fx.png     so chamas e efeitos (propulsor, fumaca, escudo...)
  atlas.json                  coordenadas, pivo e animacoes
  preview.png                 visao geral rotulada
"""
import math, json, os, random
import numpy as np
from PIL import Image, ImageDraw, ImageChops, ImageFilter, ImageFont

OUT = os.environ.get("OUT", os.path.join(os.path.dirname(os.path.abspath(__file__)), "saida"))
FRAME = 512
SS = 2                      # supersampling
W = FRAME * SS
CX = CY = W / 2
D = 9.0                     # distancia da camera ate a origem da nave
BASE_F = 142 * D            # "focal": 142 px/unidade (2x) na origem
F = BASE_F
COLS = ROWS = 8
BASE_PITCH = -7.0           # camera levemente acima da nave


def hx(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3))


# ---------------------------------------------------------------- paleta (direcao C)
MATS = {
    "hull":   [hx("#4A4A78"), hx("#8E8DB5"), hx("#B9B8D8")],   # cinza-lilas
    "dark":   [hx("#17172E"), hx("#2A2A4A"), hx("#40406E")],   # roxo-azulado
    "white":  [hx("#A9A3C0"), hx("#D9D3DC"), hx("#F4EFE6")],   # branco quente
    "mag":    [hx("#A81D52"), hx("#FF3D81"), hx("#FF86B0")],   # magenta
    "glass":  [hx("#0E4F5A"), hx("#1FD1B5"), hx("#9AF5E4")],   # turquesa
    "engine": [hx("#0B0B1A")] * 3,
}
OUTLINE = hx("#14142C")
TURQ = hx("#1FD1B5")
MAG = hx("#FF3D81")
ROSA = hx("#FF9ECB")
CORE = hx("#FFF4E6")
LILAC = hx("#8E8DB5")
VIOLET = hx("#2A2A4A")

LIGHT = np.array([-0.45, 0.75, -0.5]); LIGHT /= np.linalg.norm(LIGHT)
RIM = np.array([0.7, 0.55, 0.45]); RIM /= np.linalg.norm(RIM)
BOUNCE = np.array([0.15, -0.7, -0.55]); BOUNCE /= np.linalg.norm(BOUNCE)


# ---------------------------------------------------------------- malha
class Face:
    __slots__ = ("pts", "n", "c", "mat", "group", "layer")

    def __init__(self, pts, n, mat, group, layer):
        self.pts, self.n, self.mat, self.group, self.layer = pts, n, mat, group, layer
        self.c = pts.mean(0)


def mkface(pts, mat, group, ref, mode="away", layer=0):
    pts = np.array(pts, float)
    n = np.zeros(3)
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n += np.array([(a[1] - b[1]) * (a[2] + b[2]),
                       (a[2] - b[2]) * (a[0] + b[0]),
                       (a[0] - b[0]) * (a[1] + b[1])])
    ln = np.linalg.norm(n)
    if ln < 1e-9:
        return None
    n /= ln
    c = pts.mean(0)
    ref = np.array(ref, float)
    d = (c - ref) if mode == "away" else (ref - c)
    if np.dot(n, d) < 0:
        n = -n
    return Face(pts, n, mat, group, layer)


def loft(rings, matfn, group, axisfn):
    out = []
    for i in range(len(rings) - 1):
        A, B = rings[i], rings[i + 1]
        n = len(A)
        for j in range(n):
            j2 = (j + 1) % n
            quad = [A[j], A[j2], B[j2], B[j]]
            zc = np.mean([q[2] for q in quad])
            ax = axisfn(zc)
            out.append(mkface(quad, matfn(i, j), group, (ax[0], ax[1], zc), "away"))
    return out


def prism(base, mats, group, thick=0.16, tvec=None, layer=0):
    base = np.array(base, float)
    if tvec is None:
        e1, e2 = base[1] - base[0], base[2] - base[0]
        nv = np.cross(e1, e2); nv /= np.linalg.norm(nv)
        t = nv * thick
    else:
        t = np.array(tvec, float)
    top, bot = base + t / 2, base - t / 2
    ctr = base.mean(0)
    out = [mkface(top, mats["top"], group, ctr, "away", layer),
           mkface(bot, mats["bot"], group, ctr, "away", layer)]
    n = len(base)
    for i in range(n):
        j = (i + 1) % n
        out.append(mkface([top[i], top[j], bot[j], bot[i]], mats["sides"][i], group, ctr, "away", layer))
    return out


BARREL = ["hull", "white", "hull", "hull", "dark", "white", "dark", "hull"]


def nozzle(cx, cy, r, zl, group, body_end, taper=None):
    out = []

    def ring(rr, z):
        return [(cx + rr * math.cos(math.radians(22.5 + 45 * k)),
                 cy + rr * math.sin(math.radians(22.5 + 45 * k)), z) for k in range(8)]

    cam = (cx, cy, -9.0)
    lo, li = ring(r * 1.2, zl), ring(r * 0.8, zl)
    zf = zl + 0.45
    fl = ring(r * 0.68, zf)
    zb = zl + 0.25
    bd = ring(r, zb)
    be = ring(r, body_end)
    for k in range(8):
        k2 = (k + 1) % 8
        out.append(mkface([lo[k], lo[k2], li[k2], li[k]], "white", group, cam, "toward"))
        out.append(mkface([li[k], li[k2], fl[k2], fl[k]], "dark", group, (cx, cy, (zl + zf) / 2), "toward"))
        out.append(mkface([bd[k], bd[k2], lo[k2], lo[k]], "hull", group, (cx, cy, (zl + zb) / 2), "away"))
        out.append(mkface([bd[k], bd[k2], be[k2], be[k]], BARREL[k], group, (cx, cy, (zb + body_end) / 2), "away"))
    out.append(mkface(fl, "engine", group, cam, "toward"))
    if taper:
        zt, rt = taper
        tp = ring(rt, zt)
        for k in range(8):
            k2 = (k + 1) % 8
            out.append(mkface([be[k], be[k2], tp[k2], tp[k]], "mag" if k == 1 else "white",
                              group, (cx, cy, (body_end + zt) / 2), "away"))
    return out


FUS = [(-0.5, 0.5), (0.5, 0.5), (0.8, 0.05), (0.6, -0.4), (-0.6, -0.4), (-0.8, 0.05)]


def fus_ring(z, s, dy=0.0):
    return [(x * s, 0.05 + (y - 0.05) * s + dy, z) for x, y in FUS]


def ymid(ax):
    return (ax - 0.7) * 0.22


def P3(a, b, t):
    a, b = np.array(a, float), np.array(b, float)
    return a + (b - a) * t


def build_mesh(broken=False):
    f = []
    # fuselagem
    rings = [fus_ring(-1.5, 1.0), fus_ring(0.6, 0.8), fus_ring(2.5, 0.14, -0.12)]
    base_m = ["white", "hull", "hull", "hull", "hull", "hull"]

    def fm(i, j):
        return "mag" if (i == 1 and j == 0) else base_m[j]

    f += loft(rings, fm, "fuselage", lambda z: (0, 0.05))
    f.append(mkface(rings[0], "dark", "fuselage", (0, 0, -9), "toward"))
    panel = [(x * 0.78, 0.05 + (y - 0.05) * 0.78, -1.53) for x, y in FUS]
    f.append(mkface(panel, "hull", "fuselage", (0, 0, -9), "toward", 1))

    def ytop(z):
        return 0.5 + (0.41 - 0.5) * (z + 1.5) / 2.1

    stripe = [(-0.1, ytop(-1.4) + .004, -1.4), (0.1, ytop(-1.4) + .004, -1.4),
              (0.1, ytop(0.5) + .004, 0.5), (-0.1, ytop(0.5) + .004, 0.5)]
    c = np.mean(stripe, 0)
    f.append(mkface(stripe, "mag", "fuselage", c - np.array([0, .5, 0]), "away", 1))

    # barriga: escotilha e faixa
    def ybot(z):
        return -0.4 + 0.09 * (z + 1.5) / 2.1

    hatch = [(-0.38, ybot(-1.1) - .004, -1.1), (0.38, ybot(-1.1) - .004, -1.1),
             (0.30, ybot(0.3) - .004, 0.3), (-0.30, ybot(0.3) - .004, 0.3)]
    f.append(mkface(hatch, "white", "fuselage", np.mean(hatch, 0) + np.array([0, .5, 0]), "away", 1))
    bstripe = [(-0.09, ybot(-1.4) - .006, -1.4), (0.09, ybot(-1.4) - .006, -1.4),
               (0.09, ybot(0.5) - .006, 0.5), (-0.09, ybot(0.5) - .006, 0.5)]
    f.append(mkface(bstripe, "mag", "fuselage", np.mean(bstripe, 0) + np.array([0, .5, 0]), "away", 2))

    # canopy
    cr = [[(-0.32, 0.40, -0.2), (0.32, 0.40, -0.2), (0.22, 0.80, -0.2), (-0.22, 0.80, -0.2)],
          [(-0.28, 0.36, 0.5), (0.28, 0.36, 0.5), (0.16, 0.68, 0.5), (-0.16, 0.68, 0.5)],
          [(-0.12, 0.32, 1.3), (0.12, 0.32, 1.3), (0.06, 0.44, 1.3), (-0.06, 0.44, 1.3)]]
    cm = ["hull", "hull", "glass", "hull"]
    f += loft(cr, lambda i, j: cm[j], "canopy", lambda z: (0, 0.55))
    f.append(mkface(cr[0], "glass", "canopy", (0, 0, -9), "toward"))

    # aletas dorsais
    for s in (1, -1):
        fin = [(s * 0.3, 0.48, -0.1), (s * 0.3, 0.48, -1.45), (s * 0.85, 1.25, -1.35), (s * 0.72, 1.068, -0.9)]
        f += prism(fin, {"top": "hull", "bot": "hull", "sides": ["dark", "mag", "mag", "dark"]}, "fin", thick=0.1)

    # asas
    for s in (1, -1):
        br = broken and s == -1
        Pxz = ([(0.7, 0.8), (1.7, 0.3), (2.2, -0.45), (1.85, -1.0), (0.7, -1.2)] if br else
               [(0.7, 0.8), (2.5, -0.2), (2.5, -1.0), (0.7, -1.2)])
        base = [(s * x, ymid(x), z) for x, z in Pxz]
        sides = ["white", "mag", "dark", "mag", "hull"] if br else ["white", "mag", "hull", "hull"]
        f += prism(base, {"top": "white" if not br else "hull", "bot": "hull", "sides": sides}, "wing", tvec=(0, 0.2, 0))
        if not br:
            A, B, C, Dd = [np.array(p) for p in base]

            def Pst(a, t):
                return P3(P3(Dd, A, t), P3(C, B, t), a)

            st = [Pst(0.22, 0.14), Pst(0.96, 0.14), Pst(0.96, 0.30), Pst(0.22, 0.30)]
            st = [p + np.array([0, 0.101, 0]) for p in st]
            f.append(mkface(st, "mag", "wing", np.mean(st, 0) - np.array([0, .5, 0]), "away", 1))
            sb = [p - np.array([0, 0.202, 0]) for p in st]
            f.append(mkface(sb, "mag", "wing", np.mean(sb, 0) + np.array([0, .5, 0]), "away", 1))
            wl = [(s * 2.5, 0.4, -0.15), (s * 2.5, 0.4, -1.0), (s * 2.8, 1.15, -0.95)]
            f += prism(wl, {"top": "white", "bot": "white", "sides": ["mag", "mag", "mag"]}, "wing", thick=0.1)

    # motores
    f += nozzle(0.0, 0.02, 0.30, -1.95, "nozzle_c", -1.45)
    f += nozzle(1.15, -0.05, 0.38, -2.15, "nac_r", 0.3, taper=(1.2, 0.1))
    f += nozzle(-1.15, -0.05, 0.38, -2.15, "nac_l", 0.3, taper=(1.2, 0.1))
    return [x for x in f if x is not None]


MESH = {False: build_mesh(False), True: build_mesh(True)}
GORDER = {"wing": 0, "fuselage": 1, "nozzle_c": 2, "fin": 3, "canopy": 4, "nac_r": 5, "nac_l": 6}

NOZ = [("r", (1.15, -0.05, -2.15), 0.38), ("l", (-1.15, -0.05, -2.15), 0.38), ("c", (0.0, 0.02, -1.95), 0.30)]


# ---------------------------------------------------------------- projecao / render
def rot(roll, pitch, yaw):
    r, p, y = map(math.radians, (roll, pitch, yaw))
    Rz = np.array([[math.cos(r), -math.sin(r), 0], [math.sin(r), math.cos(r), 0], [0, 0, 1]])
    Ry = np.array([[math.cos(y), 0, math.sin(y)], [0, 1, 0], [-math.sin(y), 0, math.cos(y)]])
    Rx = np.array([[1, 0, 0], [0, math.cos(p), -math.sin(p)], [0, math.sin(p), math.cos(p)]])
    return Rx @ Ry @ Rz


def proj(P):
    P = np.asarray(P, float)
    d = P[..., 2] + D
    return np.stack([CX + F * P[..., 0] / d, CY - F * P[..., 1] / d], axis=-1), d


def new_layer():
    return Image.new("RGBA", (W, W), (0, 0, 0, 0))


def blend(layer, fn):
    tmp = new_layer()
    fn(ImageDraw.Draw(tmp))
    return Image.alpha_composite(layer, tmp)


def render_hull(roll=0.0, pitch=BASE_PITCH, yaw=None, broken=False, scorch=0, seed=0):
    if yaw is None:
        yaw = -0.2 * roll
    R = rot(roll, pitch, yaw)
    cam = np.array([0.0, 0.0, -D])
    vis = []
    for fc in MESH[broken]:
        c = R @ fc.c
        n = R @ fc.n
        if np.dot(n, cam - c) <= 1e-6:
            continue
        vis.append((GORDER[fc.group], fc.layer, -(c[2] + D), fc, n))
    vis.sort(key=lambda t: t[:3])
    body = new_layer()
    d = ImageDraw.Draw(body)
    mask = Image.new("L", (W, W), 0)
    md = ImageDraw.Draw(mask)
    for _, layer, _, fc, n in vis:
        xy, _dd = proj(fc.pts @ R.T)
        poly = [(float(a), float(b)) for a, b in xy]
        ndl = float(np.dot(n, LIGHT))
        tone = 2 if ndl > 0.55 else (1 if ndl > 0.12 else 0)
        if tone == 0 and float(np.dot(n, BOUNCE)) > 0.45:
            tone = 1
        col = MATS[fc.mat][tone]
        if fc.mat not in ("glass", "engine", "mag") and tone < 2 and float(np.dot(n, RIM)) > 0.5:
            col = mix(col, TURQ, 0.5)
        d.polygon(poly, fill=col + (255,))
        md.polygon(poly, fill=255)
        if layer == 0 and fc.mat != "engine":
            d.line(poly + [poly[0]], fill=OUTLINE + (255,), width=3, joint="curve")
    dil = mask.filter(ImageFilter.MaxFilter(9))
    out = new_layer()
    out.paste(Image.new("RGBA", (W, W), OUTLINE + (255,)), (0, 0), dil)
    out = Image.alpha_composite(out, body)

    if scorch:
        anchors = [((1.7, 0.2, -0.5), 0.42), ((-0.1, 0.42, -0.5), 0.28)]
        if scorch >= 2:
            anchors += [((-1.5, 0.2, -0.6), 0.5), ((0.9, 0.3, -1.0), 0.3)]
        blot = Image.new("L", (W, W), 0)
        bd = ImageDraw.Draw(blot)
        for k, (pt, rad) in enumerate(anchors):
            (sx, sy), dd = proj(R @ np.array(pt))
            rp = F / dd * rad
            rng = random.Random(seed + k * 13)
            poly = []
            for a in range(11):
                ang = 2 * math.pi * a / 11
                rr = rp * (0.6 + 0.7 * rng.random())
                poly.append((sx + rr * math.cos(ang) * 1.3, sy + rr * math.sin(ang) * 0.7))
            bd.polygon(poly, fill=255)
        m = ImageChops.multiply(blot, out.split()[3]).point(lambda v: int(v * 0.62))
        dark = Image.new("RGBA", (W, W), OUTLINE + (255,))
        dark.putalpha(m)
        out = Image.alpha_composite(out, dark)
    return out, R


# ---------------------------------------------------------------- efeitos
def star(d, x, y, r, col, pts=4):
    poly = []
    for k in range(pts * 2):
        rr = r if k % 2 == 0 else r * 0.28
        a = math.pi * k / pts + math.pi / 4
        poly.append((x + rr * math.cos(a), y + rr * math.sin(a)))
    d.polygon(poly, fill=col)


def flames(R, i, mode="cruise", dead=(), weak=(), seed=0):
    layer = new_layer()
    for k, (nm, (x, y, z), r) in enumerate(NOZ):
        if nm in dead:
            continue
        rng = random.Random(seed * 131 + i * 17 + k * 3 + 1)
        base_L = {"cruise": 1.0, "boost": 2.2, "idle": 0.55}[mode]
        L = base_L * (0.88 + 0.16 * math.sin(2 * math.pi * i / 8 + k * 1.3) + 0.10 * rng.random())
        if nm == "c":
            L *= 0.8
        jag = 0.16 if mode != "boost" else 0.22
        if nm in weak:
            L *= 0.5
            jag = 0.5
        rb = r * 0.72
        pc, dpt = proj(R @ np.array([x, y, z]))
        px = F / dpt
        # halo
        halos = [(1.55, 55, MAG), (1.3, 70, ROSA)] if mode != "boost" else [(2.0, 60, TURQ), (1.6, 70, MAG), (1.3, 80, ROSA)]
        for hs, al, col in halos:
            rr = px * r * hs
            layer = blend(layer, lambda dd, rr=rr, al=al, col=col, pc=pc:
                          dd.ellipse([pc[0] - rr, pc[1] - rr, pc[0] + rr, pc[1] + rr], fill=col + (al,)))
        N = 14
        jit = [1 + jag * (rng.random() * 2 - 1) for _ in range(N)]
        d = ImageDraw.Draw(layer)
        layers = [(1.0, 1.0, MAG), (0.72, 0.72, ROSA), (0.42, 0.45, CORE)]
        if mode == "boost":
            layers = [(1.3, 1.25, TURQ)] + layers
        zl = z - 0.02
        for rs, ls, col in layers:
            ring = []
            for a in range(N):
                ang = 2 * math.pi * a / N
                rr = rb * rs * jit[a]
                ring.append(R @ np.array([x + rr * math.cos(ang), y + rr * math.sin(ang), zl]))
            tip = R @ np.array([x, y, zl - L * ls])
            ring2, _ = proj(np.array(ring))
            tip2, _ = proj(tip)
            rp = [(float(a), float(b)) for a, b in ring2]
            d.polygon(rp, fill=col + (255,))
            for a in range(N):
                a2 = (a + 1) % N
                d.polygon([(float(tip2[0]), float(tip2[1])), rp[a], rp[a2]], fill=col + (255,))
    return layer


def nav_lights(layer, R, broken=False):
    d = ImageDraw.Draw(layer)
    for pt, col, ok in (((2.8, 1.15, -0.95), TURQ, True), ((-2.8, 1.15, -0.95), MAG, not broken)):
        if not ok:
            continue
        (sx, sy), dd = proj(R @ np.array(pt))
        r = F / dd * 0.05
        layer = blend(layer, lambda dr, sx=sx, sy=sy, r=r, col=col:
                      dr.ellipse([sx - 2.4 * r, sy - 2.4 * r, sx + 2.4 * r, sy + 2.4 * r], fill=col + (110,)))
        d = ImageDraw.Draw(layer)
        d.ellipse([sx - r, sy - r, sx + r, sy + r], fill=CORE + (255,))
    return layer


def smoke(layer, R, anchor, i, n=3, size=1.0, dens=1.0, seed=0):
    (sx, sy), dd = proj(R @ np.array(anchor))
    px = F / dd
    for k in range(n):
        ph = ((i / 8.0) + k / n) % 1.0
        rng = random.Random(seed * 7 + k)
        x = sx + (rng.random() - 0.5) * 40 * size + ph * (rng.random() - 0.3) * 90
        y = sy - ph * 300 * size
        r = (0.12 + 0.34 * ph) * px * size
        a1 = int(215 * (1 - ph) * dens)
        a2 = int(170 * (1 - ph) * dens)

        def fn(dr, x=x, y=y, r=r, a1=a1, a2=a2):
            dr.ellipse([x - r, y - r, x + r, y + r], fill=hx("#4A4A78") + (a1,), outline=OUTLINE + (a1,), width=4)
            dr.ellipse([x - r * 0.75 - r * 0.15, y - r * 0.75 - r * 0.2, x + r * 0.45 - r * 0.15, y + r * 0.45 - r * 0.2],
                       fill=LILAC + (a2,))
        layer = blend(layer, fn)
    return layer


def sparks(layer, R, anchors, i, n=4, seed=0):
    d = ImageDraw.Draw(layer)
    for k in range(n):
        rng = random.Random(seed * 53 + i * 11 + k)
        pt = anchors[rng.randrange(len(anchors))]
        (sx, sy), dd = proj(R @ np.array(pt))
        sx += (rng.random() - 0.5) * 120
        sy += (rng.random() - 0.5) * 70 - 20
        r = 10 + rng.random() * 18
        star(d, sx, sy, r * 1.5, ROSA + (255,))
        star(d, sx, sy, r, CORE + (255,))
        d.ellipse([sx + 20, sy - 25, sx + 28, sy - 17], fill=MAG + (255,))
    return layer


def fire_tongues(layer, R, anchor, i, seed=0):
    (sx, sy), dd = proj(R @ np.array(anchor))
    px = F / dd
    d = ImageDraw.Draw(layer)
    for k in range(3):
        rng = random.Random(seed * 19 + i * 5 + k)
        h = (0.35 + 0.45 * rng.random()) * px
        w = (0.10 + 0.06 * rng.random()) * px
        x = sx + (k - 1) * w * 1.6
        for scale, col in ((1.0, MAG), (0.65, ROSA), (0.35, CORE)):
            d.polygon([(x - w * scale, sy), (x + w * scale, sy), (x + w * 0.2 * scale + 6, sy - h * scale * 0.6),
                       (x, sy - h * scale)], fill=col + (255,))
    return layer


def shield(i):
    layer = new_layer()
    pulse = 0.8 + 0.2 * math.cos(2 * math.pi * i / 8)
    rx, ry = 400, 380
    cx = cy = W / 2
    ell = Image.new("L", (W, W), 0)
    ImageDraw.Draw(ell).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
    base = Image.new("RGBA", (W, W), TURQ + (int(34 * pulse),))
    base.putalpha(ell.point(lambda v: int(v * 34 * pulse / 255)))
    cells = new_layer()
    cd = ImageDraw.Draw(cells)
    hr = 72
    p = -1.2 + 2.4 * (i / 8)
    for ri in range(-8, 9):
        for ci in range(-8, 9):
            hxc = cx + ci * hr * 1.5
            hyc = cy + ri * hr * math.sqrt(3) + (ci % 2) * hr * math.sqrt(3) / 2
            s = ((hxc - cx) + (hyc - cy)) / (2 * rx)
            inten = math.exp(-((s - p) / 0.22) ** 2)
            a = int((22 + 120 * inten) * pulse)
            pts = [(hxc + hr * 0.94 * math.cos(math.radians(60 * k)), hyc + hr * 0.94 * math.sin(math.radians(60 * k)))
                   for k in range(6)]
            cd.polygon(pts, fill=TURQ + (a,))
            cd.line(pts + [pts[0]], fill=(130, 245, 228, int(120 * pulse)), width=3)
    cells.putalpha(ImageChops.multiply(cells.split()[3], ell))
    rim = new_layer()
    rd = ImageDraw.Draw(rim)
    rd.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], outline=TURQ + (int(240 * pulse),), width=10)
    k2 = 0.95
    rd.ellipse([cx - rx * k2, cy - ry * k2, cx + rx * k2, cy + ry * k2], outline=(130, 245, 228, 110), width=3)
    rd.arc([cx - rx * 0.86, cy - ry * 0.86, cx + rx * 0.86, cy + ry * 0.86], 200, 252, fill=(255, 255, 255, 200), width=10)
    layer = Image.alpha_composite(layer, base)
    layer = Image.alpha_composite(layer, cells)
    layer = Image.alpha_composite(layer, rim)
    return layer


def explosion(i):
    layer = new_layer()
    cx = cy = W / 2
    Rf = [70, 170, 250, 290, 300, 280, 235, 170][i]
    m = [1, 1, 1, 1, .92, .72, .5, .28][i]
    A = int(255 * m)

    def jag(r, n=22, j=0.18, seed=0):
        rr = random.Random(seed)
        return [(cx + r * (1 + j * (rr.random() * 2 - 1)) * math.cos(2 * math.pi * k / n),
                 cy + r * (1 + j * (rr.random() * 2 - 1)) * math.sin(2 * math.pi * k / n)) for k in range(n)]

    if i >= 2:  # fumaca
        tmp = new_layer()
        td = ImageDraw.Draw(tmp)
        rr = random.Random(500 + i)
        for k in range(10):
            ang = 2 * math.pi * k / 10 + rr.random() * 0.3
            dist = Rf * (0.85 + 0.2 * rr.random())
            rad = Rf * (0.28 + 0.12 * rr.random())
            x, y = cx + dist * math.cos(ang), cy + dist * math.sin(ang)
            td.ellipse([x - rad, y - rad, x + rad, y + rad], fill=VIOLET + (int(200 * m),))
        layer = Image.alpha_composite(layer, tmp)
        tmp = new_layer()
        td = ImageDraw.Draw(tmp)
        rr = random.Random(500 + i)
        for k in range(10):
            ang = 2 * math.pi * k / 10 + rr.random() * 0.3
            dist = Rf * (0.85 + 0.2 * rr.random())
            rad = Rf * (0.28 + 0.12 * rr.random())
            x, y = cx + dist * math.cos(ang) - rad * .25, cy + dist * math.sin(ang) - rad * .3
            td.ellipse([x - rad * .6, y - rad * .6, x + rad * .3, y + rad * .3], fill=LILAC + (int(120 * m),))
        layer = Image.alpha_composite(layer, tmp)
    tmp = new_layer()
    td = ImageDraw.Draw(tmp)
    td.polygon(jag(Rf, seed=1000 + i), fill=MAG + (A,))
    td.polygon(jag(Rf * 0.74, seed=1000 + i), fill=ROSA + (A,))
    if i <= 5:
        td.polygon(jag(Rf * 0.42, seed=1000 + i), fill=CORE + (A,))
    layer = Image.alpha_composite(layer, tmp)
    if 1 <= i <= 5:
        a = int(210 * (1 - (i - 1) / 5))
        layer = blend(layer, lambda dr: dr.ellipse([cx - Rf * 1.25, cy - Rf * 1.25, cx + Rf * 1.25, cy + Rf * 1.25],
                                                    outline=TURQ + (a,), width=9))
    # estilhacos
    rr = random.Random(77)
    tmp = new_layer()
    td = ImageDraw.Draw(tmp)
    cols = [LILAC, CORE, MAG, VIOLET]
    t = (i + 0.5) / 8
    for k in range(14):
        ang = rr.random() * 2 * math.pi
        sp = 200 + rr.random() * 180
        sz = 14 + rr.random() * 14
        rot0 = rr.random() * 6.28
        col = cols[k % 4]
        x, y = cx + math.cos(ang) * sp * t, cy + math.sin(ang) * sp * t
        pts = [(x + sz * math.cos(rot0 + i * 0.5 + a), y + sz * math.sin(rot0 + i * 0.5 + a)) for a in (0, 2.3, 4.1)]
        td.polygon(pts, fill=col + (int(255 * min(1, m + 0.2)),), outline=OUTLINE + (255,))
    layer = Image.alpha_composite(layer, tmp)
    return layer


# ---------------------------------------------------------------- montagem
def down(img):
    return img.resize((FRAME, FRAME), Image.LANCZOS)


def build():
    os.makedirs(OUT, exist_ok=True)
    SZ = (COLS * FRAME, ROWS * FRAME)
    sheet = Image.new("RGBA", SZ, (0, 0, 0, 0))
    sheet_h = Image.new("RGBA", SZ, (0, 0, 0, 0))
    sheet_f = Image.new("RGBA", SZ, (0, 0, 0, 0))
    atlas = {"frame_size": [FRAME, FRAME], "grid": [COLS, ROWS], "pivot": [FRAME // 2, FRAME // 2],
             "frames": [], "animations": {}}

    def put(row, col, name, hull, fx):
        h, f = down(hull), down(fx)
        comp = Image.alpha_composite(h, f)
        x, y = col * FRAME, row * FRAME
        sheet.paste(comp, (x, y))
        sheet_h.paste(h, (x, y))
        sheet_f.paste(f, (x, y))
        atlas["frames"].append({"name": name, "row": row, "col": col, "x": x, "y": y, "w": FRAME, "h": FRAME})

    def anim(name, row, names, loop):
        atlas["animations"][name] = {"row": row, "frames": names, "loop": loop}

    def fx_with_lights(fl, R, broken=False):
        return nav_lights(fl, R, broken)

    # linha 0: inclinacao (roll). theta>0 = inclina para a esquerda
    names = []
    for c, th in enumerate([45, 30, 15, 0, -15, -30, -45]):
        hull, R = render_hull(roll=th)
        fx = fx_with_lights(flames(R, c, "cruise", seed=1), R)
        nm = "roll_%s%d" % ("L" if th > 0 else ("R" if th < 0 else ""), abs(th))
        put(0, c, nm, hull, fx); names.append(nm)
        print(nm, flush=True)
    anim("roll", 0, names, False)

    # linha 1: arfagem com perspectiva de camera.
    # subindo: camera fica abaixo da nave -> aparece a barriga
    # descendo: camera fica acima da nave -> aparece o dorso
    names = []
    global F
    steps = [("climb_3", 36, 1.0), ("climb_2", 24, 1.0), ("climb_1", 12, 1.0), ("level", BASE_PITCH, 1.0),
             ("dive_1", -20, 0.93), ("dive_2", -33, 0.86), ("dive_3", -46, 0.8)]
    for c, (tag, ang, sc) in enumerate(steps):
        F = BASE_F * sc
        hull, R = render_hull(pitch=ang)
        fx = fx_with_lights(flames(R, c, "cruise", seed=2), R)
        nm = "pitch_" + tag
        put(1, c, nm, hull, fx); names.append(nm)
        print(nm, flush=True)
    F = BASE_F
    anim("pitch", 1, names, False)

    # linhas 2 e 3: propulsor cruzeiro / boost
    hull, R = render_hull()
    for row, mode in ((2, "cruise"), (3, "boost")):
        names = []
        for c in range(8):
            fx = fx_with_lights(flames(R, c, mode, seed=3 + row), R)
            nm = "thrust_%s_%d" % (mode, c)
            put(row, c, nm, hull, fx); names.append(nm)
        anim("thrust_" + mode, row, names, True)
        print("row", row, flush=True)

    # linha 4: dano leve
    names = []
    anc = [(1.7, 0.2, -0.5), (-0.1, 0.42, -0.5), (-1.5, 0.2, -0.6)]
    for c in range(8):
        wob = 2.5 * math.sin(2 * math.pi * c / 8)
        hull, R = render_hull(roll=wob, pitch=BASE_PITCH + 1.2 * math.cos(2 * math.pi * c / 8), scorch=1, seed=5)
        fx = flames(R, c, "cruise", weak=("r",), seed=11)
        fx = smoke(fx, R, (1.7, 0.25, -0.5), c, n=3, size=0.8, dens=0.9, seed=1)
        fx = sparks(fx, R, anc, c, n=3, seed=2)
        fx = fx_with_lights(fx, R)
        nm = "damage_light_%d" % c
        put(4, c, nm, hull, fx); names.append(nm)
    anim("damage_light", 4, names, True)
    print("row 4", flush=True)

    # linha 5: dano critico (asa esquerda quebrada, motor esquerdo morto)
    names = []
    for c in range(8):
        wob = 3.5 * math.sin(2 * math.pi * c / 8)
        hull, R = render_hull(roll=wob + 4, pitch=BASE_PITCH + 1.5 * math.cos(2 * math.pi * c / 8),
                              broken=True, scorch=2, seed=9)
        fx = flames(R, c, "cruise", dead=("l",), weak=("r", "c"), seed=21)
        fx = smoke(fx, R, (-2.0, 0.3, -0.4), c, n=4, size=1.3, dens=1.0, seed=3)
        fx = smoke(fx, R, (-1.15, 0.0, -2.1), c, n=3, size=1.0, dens=0.9, seed=4)
        fx = smoke(fx, R, (0.3, 0.45, -0.8), c, n=2, size=0.9, dens=0.9, seed=5)
        fx = fire_tongues(fx, R, (-2.0, 0.3, -0.4), c, seed=6)
        fx = sparks(fx, R, anc + [(-2.0, 0.3, -0.4)], c, n=5, seed=7)
        fx = fx_with_lights(fx, R, broken=True)
        nm = "damage_critical_%d" % c
        put(5, c, nm, hull, fx); names.append(nm)
    anim("damage_critical", 5, names, True)
    print("row 5", flush=True)

    # linha 6: escudo
    hull, R = render_hull()
    names = []
    for c in range(8):
        fx = flames(R, c, "cruise", seed=31)
        fx = fx_with_lights(fx, R)
        fx = Image.alpha_composite(fx, shield(c))
        nm = "shield_%d" % c
        put(6, c, nm, hull, fx); names.append(nm)
    anim("shield", 6, names, True)
    print("row 6", flush=True)

    # linha 7: explosao
    names = []
    for c in range(8):
        if c == 0:
            hull, R = render_hull(roll=3)
        elif c == 1:
            hull, R = render_hull(roll=10)
            hull.putalpha(hull.split()[3].point(lambda a: int(a * 0.55)))
        else:
            hull = new_layer()
        nm = "explosion_%d" % c
        put(7, c, nm, hull, explosion(c)); names.append(nm)
    anim("explosion", 7, names, False)
    print("row 7", flush=True)

    sheet.save(os.path.join(OUT, "spritesheet_nave.png"), optimize=True)
    sheet_h.save(os.path.join(OUT, "spritesheet_nave_casco.png"), optimize=True)
    sheet_f.save(os.path.join(OUT, "spritesheet_nave_fx.png"), optimize=True)
    with open(os.path.join(OUT, "atlas.json"), "w", encoding="utf-8") as fh:
        json.dump(atlas, fh, indent=2, ensure_ascii=False)

    # preview rotulado
    P = 2048
    cell = P // COLS
    bg = Image.new("RGBA", (P, P), hx("#1B1B33") + (255,))
    small = sheet.resize((P, P), Image.LANCZOS)
    bg = Image.alpha_composite(bg, small)
    d = ImageDraw.Draw(bg)
    for k in range(COLS + 1):
        d.line([(k * cell, 0), (k * cell, P)], fill=(70, 70, 120, 255), width=1)
        d.line([(0, k * cell), (P, k * cell)], fill=(70, 70, 120, 255), width=1)
    labels = ["roll", "pitch (sobe: barriga / desce: dorso)", "propulsor cruzeiro", "propulsor boost", "dano leve", "dano critico", "escudo", "explosao"]
    font = ImageFont.load_default()
    for r, lb in enumerate(labels):
        d.text((6, r * cell + 4), "L%d  %s" % (r, lb), fill=(190, 190, 230, 255), font=font)
    bg.convert("RGB").save(os.path.join(OUT, "preview.png"))


if __name__ == "__main__":
    build()
