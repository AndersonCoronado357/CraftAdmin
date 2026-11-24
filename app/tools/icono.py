# Genera el ícono de CraftAdmin: el bloque de comandos de Minecraft Bedrock instalado en este PC,
# en 3D y con la forma de cubo del inventario del juego (girado 45° y mirado desde 30° arriba).
# Salidas: assets/icon.png (256), assets/icon.ico (16 a 256) y renderer/img/logo-32.png / logo-64.png.
# Uso: python tools/icono.py ["ruta a la carpeta data del juego"]
import os
import sys
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
sys.path.insert(0, AQUI)
from texturas import DATA, Juego  # noqa: E402

j = Juego(sys.argv[1] if len(sys.argv) > 1 else DATA)
FRENTE = j.textura('blocks.brarchive', 'command_block_front_mipmap.png')
LADO = j.textura('blocks.brarchive', 'command_block_side_mipmap.png')
ALTO = 16 * 1.2247  # aristas verticales de un cubo de 16 visto como en el inventario


def dibujar(n, k=4):
    # Se dibuja k veces más grande, pixel por pixel, y se reduce: la textura queda nítida y los bordes parejos.
    N = n * k
    # El cubo mide 32 de ancho y 16 + ALTO de alto (en pixeles del juego); se centra en el cuadro.
    s = N / max(32, 16 + ALTO) * 0.98
    ox = N / 2
    oy = (N - (16 + ALTO) * s) / 2
    P = lambda x, y: (ox + x * s, oy + y * s)
    caras = [
        (FRENTE, P(-16, 8), P(0, 16), P(-16, 8 + ALTO), 0.8),   # izquierda
        (LADO, P(0, 16), P(16, 8), P(0, 16 + ALTO), 0.6),       # derecha
        (LADO, P(-16, 8), P(0, 0), P(0, 16), 1.0),              # arriba
    ]
    img = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    px = img.load()
    for tex, o, a, b, f in caras:
        tp = tex.load()
        U = (a[0] - o[0], a[1] - o[1]); V = (b[0] - o[0], b[1] - o[1])
        det = U[0] * V[1] - U[1] * V[0]
        xs = [o[0], a[0], b[0], a[0] + V[0]]; ys = [o[1], a[1], b[1], a[1] + V[1]]
        for y in range(max(0, int(min(ys))), min(N, int(max(ys)) + 1)):
            for x in range(max(0, int(min(xs))), min(N, int(max(xs)) + 1)):
                dx, dy = x + 0.5 - o[0], y + 0.5 - o[1]
                u = (dx * V[1] - dy * V[0]) / det
                v = (U[0] * dy - U[1] * dx) / det
                if 0 <= u < 1 and 0 <= v < 1:
                    c = tp[min(tex.width - 1, int(u * tex.width)), min(tex.height - 1, int(v * tex.height))]
                    px[x, y] = tuple(max(0, min(255, round(ch * f))) for ch in c[:3]) + (255,)
    return img.resize((n, n), Image.BOX) if k > 1 else img


tam = [16, 20, 24, 32, 40, 48, 64, 128, 256]
imgs = [dibujar(t) for t in tam]
imgs[-1].save(os.path.join(RAIZ, 'assets', 'icon.png'))
imgs[-1].save(os.path.join(RAIZ, 'assets', 'icon.ico'), sizes=[(t, t) for t in tam], append_images=imgs[:-1])
os.makedirs(os.path.join(RAIZ, 'renderer', 'img'), exist_ok=True)
dibujar(32).save(os.path.join(RAIZ, 'renderer', 'img', 'logo-32.png'))
dibujar(64).save(os.path.join(RAIZ, 'renderer', 'img', 'logo-64.png'))
print('listo')
