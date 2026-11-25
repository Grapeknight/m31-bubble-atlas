import {env} from 'cloudflare:workers';
import {currentProfile} from '../../../lib/profiles';
import {ellipseSky,type MapMeta} from '../../../lib/astro';
import map from '../../../lib/map-metadata.json';
const META=map as MapMeta;
const noCache={'Cache-Control':'no-store','Vary':'Cookie'};
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:noCache});
const columns='id,map_id,name,notes,confidence,x,y,rx,ry,theta,ra,dec,a_arcsec,b_arcsec,pa_deg,pa_defined,revision,created_at,updated_at';
async function authorize(request:Request,write=false){
 const user=await currentProfile(request.headers.get('cookie'));
 if(write&&!user)return {error:reply({error:'请先选择标注用户名。'},401)};
 if(write){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return {error:reply({error:'请求来源不匹配。'},403)};if(!request.headers.get('content-type')?.startsWith('application/json'))return {error:reply({error:'需要 JSON 请求。'},415)};}
 if(!env.DB)return {error:reply({error:'数据库尚未就绪，请稍后重试。'},503)};
 return {user,db:env.DB};
}
function validate(body:Record<string,unknown>){
 if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('请求参数无效。');
 for(const k of ['x','y','rx','ry','theta'])if(typeof body[k]!=='number'||!Number.isFinite(body[k]))throw new Error('椭圆参数必须是有限数值。');
 const {x,y,rx,ry,theta}=body as {x:number;y:number;rx:number;ry:number;theta:number};
 if(x<0||y<0||x>META.width-1||y>META.height-1||rx<.5||ry<.5||rx>2000||ry>2000||Math.abs(theta)>1000)throw new Error('椭圆中心或大小超出允许范围。');
 if(typeof body.name!=='string'||!body.name.trim()||body.name.length>100)throw new Error('名称应为 1–100 个字符。');
 if(typeof body.notes!=='string'||body.notes.length>4000)throw new Error('备注最多 4000 个字符。');
 if(!['candidate','likely','uncertain'].includes(body.confidence as string))throw new Error('分类无效。');
 if(body.map_id!==META.id)throw new Error('地图版本不匹配，请刷新页面。');
 return {x,y,rx,ry,theta,name:body.name.trim(),notes:body.notes,confidence:body.confidence as string};
}
export async function GET(request:Request){
 const auth=await authorize(request);if(auth.error)return auth.error;
 const owner=new URL(request.url).searchParams.get('profile')||auth.user?.id;
 if(!owner)return reply({error:'请先选择要浏览的用户名。'},401);
 const profile=await auth.db!.prepare('SELECT id,name FROM profiles WHERE id=?').bind(owner).first();
 if(!profile)return reply({error:'该用户名不存在。'},404);
 const {results}=await auth.db!.prepare(`SELECT ${columns} FROM bubbles WHERE user_id=? ORDER BY created_at DESC,id`).bind(owner).all();
 return reply({bubbles:results.map(r=>({...r,pa_defined:!!r.pa_defined}))});
}
export async function POST(request:Request){
 const auth=await authorize(request,true);if(auth.error)return auth.error;
 try{
  if(Number(request.headers.get('content-length'))>32000)return reply({error:'请求过大。'},413);
  const raw=await request.text();if(raw.length>32000)return reply({error:'请求过大。'},413);
  const body=JSON.parse(raw),g=validate(body),sky=ellipseSky(g,META),now=new Date().toISOString(),owner=auth.user!.id;
  if(body.profile_id!==owner)return reply({error:'当前用户名已切换，请刷新页面后重试。'},409);
  let id:string;
  if(body.id){
   if(typeof body.id!=='string'||!Number.isInteger(body.revision)||body.revision<1)return reply({error:'更新参数无效。'},400);
   id=body.id;
   const result=await auth.db!.prepare('UPDATE bubbles SET name=?,notes=?,confidence=?,x=?,y=?,rx=?,ry=?,theta=?,ra=?,dec=?,a_arcsec=?,b_arcsec=?,pa_deg=?,pa_defined=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=?').bind(g.name,g.notes,g.confidence,g.x,g.y,g.rx,g.ry,g.theta,sky.ra,sky.dec,sky.a_arcsec,sky.b_arcsec,sky.pa_deg,sky.pa_defined?1:0,now,id,owner,body.revision).run();
   if(!result.meta.changes)return reply({error:'该记录已在另一页面修改或删除。请重新载入列表后再保存。'},409);
  }else{
   id=crypto.randomUUID();
   await auth.db!.prepare('INSERT INTO bubbles (id,user_id,map_id,name,notes,confidence,x,y,rx,ry,theta,ra,dec,a_arcsec,b_arcsec,pa_deg,pa_defined,revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)').bind(id,owner,META.id,g.name,g.notes,g.confidence,g.x,g.y,g.rx,g.ry,g.theta,sky.ra,sky.dec,sky.a_arcsec,sky.b_arcsec,sky.pa_deg,sky.pa_defined?1:0,now,now).run();
  }
  const saved=await auth.db!.prepare(`SELECT ${columns} FROM bubbles WHERE id=? AND user_id=?`).bind(id,owner).first();
  return reply({bubble:{...saved,pa_defined:!!saved!.pa_defined}},body.id?200:201);
 }catch(e){if(e instanceof SyntaxError||e instanceof Error&&/参数|名称|备注|分类|地图|椭圆/.test(e.message))return reply({error:(e as Error).message},400);console.error('bubble save failed');return reply({error:'保存失败，请保留草稿并重试。'},500);}
}
export async function DELETE(request:Request){
 const auth=await authorize(request,true);if(auth.error)return auth.error;
 try{
  const body=await request.json() as {id:string;revision:number;profile_id:string};
  if(body.profile_id!==auth.user!.id)return reply({error:'当前用户名已切换，请刷新页面后重试。'},409);
  if(typeof body.id!=='string'||!Number.isInteger(body.revision))return reply({error:'删除参数无效。'},400);
  const result=await auth.db!.prepare('DELETE FROM bubbles WHERE id=? AND user_id=? AND revision=?').bind(body.id,auth.user!.id,body.revision).run();
  if(!result.meta.changes)return reply({error:'记录已更新或不存在，请重新载入。'},409);
  return reply({ok:true});
 }catch{return reply({error:'删除失败，请重试。'},500);}
}
