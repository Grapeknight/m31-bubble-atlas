import {env} from 'cloudflare:workers';
import {currentProfile} from '../../../lib/profiles';
import {canSeeCatalogueStats,normalizeConfidence} from '../../../lib/permissions';
const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','Vary':'Cookie'}});
export async function GET(request:Request){
 if(!env.DB)return reply({error:'数据库尚未就绪。'},503);
 const viewer=await currentProfile(request.headers.get('cookie'));
 if(!viewer)return reply({error:'请先选择标注用户名。'},401);
 const query=new URL(request.url).searchParams,scope=query.get('scope')||'current';
 if(!['current','all'].includes(scope))return reply({error:'参数无效。'},400);
 const owner=query.get('profile')||viewer.id;
 if(scope==='all'?viewer.role!=='advanced':!canSeeCatalogueStats(viewer,owner))return reply({error:'普通用户只能查看自己的统计图谱；全体及他人统计仅供高级用户使用。'},403);
 if(scope==='current'&&!await env.DB.prepare('SELECT id FROM profiles WHERE id=?').bind(owner).first())return reply({error:'该用户名不存在。'},404);
 const {results}=await env.DB.prepare(`SELECT b.*,p.id AS observer_id,p.name AS observer_name FROM bubbles b JOIN profiles p ON p.id=b.user_id ${scope==='current'?'WHERE b.user_id=?':''} ORDER BY b.created_at DESC,b.id`).bind(...(scope==='current'?[owner]:[])).all();
 return reply({records:results.map(({user_id,...b})=>({...b,pa_defined:!!b.pa_defined,confidence:normalizeConfidence(b.confidence as string)}))});
}
