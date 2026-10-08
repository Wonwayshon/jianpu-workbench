"""Export only canonical source and lockfiles; never include signing material or toolchains."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json
root = Path(__file__).resolve().parent.parent
version = json.loads((root/'project.json').read_text())['version']
blocked = {'.git', 'node_modules', 'target', 'gen', '.gradle', '__pycache__', 'test-runs'}
folders = ['web', 'platform', 'android', 'desktop', 'scripts', 'tests', 'docs', '.github', '.githooks']
output = root/'outputs'/f'flute-key-lab-project-{version}.zip'
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED) as z:
    for name in folders:
        for file in (root/name).rglob('*'):
            rel = file.relative_to(root)
            if not file.is_file() or str(rel).startswith('android/app/build/') or blocked.intersection(rel.parts) or file.name in ['.DS_Store', 'local.properties', 'tauri.conf.json'] or file.suffix in ['.p12', '.pfx', '.jks', '.keystore', '.pem', '.key'] or file.name.startswith('.env') or file.name.lower() in ['password.txt', 'passwords.txt', 'credentials.json', 'secrets.json', 'tokens.json'] or '验证结果' in file.name:
                continue
            z.write(file, rel)
    for name in ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'project.json', 'package.json', 'package-lock.json', '.gitignore']:
        z.write(root/name, name)
print(output)
# Modified by AI on 2026-10-08 10:47:12
