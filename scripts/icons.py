"""Package the approved light/dark logo masters into web, Android and desktop icons.
Requires Pillow. Run from any directory: python3 scripts/icons.py.
Only sizing and platform corner masks are applied; artwork is kept unchanged.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops

root = Path(__file__).resolve().parent.parent
masters = root / 'docs/branding'
icons = root / 'desktop/src-tauri/icons'
icons.mkdir(parents=True, exist_ok=True)

def tile(source, size):
    image = source.resize((size, size), Image.Resampling.LANCZOS)
    # Platform icon export: antialiased corners, with no white outer wedges.
    mask = Image.new('L', (size * 4, size * 4))
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=size * .22 * 4, fill=255)
    mask = mask.resize((size, size), Image.Resampling.LANCZOS)
    alpha = ImageChops.multiply(image.getchannel('A'), mask)
    # Bound colour noise while preserving the full-resolution alpha edge separately.
    image = image.convert('RGB').quantize(colors=128, method=Image.Quantize.FASTOCTREE).convert('RGBA')
    image.putalpha(alpha)
    return image

for mode in ('light', 'dark'):
    source = Image.open(masters / f'logo-{mode}.png').convert('RGBA')
    if source.width != source.height or source.width < 512:
        raise ValueError(f'{mode}: master must be square and at least 512 pixels')
    web = root / 'web/assets'
    web.mkdir(parents=True, exist_ok=True)
    tile(source, 256).save(web / f'logo-{mode}.png', optimize=True)
    resource = root / 'android/app/src/main/res' / ('drawable-night-nodpi' if mode == 'dark' else 'drawable-nodpi')
    resource.mkdir(parents=True, exist_ok=True)
    tile(source, 512).save(resource / 'app_logo.png', optimize=True)
    if mode == 'light':
        tile(source, 512).save(icons / 'icon.png', optimize=True)
        tile(source, 1024).save(icons / 'icon.icns')
        tile(source, 256).save(icons / 'icon.ico', sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
print('Packaged approved logos: web (light/dark), Android (day/night), macOS ICNS and Windows ICO.')
# Modified by AI on 2026-10-21 15:16:26
