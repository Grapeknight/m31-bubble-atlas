"""Reproject the original sparse Galactic HEALPix into a display-only TAN image.

PNG R/G encode round(A_V * 1000), 65535 means no coverage; B encodes
effective NSIDE. No interpolation, smoothing, deprojection or foreground removal.
The original FITS remains the scientific source of truth.
"""
from pathlib import Path
import os
import json
import hashlib
import argparse

os.environ.setdefault('MPLCONFIGDIR', '/tmp/m31-matplotlib')
import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from astropy.coordinates import SkyCoord
import astropy.units as u
import healpy as hp
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--fits', type=Path, default=ROOT.parent / 'data/M31_AV_map_PHAT_PHAST.fits')
    ap.add_argument('--step', type=float, default=1.6)
    ap.add_argument('--pa', type=float, default=38.0, help='Display orientation, not an inferred disk PA')
    args = ap.parse_args()
    out = ROOT / 'public/map'
    out.mkdir(parents=True, exist_ok=True)
    with fits.open(args.fits, checksum=True) as hdus:
        h = hdus[1].header
        assert h['COORDSYS'] == 'G' and h['ORDERING'].strip() == 'RING'
        assert hdus[1].verify_checksum() == 1
        tab = hdus[1].data
        order = np.argsort(tab['pix'])
        pix = np.asarray(tab['pix'][order], dtype=np.int64)
        av = np.asarray(tab['av'][order], dtype=np.float32)
        eff = np.asarray(tab['nside_eff'][order], dtype=np.int32)
        nside = int(h['NSIDE'])

    # Screen x follows a selectable approximate M31 long-axis direction.
    # Screen y increases downwards. CD carries the complete invertible transform.
    a = np.deg2rad(args.pa)
    cd = np.array([[np.sin(a), -np.cos(a)], [np.cos(a), np.sin(a)]]) * args.step / 3600
    w = WCS(naxis=2)
    w.wcs.ctype = ['RA---TAN', 'DEC--TAN']
    w.wcs.crval = [10.6847083, 41.26875]
    w.wcs.crpix = [1., 1.]
    w.wcs.cd = cd
    lo, hi = np.array([np.inf, np.inf]), np.array([-np.inf, -np.inf])
    for start in range(0, len(pix), 200_000):
        l, b = hp.pix2ang(nside, pix[start:start+200_000], lonlat=True)
        eq = SkyCoord(l=l*u.deg, b=b*u.deg, frame='galactic').icrs
        x, y = w.world_to_pixel(eq)
        lo = np.minimum(lo, [x.min(), y.min()])
        hi = np.maximum(hi, [x.max(), y.max()])
    lo, hi = np.floor(lo).astype(int)-12, np.ceil(hi).astype(int)+12
    w.wcs.crpix -= lo
    nx, ny = (hi-lo+1).tolist()
    rgb = np.zeros((ny, nx, 3), dtype=np.uint8)
    for y0 in range(0, ny, 64):
        yy, xx = np.mgrid[y0:min(y0+64, ny), :nx]
        gal = w.pixel_to_world(xx, yy).galactic
        ids = hp.ang2pix(nside, gal.l.deg, gal.b.deg, lonlat=True)
        idx = np.searchsorted(pix, ids)
        safe = np.minimum(idx, len(pix)-1)
        valid = (idx < len(pix)) & (pix[safe] == ids)
        q = np.full(ids.shape, 65535, dtype=np.uint16)
        q[valid] = np.rint(av[safe[valid]]*1000).astype(np.uint16)
        block = rgb[y0:y0+yy.shape[0]]
        block[..., 0], block[..., 1] = q >> 8, q & 255
        block[..., 2][valid] = np.log2(eff[safe[valid]] // 32768).astype(np.uint8)+1
        print(f'{min(y0+64, ny)}/{ny}', flush=True) if y0 % 640 == 0 else None
    Image.fromarray(rgb).save(out / 'av-packed.png', optimize=True)
    # Tiny overview is still packed scalar data, never a pre-coloured screenshot.
    Image.fromarray(rgb).resize((max(1,nx//4), max(1,ny//4)), Image.Resampling.NEAREST).save(out / 'overview-packed.png')
    bins = 8192
    hist, edges = np.histogram(av, bins=bins, range=(0, 8.192))
    cdf = np.cumsum(hist, dtype=np.float64)/hist.sum()
    cdf = np.concatenate(([0.], cdf))
    metadata = dict(
        id='m31-phat-phast-original-tan-v1', width=nx, height=ny,
        projection='TAN', frame='ICRS', crval=w.wcs.crval.tolist(),
        crpix=w.wcs.crpix.tolist(), cd=cd.tolist(),
        sampling_arcsec=args.step, display_pa_deg=args.pa,
        quantization_mag=0.001, missing_code=65535,
        source_sha256=hashlib.sha256(args.fits.read_bytes()).hexdigest(),
        source_file=args.fits.name, source_rows=len(pix),
        source_url='https://nadc.china-vo.org/res/r101847/',
        paper_url='https://arxiv.org/abs/2611.26952',
        av_min=float(av.min()), av_max=float(av.max()),
        percentiles=np.percentile(av, [1, 5, 50, 95, 99]).tolist(),
        histogram=dict(min=0, max=8.192, bins=bins, counts=hist.tolist(), cdf=cdf.tolist()),
        method='Containing original HEALPix cell. No interpolation. No deprojection.',
        effective_resolution_arcsec=[6.44, 3.22, 1.61],
        foreground_subtracted=False,
    )
    (out/'metadata.json').write_text(json.dumps(metadata, separators=(',', ':')))
    # Vite must import metadata outside public/; keep the module copy identical.
    (ROOT/'lib/map-metadata.json').write_text(json.dumps(metadata, separators=(',', ':')))
    # Reference cases independently checked against Astropy by the JS test suite.
    pts = np.array([[0,0], [nx/2, ny/2], [nx-1,ny-1], [w.wcs.crpix[0]-1,w.wcs.crpix[1]-1], [nx*.2,ny*.6]])
    sky = w.pixel_to_world(pts[:,0], pts[:,1])
    cases = [dict(pixel=p.tolist(), sky=[float(s.ra.deg),float(s.dec.deg)]) for p,s in zip(pts,sky)]
    (ROOT/'tests').mkdir(exist_ok=True)
    (ROOT/'tests/wcs-reference.json').write_text(json.dumps(cases, indent=2))
    # Independent spherical-offset reference for local semi-axes and sky PA.
    ellipse_cases = []
    for x, y in [(100., 100.), (w.wcs.crpix[0]-1, w.wcs.crpix[1]-1), (nx-282., ny-191.)]:
        for theta in [0., .3, 1.4, 2.9]:
            at = w.pixel_to_world(x, y)
            def offset(dx, dy):
                e, n = at.spherical_offsets_to(w.pixel_to_world(x+dx, y+dy))
                return np.array([e.to_value(u.arcsec), n.to_value(u.arcsec)])
            j = np.column_stack((offset(.5,0)-offset(-.5,0), offset(0,.5)-offset(0,-.5)))
            rot = np.array([[np.cos(theta),-np.sin(theta)],[np.sin(theta),np.cos(theta)]])
            mat = j @ rot @ np.diag([75.,19.])
            values, vectors = np.linalg.eigh(mat @ mat.T)
            a, b = np.sqrt(values)[::-1]
            v = vectors[:,-1]
            pa = np.rad2deg(np.arctan2(v[0],v[1])) % 180
            ellipse_cases.append(dict(geometry=dict(x=x,y=y,rx=75.,ry=19.,theta=theta),
                                      a_arcsec=float(a),b_arcsec=float(b),pa_deg=float(pa)))
    (ROOT/'tests/ellipse-astropy-reference.json').write_text(json.dumps(ellipse_cases,indent=2))
    print(json.dumps({k:v for k,v in metadata.items() if k != 'histogram'}, indent=2))


if __name__ == '__main__':
    main()
