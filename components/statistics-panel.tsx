'use client';

import { useI18n } from './i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw, BarChart3, Info, ArrowUpRight } from 'lucide-react';
import type { Bubble } from '../lib/bubbles';
import type { MapMeta } from '../lib/astro';
import type { Profile } from '../lib/profiles';
import { DEFAULT_GALAXY, GALAXY_SOURCE, measureBubble, validGalaxy, quantile, histogram, type CatalogBubble, type MeasuredBubble, type GalaxyGeometry } from '../lib/statistics';
const fmt = (x: number | null, d = 1) => x === null ? '—' : x >= 10000 ? x.toExponential(2) : x.toLocaleString('en-US', {
  maximumFractionDigits: d
});
function saveFile(name: string, content: string, type: string) {
  const a = document.createElement('a'),
    url = URL.createObjectURL(new Blob([content], {
      type
    }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function chartDownload(svg: SVGSVGElement | null, name: string, caption: string) {
  if (!svg) return;
  const copy = svg.cloneNode(true) as SVGSVGElement,
    w = svg.viewBox.baseVal.width,
    h = svg.viewBox.baseVal.height;
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('width', String(w));
  copy.setAttribute('height', String(h + 30));
  copy.setAttribute('viewBox', `0 0 ${w} ${h + 30}`);
  copy.insertAdjacentHTML('afterbegin', '<rect width="100%" height="100%" fill="#111d28"/>');
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', '15');
  text.setAttribute('y', String(h + 21));
  text.setAttribute('fill', '#93adbf');
  text.setAttribute('font-size', '9');
  text.setAttribute('font-family', 'sans-serif');
  text.textContent = caption;
  copy.appendChild(text);
  saveFile(name + '.svg', new XMLSerializer().serializeToString(copy), 'image/svg+xml;charset=utf-8');
}
const W = 580,
  H = 300,
  L = 64,
  R = 22,
  T = 28,
  B = 55,
  PW = W - L - R,
  PH = H - T - B;
function Axes({
  xmax,
  ymax,
  xlabel,
  ylabel
}: {
  xmax: number;
  ymax: number;
  xlabel: string;
  ylabel: string;
}) {
  const {
    t: tr
  } = useI18n();
  return <g fill="#93adbf" fontSize="10" fontFamily="sans-serif"><text x={L} y={15}>{ylabel}</text>{[0, .25, .5, .75, 1].map(t => <g key={t}><line x1={L} y1={T + PH * (1 - t)} x2={W - R} y2={T + PH * (1 - t)} stroke="#2c3e4d" /><text x={L - 10} y={T + PH * (1 - t) + 4} textAnchor="end">{fmt(t * ymax, 1)}</text><text x={L + PW * t} y={H - B + 20} textAnchor="middle">{fmt(t * xmax, 1)}</text></g>)}<text x={L + PW / 2} y={H - 8} textAnchor="middle">{xlabel}</text></g>;
}
function PlotHeader({
  title,
  subtitle,
  download
}: {
  title: string;
  subtitle: string;
  download: () => void;
}) {
  const {
    t: tr
  } = useI18n();
  return <header><div><h3>{title}</h3><p>{subtitle}</p></div><button title={tr("下载") + title + ' SVG'} onClick={download}><Download size={15} /></button></header>;
}
export default function StatisticsPanel({
  items,
  viewingId,
  viewingName,
  meta,
  onHelp
}: {
  items: Bubble[];
  viewingId: string;
  viewingName: string;
  meta: MapMeta;
  onHelp: () => void;
}) {
  const {
    t: tr
  } = useI18n();
  const GRADES = {
    gold: tr("黄金"),
    silver: tr("白银"),
    bronze: tr("青铜")
  };
  const [scope, setScope] = useState(viewingId ? 'current' : 'all'),
    [grade, setGrade] = useState('all'),
    [basis, setBasis] = useState<'disk' | 'projected'>('disk'),
    [bins, setBins] = useState(10);
  const [settings, setSettings] = useState<GalaxyGeometry>(DEFAULT_GALAXY),
    [input, setInput] = useState({
      distance_kpc: '780',
      inclination_deg: '77',
      pa_deg: '38'
    }),
    [settingsError, setSettingsError] = useState('');
  const [records, setRecords] = useState<CatalogBubble[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [loadedAt, setLoadedAt] = useState(''),
    [refresh, setRefresh] = useState(0);
  const histRef = useRef<SVGSVGElement>(null),
    scatterRef = useRef<SVGSVGElement>(null),
    gradeRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (scope === 'current') return;
    let stopped = false;
    const abort = new AbortController();
    setLoading(true);
    setError('');
    setRecords([]);
    (async () => {
      const pr = await fetch('/api/profiles', {
        cache: 'no-store',
        signal: abort.signal
      });
      if (!pr.ok) throw new Error(tr("参与者名单加载失败。"));
      const pd = (await pr.json()) as {
        profiles: Profile[];
      };
      const groups: CatalogBubble[][] = new Array(pd.profiles.length);
      let next = 0;
      await Promise.all(Array.from({
        length: Math.min(4, pd.profiles.length)
      }, async () => {
        while (next < pd.profiles.length) {
          const index = next++,
            p = pd.profiles[index],
            r = await fetch('/api/bubbles?profile=' + encodeURIComponent(p.id), {
              cache: 'no-store',
              signal: abort.signal
            });
          if (!r.ok) throw new Error(tr("目录「") + p.name + tr("」加载失败，请刷新重试。"));
          const d = (await r.json()) as {
            bubbles: Bubble[];
          };
          groups[index] = d.bubbles.map(b => ({
            ...b,
            observer_id: p.id,
            observer_name: p.name
          }));
        }
      }));
      if (!stopped) {
        setRecords(groups.flat());
        setLoadedAt(new Date().toLocaleTimeString('zh-CN'));
      }
    })().catch(e => {
      if (!stopped) setError((e as Error).message);
    }).finally(() => {
      if (!stopped) setLoading(false);
    });
    return () => {
      stopped = true;
      abort.abort();
    };
  }, [scope, refresh]);
  const source = useMemo(() => scope === 'current' ? items.map(b => ({
    ...b,
    observer_id: viewingId,
    observer_name: viewingName
  })) : records, [scope, items, records, viewingId, viewingName]);
  const measured = useMemo(() => source.map(b => measureBubble(b, meta, settings)).filter((b): b is MeasuredBubble => b !== null), [source, meta, settings]);
  const filtered = measured.filter(b => grade === 'all' || b.confidence === grade),
    sizes = filtered.map(b => b[basis].equivalent_diameter_pc);
  const statNames = basis === 'disk' ? tr("盘面估计") : tr("天球投影"),
    maxSize = filtered.reduce((max, b) => Math.max(max, b.disk.equivalent_diameter_pc, b.projected.equivalent_diameter_pc), 1);
  const diskHist = histogram(filtered.map(b => b.disk.equivalent_diameter_pc), bins, maxSize),
    skyHist = histogram(filtered.map(b => b.projected.equivalent_diameter_pc), bins, maxSize),
    maxCount = Math.max(4, Math.ceil(Math.max(1, ...diskHist.map(b => b.count), ...skyHist.map(b => b.count)) / 4) * 4);
  const maxR = filtered.reduce((max, b) => Math.max(max, b.galactocentric_kpc), 1),
    maxY = sizes.reduce((max, v) => Math.max(max, v), 1),
    counts = Object.keys(GRADES).map(k => ({
      key: k,
      name: GRADES[k as keyof typeof GRADES],
      count: filtered.filter(b => b.confidence === k).length
    })),
    maxGrade = Math.max(1, ...counts.map(c => c.count));
  const blocked = scope !== 'current' && (loading || !!error),
    empty = blocked || filtered.length === 0;
  function apply() {
    const v = {
      distance_kpc: Number(input.distance_kpc),
      inclination_deg: Number(input.inclination_deg),
      pa_deg: Number(input.pa_deg)
    };
    if (Object.values(input).some(v => !v.trim()) || !validGalaxy(v)) {
      setSettingsError(tr("请输入有效参数：距离 > 0 且 ≤ 10000 kpc，倾角 0–85\xB0，PA 0–180\xB0（不含 180\xB0）。"));
      return;
    }
    setSettings(v);
    setSettingsError('');
  }
  function downloadPlot(svg: SVGSVGElement | null, name: string) {
    chartDownload(svg, name, `M31 · D=${settings.distance_kpc} kpc · i=${settings.inclination_deg}° · PA=${settings.pa_deg}° · N=${filtered.length} · ${scope === 'all' ? tr("所有参与者") : viewingName} · ${grade === 'all' ? tr("全部分类") : GRADES[grade as keyof typeof GRADES]}`);
  }
  function exportTable() {
    const cols = ['observer', 'id', 'name', 'confidence', 'ra_deg', 'dec_deg', 'a_arcsec', 'b_arcsec', 'bubble_pa_deg', 'map_id', 'projected_major_pc', 'projected_minor_pc', 'projected_equivalent_diameter_pc', 'disk_major_pc', 'disk_minor_pc', 'disk_equivalent_diameter_pc', 'disk_area_pc2', 'disk_axis_ratio', 'galactocentric_radius_kpc', 'distance_kpc', 'inclination_deg', 'disk_pa_deg'];
    const cell = (v: unknown) => {
      let s = String(v ?? '');
      if (typeof v === 'string' && /^[=+@\-\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replaceAll('"', '""') + '"';
    };
    const rows = filtered.map(b => [b.observer_name, b.id, b.name, b.confidence, b.ra, b.dec, b.a_arcsec, b.b_arcsec, b.pa_deg, b.map_id, b.projected.major_pc, b.projected.minor_pc, b.projected.equivalent_diameter_pc, b.disk.major_pc, b.disk.minor_pc, b.disk.equivalent_diameter_pc, b.disk.area_pc2, b.disk.axis_ratio, b.galactocentric_kpc, settings.distance_kpc, settings.inclination_deg, settings.pa_deg]);
    saveFile('M31-bubble-statistics.csv', '﻿' + [cols, ...rows].map(r => r.map(cell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  }
  return <div className="statistics-panel">
  <div className="stats-heading"><div><span className="eyebrow">M31 BUBBLE ATLAS / CATALOG STATISTICS</span><h2 id="modal-title">{tr("气泡统计图谱")}</h2><p>{tr("按已保存的椭圆记录计算 \xB7 不包含未确认草稿")}</p></div><button className="stats-help" onClick={onHelp}><Info size={15} />{tr(" 统计方法与使用说明")}</button></div>
  <div className="stats-filters"><label>{tr("目录范围")}<select aria-label={tr("统计目录范围")} value={scope} onChange={e => setScope(e.target.value)}><option value="current" disabled={!viewingId}>{tr("当前目录")}{viewingName ? ' · ' + viewingName : ''}</option><option value="all">{tr("所有参与者")}</option></select></label><label>{tr("标注分类")}<select aria-label={tr("统计分类")} value={grade} onChange={e => setGrade(e.target.value)}><option value="all">{tr("全部分类")}</option>{Object.entries(GRADES).map(([k, v]) => <option value={k} key={k}>{v}</option>)}</select></label><label>{tr("散点与表格尺寸")}<select aria-label={tr("统计尺寸口径")} value={basis} onChange={e => setBasis(e.target.value as 'disk' | 'projected')}><option value="disk">{tr("盘面去投影估计")}</option><option value="projected">{tr("天球投影")}</option></select></label><label>{tr("直方图分箱")}<select aria-label={tr("统计分箱数")} value={bins} onChange={e => setBins(+e.target.value)}>{[5, 10, 15, 20, 30].map(n => <option value={n} key={n}>{n}{tr(" 箱")}</option>)}</select></label>{scope === 'all' && <button title={tr("刷新所有参与者统计")} disabled={loading} onClick={() => setRefresh(n => n + 1)}><RefreshCw size={16} className={loading ? 'spin' : ''} /></button>}<button className="stats-export" disabled={empty} onClick={exportTable}><Download size={15} />{tr(" 导出统计 CSV")}</button></div>
  <details className="stats-geometry"><summary>{tr("星系几何参数 ")}<span>D = {settings.distance_kpc} kpc · i = {settings.inclination_deg}° · PA = {settings.pa_deg}°</span></summary><div>{(['distance_kpc', 'inclination_deg', 'pa_deg'] as const).map(k => <label key={k}>{{
            distance_kpc: tr("距离 D / kpc"),
            inclination_deg: tr("倾角 i / deg"),
            pa_deg: tr("盘面长轴 PA / deg")
          }[k]}<input aria-label={k} type="number" value={input[k]} step={k === 'distance_kpc' ? 1 : .1} onChange={e => setInput(v => ({
            ...v,
            [k]: e.target.value
          }))} /></label>)}<button onClick={apply}>{tr("应用统计参数")}</button><button onClick={() => {
          setSettings(DEFAULT_GALAXY);
          setInput({
            distance_kpc: '780',
            inclination_deg: '77',
            pa_deg: '38'
          });
          setSettingsError('');
        }}>{tr("恢复默认")}</button></div>{settingsError && <p role="alert" className="stats-error">{settingsError}</p>}<p>{tr("默认参数参考 ")}<a href={GALAXY_SOURCE} target="_blank" rel="noreferrer">Zhang et al. 2024 <ArrowUpRight size={11} /></a>{tr("；中心 RA ")}{meta.crval[0]}°，Dec {meta.crval[1]}{tr("\xB0。倾角 0\xB0 表示正面看盘，PA 从天球北向东计。修改只影响本次统计，不改动标注。")}</p></details>
  <div className="stats-assumption"><Info size={16} /><p><b>{tr("盘面估计采用薄盘、固定距离和平行投影近似。")}</b>{tr("先把整个椭圆旋转到星系长短轴，再沿星系短轴乘以 1/cos(i)，重新求半轴。它不是球状气泡的真实三维直径；盘外结构、翘曲和深度差未建模。")}{scope === 'all' && <strong>{tr(" 所有参与者的重复标注未合并，记录数不等于独立气泡数。")}</strong>}</p></div>
  {blocked ? <div className={error ? 'stats-error-state' : 'stats-empty'} role={error ? 'alert' : 'status'}>{error || tr("正在载入所有已保存目录…")}{error && <button onClick={() => setRefresh(v => v + 1)}>{tr("重新加载")}</button>}</div> : <>
  <div className="stats-summary"><div><small>{tr("标注记录数")}</small><b>{filtered.length}<em>{tr(" 条")}</em></b><span>{new Set(filtered.map(b => b.observer_id)).size}{tr(" 位参与者")}{measured.length < source.length ? ' · ' + (source.length - measured.length) + tr(" 条不适用记录已排除") : ''}</span></div><div><small>{tr("投影等效直径中位数")}</small><b>{fmt(quantile(filtered.map(b => b.projected.equivalent_diameter_pc), .5))}<em> pc</em></b><span>{tr("Deq = 2√(ab) \xB7 等面积圆直径")}</span></div><div><small>{tr("盘面估计 Deq 中位数")}</small><b>{fmt(quantile(filtered.map(b => b.disk.equivalent_diameter_pc), .5))}<em> pc</em></b><span>{tr("含倾角修正，依赖薄盘假设")}</span></div><div><small>{tr("盘面星系中心距中位数")}</small><b>{fmt(quantile(filtered.map(b => b.galactocentric_kpc), .5), 2)}<em> kpc</em></b><span>R = √(X² + Y²)</span></div></div>
  {empty ? <div className="stats-empty"><BarChart3 size={32} /><b>{tr("当前范围没有可统计的已保存气泡")}</b><p>{tr("先在地图中确认保存标注，或切换目录范围 / 分类。图谱不会填入演示数据。")}</p></div> : <>
  <div className="stats-charts"><section className="stats-chart"><PlotHeader title={tr("气泡大小分布")} subtitle={tr("相同分箱对比投影与盘面估计；悬停柱形查看数量")} download={() => downloadPlot(histRef.current, 'M31-size-distribution')} /><div className="stats-legend"><span><i style={{
                  background: '#7f97ad'
                }} />{tr(" 天球投影")}</span><span><i style={{
                  background: '#68ddc4'
                }} />{tr(" 盘面估计")}</span></div><svg ref={histRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr("气泡等效直径分布直方图")}><title>{tr("投影与盘面估计等效直径分布，单位 pc")}</title><Axes xmax={maxSize} ymax={maxCount} xlabel={tr("等效直径 Deq / pc")} ylabel={tr("标注记录数")} />{diskHist.map((b, i) => {
                const width = PW / bins;
                return <g key={i}><rect x={L + i * width + 1} y={T + PH * (1 - skyHist[i].count / maxCount)} width={Math.max(.5, (width - 3) / 2)} height={PH * skyHist[i].count / maxCount} fill="#7f97ad"><title>{fmt(b.lo)}–{fmt(b.hi)}{tr(" pc \xB7 天球投影：")}{skyHist[i].count}{tr(" 条")}</title></rect><rect x={L + i * width + width / 2} y={T + PH * (1 - b.count / maxCount)} width={Math.max(.5, (width - 3) / 2)} height={PH * b.count / maxCount} fill="#68ddc4"><title>{fmt(b.lo)}–{fmt(b.hi)}{tr(" pc \xB7 盘面估计：")}{b.count}{tr(" 条")}</title></rect></g>;
              })}</svg></section>
  <section className="stats-chart"><PlotHeader title={tr("大小与星系中心距")} subtitle={statNames + tr("等效直径；悬停数据点查看标注者与尺寸")} download={() => downloadPlot(scatterRef.current, 'M31-size-radius')} /><svg ref={scatterRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr("气泡等效直径与盘面星系中心距散点图")}><title>{statNames}{tr("等效直径与星系中心距")}</title><Axes xmax={maxR} ymax={maxY} xlabel={tr("盘面星系中心距 R / kpc")} ylabel={statNames + ' Deq / pc'} />{filtered.map(b => <circle key={b.observer_id + b.id} cx={L + PW * b.galactocentric_kpc / maxR} cy={T + PH * (1 - b[basis].equivalent_diameter_pc / maxY)} r="4" fill={b.confidence === 'gold' ? '#e7bd64' : b.confidence === 'bronze' ? '#bd865b' : '#b9c9d8'} fillOpacity="0.8" stroke="#0d1722" strokeWidth="1"><title>{b.name} · {b.observer_name}\n{statNames} Deq {fmt(b[basis].equivalent_diameter_pc)} pc\nR {fmt(b.galactocentric_kpc, 2)} kpc · {GRADES[b.confidence]}</title></circle>)}</svg></section>
  <section className="stats-chart stats-grade-chart"><PlotHeader title={tr("分类统计")} subtitle={tr("手动分类标签，不代表自动验证或测量误差")} download={() => downloadPlot(gradeRef.current, 'M31-grades')} /><svg ref={gradeRef} viewBox="0 0 580 180" role="img" aria-label={tr("气泡分类记录数")}><title>{tr("黄金、白银、青铜的标注记录数")}</title>{counts.map((c, i) => <g key={c.key} fontFamily="sans-serif" fontSize="12"><text x="18" y={38 + i * 50} fill="#a7bfce">{c.name}</text><rect x="110" y={22 + i * 50} width={380 * c.count / maxGrade} height="23" rx="3" fill={['#e7bd64', '#b9c9d8', '#bd865b'][i]} /><text x={120 + 380 * c.count / maxGrade} y={38 + i * 50} fill="#d8e9ef">{c.count}{tr(" 条")}</text></g>)}</svg></section>
  <section className="stats-formulas"><h3>{tr("尺寸如何计算？")}</h3><p>{tr("图中的 a、b 是半轴，统计表中的长径、短径均为 ")}<b>{tr("完整直径")}</b>。</p><code>Deq = 2√(ab)<br />{tr("面积 S = πab")}<br />{tr("盘面短轴方向 Y = Ysky / cos(i)")}</code><p>{tr("线性尺寸随距离 D 成正比；面积随 D\xB2 成正比。在此模型下，盘面 Deq / 投影 Deq = 1/√cos(i)，但两个半轴的伸长还取决于椭圆方向，不能各自套用同一倍率。")}</p></section></div>
  <section className="stats-table-section"><h3>{tr("逐条派生参数 ")}<span>{filtered.length}{tr(" 条 \xB7 ")}{statNames}{tr("口径")}</span></h3><div className="stats-table-scroll"><table><thead><tr><th>{tr("标注 / 参与者")}</th><th>{tr("长径 / pc")}</th><th>{tr("短径 / pc")}</th><th>Deq / pc</th><th>{tr("轴比 b/a")}</th><th>{tr("面积 / pc\xB2")}</th><th>R / kpc</th></tr></thead><tbody>{filtered.slice(0, 300).map(b => <tr key={b.observer_id + b.id}><td><b>{b.name}</b><small>{b.observer_name} · {GRADES[b.confidence]}</small></td><td>{fmt(b[basis].major_pc)}</td><td>{fmt(b[basis].minor_pc)}</td><td>{fmt(b[basis].equivalent_diameter_pc)}</td><td>{fmt(b[basis].axis_ratio, 3)}</td><td>{fmt(b[basis].area_pc2)}</td><td>{fmt(b.galactocentric_kpc, 2)}</td></tr>)}</tbody></table></div>{filtered.length > 300 && <p>{tr("表格显示前 300 条；CSV 导出包含全部筛选结果。")}</p>}</section>
  </>}
  <p className="stats-footnote">{scope === 'all' ? tr("全体目录载入时间：") + loadedAt : tr("当前目录：") + (viewingName || tr("尚未选择"))}{tr("。图表与 CSV 均使用同一批已保存记录和上方已应用参数。没有测量误差建模、完备性修正或跨用户去重。")}</p>
  </>}
 </div>;
}
