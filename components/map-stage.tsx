'use client';
import {useEffect,useRef,useState,forwardRef,useImperativeHandle} from 'react';
import {MapRenderer,imageToScreen,screenToImage,type View} from '../lib/renderer';
import {pixelToSky,skyToPixel,ellipsePoint,type MapMeta,type Point,type Geometry} from '../lib/astro';
import type {Display} from '../lib/colors';
import type {Bubble,Draft} from '../lib/bubbles';
import {Plus,Minus,Maximize,Compass,LoaderCircle,AlertTriangle} from 'lucide-react';
export type StageAPI={fit:()=>void;focus:(p:Point)=>void;zoom:(factor:number)=>void;center:()=>Point;snapshot:()=>string|null};
type Props={meta:MapMeta;display:Display;items:Bubble[];draft:Draft|null;visible:boolean;labels:boolean;grid:boolean;rotation:number;readOnly:boolean;tool:'select'|'pan'|'draw';onPick:(b:Bubble)=>boolean;onNew:(g:Geometry)=>boolean;onChange:(g:Geometry)=>void;onGesture:(d?:Draft)=>void;onCursor:(p:(Point&{av:number|null;resolution:number|null})|null)=>void;onZoom:(s:number)=>void;onReady:()=>void};
type Drag={type:string;start:Point;imageStart:Point;view:View;geometry:Geometry|null};
const Stage=forwardRef<StageAPI,Props>(function Stage(p,ref){
 const stage=useRef<HTMLDivElement>(null),base=useRef<HTMLCanvasElement>(null),fallback=useRef<HTMLCanvasElement>(null),renderer=useRef<MapRenderer|null>(null),drag=useRef<Drag|null>(null),latest=useRef(p);
 latest.current=p;
 const [size,setSize]=useState({w:800,h:600}),[view,setView]=useState<View>({center:{x:p.meta.width/2,y:p.meta.height/2},scale:.15,rotation:p.rotation}),viewRef=useRef(view);viewRef.current=view;
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[fallbackMode,setFallbackMode]=useState(false),[hover,setHover]=useState<Point|null>(null);
 const fit=()=>{const rot=viewRef.current.rotation,c=Math.abs(Math.cos(rot)),s=Math.abs(Math.sin(rot)),w=p.meta.width*c+p.meta.height*s,h=p.meta.width*s+p.meta.height*c;setView({center:{x:(p.meta.width-1)/2,y:(p.meta.height-1)/2},scale:Math.min((size.w-64)/w,(size.h-112)/h),rotation:rot});};
 const zoomAt=(factor:number,anchor:Point)=>setView(v=>{const before=screenToImage(anchor,v,size.w,size.h),nv={...v,scale:Math.max(.04,Math.min(24,v.scale*factor))},after=screenToImage(anchor,nv,size.w,size.h);return {...nv,center:{x:nv.center.x+before.x-after.x,y:nv.center.y+before.y-after.y}};});
 useImperativeHandle(ref,()=>({fit,focus:pos=>setView(v=>({...v,center:pos,scale:Math.max(v.scale,.85)})),zoom:f=>zoomAt(f,{x:size.w/2,y:size.h/2}),center:()=>viewRef.current.center,snapshot:()=>{
  if(loading||error)return null;const c=document.createElement('canvas');c.width=size.w*2;c.height=size.h*2;const ctx=c.getContext('2d')!;ctx.fillStyle='#0b1018';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(fallbackMode?fallback.current!:base.current!,0,0,c.width,c.height);ctx.scale(2,2);if(p.visible){for(const b of p.items){const pos=imageToScreen(b,view,size.w,size.h);ctx.save();ctx.translate(pos.x,pos.y);ctx.rotate(b.theta+view.rotation);ctx.strokeStyle='#000000';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,b.rx*view.scale,b.ry*view.scale,0,0,Math.PI*2);ctx.stroke();ctx.restore();if(p.labels&&b.id===p.draft?.id){ctx.fillStyle='#d7fff6';ctx.font='12px sans-serif';ctx.fillText(b.name,pos.x+8,pos.y-8);}}}ctx.fillStyle='#c0cbd8';ctx.font='12px sans-serif';ctx.fillText('M31 Bubble Atlas · '+p.display.stretch+' · Aᵥ '+p.display.min+'–'+p.display.max+' mag',20,size.h-20);return c.toDataURL('image/png');
 }}));
 useEffect(()=>{const el=stage.current!;const observer=new ResizeObserver(e=>{const r=e[0].contentRect;setSize({w:r.width,h:r.height});});observer.observe(el);return()=>observer.disconnect();},[]);
 useEffect(()=>{fit();},[size.w,size.h]); // fit when the panel layout changes
 useEffect(()=>{setView(v=>({...v,rotation:p.rotation}));},[p.rotation]);
 useEffect(()=>{let alive=true;const r=new MapRenderer(base.current!,p.meta);renderer.current=r;r.load().then(()=>{if(alive){setFallbackMode(!r.gl);setLoading(false);latest.current.onReady();}}).catch((error)=>{console.error('Map renderer:',error);if(alive){setLoading(false);setError('地图加载失败，请检查连接并刷新页面。');}});return()=>{alive=false;r.destroy();};},[p.meta.id]);
 useEffect(()=>{if(loading)return;const r=renderer.current;if(!r)return;const dpr=Math.min(window.devicePixelRatio||1,2);r.render(view,p.display,size.w,size.h,dpr);if(!r.gl)r.drawFallback(fallback.current!,view,size.w,size.h,dpr);p.onZoom(view.scale);},[loading,view,p.display,size,fallbackMode]);
 useEffect(()=>{const el=stage.current!;const wheel=(e:WheelEvent)=>{e.preventDefault();const box=el.getBoundingClientRect();zoomAt(Math.exp(-e.deltaY*.0015),{x:e.clientX-box.left,y:e.clientY-box.top});};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[size]);
 const point=(e:React.PointerEvent)=>{const r=stage.current!.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
 function down(e:React.PointerEvent){
  if(loading||error||e.button>1||(e.target as HTMLElement).closest('button'))return;
  const start=point(e),im=screenToImage(start,view,size.w,size.h),target=e.target as HTMLElement;
  let type='pan',g:Geometry|null=null;
  if(e.button===1||p.tool==='pan'||e.altKey)type='pan';
  else if(p.tool==='draw'){
   if(im.x<0||im.y<0||im.x>=p.meta.width||im.y>=p.meta.height)return;
   g={x:im.x,y:im.y,rx:30/view.scale,ry:30/view.scale,theta:0};if(!p.onNew(g))return;type='draw';
  }else if(target.getAttribute('data-handle')&&p.draft){type=target.getAttribute('data-handle')!;g={...p.draft};p.onGesture();}
  else if(target.closest('[data-bubble]')){const id=target.closest('[data-bubble]')!.getAttribute('data-bubble');const b=p.items.find(b=>b.id===id);if(b){if(!p.onPick(b))return;g={...b};if(p.draft?.id===id)g={...p.draft};type='move';p.onGesture({id:b.id,revision:b.revision,x:b.x,y:b.y,rx:b.rx,ry:b.ry,theta:b.theta,name:b.name,notes:b.notes,confidence:b.confidence});}}
  else if(target.closest('[data-draft]')&&p.draft){g={...p.draft};type='move';p.onGesture();}
  if(p.readOnly&&type!=='pan')return;
  drag.current={type,start,imageStart:im,view:{...view},geometry:g};stage.current!.setPointerCapture(e.pointerId);e.preventDefault();
 }
 function move(e:React.PointerEvent){
  const s=point(e),im=screenToImage(s,view,size.w,size.h),sample=renderer.current?.sample(im);setHover(s);p.onCursor({...im,av:sample?.av??null,resolution:sample?.resolution??null});
  const d=drag.current;if(!d)return;
  if(d.type==='pan'){const a=screenToImage(d.start,d.view,size.w,size.h),b=screenToImage(s,d.view,size.w,size.h);setView({...d.view,center:{x:d.view.center.x+a.x-b.x,y:d.view.center.y+a.y-b.y}});return;}
  const g=d.geometry!;let next={...g};
  if(d.type==='move'){next.x=Math.max(0,Math.min(p.meta.width-1,g.x+im.x-d.imageStart.x));next.y=Math.max(0,Math.min(p.meta.height-1,g.y+im.y-d.imageStart.y));}
  else if(d.type==='draw'){const r=Math.hypot(im.x-g.x,im.y-g.y);next.rx=next.ry=Math.max(1,Math.min(2000,r));}
  else if(d.type==='rotate')next.theta=Math.atan2(im.y-g.y,im.x-g.x)+Math.PI/2;
  else{const dx=im.x-g.x,dy=im.y-g.y,c=Math.cos(g.theta),s=Math.sin(g.theta),x=dx*c+dy*s,y=-dx*s+dy*c;if(d.type==='x')next.rx=Math.max(.5,Math.min(2000,Math.abs(x)));if(d.type==='y')next.ry=Math.max(.5,Math.min(2000,Math.abs(y)));if(d.type==='size'){const k=Math.max(.5,Math.hypot(x,y))/Math.hypot(g.rx,g.ry);next.rx=Math.max(.5,Math.min(2000,g.rx*k));next.ry=Math.max(.5,Math.min(2000,g.ry*k));}}
  p.onChange(next);
 }
 const screen=(p:Point)=>imageToScreen(p,view,size.w,size.h);
 const renderEllipse=(b:Geometry,key:string,selected=false)=>{const pos=screen(b);return <g key={key} data-bubble={selected?undefined:key} data-draft={selected?'true':undefined} className={selected?'ellipse selected':'ellipse'}><ellipse cx={pos.x} cy={pos.y} rx={b.rx*view.scale} ry={b.ry*view.scale} transform={`rotate(${(b.theta+view.rotation)*180/Math.PI} ${pos.x} ${pos.y})`} /><path d={`M${pos.x-4},${pos.y}h8 M${pos.x},${pos.y-4}v8`} className="ellipse-center" />{p.labels&&selected&&<text x={pos.x+10} y={pos.y-10}>{selected?p.draft?.name:p.items.find(x=>x.id===key)?.name}</text>}</g>;};
 const handles=p.draft?(['x','y','rotate','size'] as const).map(kind=>{
  const g=p.draft!,basePoint=kind==='x'?ellipsePoint(g,0):kind==='y'?ellipsePoint(g,Math.PI/2):kind==='size'?{x:g.x+g.rx*Math.cos(g.theta)-g.ry*Math.sin(g.theta),y:g.y+g.rx*Math.sin(g.theta)+g.ry*Math.cos(g.theta)}: {x:g.x+(g.ry+30/view.scale)*Math.sin(g.theta),y:g.y-(g.ry+30/view.scale)*Math.cos(g.theta)},pt=screen(basePoint);return <g key={kind}>{kind==='rotate'&&<line className="handle-link" x1={screen(ellipsePoint(g,-Math.PI/2)).x} y1={screen(ellipsePoint(g,-Math.PI/2)).y} x2={pt.x} y2={pt.y}/>}{kind==='rotate'?<circle data-handle={kind} className="handle handle-rotate" cx={pt.x} cy={pt.y} r={6}><title>旋转</title></circle>:<rect data-handle={kind} className={`handle handle-${kind}`} x={pt.x-5} y={pt.y-5} width={10} height={10} rx={1.5}><title>{kind==='size'?'等比缩放':'拉伸半轴'}</title></rect>}</g>;
 }):null;
 const scaleArcsec=[1,5,10,30,60,120,300,600,1200,1800,3600].reduce((best,v)=>Math.abs(v/p.meta.sampling_arcsec*view.scale-70)<Math.abs(best/p.meta.sampling_arcsec*view.scale-70)?v:best,60);
 const origin=screen({x:p.meta.crpix[0]-1,y:p.meta.crpix[1]-1}),north=screen(skyToPixel({ra:p.meta.crval[0],dec:p.meta.crval[1]+.01},p.meta)),east=screen(skyToPixel({ra:p.meta.crval[0]+.01,dec:p.meta.crval[1]},p.meta));
 const compass=(q:Point)=>{const a=Math.atan2(q.y-origin.y,q.x-origin.x);return {x:Math.cos(a)*24,y:Math.sin(a)*24};},n=compass(north),e=compass(east);
 return <div ref={stage} className={`map-stage tool-${p.tool}`} onPointerDown={down} onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onPointerLeave={()=>{setHover(null);p.onCursor(null);}}>
  <canvas ref={base} className="map-canvas" aria-label="M31 消光图" style={{display:fallbackMode?'none':undefined}}/><canvas ref={fallback} className="map-canvas" style={{display:fallbackMode?'block':'none'}}/>
  <svg className="map-overlay" width={size.w} height={size.h} aria-label="气泡椭圆标注层">
   {p.grid&&<g className="sky-grid">{[10,10.25,10.5,10.75,11,11.25,11.5,11.75].map(ra=>{const a=screen(skyToPixel({ra,dec:39.5},p.meta)),b=screen(skyToPixel({ra,dec:43},p.meta));return <g key={'a'+ra}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y}/></g>;})}{[40.5,40.75,41,41.25,41.5,41.75,42,42.25].map(dec=>{const pts=Array.from({length:40},(_,i)=>screen(skyToPixel({ra:9.5+i/39*3,dec},p.meta)));return <polyline key={dec} points={pts.map(q=>`${q.x},${q.y}`).join(' ')}/>;})}</g>}
   {p.visible&&p.items.filter(b=>b.id!==p.draft?.id).map(b=>renderEllipse(b,b.id))}
   {p.visible&&p.draft&&<>{renderEllipse(p.draft,'draft',true)}{!p.readOnly&&handles}</>}
   {hover&&p.tool==='draw'&&<path className="draw-cross" d={`M${hover.x-12},${hover.y}h24 M${hover.x},${hover.y-12}v24`}/>}
  </svg>
  <div className="map-caption"><span className="live-dot"/> PHAT / PHAST <span>·</span> Aᵥ 消光图</div>
  <div className="map-view-label">{Math.abs(p.rotation)<.001?'长轴水平':'旋转视图'} <span>ICRS / TAN</span></div>
  <div className="map-controls"><button title="放大" onClick={()=>zoomAt(1.5,{x:size.w/2,y:size.h/2})}><Plus size={17}/></button><button title="缩小" onClick={()=>zoomAt(1/1.5,{x:size.w/2,y:size.h/2})}><Minus size={17}/></button><span/><button title="适应窗口 (F)" onClick={fit}><Maximize size={16}/></button></div>
  <svg className="compass" width="86" height="86" viewBox="-43 -43 86 86"><circle r="32"/><line x1="0" y1="0" x2={n.x.toFixed(4)} y2={n.y.toFixed(4)}/><line x1="0" y1="0" x2={e.x.toFixed(4)} y2={e.y.toFixed(4)}/><text x={(n.x*1.45).toFixed(4)} y={(n.y*1.45+3).toFixed(4)}>N</text><text x={(e.x*1.45).toFixed(4)} y={(e.y*1.45+3).toFixed(4)}>E</text><circle r="2" className="compass-dot"/></svg>
  <div className="scale-bar"><span style={{width:scaleArcsec/p.meta.sampling_arcsec*view.scale}}/><label>{scaleArcsec>=60?scaleArcsec/60+'′':scaleArcsec+'″'}</label></div>
  {loading&&<div className="map-loading"><LoaderCircle size={23} className="spin"/><b>正在加载原始消光图</b><span>准备数值纹理与天球坐标…</span></div>}
  {error&&<div className="map-loading"><AlertTriangle/><b>{error}</b><button onClick={()=>location.reload()}>重新加载</button></div>}
 </div>;
});
export default Stage;
