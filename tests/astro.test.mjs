import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pixelToSky,skyToPixel,ellipseSky,skyEllipseToGeometry,boundary,ds9Angle} from '../lib/astro.ts';
import {imageToScreen,screenToImage} from '../lib/renderer.ts';
import {normalized,colorAt,PALETTES} from '../lib/colors.ts';
import meta from '../public/map/metadata.json' with {type:'json'};
import bundledMeta from '../lib/map-metadata.json' with {type:'json'};
import cases from './wcs-reference.json' with {type:'json'};
import ellipses from './ellipse-astropy-reference.json' with {type:'json'};
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
test('TAN pixel and ICRS agree with independent Astropy reference at centre and corners',()=>{
 assert.deepEqual(bundledMeta,meta);
 for(const c of cases){const p={x:c.pixel[0],y:c.pixel[1]},s=pixelToSky(p,meta);near(s.ra,c.sky[0],1e-10);near(s.dec,c.sky[1],1e-10);const q=skyToPixel(s,meta);near(p.x,q.x);near(p.y,q.y);}
});
test('ellipse local angular sizes and north-through-east PA recover requested sky ellipses',()=>{
 for(const c of cases)for(const pa of [0,17,38,90,145,179.9]){
  const g=skyEllipseToGeometry(c.sky[0],c.sky[1],120,35,pa,meta),s=ellipseSky(g,meta);
  near(s.ra,c.sky[0],1e-10);near(s.dec,c.sky[1],1e-10);near(s.a_arcsec,120,2e-5);near(s.b_arcsec,35,2e-5);near(Math.min(Math.abs(s.pa_deg-pa),180-Math.abs(s.pa_deg-pa)),0,2e-5);
 }
});
test('ellipse sky axes and PA agree with independent Astropy spherical offsets',()=>{
 for(const c of ellipses){const s=ellipseSky(c.geometry,meta);near(s.a_arcsec,c.a_arcsec,3e-5);near(s.b_arcsec,c.b_arcsec,3e-5);near(Math.min(Math.abs(s.pa_deg-c.pa_deg),180-Math.abs(s.pa_deg-c.pa_deg)),0,3e-5);}
});
test('view rotation, zoom and pan preserve original image geometry',()=>{
 for(const rotation of [-Math.PI,-2.234,0,.5,Math.PI])for(const scale of [.1,1,12]){
  const v={center:{x:2300,y:500},scale,rotation},p={x:2555.123,y:432.765},s=imageToScreen(p,v,1234,777),q=screenToImage(s,v,1234,777);near(q.x,p.x,1e-9);near(q.y,p.y,1e-9);
 }
 const at={x:meta.crpix[0]-1,y:meta.crpix[1]-1},n=skyToPixel({ra:meta.crval[0],dec:meta.crval[1]+.01},meta),v={center:at,scale:1,rotation:(-90-meta.display_pa_deg)*Math.PI/180};
 const p=imageToScreen(n,v,800,600);near(p.x,400,1e-7);assert.ok(p.y<300);
});
test('exact boundary retains 96 ICRS points independent of visual stretches',()=>{
 const g={x:meta.crpix[0]-1,y:meta.crpix[1]-1,rx:60,ry:20,theta:.7},b=boundary(g,meta);assert.equal(b.length,96);for(const p of b)assert.ok(p[0]>0&&p[1]>0);
 const s=ellipseSky(g,meta);near(s.a_arcsec,96,1e-5);near(s.b_arcsec,32,1e-5);
});
test('linear, log1p and histogram mappings are bounded, monotone and normalized within chosen limits',()=>{
 for(const stretch of ['linear','log','hist'])for(const [min,max] of [[0,4],[.59,2.02],[-1,8]]){
  const d={min,max,stretch,logStrength:100,palette:'turbo',reverse:false};near(normalized(min,d,meta),0);near(normalized(max,d,meta),1);let last=-1;
  for(let i=0;i<=1000;i++){const t=normalized(min+(max-min)*i/1000,d,meta);assert.ok(t>=last-1e-12&&t>=0&&t<=1);last=t;}
 }
 for(const palette of Object.keys(PALETTES)){assert.deepEqual(colorAt(0,palette),colorAt(1,palette,true));for(const t of [0,.25,.5,.99,1])assert.ok(colorAt(t,palette).every(x=>Number.isInteger(x)&&x>=0&&x<=255));}
});
test('DS9 sky angle follows Astropy regions PA plus 90 degree convention',()=>{near(ds9Angle(0),90);near(ds9Angle(90),0);near(ds9Angle(38),128);});
