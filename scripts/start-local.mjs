import './sites-env.mjs';
import {spawn,spawnSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);
if(!existsSync('node_modules/vinext'))throw new Error('缺少依赖，请在项目目录先运行 npm ci。');
try{
 const r=await fetch('http://127.0.0.1:5173/',{signal:AbortSignal.timeout(1500)});
 if(r.ok&&(await r.text()).includes('M31 Bubble Atlas')){console.log('M31 preview is already running: http://127.0.0.1:5173/');process.exit(0);}
}catch{}
const journal=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8'));
const marker='.sites-runtime/local-migrations.json';
const applied=existsSync(marker)?JSON.parse(readFileSync(marker,'utf8')):[];
function run(args){const r=spawnSync(process.execPath,args,{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
if(journal.entries.some(e=>!applied.includes(e.tag))){
 run(['scripts/run-framework.mjs','build']);
 for(const e of journal.entries){if(applied.includes(e.tag))continue;
  run(['--import','./scripts/sites-env.mjs','node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--file',`drizzle/${e.tag}.sql`]);
  applied.push(e.tag);mkdirSync(path.dirname(marker),{recursive:true});writeFileSync(marker,JSON.stringify(applied));
 }
}
const child=spawn(process.execPath,['scripts/run-framework.mjs','dev','--hostname','127.0.0.1'],{stdio:'inherit'});
process.on('SIGINT',()=>child.kill('SIGINT'));process.on('SIGTERM',()=>child.kill('SIGTERM'));
child.on('exit',code=>{process.exitCode=code||0;});
