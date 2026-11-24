# Saca de Minecraft Bedrock instalado en este PC las texturas, skins e íconos que usa CraftAdmin
# y los guarda en renderer/juego.js (como imágenes PNG en base64, para que la app no dependa del juego).
# Uso: python tools/texturas.py ["ruta a la carpeta data del juego"]
import base64
import io
import os
import struct
import sys
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
DATA = r'C:\XboxGames\Minecraft for Windows\Content\data'
MAGIA = 0x267052A0B125277D


def leer_brarchive(ruta):
    """Lee un .brarchive del juego: cabecera, 256 bytes por entrada (nombre, posición, largo) y luego los datos."""
    b = open(ruta, 'rb').read()
    magia, n, _ver = struct.unpack_from('<QII', b, 0)
    if magia != MAGIA:
        raise ValueError(f'{ruta} no es un brarchive')
    base = 16 + 256 * n
    out = {}
    for i in range(n):
        o = 16 + 256 * i
        nombre = b[o + 1:o + 1 + b[o]].decode('utf-8')
        pos, largo = struct.unpack_from('<II', b, o + 248)
        out[nombre] = b[base + pos:base + pos + largo]
    return out


class Juego:
    def __init__(self, data=DATA):
        self.data = data
        self.tx = os.path.join(data, r'resource_packs\vanilla\__brarchive\textures')
        self.hbui = os.path.join(data, r'gui\dist\hbui\assets')
        self._cache = {}

    def textura(self, archivo, nombre):
        if archivo not in self._cache:
            self._cache[archivo] = leer_brarchive(os.path.join(self.tx, archivo))
        return Image.open(io.BytesIO(self._cache[archivo][nombre])).convert('RGBA')

    def icono_menu(self, prefijo):
        """Íconos de los menús nuevos de Bedrock (gui/dist/hbui). El nombre trae un código al final."""
        for n in sorted(os.listdir(self.hbui)):
            if n.startswith(prefijo) and n.endswith('.png'):
                return Image.open(os.path.join(self.hbui, n)).convert('RGBA')
        raise FileNotFoundError(prefijo)


# Texturas: nombre en la app -> (archivo, nombre en el juego)
TEXTURAS = {
    'pasto_arriba': ('blocks.brarchive', 'grass_carried.png'),
    'pasto_lado': ('blocks.brarchive', 'grass_side_carried.png'),
    'tierra': ('blocks.brarchive', 'dirt.png'),
    'mesa_arriba': ('blocks.brarchive', 'crafting_table_top.png'),
    'mesa_frente': ('blocks.brarchive', 'crafting_table_front.png'),
    'mesa_lado': ('blocks.brarchive', 'crafting_table_side.png'),
    'estanteria': ('blocks.brarchive', 'bookshelf.png'),
    'tablas_roble': ('blocks.brarchive', 'planks_oak.png'),
    'barril_lado': ('blocks.brarchive', 'barrel_side.png'),
    'barril_arriba': ('blocks.brarchive', 'barrel_top.png'),
    'comando_frente': ('blocks.brarchive', 'command_block_front_mipmap.png'),
    'comando_lado': ('blocks.brarchive', 'command_block_side_mipmap.png'),
    'comando_atras': ('blocks.brarchive', 'command_block_back_mipmap.png'),
    'lampara': ('blocks.brarchive', 'redstone_lamp_off.png'),
    'lampara_on': ('blocks.brarchive', 'redstone_lamp_on.png'),
    'portal': ('blocks.brarchive', 'portal.png'),
    'oro': ('blocks.brarchive', 'gold_block.png'),
    'barrera': ('blocks.brarchive', 'barrier.png'),
    'mapa': ('items.brarchive', 'map_filled.png'),
    'libro': ('items.brarchive', 'book_writable.png'),
    'mundo': ('ui.brarchive', 'World.png'),
    'steve': ('entity.brarchive', 'steve.png'),
    'alex': ('entity.brarchive', 'alex.png'),
    'cofre': (r'entity\chest.brarchive', 'normal.png'),
    'cofre_ender': (r'entity\chest.brarchive', 'ender.png'),
}

