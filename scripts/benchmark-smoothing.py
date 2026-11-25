import os,time,signal,json,itertools
from pathlib import Path
os.environ.setdefault('MPLCONFIGDIR','/tmp/m31-matplotlib')
import numpy as np,healpy as hp
from scipy.spatial import cKDTree
from astropy.io import fits
from astropy.wcs import WCS
from PIL import Image
root=Path(__file__).resolve().parents[1];(root/'outputs').mkdir(exist_ok=True);start=time.perf_counter();report={'sigma_arcsec':3.0,'timeout_seconds':60,'method':'normalized Gaussian on sparse original HEALPix centres, spherical distances, 4 sigma support; no coarsening','native_nside':131072,'cutoff_sigma':4,'stages':{}}
def out(msg):print(msg,flush=True)
def timeout(*_):raise TimeoutError('60 second wall-time limit reached')
signal.signal(signal.SIGALRM,timeout);signal.alarm(60)
try:
 with fits.open(root.parent/'data/M31_AV_map_PHAT_PHAST.fits',memmap=True) as f:
  ids=np.array(f[1].data['pix'],dtype=np.int64);av=np.array(f[1].data['av'],dtype=np.float64)
 vectors=np.column_stack(hp.pix2vec(131072,ids,nest=False));tree=cKDTree(vectors);report['stages']['read_and_tree_seconds']=time.perf_counter()-start
 sigma=3/3600*np.pi/180;radius=2*np.sin(4*sigma/2);n=len(ids);smoothed=np.empty(n,dtype=np.float32);last=start
 for i in range(0,n,1024):
  pts=vectors[i:i+1024];neighbours=tree.query_ball_point(pts,radius,workers=2,return_sorted=False)
  lengths=np.fromiter(map(len,neighbours),dtype=np.int64,count=len(pts));idx=np.fromiter(itertools.chain.from_iterable(neighbours),dtype=np.int64,count=int(lengths.sum()));rows=np.repeat(np.arange(len(pts)),lengths)
  delta=vectors[idx]-pts[rows];chord=np.sqrt(np.einsum('ij,ij->i',delta,delta));angle=2*np.arcsin(np.minimum(1.,chord*.5));weight=np.exp(-.5*(angle/sigma)**2)
  den=np.bincount(rows,weights=weight,minlength=len(pts));num=np.bincount(rows,weights=weight*av[idx],minlength=len(pts));smoothed[i:i+len(pts)]=num/den
  report['processed_cells']=min(i+1024,n);report['total_cells']=n
  now=time.perf_counter()
  if now-last>=5:out(json.dumps({'elapsed_seconds':round(now-start,2),'processed_cells':report['processed_cells'],'fraction':round(report['processed_cells']/n,4)}));last=now
 report['stages']['through_smoothing_seconds']=time.perf_counter()-start
 # Reproject with the unchanged display WCS and the original missing-data mask.
 m=json.loads((root/'public/map/metadata.json').read_text());w=WCS(naxis=2);w.wcs.ctype=['RA---TAN','DEC--TAN'];w.wcs.crval=m['crval'];w.wcs.crpix=m['crpix'];w.wcs.cd=m['cd']
 order=np.argsort(ids);pix=ids[order];values=smoothed[order];nx,ny=m['width'],m['height'];rgb=np.zeros((ny,nx,3),dtype=np.uint8)
 for y0 in range(0,ny,64):
  yy,xx=np.mgrid[y0:min(ny,y0+64),:nx];gal=w.pixel_to_world(xx,yy).galactic;query=hp.ang2pix(131072,gal.l.deg,gal.b.deg,lonlat=True);idx=np.searchsorted(pix,query);safe=np.minimum(idx,len(pix)-1);valid=(idx<len(pix))&(pix[safe]==query);q=np.full(query.shape,65535,dtype=np.uint16);q[valid]=np.rint(values[safe[valid]]*1000).astype(np.uint16);block=rgb[y0:y0+len(yy)];block[...,0]=q>>8;block[...,1]=q&255;block[...,2][valid]=1
 Image.fromarray(rgb).save(root/'outputs/benchmark-sigma-3-packed.png',optimize=True)
 report.update(status='completed',elapsed_seconds=time.perf_counter()-start,value_range=[float(smoothed.min()),float(smoothed.max())])
except TimeoutError:
 report.update(status='timed_out',elapsed_seconds=time.perf_counter()-start)
finally:
 signal.alarm(0);(root/'outputs/smoothing-benchmark.json').write_text(json.dumps(report,indent=2));out(json.dumps(report))
