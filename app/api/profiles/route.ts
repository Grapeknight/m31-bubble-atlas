import {validUsername} from '../../../lib/usernames';
import {env} from 'cloudflare:workers';
import {currentProfile,hashToken,tokenFromCookie,writeCookie} from '../../../lib/profiles';
const reply=(v:unknown,status=200,extra:Record<string,string>={})=>Response.json(v,{status,headers:{'Cache-Control':'no-store',...extra}});
export async function GET(request:Request){
 if(!env.DB)return reply({error:'数据库尚未就绪。'},503);
 const {results}=await env.DB.prepare('SELECT p.id,p.name,p.created_at,COUNT(b.id) AS count FROM profiles p LEFT JOIN bubbles b ON b.user_id=p.id GROUP BY p.id ORDER BY p.created_at,p.id').all();
 return reply({profiles:results,current_profile:await currentProfile(request.headers.get('cookie'))});
}
export async function POST(request:Request){
 if(!env.DB)return reply({error:'数据库尚未就绪。'},503);
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'请求来源不匹配。'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'需要 JSON 请求。'},415);
 try{
  const raw=await request.text();if(raw.length>2000)return reply({error:'请求过大。'},413);
  const body=JSON.parse(raw);if(!body||typeof body!=='object')return reply({error:'参数无效。'},400);
  if(body.action==='logout'){
   const token=tokenFromCookie(request.headers.get('cookie'));if(token)await env.DB.prepare('DELETE FROM profile_sessions WHERE token_hash=?').bind(await hashToken(token)).run();
   return reply({profile:null},200,{'Set-Cookie':writeCookie('',request,0)});
  }
  if(body.action==='rename'||body.action==='delete'){
   const current=await currentProfile(request.headers.get('cookie'));
   if(!current)return reply({error:'请先选择要管理的用户名。'},401);
   if(body.id!==current.id)return reply({error:'只能管理当前选择的用户名，请先切换。'},403);
   if(body.expected_name!==current.name)return reply({error:'用户名已变更，请刷新名单后重试。'},409);
   if(body.action==='rename'){
    if(typeof body.name!=='string')return reply({error:'请输入新用户名。'},400);
    const name=body.name.trim().normalize('NFKC');
    if(!validUsername(name))return reply({error:'用户名最多 10 个汉字或 20 个半角字符，不能包含控制字符。'},400);
    const result=await env.DB.prepare('UPDATE OR IGNORE profiles SET name=?,normalized_name=? WHERE id=? AND name=?').bind(name,name.toLocaleLowerCase('en-US'),current.id,current.name).run();
    if(!result.meta.changes)return reply({error:'新用户名已存在，或名单已更新。请换一个名字或刷新后重试。'},409);
    return reply({profile:{id:current.id,name}});
   }
   if(body.confirm_name!==current.name)return reply({error:'请输入完整用户名以确认删除。'},400);
   const results=await env.DB.batch([
    env.DB.prepare('DELETE FROM bubbles WHERE user_id=? AND EXISTS (SELECT 1 FROM profiles WHERE id=? AND name=?)').bind(current.id,current.id,current.name),
    env.DB.prepare('DELETE FROM profile_sessions WHERE profile_id=? AND EXISTS (SELECT 1 FROM profiles WHERE id=? AND name=?)').bind(current.id,current.id,current.name),
    env.DB.prepare('DELETE FROM profiles WHERE id=? AND name=?').bind(current.id,current.name),
   ]);
   if(!results[2].meta.changes)return reply({error:'用户名已变更或删除，请刷新名单。'},409);
   return reply({profile:null,deleted_id:current.id},200,{'Set-Cookie':writeCookie('',request,0)});
  }
  let profile:{id:string;name:string}|null=null;
  if(body.action==='create'){
   if(typeof body.name!=='string')return reply({error:'请输入用户名。'},400);
   const name=body.name.trim().normalize('NFKC'),normalized=name.toLocaleLowerCase('en-US');
   if(!validUsername(name))return reply({error:'用户名最多 10 个汉字或 20 个半角字符，不能包含控制字符。'},400);
   const id=crypto.randomUUID(),result=await env.DB.prepare('INSERT INTO profiles (id,name,normalized_name,created_at) VALUES (?,?,?,?) ON CONFLICT(normalized_name) DO NOTHING').bind(id,name,normalized,new Date().toISOString()).run();
   if(!result.meta.changes)return reply({error:'该用户名已存在，请从名单选择，或换一个名字。'},409);
   profile={id,name};
  }else if(body.action==='select'&&typeof body.id==='string')profile=await env.DB.prepare('SELECT id,name FROM profiles WHERE id=?').bind(body.id).first();
  else return reply({error:'请选择用户名或创建新用户名。'},400);
  if(!profile)return reply({error:'用户名不存在，请刷新名单。'},404);
  const bytes=crypto.getRandomValues(new Uint8Array(32)),token=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
  const old=tokenFromCookie(request.headers.get('cookie'));if(old)await env.DB.prepare('DELETE FROM profile_sessions WHERE token_hash=?').bind(await hashToken(old)).run();
  await env.DB.prepare('DELETE FROM profile_sessions WHERE expires_at<?').bind(new Date().toISOString()).run();
  await env.DB.prepare('INSERT INTO profile_sessions (token_hash,profile_id,expires_at) VALUES (?,?,?)').bind(await hashToken(token),profile.id,new Date(Date.now()+30*86400000).toISOString()).run();
  return reply({profile},200,{'Set-Cookie':writeCookie(token,request)});
 }catch{ return reply({error:'选择用户名失败，请稍后重试。'},500);}
}
