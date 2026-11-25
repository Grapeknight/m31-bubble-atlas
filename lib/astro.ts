/** FITS pixel centres are 1-based; browser geometry uses 0-based centres. */
export type Point={x:number;y:number};
export type Geometry={x:number;y:number;rx:number;ry:number;theta:number};
export type MapMeta={
 id:string;width:number;height:number;crval:number[];crpix:number[];cd:number[][];
 sampling_arcsec:number;display_pa_deg:number;av_min:number;av_max:number;
 percentiles:number[];histogram:{min:number;max:number;bins:number;counts:number[];cdf:number[]};
 source_sha256:string;source_url:string;paper_url:string;
};
export type Sky={ra:number;dec:number};
const R=Math.PI/180,AS=180/Math.PI*3600;
export const mod=(v:number,n:number)=>((v%n)+n)%n;
export function pixelToSky(p:Point,m:MapMeta):Sky{
 const dx=p.x+1-m.crpix[0],dy=p.y+1-m.crpix[1];
 const e=(m.cd[0][0]*dx+m.cd[0][1]*dy)*R,n=(m.cd[1][0]*dx+m.cd[1][1]*dy)*R;
 const d0=m.crval[1]*R,a0=m.crval[0]*R,q=Math.cos(d0)-n*Math.sin(d0);
 return {ra:mod((a0+Math.atan2(e,q))/R,360),dec:Math.atan2(Math.sin(d0)+n*Math.cos(d0),Math.hypot(q,e))/R};
}
export function skyToPixel(s:Sky,m:MapMeta):Point{
 const a=(s.ra-m.crval[0])*R,d=s.dec*R,d0=m.crval[1]*R;
 const den=Math.sin(d0)*Math.sin(d)+Math.cos(d0)*Math.cos(d)*Math.cos(a);
 if(den<=0)return {x:NaN,y:NaN};
 const e=Math.cos(d)*Math.sin(a)/den/R,n=(Math.cos(d0)*Math.sin(d)-Math.sin(d0)*Math.cos(d)*Math.cos(a))/den/R;
 const [[a1,b],[c,d1]]=m.cd,det=a1*d1-b*c;
 return {x:(d1*e-b*n)/det+m.crpix[0]-1,y:(a1*n-c*e)/det+m.crpix[1]-1};
}
function tangent(s:Sky,at:Sky):Point{
 const a=(s.ra-at.ra)*R,d=s.dec*R,d0=at.dec*R,den=Math.sin(d0)*Math.sin(d)+Math.cos(d0)*Math.cos(d)*Math.cos(a);
 return {x:AS*Math.cos(d)*Math.sin(a)/den,y:AS*(Math.cos(d0)*Math.sin(d)-Math.sin(d0)*Math.cos(d)*Math.cos(a))/den};
}
export function ellipseSky(g:Geometry,m:MapMeta){
 const at=pixelToSky(g,m),xp=tangent(pixelToSky({x:g.x+.5,y:g.y},m),at),xm=tangent(pixelToSky({x:g.x-.5,y:g.y},m),at),yp=tangent(pixelToSky({x:g.x,y:g.y+.5},m),at),ym=tangent(pixelToSky({x:g.x,y:g.y-.5},m),at);
 const j=[[xp.x-xm.x,yp.x-ym.x],[xp.y-xm.y,yp.y-ym.y]],c=Math.cos(g.theta),s=Math.sin(g.theta);
 const ex=(j[0][0]*c+j[0][1]*s)*g.rx,nx=(j[1][0]*c+j[1][1]*s)*g.rx,ey=(-j[0][0]*s+j[0][1]*c)*g.ry,ny=(-j[1][0]*s+j[1][1]*c)*g.ry;
 const ee=ex*ex+ey*ey,nn=nx*nx+ny*ny,en=ex*nx+ey*ny,root=Math.hypot(ee-nn,2*en),l1=Math.max(0,(ee+nn+root)/2),l2=Math.max(0,(ee+nn-root)/2),direction=.5*Math.atan2(2*en,ee-nn);
 return {...at,a_arcsec:Math.sqrt(l1),b_arcsec:Math.sqrt(l2),pa_deg:mod(90-direction/R,180),pa_defined:root>Math.max(l1,1)*1e-6};
}
export function ellipsePoint(g:Geometry,t:number):Point{
 const x=g.rx*Math.cos(t),y=g.ry*Math.sin(t),c=Math.cos(g.theta),s=Math.sin(g.theta);
 return {x:g.x+x*c-y*s,y:g.y+x*s+y*c};
}
export function boundary(g:Geometry,m:MapMeta,n=96):number[][]{
 return Array.from({length:n},(_,i)=>{const s=pixelToSky(ellipsePoint(g,i*2*Math.PI/n),m);return [s.ra,s.dec];});
}
export function skyEllipseToGeometry(ra:number,dec:number,a:number,b:number,pa:number,m:MapMeta):Geometry{
 const p=skyToPixel({ra,dec},m),d=dec*R,ang=pa*R;
 function destination(e:number,n:number){const er=e/AS,nr=n/AS,q=Math.cos(d)-nr*Math.sin(d);return skyToPixel({ra:mod(ra+Math.atan2(er,q)/R,360),dec:Math.atan2(Math.sin(d)+nr*Math.cos(d),Math.hypot(q,er))/R},m);}
 const ep=destination(.5,0),em=destination(-.5,0),np=destination(0,.5),nm=destination(0,-.5),e={x:ep.x-em.x,y:ep.y-em.y},n={x:np.x-nm.x,y:np.y-nm.y};
 const u={x:(e.x*Math.sin(ang)+n.x*Math.cos(ang))*a,y:(e.y*Math.sin(ang)+n.y*Math.cos(ang))*a},v={x:(e.x*Math.cos(ang)-n.x*Math.sin(ang))*b,y:(e.y*Math.cos(ang)-n.y*Math.sin(ang))*b};
 const xx=u.x*u.x+v.x*v.x,yy=u.y*u.y+v.y*v.y,xy=u.x*u.y+v.x*v.y,root=Math.hypot(xx-yy,2*xy);
 return {...p,rx:Math.sqrt((xx+yy+root)/2),ry:Math.sqrt(Math.max(0,(xx+yy-root)/2)),theta:.5*Math.atan2(2*xy,xx-yy)};
}
/** DS9 / regions sky ellipse angle uses PA + 90 degrees (modulo 180). */
export function ds9Angle(pa:number){return mod(pa+90,180);}
export function sexagesimal(s:Sky){
 const h=s.ra/15,hh=Math.floor(h),mm=Math.floor((h-hh)*60),ss=((h-hh)*60-mm)*60,d=Math.abs(s.dec),dd=Math.floor(d),dm=Math.floor((d-dd)*60),ds=((d-dd)*60-dm)*60;
 return `${String(hh).padStart(2,'0')}ʰ ${String(mm).padStart(2,'0')}ᵐ ${ss.toFixed(2)}ˢ · ${s.dec<0?'−':'+'}${dd}° ${String(dm).padStart(2,'0')}′ ${ds.toFixed(1)}″`;
}
