/** Backend-only user administration. No HTTP route invokes this script. */
import './sites-env.mjs';
import {hashAdvancedPassword} from '../lib/advanced-password.mjs';
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const usage=`Backend user administration (run from the project directory):
  npm run users -- list --local
  npm run users -- set --local --id USER_ID --role advanced
  npm run users -- set --local --id USER_ID --role standard
  npm run users -- list --remote --config /absolute/path/wrangler.json
  npm run users -- set --remote --config /absolute/path/wrangler.json --id USER_ID --role advanced
Optional: --database BINDING_OR_DATABASE_NAME (default DB).
Setting advanced prompts for a dedicated password (hidden input) and invalidates existing sessions.
For private automation only: --password-stdin reads the password from stdin, never an argument.`;
const args=process.argv.slice(2),command=args.shift();
if(command==='--help'||command==='help'){console.log(usage);process.exit(0);}
const opts={};
for(let i=0;i<args.length;i++){
 const key=args[i];
 if(['--local','--remote','--password-stdin'].includes(key)){if(opts[key])throw new Error('Duplicate option: '+key);opts[key]=true;}
 else if(['--id','--role','--config','--database'].includes(key)&&args[i+1]&&!args[i+1].startsWith('--')){if(opts[key])throw new Error('Duplicate option: '+key);opts[key]=args[++i];}
 else throw new Error('Unknown or incomplete option: '+key+'\n'+usage);
}
if(!['list','set'].includes(command)||!!opts['--local']===!!opts['--remote'])throw new Error('Choose exactly one target: --local or --remote.\n'+usage);
if(opts['--remote']&&!opts['--config'])throw new Error('Remote changes require an explicit --config for the deployed Worker.');
if(command==='set'&&(!opts['--id']||!['standard','advanced'].includes(opts['--role'])))throw new Error('Set requires --id and --role standard|advanced.\n'+usage);
const config=opts['--config']||'dist/server/wrangler.json';
if(!existsSync(config))throw new Error('Config not found: '+config+'. Run npm run build first or pass --config.');
if(opts['--password-stdin']&&(command!=='set'||opts['--role']!=='advanced'))throw new Error('--password-stdin requires set --role advanced.');
async function readPassword(){
 if(opts['--password-stdin']){
  let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>1024)throw new Error('Password input too long.');}
  return input.replace(/\r?\n$/,'');
 }
 if(!process.stdin.isTTY)throw new Error('Use a private interactive terminal to set the password, or pass --password-stdin for automation.');
 const silent=new Writable({write(_chunk,_encoding,done){done();}});
 const rl=createInterface({input:process.stdin,output:silent,terminal:true});
 try{
  process.stderr.write('Dedicated password (8-128 characters, hidden): ');
  const first=await rl.question('');process.stderr.write('\nConfirm password: ');
  const second=await rl.question('');process.stderr.write('\n');
  if(first!==second)throw new Error('Passwords differ; no changes made.');
  return first;
 }finally{rl.close();}
}
const directory=mkdtempSync(path.join(tmpdir(),'m31-user-admin-'));
const sqlQuote=v=>"'"+v.replaceAll("'","''")+"'";
function execute(sql){
 const file=path.join(directory,'query.sql');writeFileSync(file,sql,{mode:0o600});
 const r=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute',opts['--database']||'DB',opts['--local']?'--local':'--remote','--config',config,...(opts['--local']?['--persist-to','.wrangler/state']:[]),'--file',file,'--json'],{encoding:'utf8',env:process.env,maxBuffer:8*1024*1024});
 if(r.status!==0)throw new Error('D1 command failed. '+(r.stderr||r.stdout));
 const data=JSON.parse(r.stdout);
 if(!Array.isArray(data)||data.some(x=>!x.success))throw new Error('D1 returned an unsuccessful result.');
 return data.flatMap(x=>x.results||[]);
}
try{
 if(command==='list'){
  console.table(execute('SELECT id,name,role,created_at FROM profiles ORDER BY created_at,id;'));
 }else{
  const id=sqlQuote(opts['--id']);
  if(execute(`SELECT id FROM profiles WHERE id=${id};`).length!==1)throw new Error('User ID not found. Create the username in the website first, then use list.');
  const advanced=opts['--role']==='advanced';
  const hash=advanced?await hashAdvancedPassword(await readPassword()):null;
  const rows=execute(`UPDATE profiles SET role=${sqlQuote(opts['--role'])},access_code_hash=${hash?sqlQuote(hash):'NULL'} WHERE id=${id} RETURNING id,name,role;\nDELETE FROM profile_sessions WHERE profile_id=${id};`);
  if(rows.length!==1)throw new Error('User disappeared during update. Refresh the list.');
  console.table(rows);
  console.log('Existing sessions invalidated. Log in again.');
  if(advanced)console.log('Dedicated password set. Select the username normally, then use Enable advanced features to verify it.');
 }
}finally{rmSync(directory,{recursive:true,force:true});}
