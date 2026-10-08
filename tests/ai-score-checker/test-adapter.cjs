const fs=require('node:fs');
const payload=JSON.parse(fs.readFileSync(0,'utf8'));
const mode=process.argv[2];
if(mode==='repair') process.stdout.write(payload.draft.includes('(1 2 | 3 4\n')?payload.draft.replace('(1 2 | 3 4\n','(1 2 | 3 4)\n'):payload.draft.replace('!unknown','!tr'));
else if(mode==='repeat') process.stdout.write(payload.draft);
else if(mode==='max') process.stdout.write('% next round '+payload.attempt+'\n'+payload.draft);
else if(mode==='exit') process.exitCode=7;
else if(mode==='timeout') setTimeout(()=>process.stdout.write(payload.draft),1000);
else if(mode==='cycle') process.stdout.write(payload.draft.startsWith('% A')?'% B\n1 ?':'% A\n1 ?');
else if(mode!=='empty') throw new Error('Unknown fixture mode');
// Modified by AI on 2026-10-08 10:06:28