# Íconos de la interfaz: nombre en la app -> (tipo, nombre en el juego)
#   'menu': ícono de los menús nuevos (pixeles de 1, se guarda al doble)
#   'grande': ícono de los menús que ya viene al doble
#   'color': ícono a color de los menús clásicos (se guarda tal cual)
ICONOS = {
    'copy': ('menu', 'duplicate@'),
    'folder': ('grande', 'Folder-Closed-'),
    'trash': ('menu', 'delete@'),
    'restart': ('menu', 'reset@'),
    'plus': ('grande', 'plus@1x'),
    'userPlus': ('menu', 'add-player@'),
    'users': ('menu', 'friends@'),
    'search': ('menu', 'search@'),
    'send': ('menu', 'arrow-right@'),
    'external': ('menu', 'external-link@'),
    'check': ('menu', 'checkmark@'),
    'x': ('menu', 'cross@'),
    'download': ('menu', 'download@'),
    'upload': ('menu', 'export@'),
    'edit': ('menu', 'edit@'),
    'clock': ('menu', 'time@'),
    'logout': ('menu', 'exit@'),
    'ban': ('menu', 'block@'),
    'unlock': ('menu', 'lock-unlocked@'),
    'archive': ('menu', 'save@'),
    'terminal': ('grande', 'Slash-Command-'),
    'chat': ('menu', 'comment@'),
    'link': ('menu', 'lan@'),
    'signal': ('menu', 'ping_high@'),
    'shield': ('menu', 'operator@'),
    'server': ('menu', 'lan@'),
    'chevronLeft': ('menu', 'chevron-left@'),
    'chevronRight': ('menu', 'chevron-right@'),
    'info': ('menu', 'information@'),
    'alert': ('menu', 'warning@'),
    'play': ('menu', 'play@'),
    'pause': ('menu', 'pause@'),
    'world': ('menu', 'world@'),
    'operador': ('menu', 'permission-operator@'),
    'miembro': ('menu', 'permission-member@'),
    'visitante': ('menu', 'permission-visitor@'),
    'swOn': ('menu', 'switch-on@'),
    'swOff': ('menu', 'switch-off@'),
    'sun': ('color', 'time_2day.png'),
    'moon': ('color', 'time_5night.png'),
    'cloud': ('color', 'weather_clear.png'),
}


# Letras de los menús de Bedrock (gui/dist/hbui/fonts): nombre del archivo en la app -> comienzo del nombre en el juego
FUENTES = {
    'minecraft-ten.otf': 'Minecraft-Ten-',
    'minecraft-seven.otf': 'Minecraft-Seven-6',
    'minecraft-seven-pp.otf': 'Minecraft-Seven-Pixel-Perfect-9',
    'minecraft-seven-pp-bold.otf': 'Minecraft-Seven-Pixel-Perfect-Bold-',
    'minecraft-five.otf': 'Minecraft-Five-4',
    'minecraft-five-bold.otf': 'Minecraft-Five-Bold-',
}
# Noto Sans es la letra de los textos largos en los menús del juego. Solo viene completa en un archivo
# enorme con todos los idiomas, así que se recorta a las letras del español.
NOTO = {'noto-sans.ttf': 'NotoSansMerged-Regular-', 'noto-sans-bold.ttf': 'NotoSans-Bold-'}

# Piezas de los botones y paneles de los menús de Bedrock (se estiran como en el juego, con border-image)
PIEZAS = [
    *(f'pressable_{c}_{e}' for c in ('neutral', 'primary', 'secondary', 'destructive') for e in ('default', 'hovered', 'pressed', 'focused')),
    *(f'pressable_elevated_{c}_{e}' for c in ('neutral', 'primary', 'secondary', 'destructive') for e in ('default', 'hovered', 'focused')),
    'pressable_disabled', 'pressable_elevated_disabled',
    *(f'listItem_action_{e}' for e in ('default', 'hovered', 'pressed', 'focused')),
    'baseTextField_neutral80', 'baseTextField_neutral90', 'baseTextField_disabled',
    *(f'tabBar_neutral_{e}' for e in ('default', 'hovered', 'pressed')),
    'tooltip',
]


def pieza(hbui, nombre):
    for n in os.listdir(hbui):
        if n.endswith('.png') and n.rsplit('-', 1)[0] == nombre:
            return Image.open(os.path.join(hbui, n)).convert('RGBA')
    raise FileNotFoundError(nombre)


def copiar_fuentes(data, destino):
    import shutil
    origen = os.path.join(data, r'gui\dist\hbui\fonts')
    os.makedirs(destino, exist_ok=True)
    archivos = sorted(os.listdir(origen))
    def buscar(prefijo):
        for n in archivos:
            if n.startswith(prefijo):
                return os.path.join(origen, n)
        raise FileNotFoundError(prefijo)
    for nuevo, prefijo in FUENTES.items():
        shutil.copyfile(buscar(prefijo), os.path.join(destino, nuevo))
    from fontTools import subset
    letras = ''.join(chr(c) for c in range(0x20, 0x7f)) + ''.join(chr(c) for c in range(0xa0, 0x180)) + '‐–—‘’‚“”„…•·€™←↑→↓'
    for nuevo, prefijo in NOTO.items():
        op = subset.Options()
        op.layout_features = ['kern', 'liga', 'calt', 'ccmp', 'locl', 'mark', 'mkmk']
        op.name_IDs = ['*']
        f = subset.load_font(buscar(prefijo), op)
        s = subset.Subsetter(op)
        s.populate(text=letras)
        s.subset(f)
        subset.save_font(f, os.path.join(destino, nuevo), op)


