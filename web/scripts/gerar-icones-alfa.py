"""Gera as versões com canal alfa dos ícones provisórios de esporte (tema escuro).

Os PNGs de `public/images/sports/` são RGB, com traço escuro sobre fundo branco. Este script grava
`{nome}-alfa.png` ao lado de cada um: o traço fica opaco, na cor original, e o branco vira transparente,
sem mudar o desenho. A web pinta a versão com alfa por máscara (`SportIcon`) e o Expo por `tintColor`.
Rode de novo sempre que os ícones provisórios forem trocados:

    python -I web/scripts/gerar-icones-alfa.py

Requer Pillow. Também copia o resultado para `mobile/assets/sports/`.
"""

import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "web" / "public" / "images" / "sports"
MOBILE = ROOT / "mobile" / "assets" / "sports"
SIZE = 512


def to_alpha(path: Path) -> Path:
    image = Image.open(path).convert("RGB")
    pixels = image.getdata()
    # Cor do traço: o pixel mais escuro da imagem.
    stroke = min(pixels, key=lambda p: sum(p))
    stroke_luma = 0.299 * stroke[0] + 0.587 * stroke[1] + 0.114 * stroke[2]
    alpha = []
    for r, g, b in pixels:
        luma = 0.299 * r + 0.587 * g + 0.114 * b
        alpha.append(max(0, min(255, round((255 - luma) * 255 / (255 - stroke_luma)))))
    mask = Image.new("L", image.size)
    mask.putdata(alpha)
    result = Image.new("RGBA", image.size, stroke + (0,))
    result.putalpha(mask)
    result = result.resize((SIZE, SIZE), Image.LANCZOS)
    target = path.with_name(f"{path.stem}-alfa.png")
    result.save(target, optimize=True)
    return target


def main() -> None:
    MOBILE.mkdir(parents=True, exist_ok=True)
    for name in ("futebol", "tenis", "corrida"):
        target = to_alpha(SOURCE / f"{name}.png")
        shutil.copyfile(target, MOBILE / target.name)
        print(f"{target.relative_to(ROOT)} ({target.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
