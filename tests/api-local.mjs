/** Integration test against the running loopback preview; cleans its own fixtures. */
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync} from 'node:fs';
import meta from '../public/map/metadata.json' with {type:'json'};
const origin=process.env.M31_TEST_ORIGIN||'http://127.0.0.1:5173';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'Local test only');
const created=[],bubbles=[];let assertions=0;
async function call(path,method='GET',body,session='',expected=200){
 const r=await fetch(origin+path,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(session?{Cookie:session}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const d=await r.json();assert.equal(r.status,expected,JSON.stringify(d));assertions++;
 return {data:d,cookie:r.headers.get('set-cookie')?.split(';')[0]||''};
}
try{
 await call('/api/profiles');
 const prefix='QA-'+Date.now();
 const a=await call('/api/profiles','POST',{action:'create',name:prefix+'-A'});created.push(a.data.profile.id);
 const b=await call('/api/profiles','POST',{action:'create',name:prefix+'-B'});created.push(b.data.profile.id);
 const aid=a.data.profile.id,bid=b.data.profile.id;
 await call('/api/profiles','POST',{action:'create',name:(' '+prefix+'-a ')} ,'',409);
 const base={x:meta.crpix[0]-1,y:meta.crpix[1]-1,rx:30,ry:17,theta:.3,name:'QA shell',notes:'test',confidence:'candidate',map_id:meta.id};
 await call('/api/bubbles','POST',{...base,profile_id:aid},'',401);
 const one=(await call('/api/bubbles','POST',{...base,profile_id:aid},a.cookie,201)).data.bubble;bubbles.push(one.id);
 const two=(await call('/api/bubbles','POST',{...base,name:'second',profile_id:aid},a.cookie,201)).data.bubble;bubbles.push(two.id);
 const other=(await call('/api/bubbles','POST',{...base,name:'other user',profile_id:bid},b.cookie,201)).data.bubble;bubbles.push(other.id);
 const list=(await call('/api/bubbles?profile='+aid)).data.bubbles;assert.equal(list.length,2);assertions++;
 assert.ok(list.every(x=>x.id!==other.id));assertions++;
 const readOther=await call('/api/bubbles?profile='+bid,'GET',undefined,a.cookie);assert.equal(readOther.data.bubbles[0].id,other.id);assertions++;
 await call('/api/bubbles','POST',{...other,profile_id:aid},a.cookie,409);
 await call('/api/bubbles','DELETE',{id:other.id,revision:other.revision,profile_id:aid},a.cookie,409);
 await call('/api/bubbles','POST',{...one,profile_id:bid},a.cookie,409);
 const revised=(await call('/api/bubbles','POST',{...one,rx:45,profile_id:aid},a.cookie)).data.bubble;
 assert.equal(revised.revision,2);assert.ok(revised.a_arcsec>one.a_arcsec);assertions+=2;
 await call('/api/bubbles','POST',{...one,profile_id:aid},a.cookie,409);
 await call('/api/bubbles','DELETE',{id:one.id,revision:1,profile_id:aid},a.cookie,409);
 await call('/api/bubbles','POST',{...base,rx:-1,profile_id:aid},a.cookie,400);
 await call('/api/bubbles','POST',{...base,map_id:'wrong',profile_id:aid},a.cookie,400);
 await call('/api/bubbles','POST',null,a.cookie,400);
 const cross=await fetch(origin+'/api/bubbles',{method:'POST',headers:{Cookie:a.cookie,'Content-Type':'application/json',Origin:'https://unrelated.invalid'},body:JSON.stringify({...base,profile_id:aid})});assert.equal(cross.status,403);assertions++;
 await call('/api/bubbles','DELETE',{id:one.id,revision:2,profile_id:aid},a.cookie);
 const switcher=await call('/api/profiles','POST',{action:'select',id:bid},a.cookie);assert.equal(switcher.data.profile.id,bid);assertions++;
 await call('/api/bubbles','POST',{...base,profile_id:aid},switcher.cookie,409);
 await call('/api/profiles','POST',{action:'logout'},switcher.cookie);
 await call('/api/bubbles','POST',{...base,profile_id:bid},switcher.cookie,401);
 console.log(`${assertions} API checks passed: public catalogue reads, separated writes, duplicate names, version conflicts, session switching, logout, origin validation.`);
}finally{
 const dir='.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
 for(const name of readdirSync(dir).filter(x=>x.endsWith('.sqlite')&&x!=='metadata.sqlite')){
  const db=new DatabaseSync(dir+'/'+name);try{for(const id of created){db.prepare('DELETE FROM bubbles WHERE user_id=?').run(id);db.prepare('DELETE FROM profile_sessions WHERE profile_id=?').run(id);db.prepare('DELETE FROM profiles WHERE id=?').run(id);}}finally{db.close();}
 }
}