def escribir_css(data, ruta):
    """Escribe renderer/ore.css: las letras del juego y sus piezas de botón como variables de CSS."""
    hbui = os.path.join(data, r'gui\dist\hbui\assets')
    lineas = [
        '/* Letras y piezas de los menús de Minecraft Bedrock instalado en este PC.',
        '   Lo genera tools/texturas.py; no se edita a mano. */',
        "@font-face { font-family: 'Minecraft Ten'; src: url(fonts/minecraft-ten.otf); }",
        "@font-face { font-family: 'Minecraft Seven'; src: url(fonts/minecraft-seven-pp.otf); }",
        "@font-face { font-family: 'Minecraft Seven'; font-weight: 700; src: url(fonts/minecraft-seven-pp-bold.otf); }",
        "@font-face { font-family: 'Minecraft Seven v2'; src: url(fonts/minecraft-seven.otf); }",
        "@font-face { font-family: 'Minecraft Five'; src: url(fonts/minecraft-five.otf); }",
        "@font-face { font-family: 'Minecraft Five'; font-weight: 700; src: url(fonts/minecraft-five-bold.otf); }",
        "@font-face { font-family: 'Noto Sans'; src: url(fonts/noto-sans.ttf); }",
        "@font-face { font-family: 'Noto Sans'; font-weight: 700; src: url(fonts/noto-sans-bold.ttf); }",
        ':root {',
    ]
    for n in PIEZAS:
        lineas.append(f'  --ore-{n.replace("_", "-").lower()}: url({png64(pieza(hbui, n))});')
    lineas += ['}', '']
    with open(ruta, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lineas))


def png64(im):
    buf = io.BytesIO()
    im.save(buf, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')


def mascara(im, escala):
    # Solo importa la forma: se deja en blanco y la app la pinta del color del texto.
    blanco = Image.new('RGBA', im.size, (255, 255, 255, 0))
    blanco.putalpha(im.split()[3].point(lambda a: 255 if a >= 128 else 0))
    if escala > 1:
        blanco = blanco.resize((im.width * escala, im.height * escala), Image.NEAREST)
    return blanco


def generar(data=DATA):
    j = Juego(data)
    tex = {}
    for clave, (archivo, nombre) in TEXTURAS.items():
        im = j.textura(archivo, nombre)
        if clave == 'portal':
            # El portal es una tira animada y medio transparente: se toma el primer cuadro y se deja sólido.
            im = im.crop((0, 0, 16, 16))
            im.putalpha(255)
        tex[clave] = png64(im)
    # Paisaje de los menús del juego: se usa en Inicio cuando el mundo todavía no tiene foto.
    fondo = pieza(j.hbui, 'background-main').convert('RGB')
    buf = io.BytesIO()
    fondo.save(buf, 'JPEG', quality=88)
    tex['fondo'] = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')
    ic = {}
    for clave, (tipo, nombre) in ICONOS.items():
        if tipo == 'color':
            im = j.textura('ui.brarchive', nombre)
            ic[clave] = {'u': png64(im), 'w': im.width, 'h': im.height, 'color': True}
        else:
            im = mascara(j.icono_menu(nombre), 2 if tipo == 'menu' else 1)
            ic[clave] = {'u': png64(im), 'w': im.width, 'h': im.height}
    return tex, ic


def escribir_js(tex, ic, ruta):
    import json
    lineas = [
        "'use strict';",
        '// Texturas, skins e íconos sacados de Minecraft Bedrock instalado en este PC.',
        '// Lo genera tools/texturas.py; no se edita a mano.',
        'const JUEGO = {',
        '  tex: {',
    ]
    lineas += [f'    {k}: {json.dumps(v)},' for k, v in tex.items()]
    lineas += ['  },', '  ic: {']
    lineas += [f'    {k}: {json.dumps(v, separators=(",", ":"))},' for k, v in ic.items()]
    lineas += ['  },', '};', '']
    with open(ruta, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lineas))


if __name__ == '__main__':
    data = sys.argv[1] if len(sys.argv) > 1 else DATA
    tex, ic = generar(data)
    destino = os.path.join(RAIZ, 'renderer', 'juego.js')
    escribir_js(tex, ic, destino)
    print(f'listo: {len(tex)} texturas y {len(ic)} íconos en {destino} ({os.path.getsize(destino) // 1024} KB)')
    copiar_fuentes(data, os.path.join(RAIZ, 'renderer', 'fonts'))
    css = os.path.join(RAIZ, 'renderer', 'ore.css')
    escribir_css(data, css)
    print(f'listo: {len(FUENTES) + len(NOTO)} letras en renderer/fonts y {len(PIEZAS)} piezas en {css} ({os.path.getsize(css) // 1024} KB)')
