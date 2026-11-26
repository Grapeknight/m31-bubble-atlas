import type {Bubble} from './bubbles';
import type {MapMeta} from './astro';

export type GalaxyGeometry={distance_kpc:number;inclination_deg:number;pa_deg:number};
export const DEFAULT_GALAXY:GalaxyGeometry={distance_kpc:780,inclination_deg:77,pa_deg:38};
export const GALAXY_SOURCE='https://arxiv.org/abs/2401.01517';
export type CatalogBubble=Bubble&{observer_id:string;observer_name:string};
export type SizeMetrics={major_pc:number;minor_pc:number;equivalent_diameter_pc:number;area_pc2:number;axis_ratio:number};
export type MeasuredBubble=CatalogBubble&{projected:SizeMetrics;disk:SizeMetrics;galactocentric_kpc:number;disk_x_kpc:number;disk_y_kpc:number};
const RAD=Math.PI/180;
export function validGalaxy(g:GalaxyGeometry){return Number.isFinite(g.distance_kpc)&&g.distance_kpc>0&&g.distance_kpc<=10000&&Number.isFinite(g.inclination_deg)&&g.inclination_deg>=0&&g.inclination_deg<=85&&Number.isFinite(g.pa_deg)&&g.pa_deg>=0&&g.pa_deg<180;}

/** SVD semi-axes of a 2x2 ellipse matrix. Inputs in pc; reported sizes are diameters. */
function sizes(u:number[],v:number[]):SizeMetrics{
 const xx=u[0]**2+v[0]**2,yy=u[1]**2+v[1]**2,xy=u[0]*u[1]+v[0]*v[1];
 const lmax=(xx+yy+Math.hypot(xx-yy,2*xy))/2;
 // det/lmax avoids subtractive cancellation for highly elongated ellipses.
 const a=Math.sqrt(lmax),b=Math.abs(u[0]*v[1]-u[1]*v[0])/a;
 return {major_pc:2*a,minor_pc:2*b,equivalent_diameter_pc:2*Math.sqrt(a*b),area_pc2:Math.PI*a*b,axis_ratio:b/a};
}

/** Fixed-distance, parallel-projection thin-disk estimate in the original centre TAN plane.
 * Rotate east/north into galaxy major/minor axes, then stretch ONLY the minor
 * direction by sec(i). Transform the entire ellipse, not just an angular radius.
 * These are conditional disk estimates, not 3D sizes of spherical cavities.
 */
export function measureBubble(b:CatalogBubble,m:MapMeta,g:GalaxyGeometry):MeasuredBubble|null{
 if(!validGalaxy(g))throw new Error('距离必须为正数，倾角为 0–85°，盘面 PA 为 0–180°（不含 180°）。');
 if(b.map_id!==m.id||![b.x,b.y,b.rx,b.ry,b.theta].every(Number.isFinite)||b.rx<=0||b.ry<=0)return null;
 const k=g.distance_kpc*1000*RAD,ct=Math.cos(b.theta),st=Math.sin(b.theta),cd=m.cd;
 const east=(x:number,y:number)=>(cd[0][0]*x+cd[0][1]*y)*k;
 const north=(x:number,y:number)=>(cd[1][0]*x+cd[1][1]*y)*k;
 const u=[east(ct*b.rx,st*b.rx),north(ct*b.rx,st*b.rx)];
 const v=[east(-st*b.ry,ct*b.ry),north(-st*b.ry,ct*b.ry)];
 const s=Math.sin(g.pa_deg*RAD),c=Math.cos(g.pa_deg*RAD),ci=Math.cos(g.inclination_deg*RAD);
 const disk=(p:number[])=>[s*p[0]+c*p[1],(c*p[0]-s*p[1])/ci];
 const delta=[b.x+1-m.crpix[0],b.y+1-m.crpix[1]],center=disk([east(delta[0],delta[1]),north(delta[0],delta[1])]);
 const projected=sizes(u,v),deprojected=sizes(disk(u),disk(v));
 if(!Object.values(projected).every(Number.isFinite)||!Object.values(deprojected).every(Number.isFinite))return null;
 return {...b,projected,disk:deprojected,galactocentric_kpc:Math.hypot(...center)/1000,disk_x_kpc:center[0]/1000,disk_y_kpc:center[1]/1000};
}
export function quantile(values:number[],p:number):number|null{
 if(!values.length)return null;
 const s=[...values].sort((a,b)=>a-b),x=Math.max(0,Math.min(1,p))*(s.length-1),i=Math.floor(x);
 return s[i]+(s[Math.min(s.length-1,i+1)]-s[i])*(x-i);
}
export function histogram(values:number[],bins:number,max?:number){
 const upper=max??values.reduce((a,b)=>Math.max(a,b),0),high=upper>0?upper:1,count=Math.max(1,Math.floor(bins));
 const result=Array.from({length:count},(_,i)=>({lo:i/count*high,hi:(i+1)/count*high,count:0}));
 for(const v of values)if(Number.isFinite(v)&&v>=0&&v<=high)result[Math.min(count-1,Math.floor(v/high*count))].count++;
 return result;
}
