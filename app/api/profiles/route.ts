import {validUsername} from '../../../lib/usernames';
import {env} from 'cloudflare:workers';
import {currentProfile,hashToken,tokenFromCookie,writeCookie} from '../../../lib/profiles';
import {canSeeCatalogueStats,type Profile} from '../../../lib/permissions';
import {verifyAdvancedPassword} from '../../../lib/advanced-password.mjs';
const reply=(v:unknown,status=200,extra:Record<string,string>={})=>Response.json(v,{status,headers:{'Cache-Control':'no-store','Vary':'Cookie',...extra}});
export async function GET(request:Request){
 if(!env.DB)return reply({error:'数据库尚未就绪。'},503);
 const current=await currentProfile(request.headers.get('cookie'));
 const {results}=await env.DB.prepare("SELECT p.id,p.name,p.created_at,p.role FROM profiles p ORDER BY p.created_at,p.id").all<{id:string;name:string;created_at:string;role:string}>();
 const {results:counts}=await env.DB.prepare("SELECT user_id,COUNT(*) AS count FROM bubbles WHERE ?='advanced' OR user_id=? GROUP BY user_id").bind(current?.role||'',current?.id||'').all<{user_id:string;count:number}>();
 const byId=new Map(counts.map(r=>[r.user_id,r.count]));
 return reply({profiles:results.map(p=>({id:p.id,name:p.name,created_at:p.created_at,...(canSeeCatalogueStats(current,p.id)?{count:byId.get(p.id)||0}:{})})),current_profile:current});
}
export async function POST(request:Request){
 if(!env.DB)return reply({error:'数据库尚未就绪。'},503);
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'请求来源不匹配。'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'需要 JSON 请求。'},415);
 try{
  const raw=await request.text();if(raw.length>2000)return reply({error:'请求过大。'},413);
  const body=JSON.parse(raw);if(!body||typeof body!=='object')return reply({error:'参数无效。'},400);
  if(['role','access_code_hash','accessCodeHash','is_advanced'].some(k=>k in body))return reply({error:'用户权限只能由部署者在后台设置。'},403);
  if(body.action==='logout'){
   const token=tokenFromCookie(request.headers.get('cookie'));if(token)await env.DB.prepare('DELETE FROM profile_sessions WHERE token_hash=?').bind(await hashToken(token)).run();
   return reply({profile:null},200,{'Set-Cookie':writeCookie('',request,0)});
  }
  if(body.action==='rename'||body.action==='delete'){
   const current=await currentProfile(request.headers.get('cookie'));
   if(!current)return reply({error:'请先选择要管理的用户名。'},401);
   if(body.id!==current.id)return reply({error:'只能管理当前选择的用户名，请先切换。'},403);
   if(current.advanced_available&&current.role!=='advanced')return reply({error:'管理高级账户需先输入专用密码启用高级功能。'},403);
   if(body.expected_name!==current.name)return reply({error:'用户名已变更，请刷新名单后重试。'},409);
   if(body.action==='rename'){
    if(typeof body.name!=='string')return reply({error:'请输入新用户名。'},400);
    const name=body.name.trim().normalize('NFKC');
    if(!validUsername(name))return reply({error:'用户名最多 10 个汉字或 20 个半角字符，不能包含控制字符。'},400);
    const result=await env.DB.prepare('UPDATE OR IGNORE profiles SET name=?,normalized_name=? WHERE id=? AND name=?').bind(name,name.toLocaleLowerCase('en-US'),current.id,current.name).run();
    if(!result.meta.changes)return reply({error:'新用户名已存在，或名单已更新。请换一个名字或刷新后重试。'},409);
    return reply({profile:{...current,name}});
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
  let profile:(Profile&{access_code_hash?:string|null})|null=null;
  let verifiedHash:string|null=null;
  if(body.action==='create'){
   if(typeof body.name!=='string')return reply({error:'请输入用户名。'},400);
   const name=body.name.trim().normalize('NFKC'),normalized=name.toLocaleLowerCase('en-US');
   if(!validUsername(name))return reply({error:'用户名最多 10 个汉字或 20 个半角字符，不能包含控制字符。'},400);
   const id=crypto.randomUUID(),result=await env.DB.prepare('INSERT INTO profiles (id,name,normalized_name,created_at) VALUES (?,?,?,?) ON CONFLICT(normalized_name) DO NOTHING').bind(id,name,normalized,new Date().toISOString()).run();
   if(!result.meta.changes)return reply({error:'该用户名已存在，请从名单选择，或换一个名字。'},409);
   profile={id,name,role:'standard'};
  }else if(body.action==='select'&&typeof body.id==='string')profile=await env.DB.prepare('SELECT id,name,role FROM profiles WHERE id=?').bind(body.id).first();
  else if(body.action==='unlock'){
   const current=await currentProfile(request.headers.get('cookie'));
   if(!current)return reply({error:'请先选择标注用户名。'},401);
   if(body.id!==current.id)return reply({error:'当前用户名已切换，请刷新页面后重试。'},409);
   profile=await env.DB.prepare('SELECT id,name,role,access_code_hash FROM profiles WHERE id=?').bind(current.id).first();
   if(!profile||profile.role!=='advanced')return reply({error:'此账户未由后台设置为高级用户。'},403);
   if(!await verifyAdvancedPassword(body.advanced_password,profile.access_code_hash||null))return reply({error:'高级用户专用密码不正确。',requires_advanced_password:true},403);
   verifiedHash=profile.access_code_hash!;
  }
  else return reply({error:'请选择用户名或创建新用户名。'},400);
  if(!profile)return reply({error:'用户名不存在，请刷新名单。'},404);
  const bytes=crypto.getRandomValues(new Uint8Array(32)),token=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
  const old=tokenFromCookie(request.headers.get('cookie'));if(old)await env.DB.prepare('DELETE FROM profile_sessions WHERE token_hash=?').bind(await hashToken(old)).run();
  await env.DB.prepare('DELETE FROM profile_sessions WHERE expires_at<?').bind(new Date().toISOString()).run();
  await env.DB.prepare('INSERT INTO profile_sessions (token_hash,profile_id,expires_at,access_code_hash) VALUES (?,?,?,?)').bind(await hashToken(token),profile.id,new Date(Date.now()+30*86400000).toISOString(),verifiedHash).run();
  const effectiveProfile=await currentProfile(writeCookie(token,request));
  return reply({profile:effectiveProfile},200,{'Set-Cookie':writeCookie(token,request)});
 }catch{ return reply({error:'选择用户名失败，请稍后重试。'},500);}
}
