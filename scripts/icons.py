"""Render the existing Android vector icon into desktop packaging formats (requires Pillow)."""
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parent.parent
vector = ET.parse(root / 'android/app/src/main/res/drawable/app_icon.xml').getroot()
ns = '{http://schemas.android.com/apk/res/android}'
image = Image.new('RGBA', (1080, 1080))
draw = ImageDraw.Draw(image)
for shape in vector:
    tokens = re.findall(r'[A-Za-z]|-?\d+(?:\.\d+)?', shape.attrib[ns+'pathData'])
    i = 0; points = []; x = y = 0
    while i < len(tokens):
        command = tokens[i]; i += 1
        if command == 'Z': break
        count = {'M':2, 'L':2, 'H':1, 'V':1, 'C':6}[command]
        args = list(map(float, tokens[i:i+count])); i += count
        if command in ['M','L']: x,y = args; points.append((x,y))
        elif command == 'H': x=args[0]; points.append((x,y))
        elif command == 'V': y=args[0]; points.append((x,y))
        else:
            a,b,c,d,e,f = args
            for step in range(1,33):
                t=step/32; u=1-t
                points.append((u**3*x+3*u*u*t*a+3*u*t*t*c+t**3*e,u**3*y+3*u*u*t*b+3*u*t*t*d+t**3*f))
            x,y=e,f
    draw.polygon([(int(x*10),int(y*10)) for x,y in points],fill=shape.attrib[ns+'fillColor'])
icons=root/'desktop/src-tauri/icons';icons.mkdir(exist_ok=True)
image.resize((512,512),Image.Resampling.LANCZOS).save(icons/'icon.png')
image.resize((1024,1024),Image.Resampling.LANCZOS).save(icons/'icon.icns')
image.resize((256,256),Image.Resampling.LANCZOS).save(icons/'icon.ico',sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
print('Generated Mac/Windows icons from the existing Android vector.')
# Modified by AI on 2026-10-08 10:06:28
