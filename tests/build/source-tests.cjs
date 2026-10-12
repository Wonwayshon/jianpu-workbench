const assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const r=spawnSync('python3',['-c',`from pathlib import Path
import subprocess,json,zipfile
subprocess.run(['python3','scripts/export-source.py'],check=True)
v=json.loads(Path('project.json').read_text())['version']
with zipfile.ZipFile('outputs/flute-key-lab-project-'+v+'.zip') as z:
 names=set(z.namelist())
 for p in ['tests/build/build.cjs','tests/build/source-tests.cjs','tests/build/release-tests.cjs','tests/build/publish-tests.cjs','capacitor.config.json','android/gradle/wrapper/gradle-wrapper.jar']:
  assert p in names,p
 assert not any(p.startswith(('android/build/','android/app/build/')) for p in names)
 assert not any('/node_modules/' in p or '/.gradle/' in p or p.endswith(('.p12','.jks','.keystore')) for p in names)
 print('PASS: source export retains build tests/config/wrapper and excludes generated native output and signing material.')
`],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);console.log(r.stdout.trim());
// Modified by AI on 2026-10-12 16:35:39
