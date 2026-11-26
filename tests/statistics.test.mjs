import {test} from 'node:test';
import assert from 'node:assert/strict';
import {measureBubble,histogram,quantile,validGalaxy,DEFAULT_GALAXY} from '../lib/statistics.ts';
import {skyEllipseToGeometry} from '../lib/astro.ts';
import meta from '../lib/map-metadata.json' with {type:'json'};
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
function bubble(a=100,b=30,pa=38){return {id:'test',name:'test',observer_id:'p1',observer_name:'test',map_id:meta.id,confidence:'silver',...skyEllipseToGeometry(...meta.crval,a,b,pa,meta)};}
const factor=780000*Math.PI/(180*3600);
test('projected full diameters convert arcseconds to parsecs; disk centre has R=0',()=>{
 const m=measureBubble(bubble(),meta,DEFAULT_GALAXY);near(m.projected.major_pc,200*factor,1e-5);near(m.projected.minor_pc,60*factor,1e-5);near(m.projected.equivalent_diameter_pc,2*Math.sqrt(3000)*factor,1e-5);near(m.galactocentric_kpc,0,1e-10);
});
test('face-on disk reproduces all projected sizes for arbitrary PA',()=>{
 for(const angle of [0,12,38,90,147,179]){const m=measureBubble(bubble(100,30,angle),meta,{distance_kpc:780,inclination_deg:0,pa_deg:87});for(const k of Object.keys(m.disk))near(m.disk[k],m.projected[k],1e-6);}
});
test('60 degree disk stretches minor-axis direction by two, not all axes',()=>{
 const major=measureBubble(bubble(100,30,38),meta,{distance_kpc:780,inclination_deg:60,pa_deg:38});near(major.disk.major_pc,200*factor,1e-5);near(major.disk.minor_pc,120*factor,1e-5);
 const minor=measureBubble(bubble(100,30,128),meta,{distance_kpc:780,inclination_deg:60,pa_deg:38});near(minor.disk.major_pc,400*factor,1e-5);near(minor.disk.minor_pc,60*factor,1e-5);
});
test('deprojection area and equivalent diameter obey determinant identities',()=>{
 for(const pa of [0,17,38,93,170])for(const inc of [0,35,60,77,85]){
  const m=measureBubble(bubble(100,30,pa),meta,{distance_kpc:780,inclination_deg:inc,pa_deg:38}),ci=Math.cos(inc*Math.PI/180);
  near(m.disk.area_pc2/m.projected.area_pc2,1/ci,1e-9);near(m.disk.equivalent_diameter_pc/m.projected.equivalent_diameter_pc,1/Math.sqrt(ci),1e-9);assert.ok(m.disk.axis_ratio>0&&m.disk.axis_ratio<=1);
 }
});
test('distance scales diameters and radius linearly, area quadratically',()=>{
 const b={...bubble(),x:meta.crpix[0]+100,y:meta.crpix[1]+70},a=measureBubble(b,meta,DEFAULT_GALAXY),d=measureBubble(b,meta,{...DEFAULT_GALAXY,distance_kpc:1560});near(d.disk.major_pc/a.disk.major_pc,2);near(d.disk.area_pc2/a.disk.area_pc2,4);near(d.galactocentric_kpc/a.galactocentric_kpc,2);
});
test('centre along galaxy minor axis is deprojected; screen ellipse axis swaps are invariant',()=>{
 const base={...bubble(),x:meta.crpix[0]-1,y:meta.crpix[1]-1+100},m=measureBubble(base,meta,{distance_kpc:780,inclination_deg:60,pa_deg:38});near(m.galactocentric_kpc,100*meta.sampling_arcsec*factor*2/1000,1e-8);
 const swapped=measureBubble({...base,rx:base.ry,ry:base.rx,theta:base.theta+Math.PI/2},meta,{distance_kpc:780,inclination_deg:60,pa_deg:38});near(m.disk.major_pc,swapped.disk.major_pc);near(m.disk.minor_pc,swapped.disk.minor_pc);
});
test('unknown map and invalid ellipse excluded; invalid galaxy parameters rejected',()=>{
 assert.equal(measureBubble({...bubble(),map_id:'other'},meta,DEFAULT_GALAXY),null);assert.equal(measureBubble({...bubble(),rx:-1},meta,DEFAULT_GALAXY),null);
 for(const g of [{...DEFAULT_GALAXY,inclination_deg:90},{...DEFAULT_GALAXY,distance_kpc:0},{...DEFAULT_GALAXY,pa_deg:180}]){assert.equal(validGalaxy(g),false);assert.throws(()=>measureBubble(bubble(),meta,g));}
});
test('empty, singleton and equal-valued distributions; last edge included',()=>{
 assert.equal(quantile([],.5),null);assert.equal(quantile([3],.5),3);assert.equal(quantile([4,1,2,3],.5),2.5);
 assert.equal(histogram([],10).reduce((n,b)=>n+b.count,0),0);assert.equal(histogram([5,5,5],5).at(-1).count,3);
 const h=histogram([0,2,4,6,8,10],5,10);assert.equal(h.reduce((n,b)=>n+b.count,0),6);assert.equal(h.at(-1).count,2);
});
