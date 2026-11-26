"""Gera a geometria vetorial dos selos de modalidade (futebol, tênis e corrida) para a web e o Expo.

Origem única dos selos: a recriação vetorial do desenho do designer (disco, coroa de louros, anel e
símbolo central), com as proporções aprovadas na sessão e as formas decididas na prototipação.
O mesmo módulo TypeScript é gravado nos dois clientes:

    python3 -I scripts/gerar_selos.py           # regrava web/src/data/selos.ts e mobile/src/data/selos.ts
    python3 -I scripts/gerar_selos.py --check   # só confere; sai com 1 se algum arquivo estiver desatualizado
    python3 -I scripts/gerar_selos.py --previa artifacts/selos   # também grava SVGs de prévia (não versionados)

A geometria sai como dado, sem cor: cada forma é um caminho (`d`) preenchido com a regra padrão
(`nonzero`), em coordenadas centradas no disco (raio 256). Traços, recortes e máscaras do desenho
original já vêm resolvidos em contornos fechados, com os furos no sentido contrário. Assim os clientes
montam as formas só com `<circle>` e `<path>` (SVG inline na web, `react-native-svg` no Expo) e pintam
por token ou `currentColor`:

- selo: `<circle r=256>` na cor do disco, mais `SELO_COROA` e `simbolo` na cor dos detalhes;
- símbolo com aro: `simboloComAro` (anel de r ≈ 0,92 da caixa, traço ≈ 6,6% do diâmetro e símbolo em
  escala 0,95, sem ajuste óptico por modalidade), numa cor só, em `SELO_VIEWBOX`;
- marca d'água: `simbolo` numa cor só, em `SIMBOLO_VIEWBOX`.

Usa só a biblioteca padrão. A saída é determinística: rodar duas vezes não muda os arquivos.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DESTINOS = (ROOT / "web" / "src" / "data" / "selos.ts", ROOT / "mobile" / "src" / "data" / "selos.ts")

R = 256  # raio do disco nas coordenadas geradas; o desenho é medido com o raio normalizado (R = 1)
SELO_VIEWBOX = "-256 -256 512 512"
SIMBOLO_META = 172  # meia largura da caixa da marca d'água (símbolo isolado), como no protótipo
AMOSTRAS = 240  # amostras por segmento para achar os cruzamentos com as bordas de recorte

Ponto = tuple[float, float]


# ------------------------------------------------------------------ segmentos e contornos
class Reta:
    def __init__(self, a: Ponto, b: Ponto):
        self.a, self.b = a, b

    def ponto(self, t: float) -> Ponto:
        return (self.a[0] + (self.b[0] - self.a[0]) * t, self.a[1] + (self.b[1] - self.a[1]) * t)

    def dividir(self, t: float) -> tuple[Reta, Reta]:
        m = self.ponto(t)
        return Reta(self.a, m), Reta(m, self.b)

    def inverter(self) -> Reta:
        return Reta(self.b, self.a)

    def mapear(self, fn) -> Reta:
        return Reta(fn(self.a), fn(self.b))

    @property
    def fim(self) -> Ponto:
        return self.b


class Cubica:
    def __init__(self, a: Ponto, c1: Ponto, c2: Ponto, b: Ponto):
        self.a, self.c1, self.c2, self.b = a, c1, c2, b

    def ponto(self, t: float) -> Ponto:
        s = 1 - t
        k = (s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t)
        pts = (self.a, self.c1, self.c2, self.b)
        return (sum(w * p[0] for w, p in zip(k, pts)), sum(w * p[1] for w, p in zip(k, pts)))

    def dividir(self, t: float) -> tuple[Cubica, Cubica]:
        def lerp(p: Ponto, q: Ponto) -> Ponto:
            return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)

        ab, bc, cd = lerp(self.a, self.c1), lerp(self.c1, self.c2), lerp(self.c2, self.b)
        abc, bcd = lerp(ab, bc), lerp(bc, cd)
        m = lerp(abc, bcd)
        return Cubica(self.a, ab, abc, m), Cubica(m, bcd, cd, self.b)

    def inverter(self) -> Cubica:
        return Cubica(self.b, self.c2, self.c1, self.a)

    def mapear(self, fn) -> Cubica:
        return Cubica(fn(self.a), fn(self.c1), fn(self.c2), fn(self.b))

    @property
    def fim(self) -> Ponto:
        return self.b


class Arco:
    """Arco de circunferência de `a0` a `a1` (radianos, ângulo medido com y para baixo)."""

    def __init__(self, centro: Ponto, r: float, a0: float, a1: float):
        self.centro, self.r, self.a0, self.a1 = centro, r, a0, a1

    def ponto(self, t: float) -> Ponto:
        a = self.a0 + (self.a1 - self.a0) * t
        return (self.centro[0] + self.r * math.cos(a), self.centro[1] + self.r * math.sin(a))

    def dividir(self, t: float) -> tuple[Arco, Arco]:
        m = self.a0 + (self.a1 - self.a0) * t
        return Arco(self.centro, self.r, self.a0, m), Arco(self.centro, self.r, m, self.a1)

    def inverter(self) -> Arco:
        return Arco(self.centro, self.r, self.a1, self.a0)

    def mapear(self, fn) -> Arco:
        # Só semelhanças (rotação, espelho, translação e escala uniforme) são aplicadas a arcos.
        c = fn(self.centro)
        p0, pm, p1 = (fn(self.ponto(t)) for t in (0, 0.5, 1))
        r = math.dist(c, p0)
        a0 = math.atan2(p0[1] - c[1], p0[0] - c[0])
        varredura = self.a1 - self.a0
        ang_m = math.atan2(pm[1] - c[1], pm[0] - c[0])
        esperado = a0 + varredura / 2
        if abs(math.remainder(ang_m - esperado, math.tau)) > 1e-6:
            varredura = -varredura
        a1 = a0 + varredura
        assert math.dist(fn(self.ponto(1)), (c[0] + r * math.cos(a1), c[1] + r * math.sin(a1))) < 1e-9
        return Arco(c, r, a0, a1)

    @property
    def fim(self) -> Ponto:
        return self.ponto(1)


class Contorno:
    """Subcaminho fechado: sequência contínua de segmentos que termina onde começa."""

    def __init__(self, segmentos: list):
        self.segmentos = segmentos

    @property
    def inicio(self) -> Ponto:
        return self.segmentos[0].ponto(0)

    def poligono(self, n: int = 24) -> list[Ponto]:
        return [s.ponto(i / n) for s in self.segmentos for i in range(n)]

    def area(self) -> float:
        p = self.poligono()
        return sum(p[i - 1][0] * p[i][1] - p[i][0] * p[i - 1][1] for i in range(len(p))) / 2

    def inverter(self) -> Contorno:
        return Contorno([s.inverter() for s in reversed(self.segmentos)])

    def mapear(self, fn) -> Contorno:
        return Contorno([s.mapear(fn) for s in self.segmentos])

    def orientar(self, positivo: bool) -> Contorno:
        return self if (self.area() > 0) == positivo else self.inverter()

    def contem(self, q: Ponto) -> bool:
        p, dentro = self.poligono(), False
        for i in range(len(p)):
            (x1, y1), (x2, y2) = p[i - 1], p[i]
            if (y1 > q[1]) != (y2 > q[1]) and q[0] < x1 + (q[1] - y1) * (x2 - x1) / (y2 - y1):
                dentro = not dentro
        return dentro


def solido(c: Contorno) -> Contorno:
    return c.orientar(True)


def furo(c: Contorno) -> Contorno:
    return c.orientar(False)


def poligono(pontos: list[Ponto]) -> Contorno:
    return Contorno([Reta(pontos[i], pontos[(i + 1) % len(pontos)]) for i in range(len(pontos))])


def circulo(r: float, centro: Ponto = (0, 0)) -> Contorno:
    return Contorno([Arco(centro, r, 0, math.pi), Arco(centro, r, math.pi, math.tau)])


def anel(r: float, espessura: float) -> list[Contorno]:
    """Traço de circunferência como coroa circular preenchida."""
    return [solido(circulo(r + espessura / 2)), furo(circulo(r - espessura / 2))]


def retangulo(x0: float, y0: float, x1: float, y1: float) -> Contorno:
    return poligono([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])


def capsula(a: Ponto, b: Ponto, largura: float) -> Contorno:
    """Traço reto com pontas redondas (`stroke-linecap: round`)."""
    r = largura / 2
    ang = math.atan2(b[1] - a[1], b[0] - a[0])
    nx, ny = -math.sin(ang), math.cos(ang)
    return Contorno([
        Reta((a[0] + nx * r, a[1] + ny * r), (b[0] + nx * r, b[1] + ny * r)),
        Arco(b, r, ang + math.pi / 2, ang - math.pi / 2),
        Reta((b[0] - nx * r, b[1] - ny * r), (a[0] - nx * r, a[1] - ny * r)),
        Arco(a, r, ang - math.pi / 2, ang - 3 * math.pi / 2),
    ])


def traco_reto(a: Ponto, b: Ponto, largura: float) -> Contorno:
    """Traço reto com pontas retas (`stroke-linecap: butt`)."""
    ang = math.atan2(b[1] - a[1], b[0] - a[0])
    nx, ny = -math.sin(ang) * largura / 2, math.cos(ang) * largura / 2
    return poligono([(a[0] + nx, a[1] + ny), (b[0] + nx, b[1] + ny), (b[0] - nx, b[1] - ny), (a[0] - nx, a[1] - ny)])


def poligono_arredondado(pontos: list[Ponto], d: float) -> Contorno:
    """Polígono convexo preenchido com traço de largura 2d e junção redonda: deslocamento d com cantos em arco."""
    n = len(pontos)
    cx, cy = sum(p[0] for p in pontos) / n, sum(p[1] for p in pontos) / n
    normais = []
    for i in range(n):
        (x1, y1), (x2, y2) = pontos[i], pontos[(i + 1) % n]
        ex, ey = x2 - x1, y2 - y1
        comp = math.hypot(ex, ey)
        nx, ny = ey / comp, -ex / comp
        if nx * ((x1 + x2) / 2 - cx) + ny * ((y1 + y2) / 2 - cy) < 0:
            nx, ny = -nx, -ny
        normais.append((nx, ny))
    segs: list = []
    for i in range(n):
        anterior, atual = normais[i - 1], normais[i]
        a0 = math.atan2(anterior[1], anterior[0])
        a1 = a0 + math.remainder(math.atan2(atual[1], atual[0]) - a0, math.tau)
        segs.append(Arco(pontos[i], d, a0, a1))
        p, q = pontos[i], pontos[(i + 1) % n]
        segs.append(Reta((p[0] + atual[0] * d, p[1] + atual[1] * d), (q[0] + atual[0] * d, q[1] + atual[1] * d)))
    return Contorno(segs)


def suave(pontos: list[Ponto], fechado: bool = False) -> list[Cubica]:
    """Catmull-Rom -> Bézier cúbica passando por todos os pontos (a mesma curva do desenho da sessão)."""
    n = len(pontos)
    out = []
    for i in range(n) if fechado else range(n - 1):
        p0 = pontos[i - 1] if (fechado or i > 0) else pontos[i]
        p1, p2 = pontos[i], pontos[(i + 1) % n]
        p3 = pontos[(i + 2) % n] if (fechado or i + 2 < n) else p2
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        out.append(Cubica(p1, c1, c2, p2))
    return out


# ------------------------------------------------------------------ recortes resolvidos em contorno
class Disco:
    """Região de recorte circular centrada na origem; a borda liga as saídas às entradas por arco."""

    def __init__(self, r: float):
        self.r = r

    def fora(self, p: Ponto) -> float:
        return math.hypot(*p) - self.r

    def ligar(self, p: Ponto, q: Ponto, forma: Contorno) -> list:
        a0, a1 = math.atan2(p[1], p[0]), math.atan2(q[1], q[0])
        for sentido in (1, -1):
            varredura = (a1 - a0) % math.tau if sentido == 1 else -((a0 - a1) % math.tau)
            arco = Arco((0, 0), self.r, a0, a0 + varredura)
            if forma.contem(arco.ponto(0.5)):
                return [arco]
        raise ValueError("borda do recorte fora da forma")


class SemiPlano:
    """Região y < limite (abaixo=False) ou y > limite (abaixo=True); a borda liga por reta."""

    def __init__(self, limite: float, abaixo: bool):
        self.limite, self.abaixo = limite, abaixo

    def fora(self, p: Ponto) -> float:
        return (self.limite - p[1]) if self.abaixo else (p[1] - self.limite)

    def ligar(self, p: Ponto, q: Ponto, forma: Contorno) -> list:
        return [Reta(p, q)]


def recortar(forma: Contorno, regiao) -> Contorno | None:
    """Intersecção de um contorno com uma região convexa, sem `clipPath`: o resultado é outro contorno."""
    pedacos = []
    for seg in forma.segmentos:
        valores = [regiao.fora(seg.ponto(i / AMOSTRAS)) for i in range(AMOSTRAS + 1)]
        raizes = []
        for i in range(AMOSTRAS):
            if (valores[i] < 0) != (valores[i + 1] < 0):
                lo, hi = i / AMOSTRAS, (i + 1) / AMOSTRAS
                for _ in range(60):
                    mid = (lo + hi) / 2
                    if (regiao.fora(seg.ponto(mid)) < 0) == (valores[i] < 0):
                        lo = mid
                    else:
                        hi = mid
                raizes.append((lo + hi) / 2)
        resto, base = seg, 0.0
        for t in raizes:
            local = (t - base) / (1 - base)
            parte, resto = resto.dividir(local)
            pedacos.append(parte)
            base = t
        pedacos.append(resto)
    dentro = [regiao.fora(p.ponto(0.5)) < 0 for p in pedacos]
    if all(dentro):
        return forma
    if not any(dentro):
        return None
    n = len(pedacos)
    inicio = next(i for i in range(n) if dentro[i] and not dentro[i - 1])
    ordem = [(pedacos[(inicio + k) % n], dentro[(inicio + k) % n]) for k in range(n)]
    segs: list = []
    i = 0
    while i < n:
        while i < n and ordem[i][1]:
            segs.append(ordem[i][0])
            i += 1
        saida = segs[-1].fim
        while i < n and not ordem[i][1]:
            i += 1
        entrada = ordem[i][0].ponto(0) if i < n else segs[0].ponto(0)
        segs.extend(regiao.ligar(saida, entrada, forma))
    return Contorno(segs)


# ------------------------------------------------------------------ coroa de louros e anel
STEM_R = 0.881
STEM_W = 0.016
NODES = 15
FIRST, LAST = 174.5, 7.6  # graus a partir do topo, sentido horário (ramo direito)
PETAL_LEN = 0.94  # escala do comprimento da tulipa
ANEL = (0.7265, 0.043)  # anel do selo (raio, espessura)

# Pétala externa no referencial local: u = para frente (rumo ao topo), v = para fora.
PETAL = [
    ((-0.004, 0.000),),
    ((-0.002, 0.050), (0.022, 0.084), (0.054, 0.084)),
    ((0.080, 0.084), (0.098, 0.080), (0.112, 0.073)),
    ((0.106, 0.050), (0.098, 0.030), (0.090, 0.016)),
    ((0.084, 0.010), (0.078, 0.006), (0.072, 0.000)),
]


def petala(sinal: int) -> Contorno:
    pts = [[(u * PETAL_LEN, sinal * v) for u, v in grupo] for grupo in PETAL]
    segs: list = []
    atual = pts[0][0]
    for c1, c2, fim in pts[1:]:
        segs.append(Cubica(atual, c1, c2, fim))
        atual = fim
    segs.append(Reta(atual, pts[0][0]))
    return Contorno(segs)


def coroa() -> list[Contorno]:
    folha = [petala(1), petala(-1)]
    contornos = []
    passo = (FIRST - LAST) / (NODES - 1)
    for espelho in (1, -1):
        for i in range(NODES):
            th = math.radians(FIRST - i * passo)
            x, y = STEM_R * math.sin(th), -STEM_R * math.cos(th)
            a, b, c, d = -math.cos(th), -math.sin(th), math.sin(th), -math.cos(th)

            def fn(p: Ponto, a=a, b=b, c=c, d=d, x=x, y=y, espelho=espelho) -> Ponto:
                return (espelho * (a * p[0] + c * p[1] + x), b * p[0] + d * p[1] + y)

            contornos.extend(solido(f.mapear(fn)) for f in folha)
    return contornos + anel(STEM_R, STEM_W) + anel(*ANEL)


# ------------------------------------------------------------------ símbolos
def futebol() -> list[Contorno]:
    bola = Disco(0.612)
    seam_w = 0.037
    canto = 0.008  # arredondamento dos cantos (metade do traço de junção redonda do desenho)
    pent = 0.222
    # calota em coordenadas locais (t = perpendicular, r = radial), já descontado o arredondamento
    cap = [(-0.032, 0.463), (0.032, 0.463), (0.196, 0.526), (0.205, 0.56), (0.21, 0.70),
           (-0.21, 0.70), (-0.205, 0.56), (-0.196, 0.526)]

    def at(a: float, tt: float, rr: float) -> Ponto:
        sx, sy = math.sin(a), -math.cos(a)
        return (rr * sx + tt * math.cos(a), rr * sy + tt * math.sin(a))

    formas = [poligono_arredondado([at(math.radians(72 * k), 0, pent) for k in range(5)], canto)]
    for k in range(5):
        a = math.radians(72 * k)
        formas.append(traco_reto(at(a, 0, 0.1), at(a, 0, 0.5), seam_w))
        formas.append(poligono_arredondado([at(a, tt, rr) for tt, rr in cap], canto))
    recortadas = [recortar(f, bola) for f in formas]
    return [solido(f) for f in recortadas if f] + anel(0.6455, 0.02)


def tenis() -> list[Contorno]:
    cy, rx, ry, w = -0.206, 0.281, 0.357, 0.058
    sw = 0.027
    # Aro da cabeça: traço da elipse resolvido nas duas bordas (deslocadas pela normal).
    bordas = []
    for lado in (1, -1):
        pts = []
        for i in range(48):
            t = math.tau * i / 48
            px, py = rx * math.cos(t), cy + ry * math.sin(t)
            nx, ny = ry * math.cos(t), rx * math.sin(t)
            k = lado * (w / 2) / math.hypot(nx, ny)
            pts.append((px + nx * k, py + ny * k))
        bordas.append(Contorno(suave(pts, fechado=True)))
    formas = [solido(bordas[0]), furo(bordas[1])]
    # Cordas: o desenho recorta na elipse central do aro; as pontas ficam sob o traço do aro.
    for x in (-0.093, 0.092):
        h = ry * math.sqrt(1 - (x / rx) ** 2)
        formas.append(solido(traco_reto((x, cy - h), (x, cy + h), sw)))
    for y in (-0.312, -0.089):
        h = rx * math.sqrt(1 - ((y - cy) / ry) ** 2)
        formas.append(solido(traco_reto((-h, y), (h, y), sw)))
    for lado in (-1, 1):
        formas.append(solido(capsula((lado * 0.157, 0.09), (lado * 0.028, 0.305), 0.046)))
    formas.append(solido(retangulo(-0.041, 0.29, 0.041, 0.458)))

    def quad(p0: Ponto, q: Ponto, p1: Ponto) -> Cubica:
        return Cubica(p0, (p0[0] + 2 / 3 * (q[0] - p0[0]), p0[1] + 2 / 3 * (q[1] - p0[1])),
                      (p1[0] + 2 / 3 * (q[0] - p1[0]), p1[1] + 2 / 3 * (q[1] - p1[1])), p1)

    cabo = Contorno([
        Reta((-0.041, 0.474), (0.041, 0.474)),
        Reta((0.041, 0.474), (0.041, 0.57)),
        quad((0.041, 0.57), (0.041, 0.594), (0.017, 0.594)),
        Reta((0.017, 0.594), (-0.017, 0.594)),
        quad((-0.017, 0.594), (-0.041, 0.594), (-0.041, 0.57)),
        Reta((-0.041, 0.57), (-0.041, 0.474)),
    ])
    return formas + [solido(cabo)]


def corrida() -> list[Contorno]:
    pista = Disco(0.655)
    # Bordas das três raias, medidas no desenho original (x em cada y). As divisórias se alargam
    # para baixo, como numa pista em perspectiva.
    ys = [-0.70, -0.6, -0.5, -0.4, -0.3, -0.2, -0.1, 0.0, 0.1, 0.19, 0.3, 0.4, 0.5, 0.6, 0.70]
    lanes = [
        ([0.073, -0.011, -0.095, -0.176, -0.254, -0.329, -0.401, -0.473, -0.538, -0.598, -0.67, -0.73, -0.79, -0.85, -0.91],
         [0.145, 0.089, 0.033, -0.020, -0.070, -0.117, -0.161, -0.204, -0.242, -0.273, -0.310, -0.339, -0.367, -0.392, -0.415]),
        ([0.155, 0.105, 0.055, 0.008, -0.036, -0.076, -0.114, -0.151, -0.186, -0.210, -0.242, -0.264, -0.285, -0.305, -0.325],
         [0.215, 0.192, 0.167, 0.148, 0.129, 0.114, 0.098, 0.089, 0.083, 0.078, 0.076, 0.080, 0.083, 0.089, 0.095]),
        ([0.230, 0.211, 0.192, 0.176, 0.164, 0.154, 0.145, 0.142, 0.139, 0.140, 0.145, 0.154, 0.164, 0.176, 0.190],
         [0.293, 0.305, 0.317, 0.329, 0.345, 0.363, 0.385, 0.410, 0.435, 0.463, 0.498, 0.524, 0.548, 0.570, 0.592]),
    ]
    band_top, band_bottom = 0.158, 0.222  # faixa da largada, vazada nas três raias
    formas = []
    for left, right in lanes:
        esquerda = suave(list(zip(left, ys)))
        direita = suave(list(zip(right, ys))[::-1])
        raia = Contorno(esquerda + [Reta(esquerda[-1].fim, direita[0].a)] + direita
                        + [Reta(direita[-1].fim, esquerda[0].a)])
        for metade in (SemiPlano(band_top, abaixo=False), SemiPlano(band_bottom, abaixo=True)):
            parte = recortar(raia, metade)
            parte = parte and recortar(parte, pista)
            if parte:
                formas.append(solido(parte))
    return formas


SIMBOLOS = {"futebol": futebol, "tenis": tenis, "corrida": corrida}

# Símbolo com aro (protótipo): anel de r = 236/256 ≈ 0,92 da caixa, traço 34/512 ≈ 6,6% do diâmetro,
# e o símbolo inteiro em escala 0,95 dentro dele, igual para as três modalidades.
ARO_R, ARO_W, ARO_ESCALA = 236 / 256, 34 / 256, 0.95


def com_aro(simbolo: list[Contorno]) -> list[Contorno]:
    def escala(p: Ponto) -> Ponto:
        return (p[0] * ARO_ESCALA, p[1] * ARO_ESCALA)

    return anel(ARO_R, ARO_W) + [c.mapear(escala) for c in simbolo]


# ------------------------------------------------------------------ serialização
def num(decimos: int) -> str:
    """Inteiro em décimos de unidade -> número SVG curto ("12.5", ".5", "-3")."""
    s = f"{decimos / 10:.1f}".rstrip("0").rstrip(".")
    if s.startswith("0."):
        s = s[1:]
    elif s.startswith("-0."):
        s = "-" + s[2:]
    return "0" if s in ("", "-0") else s


def juntar(valores: list[str]) -> str:
    out = ""
    for v in valores:
        out += v if (not out or v.startswith("-")) else " " + v
    return out


def caminho(contornos: list[Contorno]) -> str:
    """Contornos (raio 1) -> `d` com coordenadas relativas, arredondadas a 0,1 na escala de raio 256."""

    def q(p: Ponto) -> tuple[int, int]:
        return round(p[0] * R * 10), round(p[1] * R * 10)

    partes = []
    for c in contornos:
        cur = q(c.inicio)
        cmds = ["M" + juntar([num(cur[0]), num(cur[1])])]
        for s in c.segmentos:
            fim = q(s.fim)
            dx, dy = fim[0] - cur[0], fim[1] - cur[1]
            if isinstance(s, Reta):
                if dx == 0 and dy == 0:
                    continue
                cmds.append("v" + num(dy) if dx == 0 else "h" + num(dx) if dy == 0 else "l" + juntar([num(dx), num(dy)]))
            elif isinstance(s, Cubica):
                c1, c2 = q(s.c1), q(s.c2)
                cmds.append("c" + juntar([num(v) for v in (c1[0] - cur[0], c1[1] - cur[1], c2[0] - cur[0],
                                                           c2[1] - cur[1], dx, dy)]))
            else:
                if dx == 0 and dy == 0:
                    continue
                varredura = s.a1 - s.a0
                grande = "1" if abs(varredura) > math.pi else "0"
                sentido = "1" if varredura > 0 else "0"
                r = num(round(s.r * R * 10))
                # Flags separadas por espaço: o leitor de caminhos do react-native-svg não aceita flags coladas.
                cmds.append(f"a{r} {r} 0 {grande} {sentido} " + juntar([num(dx), num(dy)]))
            cur = fim
        partes.append("".join(cmds) + "z")
    return "".join(partes)


def gerar() -> dict:
    simbolos = {nome: fn() for nome, fn in SIMBOLOS.items()}
    return {
        "coroa": caminho(coroa()),
        "simbolos": {nome: caminho(c) for nome, c in simbolos.items()},
        "aros": {nome: caminho(com_aro(c)) for nome, c in simbolos.items()},
    }


def modulo_ts(dados: dict) -> str:
    linhas = [
        "// Gerado por scripts/gerar_selos.py; não edite à mão.",
        "// Para regenerar, rode na raiz do repositório: python3 -I scripts/gerar_selos.py",
        "import type { Sport } from '../api/client'",
        "",
        "/**",
        " * Geometria dos selos de modalidade, sem cor. Cada `d` é preenchido com a regra padrão (`nonzero`),",
        " * em coordenadas centradas no disco (raio 256); os furos já vêm no sentido contrário.",
        " * - Selo: `<circle r={SELO_RAIO_DISCO}>` na cor do disco, mais `SELO_COROA` e `simbolo` na cor dos detalhes, em `SELO_VIEWBOX`.",
        " * - Símbolo com aro: `simboloComAro` numa cor só, em `SELO_VIEWBOX`.",
        " * - Marca d'água: `simbolo` numa cor só, em `SIMBOLO_VIEWBOX`.",
        " */",
        f"export const SELO_VIEWBOX = '{SELO_VIEWBOX}'",
        f"export const SELO_RAIO_DISCO = {R}",
        f"export const SIMBOLO_VIEWBOX = '{-SIMBOLO_META} {-SIMBOLO_META} {2 * SIMBOLO_META} {2 * SIMBOLO_META}'",
        "",
        "/** Coroa de louros (dois ramos de 15 pares de folhas sobre a haste) e anel do selo. */",
        f"export const SELO_COROA = '{dados['coroa']}'",
        "",
        "export interface GeometriaSelo {",
        "  /** Símbolo central da modalidade, na escala do selo. */",
        "  readonly simbolo: string",
        "  /** Anel fino com o símbolo em escala 0,95, sem ajuste óptico por modalidade. */",
        "  readonly simboloComAro: string",
        "}",
        "",
        "export const SELOS_GEOMETRIA: Readonly<Record<Sport, GeometriaSelo>> = {",
    ]
    for nome in SIMBOLOS:
        linhas += [
            f"  {nome}: {{",
            f"    simbolo: '{dados['simbolos'][nome]}',",
            f"    simboloComAro: '{dados['aros'][nome]}',",
            "  },",
        ]
    linhas.append("}")
    return "\n".join(linhas) + "\n"


def previa(dados: dict, pasta: Path) -> None:
    """SVGs avulsos para conferência visual (cores de exemplo só na prévia, não no dado)."""
    pasta.mkdir(parents=True, exist_ok=True)
    for nome in SIMBOLOS:
        formas = {
            "selo": (SELO_VIEWBOX, f'<circle r="{R}" fill="#153a2b"/><g fill="#fff"><path d="{dados["coroa"]}"/>'
                                   f'<path d="{dados["simbolos"][nome]}"/></g>'),
            "aro": (SELO_VIEWBOX, f'<path fill="#153a2b" d="{dados["aros"][nome]}"/>'),
            "simbolo": (f"{-SIMBOLO_META} {-SIMBOLO_META} {2 * SIMBOLO_META} {2 * SIMBOLO_META}",
                        f'<path fill="#153a2b" d="{dados["simbolos"][nome]}"/>'),
        }
        for forma, (vb, corpo) in formas.items():
            (pasta / f"{nome}-{forma}.svg").write_text(
                f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">{corpo}</svg>\n', encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Gera a geometria dos selos de modalidade para a web e o Expo.")
    parser.add_argument("--check", action="store_true", help="só confere se os arquivos gerados estão atualizados")
    parser.add_argument("--previa", type=Path, help="pasta onde gravar SVGs de prévia (não versionados)")
    args = parser.parse_args()
    dados = gerar()
    conteudo = modulo_ts(dados)
    desatualizados = []
    for destino in DESTINOS:
        atual = destino.read_text(encoding="utf-8") if destino.exists() else None
        rel = destino.relative_to(ROOT).as_posix()
        if atual == conteudo:
            print(f"{rel}: atualizado ({len(conteudo.encode())} bytes)")
        elif args.check:
            desatualizados.append(rel)
            print(f"{rel}: desatualizado", file=sys.stderr)
        else:
            destino.write_bytes(conteudo.encode("utf-8"))
            print(f"{rel}: gravado ({len(conteudo.encode())} bytes)")
    if args.previa:
        previa(dados, args.previa)
    return 1 if desatualizados else 0


if __name__ == "__main__":
    sys.exit(main())
