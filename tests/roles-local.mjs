/** Local-only role/security integration checks. Never modifies real observers. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync} from 'node:fs';
import meta from '../lib/map-metadata.json' with {type:'json'};
const origin=process.env.M31_TEST_ORIGIN||'http://127.0.0.1:5173';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'Local tests only');
const ids=[];let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
async function call(path,body,session='',status=200){
 const r=await fetch(origin+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(session?{Cookie:session}:{})},body:body?JSON.stringify(body):undefined});
 const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));checks++;
 return {data:d,cookie:r.headers.get('set-cookie')?.split(';')[0]||session};
}
async function admin(id,role,password){
 const args=['scripts/manage-users.mjs','set','--local','--id',id,'--role',role,...(password?['--password-stdin']:[])];
 const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:['pipe','pipe','pipe']});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',reject);child.on('exit',code=>resolve({code,output}));child.stdin.end(password?password+'\n':'');});
 assert.equal(result.code,0,result.output);checks++;
 check(!password||!result.output.includes(password),'Backend must not print plaintext passwords');
}
try{
 const prefix='QR'+Date.now().toString(36);
 const create=async suffix=>{const r=await call('/api/profiles',{action:'create',name:prefix+suffix});ids.push(r.data.profile.id);return r;};
 const a=await create('A'),b=await create('B'),c=await create('C');
 const aid=a.data.profile.id,bid=b.data.profile.id,cid=c.data.profile.id;
 check(a.data.profile.role==='standard','new account is standard');
 const base={map_id:meta.id,x:meta.crpix[0]-1,y:meta.crpix[1]-1,rx:30,ry:20,theta:0,name:'Role test',confidence:'silver',notes:''};
 for(const user of [a,b,c])await call('/api/bubbles',{...base,profile_id:user.data.profile.id},user.cookie,201);
 const anonymous=(await call('/api/profiles')).data;
 check(anonymous.profiles.every(p=>!('count' in p)),'anonymous counts omitted, not zero');
 await call('/api/statistics?scope=all',undefined,'',401);
 const normal=(await call('/api/profiles',undefined,a.cookie)).data;
 check(normal.profiles.find(p=>p.id===aid).count===1,'own count visible');
 check(!('count' in normal.profiles.find(p=>p.id===bid)),'other count absent');
 check((await call('/api/bubbles?profile='+bid,undefined,a.cookie)).data.bubbles.length===1,'other map remains readable');
 check((await call('/api/statistics?profile='+aid,undefined,a.cookie)).data.records.length===1,'own stats allowed');
 await call('/api/statistics?profile='+bid,undefined,a.cookie,403);
 await call('/api/statistics?scope=all',undefined,a.cookie,403);
 for(const field of ['role','access_code_hash','is_advanced'])await call('/api/profiles',{action:'select',id:aid,[field]:'advanced'},a.cookie,403);
 const password=randomBytes(24).toString('base64url'),passwordC=randomBytes(24).toString('base64url');
 await admin(bid,'advanced',password);await admin(cid,'advanced',passwordC);
 check((await call('/api/profiles',undefined,b.cookie)).data.current_profile===null,'role update invalidates old sessions');
 const selected=await call('/api/profiles',{action:'select',id:bid});
 check(selected.data.profile.role==='standard'&&selected.data.profile.advanced_available,'eligible observer enters ordinary mode without a password');
 check(!('count' in (await call('/api/profiles',undefined,selected.cookie)).data.profiles.find(p=>p.id===aid)),'eligible but locked still cannot see counts');
 await call('/api/statistics?scope=all',undefined,selected.cookie,403);
 await call('/api/profiles',{action:'unlock',id:bid,advanced_password:password},'',401);
 await call('/api/profiles',{action:'unlock',id:aid,advanced_password:password},a.cookie,403);
 await call('/api/profiles',{action:'unlock',id:bid,advanced_password:password},a.cookie,409);
 await call('/api/profiles',{action:'unlock',id:bid,advanced_password:'incorrect-password'},selected.cookie,403);
 await call('/api/profiles',{action:'unlock',id:bid,advanced_password:passwordC},selected.cookie,403);
 check((await call('/api/profiles',undefined,selected.cookie)).data.current_profile.role==='standard','wrong password preserves ordinary session');
 await call('/api/profiles',{action:'rename',id:bid,expected_name:prefix+'B',name:prefix+'new'},selected.cookie,403);
 await call('/api/profiles',{action:'delete',id:bid,expected_name:prefix+'B',confirm_name:prefix+'B'},selected.cookie,403);
 const unlocked=await call('/api/profiles',{action:'unlock',id:bid,advanced_password:password},selected.cookie);
 check(unlocked.data.profile.role==='advanced','dedicated password enables advanced features');
 check((await call('/api/profiles',undefined,selected.cookie)).data.current_profile===null,'unlock rotates session token');
 const advanced=(await call('/api/profiles',undefined,unlocked.cookie)).data;
 check(advanced.profiles.filter(p=>ids.includes(p.id)).every(p=>p.count===1),'advanced counts visible');
 check(!JSON.stringify(advanced).includes(password)&&!JSON.stringify(advanced).includes('access_code_hash'),'no password or hash exposure');
 check((await call('/api/statistics?profile='+aid,undefined,unlocked.cookie)).data.records.length===1,'advanced can inspect others stats');
 const all=(await call('/api/statistics?scope=all',undefined,unlocked.cookie)).data.records;
 check(all.filter(r=>ids.includes(r.observer_id)).length===3,'combined stats include all fixture records');
 check(all.every(r=>!('access_code_hash' in r)),'statistics does not expose credential hashes');
 const renamed=await call('/api/profiles',{action:'rename',id:bid,expected_name:prefix+'B',name:prefix+'new'},unlocked.cookie);
 check(renamed.data.profile.role==='advanced','rename retains advanced state');
 const relocked=await call('/api/profiles',{action:'select',id:bid},unlocked.cookie);
 check(relocked.data.profile.role==='standard','reselecting same name restores ordinary mode');
 await call('/api/statistics?scope=all',undefined,relocked.cookie,403);
 const again=await call('/api/profiles',{action:'unlock',id:bid,advanced_password:password},relocked.cookie);
 const replacement=randomBytes(24).toString('base64url');await admin(bid,'advanced',replacement);
 await call('/api/statistics?scope=all',undefined,again.cookie,401);
 const afterReset=await call('/api/profiles',{action:'select',id:bid});
 await call('/api/profiles',{action:'unlock',id:bid,advanced_password:password},afterReset.cookie,403);
 const resetUnlocked=await call('/api/profiles',{action:'unlock',id:bid,advanced_password:replacement},afterReset.cookie);
 await admin(bid,'standard');await call('/api/statistics?scope=all',undefined,resetUnlocked.cookie,401);
 const demoted=await call('/api/profiles',{action:'select',id:bid});
 check(demoted.data.profile.role==='standard'&&!demoted.data.profile.advanced_available,'demotion removes eligibility');
 await call('/api/profiles',{action:'unlock',id:bid,advanced_password:replacement},demoted.cookie,403);
 console.log(`${checks} role checks passed: ordinary entry, per-observer passwords, backend administration, restricted counts/statistics, reset/demotion and public maps.`);
}finally{
 const dir='.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
 for(const file of readdirSync(dir).filter(f=>f.endsWith('.sqlite')&&f!=='metadata.sqlite')){
  const db=new DatabaseSync(dir+'/'+file);try{for(const id of ids){db.prepare('DELETE FROM bubbles WHERE user_id=?').run(id);db.prepare('DELETE FROM profile_sessions WHERE profile_id=?').run(id);db.prepare('DELETE FROM profiles WHERE id=?').run(id);}}finally{db.close();}
 }
}
