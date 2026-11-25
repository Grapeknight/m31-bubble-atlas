import {colorAt,cdfAt,normalized,type Display} from './colors';
import type {MapMeta,Point} from './astro';
export type View={center:Point;scale:number;rotation:number};
export const imageToScreen=(p:Point,v:View,w:number,h:number):Point=>{const x=(p.x-v.center.x)*v.scale,y=(p.y-v.center.y)*v.scale,c=Math.cos(v.rotation),s=Math.sin(v.rotation);return {x:w/2+x*c-y*s,y:h/2+x*s+y*c};};
export const screenToImage=(p:Point,v:View,w:number,h:number):Point=>{const x=(p.x-w/2)/v.scale,y=(p.y-h/2)/v.scale,c=Math.cos(v.rotation),s=Math.sin(v.rotation);return {x:v.center.x+x*c+y*s,y:v.center.y-x*s+y*c};};
export class MapRenderer{
 canvas:HTMLCanvasElement;meta:MapMeta;pixels:Uint8ClampedArray|null=null;gl:WebGLRenderingContext|null;program:WebGLProgram|null=null;textures:WebGLTexture[]=[];fallback:HTMLCanvasElement|null=null;lastColor='';
 constructor(canvas:HTMLCanvasElement,meta:MapMeta){this.canvas=canvas;this.meta=meta;this.gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:false,preserveDrawingBuffer:true});}
 async load(){
  const img=new Image();img.src='/map/av-packed.png';await img.decode();
  const tmp=document.createElement('canvas');tmp.width=img.width;tmp.height=img.height;const ctx=tmp.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(img,0,0);this.pixels=ctx.getImageData(0,0,img.width,img.height).data;
  const gl=this.gl;
  if(!gl||img.width>gl.getParameter(gl.MAX_TEXTURE_SIZE)){this.gl=null;this.fallback=tmp;return;}
  const vertex='attribute vec2 pos;void main(){gl_Position=vec4(pos,0.,1.);}';
  const fragment=`precision highp float;
  uniform sampler2D image;uniform sampler2D palette;uniform sampler2D histogram;
  uniform vec2 size;uniform vec2 viewport;uniform vec2 center;uniform float scale;uniform float angle;uniform float dpr;
  uniform float low;uniform float high;uniform float stretch;uniform float strength;uniform float cdfLow;uniform float cdfHigh;
  void main(){vec2 p=vec2(gl_FragCoord.x/dpr,viewport.y-gl_FragCoord.y/dpr)-viewport*.5;
   float c=cos(angle),s=sin(angle);vec2 q=vec2(c*p.x+s*p.y,-s*p.x+c*p.y)/scale+center;
   if(q.x<-.5||q.y<-.5||q.x>=size.x-.5||q.y>=size.y-.5){gl_FragColor=vec4(0.);return;}
   vec4 raw=texture2D(image,(q+.5)/size);float code=floor(raw.r*255.+.5)*256.+floor(raw.g*255.+.5);
   if(code>65534.){gl_FragColor=vec4(0.);return;}
   float value=code*.001;float t=clamp((value-low)/(high-low),0.,1.);
   if(stretch>.5&&stretch<1.5)t=log(1.+strength*t)/log(1.+strength);
   if(stretch>1.5&&cdfHigh>cdfLow){vec4 histColor=texture2D(histogram,vec2((clamp(value/8.192,0.,1.)*4095.+.5)/4096.,.5));float f=(floor(histColor.r*255.+.5)*256.+floor(histColor.g*255.+.5))/65535.;t=clamp((f-cdfLow)/(cdfHigh-cdfLow),0.,1.);}
   gl_FragColor=vec4(texture2D(palette,vec2((t*255.+.5)/256.,.5)).rgb,1.);
  }`;
  const compile=(type:number,src:string)=>{const sh=gl.createShader(type)!;gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(sh)||'着色器编译失败');return sh;};
  const p=gl.createProgram()!;gl.attachShader(p,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('显示程序初始化失败');this.program=p;gl.useProgram(p);
  const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(p,'pos');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  for(let i=0;i<3;i++){this.textures.push(gl.createTexture()!);gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,this.textures[i]);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.uniform1i(gl.getUniformLocation(p,['image','palette','histogram'][i]),i);}
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.textures[0]);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);
  const cdf=new Uint8Array(4096*4);for(let i=0;i<4096;i++){const q=Math.round(cdfAt(i/4095*8.192,this.meta)*65535);cdf[i*4]=q>>8;cdf[i*4+1]=q&255;cdf[i*4+3]=255;}
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,this.textures[2]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,4096,1,0,gl.RGBA,gl.UNSIGNED_BYTE,cdf);
 }
 sample(p:Point){const x=Math.round(p.x),y=Math.round(p.y);if(!this.pixels||x<0||y<0||x>=this.meta.width||y>=this.meta.height)return null;const i=(y*this.meta.width+x)*4,q=this.pixels[i]*256+this.pixels[i+1];return q===65535?null:{av:q/1000,resolution:[0,6.44,3.22,1.61][this.pixels[i+2]]};}
 render(v:View,d:Display,w:number,h:number,dpr:number){
  const canvas=this.canvas;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  const gl=this.gl,p=this.program;if(gl&&p){gl.viewport(0,0,canvas.width,canvas.height);gl.useProgram(p);
   const one=(n:string,x:number)=>gl.uniform1f(gl.getUniformLocation(p,n),x),two=(n:string,x:number,y:number)=>gl.uniform2f(gl.getUniformLocation(p,n),x,y);
   two('size',this.meta.width,this.meta.height);two('viewport',w,h);two('center',v.center.x,v.center.y);one('scale',v.scale);one('angle',v.rotation);one('dpr',dpr);one('low',d.min);one('high',d.max);one('strength',d.logStrength);one('stretch',{linear:0,log:1,hist:2}[d.stretch]);one('cdfLow',cdfAt(d.min,this.meta));one('cdfHigh',cdfAt(d.max,this.meta));
   const colors=new Uint8Array(1024);for(let i=0;i<256;i++){colors.set([...colorAt(i/255,d.palette,d.reverse),255],i*4);}gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.textures[1]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,256,1,0,gl.RGBA,gl.UNSIGNED_BYTE,colors);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  }else if(this.fallback&&this.pixels){
   const key=JSON.stringify(d);if(key!==this.lastColor){const a=new Uint8ClampedArray(this.pixels.length),lut=new Uint8ClampedArray(8193*4);for(let i=0;i<=8192;i++)lut.set([...colorAt(normalized(i/1000,d,this.meta),d.palette,d.reverse),255],i*4);for(let i=0;i<a.length;i+=4){const q=this.pixels[i]*256+this.pixels[i+1];if(q!==65535)a.set(lut.subarray(Math.min(q,8192)*4,Math.min(q,8192)*4+4),i);}this.fallback.getContext('2d')!.putImageData(new ImageData(a,this.meta.width,this.meta.height),0,0);this.lastColor=key;}
   // A canvas that obtained WebGL cannot switch context; a fallback canvas is overlaid by the component.
  }
 }
 drawFallback(target:HTMLCanvasElement,v:View,w:number,h:number,dpr:number){if(!this.fallback)return;target.width=w*dpr;target.height=h*dpr;const c=target.getContext('2d')!;c.scale(dpr,dpr);c.translate(w/2,h/2);c.rotate(v.rotation);c.scale(v.scale,v.scale);c.translate(-v.center.x-.5,-v.center.y-.5);c.imageSmoothingEnabled=false;c.drawImage(this.fallback,0,0);}
 destroy(){if(this.gl){this.textures.forEach(t=>this.gl!.deleteTexture(t));if(this.program)this.gl.deleteProgram(this.program);}this.pixels=null;}
}
