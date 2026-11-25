import type {MapMeta} from './astro';
export type Stretch='linear'|'log'|'hist';
export type Display={min:number;max:number;stretch:Stretch;palette:string;reverse:boolean;logStrength:number};
export const PALETTES:Record<string,string[]>={
 inferno:['#000004','#1b0c41','#4a0c6b','#781c6d','#a52c60','#cf4446','#ed6925','#fb9b06','#f7d13d','#fcffa4'],
 viridis:['#440154','#482878','#3e4989','#31688e','#26828e','#1f9e89','#35b779','#6ece58','#b5de2b','#fde725'],
 magma:['#000004','#180f3d','#440f76','#721f81','#9e2f7f','#cd4071','#f1605d','#fd9668','#feca8d','#fcfdbf'],
 turbo:['#30123b','#4145ab','#4675ed','#39a2fc','#1bcfd4','#24eca6','#61fc6c','#a4fc3c','#d5e72e','#f7c735','#fe9b2d','#f36315','#d93806','#a91601','#7a0403'],
 jet:['#000080','#0000ff','#0080ff','#00ffff','#80ff80','#ffff00','#ff8000','#ff0000','#800000'],
 gray:['#080b10','#ffffff'],
};
export const clamp=(v:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
export function colorAt(t:number,palette:string,reverse=false){
 const p=PALETTES[palette]||PALETTES.inferno,x=clamp(reverse?1-t:t)*(p.length-1),i=Math.min(p.length-2,Math.floor(x)),f=x-i;
 const a=p[i].slice(1).match(/../g)!.map(x=>parseInt(x,16)),b=p[i+1].slice(1).match(/../g)!.map(x=>parseInt(x,16));
 return a.map((v,j)=>Math.round(v+(b[j]-v)*f));
}
export function cdfAt(v:number,m:MapMeta){
 const h=m.histogram,q=clamp((v-h.min)/(h.max-h.min))*h.bins,i=Math.min(h.bins-1,Math.floor(q));
 return h.cdf[i]+(h.cdf[i+1]-h.cdf[i])*(q-i);
}
export function normalized(v:number,d:Display,m:MapMeta){
 const t=clamp((v-d.min)/(d.max-d.min));
 if(d.stretch==='log')return Math.log1p(d.logStrength*t)/Math.log1p(d.logStrength);
 if(d.stretch==='hist'){const a=cdfAt(d.min,m),b=cdfAt(d.max,m);return b>a?clamp((cdfAt(v,m)-a)/(b-a)):t;}
 return t;
}
export function legendGradient(d:Display,m:MapMeta){
 return `linear-gradient(to right,${Array.from({length:65},(_,i)=>{const c=colorAt(normalized(d.min+(d.max-d.min)*i/64,d,m),d.palette,d.reverse);return `rgb(${c.join(',')}) ${i/64*100}%`;}).join(',')})`;
}
