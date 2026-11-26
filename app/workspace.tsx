'use client';

import { useI18n } from '../components/i18n';
import { useEffect, useRef, useState } from 'react';
import { Plus, MousePointer2, Hand, Eye, EyeOff, Download, Search, SlidersHorizontal, Trash2, Check, Undo2, Redo2, RotateCcw, LogOut, ArrowUpRight, Info, X, Target, Crosshair, Copy, RefreshCw, ChevronDown, CheckCircle2, LockKeyhole, Grid2X2, Tag, PanelRightClose, HelpCircle, ImageDown, BarChart3 } from 'lucide-react';
import Stage, { type StageAPI } from '../components/map-stage';
import StatisticsPanel from '../components/statistics-panel';
import HelpGuide from '../components/help-guide';
import { validUsername, usernameWidth } from '../lib/usernames';
import { ellipseSky, pixelToSky, skyToPixel, skyEllipseToGeometry, sexagesimal, boundary, ds9Angle, type Geometry, type MapMeta, type Point } from '../lib/astro';
import { PALETTES, legendGradient, type Display, type Stretch } from '../lib/colors';
import { sameDraft, type Bubble, type Draft } from '../lib/bubbles';
import metadata from '../lib/map-metadata.json';
import type { Profile } from '../lib/profiles';
const meta = metadata as MapMeta;
const DEFAULT: Display = {
  min: 0,
  max: 4,
  stretch: 'linear',
  palette: 'turbo',
  reverse: false,
  logStrength: 100
};
const toDraft = (b: Bubble): Draft => ({
  id: b.id,
  revision: b.revision,
  x: b.x,
  y: b.y,
  rx: b.rx,
  ry: b.ry,
  theta: b.theta,
  name: b.name,
  notes: b.notes,
  confidence: b.confidence
});
function download(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], {
    type
  }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const csvCell = (v: unknown) => {
  let s = String(v ?? '');
  if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
};
function NumberField({
  label,
  value,
  onChange,
  step = .1,
  min,
  max,
  unit,
  disabled = false
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  disabled?: boolean;
}) {
  const {
    t: tr, language, setLanguage
  } = useI18n();
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  function commit() {
    const v = Number(text);
    if (text.trim() && Number.isFinite(v) && (min === undefined || v >= min) && (max === undefined || v <= max)) onChange(v);else setText(String(value));
  }
  return <label className="number-field"><span>{label}</span><div><input type="number" value={text} step={step} min={min} max={max} disabled={disabled} onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => {
        if (e.key === 'Enter') {
          commit();
          e.currentTarget.blur();
        }
      }} />{unit && <small>{unit}</small>}</div></label>;
}
export default function Workspace({
  initialProfile
}: {
  initialProfile: Profile | null;
}) {
  const {
    t: tr, language, setLanguage
  } = useI18n();
  const STATUS = {
    gold: tr("黄金"),
    silver: tr("白银"),
    bronze: tr("青铜")
  };
  const [activeProfile, setActiveProfile] = useState<Profile | null>(initialProfile),
    [profiles, setProfiles] = useState<Profile[]>([]),
    [viewingId, setViewingId] = useState(initialProfile?.id || ''),
    [profileName, setProfileName] = useState(''),
    [profileBusy, setProfileBusy] = useState(false),
    [renameName, setRenameName] = useState(''),
    [deleteName, setDeleteName] = useState(''),
    [profileError, setProfileError] = useState('');
  const viewingProfile = profiles.find(p => p.id === viewingId) || activeProfile;
  const canEdit = !!activeProfile && viewingId === activeProfile.id;
  const user = activeProfile ? {
    name: activeProfile.name,
    email: activeProfile.name
  } : null;
  const [items, setItems] = useState<Bubble[]>([]),
    [draft, setDraft] = useState<Draft | null>(null),
    [baseline, setBaseline] = useState<Draft | null>(null),
    [history, setHistory] = useState<Draft[]>([]),
    [future, setFuture] = useState<Draft[]>([]);
  const [visibilityGrade,setVisibilityGrade]=useState('all');
  const [display, setDisplay] = useState<Display>(DEFAULT),
    [tool, setTool] = useState<'select' | 'pan' | 'draw'>('select'),
    [visible, setVisible] = useState(true),
    [labels, setLabels] = useState(true),
    [grid, setGrid] = useState(false),
    [rotation, setRotation] = useState(0),
    [zoom, setZoom] = useState(.1);
  const [cursor, setCursor] = useState<(Point & {
      av: number | null;
      resolution: number | null;
    }) | null>(null),
    [ready, setReady] = useState(false),
    [saving, setSaving] = useState(false),
    [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState(''),
    [notice, setNotice] = useState(''),
    [modal, setModal] = useState<'help' | 'about' | 'export' | 'delete' | 'goto' | 'profiles' | 'manage-profile' | 'statistics' | null>(null),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all');
  const [helpSection, setHelpSection] = useState('start');
  const catalogLoad = useRef(0);
  const stage = useRef<StageAPI>(null),
    [jump, setJump] = useState({
      ra: '10.6847083',
      dec: '41.26875'
    }),
    [inspectorOpen, setInspectorOpen] = useState(true);
  useEffect(()=>{const query=window.matchMedia('(max-width: 850px)');const close=()=>{if(query.matches)setInspectorOpen(false);};close();query.addEventListener('change',close);return()=>query.removeEventListener('change',close);},[]);
  const dirty = !sameDraft(draft, baseline),
    sky = draft ? ellipseSky(draft, meta) : null,
    skyCursor = cursor ? pixelToSky(cursor, meta) : null;
  function notify(s: string) {
    setNotice(tr(s));
  }
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(''), 6000);
      return () => clearTimeout(t);
    }
  }, [notice]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('m31-display-v1') || 'null');
      if (saved && Number.isFinite(saved.min) && Number.isFinite(saved.max) && saved.max > saved.min && ['linear', 'log', 'hist'].includes(saved.stretch) && PALETTES[saved.palette] && saved.logStrength > 0) setDisplay(saved);
    } catch {}
  }, []);
  useEffect(() => {
    localStorage.setItem('m31-display-v1', JSON.stringify(display));
  }, [display]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [dirty]);
  async function api(method: string, body?: unknown) {
    const response = await fetch('/api/bubbles' + (method === 'GET' ? '?profile=' + encodeURIComponent(viewingId) : ''), {
      method,
      headers: body ? {
        'Content-Type': 'application/json'
      } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    });
    const data = (await response.json()) as {
      error?: string;
      bubbles?: Bubble[];
      bubble?: Bubble;
    };
    if (!response.ok) throw new Error(data.error || tr("请求失败，请重试。"));
    return data;
  }
  async function reload(initial = false) {
    if (!initial && dirty && !confirm(tr("当前椭圆有未保存的修改。重新载入会放弃这些修改，继续吗？"))) return;
    const requestId = ++catalogLoad.current;
    setLoading(true);
    setLoadError('');
    try {
      const data = await api('GET');
      if (requestId !== catalogLoad.current) return;
      setItems(data.bubbles!);
      if (!initial) {
        setDraft(null);
        setBaseline(null);
        setHistory([]);
        setFuture([]);
        notify(tr("已同步当前目录"));
      }
    } catch (e) {
      if (requestId === catalogLoad.current) setLoadError(tr((e as Error).message));
    } finally {
      if (requestId === catalogLoad.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (viewingId) reload(true);else setItems([]);
  }, [viewingId]);
  async function refreshProfiles() {
    try {
      const r = await fetch('/api/profiles', {
          cache: 'no-store'
        }),
        d = (await r.json()) as {
          error?: string;
          profiles: Profile[];
          current_profile: Profile | null;
        };
      if (!r.ok) throw new Error(d.error);
      setProfiles(d.profiles);
      setActiveProfile(d.current_profile);
    } catch (e) {
      setLoadError(tr((e as Error).message));
    }
  }
  useEffect(() => {
    refreshProfiles();
  }, []);
  function clearSelection() {
    catalogLoad.current++;
    setLoading(false);
    setDraft(null);
    setBaseline(null);
    setHistory([]);
    setFuture([]);
    setTool('select');
    setSearch('');
    setFilter('all');
  }
  function browse(profile: Profile) {
    if (saving || !mayLeave()) return;
    clearSelection();
    if (viewingId !== profile.id) setItems([]);
    setViewingId(profile.id);
    setModal(null);
  }
  async function chooseProfile(action: 'create' | 'select' | 'logout', id?: string) {
    if (saving || !mayLeave()) return;
    setProfileBusy(true);
    try {
      const r = await fetch('/api/profiles', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action,
            id,
            name: profileName
          })
        }),
        d = (await r.json()) as {
          error?: string;
          profile: Profile | null;
        };
      if (!r.ok) throw new Error(d.error);
      clearSelection();
      if (d.profile?.id !== viewingId) setItems([]);
      setActiveProfile(d.profile);
      setViewingId(d.profile?.id || '');
      setProfileName('');
      setModal(null);
      await refreshProfiles();
      notify(d.profile ? tr("当前标注者：") + d.profile.name : tr("已退出当前用户名"));
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setProfileBusy(false);
    }
  }
  async function manageProfile(action: 'rename' | 'delete') {
    if (!activeProfile || profileBusy || saving) return;
    if (action === 'delete' && !mayLeave()) return;
    setProfileBusy(true);
    setProfileError('');
    try {
      const r = await fetch('/api/profiles', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action,
            id: activeProfile.id,
            expected_name: activeProfile.name,
            name: renameName,
            confirm_name: deleteName
          })
        }),
        d = (await r.json()) as {
          error?: string;
          profile: Profile | null;
        };
      if (!r.ok) throw new Error(d.error || tr("操作失败"));
      if (action === 'delete') {
        clearSelection();
        if (viewingId === activeProfile.id) setViewingId('');
        setActiveProfile(null);
        setDeleteName('');
        setModal('profiles');
        notify(tr("用户名及其标注已删除"));
      } else {
        setActiveProfile(d.profile);
        setRenameName(d.profile!.name);
        notify(tr("用户名已更新，原有标注保持不变"));
      }
      await refreshProfiles();
    } catch (e) {
      setProfileError(tr((e as Error).message));
    } finally {
      setProfileBusy(false);
    }
  }
  function mayLeave() {
    return !dirty || confirm(tr("当前椭圆有未保存的修改。放弃修改并继续吗？"));
  }
  function remember(before?: Draft) {
    if (!canEdit) return;
    const d = before || draft;
    if (d) {
      setHistory(h => [...h.slice(-49), {
        ...d
      }]);
      setFuture([]);
    }
  }
  function edit(g: Partial<Draft>, record = true) {
    if (!draft || !canEdit) return;
    if (record) remember();
    setDraft({
      ...draft,
      ...g
    });
  }
  function pick(b: Bubble) {
    if (saving) return false;
    if (draft?.id === b.id) return true;
    if (!mayLeave()) return false;
    const d = toDraft(b);
    setDraft(d);
    setBaseline({
      ...d
    });
    setHistory([]);
    setFuture([]);
    setTool('select');
    setVisible(true);
    setVisibilityGrade('all');
    setInspectorOpen(true);
    return true;
  }
  function create(g?: Geometry) {
    if (!canEdit) {
      notify(tr("请先选择自己的标注用户名。"));
      setModal('profiles');
      return false;
    }
    if (saving || !mayLeave()) return false;
    const center = stage.current?.center() || {
      x: meta.crpix[0] - 1,
      y: meta.crpix[1] - 1
    };
    const geom = g || {
      x: Math.max(0, Math.min(meta.width - 1, center.x)),
      y: Math.max(0, Math.min(meta.height - 1, center.y)),
      rx: 40 / zoom,
      ry: 40 / zoom,
      theta: 0
    };
    const next = {
      ...geom,
      name: 'M31-B' + String(Math.max(0, ...items.map(b => Number(/^M31-B(\d+)$/.exec(b.name)?.[1] || 0))) + 1).padStart(4, '0'),
      notes: '',
      confidence: 'silver' as const
    };
    setDraft(next);
    setBaseline(null);
    setHistory([]);
    setFuture([]);
    setVisible(true);
    setVisibilityGrade('all');
    setInspectorOpen(true);
    return true;
  }
  function undo() {
    if (!draft || !history.length) return;
    setFuture(f => [...f, {
      ...draft
    }]);
    setDraft(history.at(-1)!);
    setHistory(h => h.slice(0, -1));
  }
  function redo() {
    if (!draft || !future.length) return;
    setHistory(h => [...h, {
      ...draft
    }]);
    setDraft(future.at(-1)!);
    setFuture(f => f.slice(0, -1));
  }
  async function save() {
    if (!draft || saving || !canEdit) return;
    if (!draft.name.trim()) {
      notify(tr("请为这个气泡填写名称。"));
      return;
    }
    setSaving(true);
    try {
      const data = await api('POST', {
          ...draft,
          map_id: meta.id,
          profile_id: activeProfile!.id
        }),
        b = data.bubble!;
      setItems(list => [b, ...list.filter(x => x.id !== b.id)]);
      setDraft(toDraft(b));
      setBaseline(toDraft(b));
      setHistory([]);
      setFuture([]);
      setTool('select');
      refreshProfiles();
      notify(tr("已保存至 ") + activeProfile!.name + tr(" 的目录"));
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!draft?.id || !canEdit) return;
    setSaving(true);
    try {
      await api('DELETE', {
        id: draft.id,
        revision: draft.revision,
        profile_id: activeProfile!.id
      });
      setItems(xs => xs.filter(b => b.id !== draft.id));
      setDraft(null);
      setBaseline(null);
      setHistory([]);
      setFuture([]);
      setModal(null);
      refreshProfiles();
      notify(tr("已删除气泡"));
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function cancel() {
    if (!mayLeave()) return;
    setDraft(baseline ? {
      ...baseline
    } : null);
    setHistory([]);
    setFuture([]);
    if (!baseline) setTool('select');
  }
  function changeSky(key: string, v: number) {
    if (!sky || !draft || !canEdit) return;
    const s = {
      ...sky,
      [key]: v
    };
    if (s.a_arcsec < s.b_arcsec) {
      notify(tr("长半轴应不小于短半轴。"));
      return;
    }
    const g = skyEllipseToGeometry(s.ra, s.dec, s.a_arcsec, s.b_arcsec, s.pa_deg, meta);
    if (!Number.isFinite(g.x) || g.x < 0 || g.y < 0 || g.x >= meta.width || g.y >= meta.height || g.rx < .5 || g.ry < .5 || g.rx > 2000 || g.ry > 2000) {
      notify(tr("参数超出地图范围或允许大小。"));
      return;
    }
    edit(g);
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
      if (modal) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (e.key === 'Escape') {
        cancel();
        setTool('select');
      }
      if (e.key.toLowerCase() === 'n' && user) {
        if (create()) setTool('select');
      }
      if (e.key.toLowerCase() === 'h') setVisible(v => !v);
      if (e.key.toLowerCase() === 'f') stage.current?.fit();
      if (e.key.toLowerCase() === 'v') setTool('select');
      if (e.key.toLowerCase() === 'p') setTool('pan');
      if (e.key === 'Delete' && draft?.id && canEdit) setModal('delete');
      if (e.key === '?' || e.key === '/') {
        e.preventDefault();
        setModal('help');
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [draft, baseline, history, future, modal, user, saving, zoom, items, canEdit]);
  const filtered = items.filter(b => (filter === 'all' || b.confidence === filter) && (b.name + ' ' + b.notes + ' ' + b.ra + ' ' + b.dec).toLowerCase().includes(search.toLowerCase()));
  function exportData(format: string) {
    const date = new Date().toISOString().slice(0, 10),
      stem = `M31-bubbles-${date}`;
    if (format === 'json') download(stem + '.json', JSON.stringify({
      schema_version: 1,
      exported_at: new Date().toISOString(),
      owner: viewingProfile?.name,
      profile_id: viewingId,
      coordinate_frame: 'ICRS',
      axis_definition: 'Local tangent-plane semi-axes in arcsec; PA east of north, modulo 180. Exact footprint in boundary_icrs_deg.',
      map: {
        id: meta.id,
        crval: meta.crval,
        crpix: meta.crpix,
        cd: meta.cd,
        source_sha256: meta.source_sha256
      },
      display,
      bubbles: items.map(b => ({
        ...b,
        boundary_icrs_deg: boundary(b, meta)
      }))
    }, null, 2), 'application/json');
    if (format === 'csv') {
      const cols = ['id', 'name', 'ra', 'dec', 'a_arcsec', 'b_arcsec', 'pa_deg', 'pa_defined', 'confidence', 'notes', 'map_id', 'created_at', 'updated_at'];
      download(stem + '.csv', '﻿' + [cols.join(','), ...items.map(b => cols.map(c => csvCell(b[c as keyof Bubble])).join(','))].join('\r\n'), 'text/csv;charset=utf-8');
    }
    if (format === 'ds9') download(stem + '.reg', '# Region file format: DS9 version 4.1\n# ICRS local ellipse approximation; radii in arcsec. For exact footprints use JSON boundaries.\nglobal color=cyan width=1\nicrs\n' + items.map(b => `ellipse(${b.ra.toFixed(9)},${b.dec.toFixed(9)},${b.a_arcsec.toFixed(4)}",${b.b_arcsec.toFixed(4)}",${ds9Angle(b.pa_deg).toFixed(6)}) # text={${b.name.replace(/[{}\r\n]/g, ' ')}}`).join('\n'));
    setModal(null);
    notify(tr(`已导出 ${items.length} 个已保存气泡`));
  }
  function snapshot() {
    const data = stage.current?.snapshot();
    if (!data) return;
    const a = document.createElement('a');
    a.href = data;
    a.download = 'M31-bubbles-view.png';
    a.click();
  }
  const changeRange = (key: 'min' | 'max', value: number) => {
    if (!Number.isFinite(value)) return;
    if (key === 'min' && value >= display.max || key === 'max' && value <= display.min) {
      notify(tr("颜色上限必须大于下限。"));
      return;
    }
    setDisplay(d => ({
      ...d,
      [key]: value
    }));
  };
  return <div className="atlas-app">
  <header className="app-header"><a className="brand" href="/" aria-label={tr("M31 Bubble Atlas 首页")}><svg width="34" height="34" viewBox="0 0 34 34" fill="none"><ellipse cx="17" cy="17" rx="15" ry="7" transform="rotate(-32 17 17)" /><ellipse cx="17" cy="17" rx="9" ry="14" transform="rotate(-32 17 17)" /><circle cx="17" cy="17" r="3" /></svg><span>M31 <b>Bubble Atlas</b><small>{tr("仙女座星系 \xB7 气泡标注台")}</small></span></a><div className="project-banner">{tr("空泡捕手计划 之 仙女座空泡搜寻")}</div><div className="header-actions"><button className="language-toggle" aria-label="Switch interface language" onClick={()=>setLanguage(language==='zh'?'en':'zh')}>{language==='zh'?'EN':'中文'}</button><button className="stats-entry" onClick={() => setModal('statistics')}><BarChart3 size={16} /><span>{tr("统计图谱")}</span></button><button className="quiet" onClick={() => {
          setHelpSection('start');
          setModal('help');
        }}><HelpCircle size={16} /><span>{tr("使用指南")}</span></button>{user ? <><button className="profile-switch" onClick={() => {
            refreshProfiles();
            setModal('profiles');
          }}><span className="avatar">{user.name.charAt(0).toUpperCase()}</span><span className="user-name">{user.name}</span><ChevronDown size={13} /></button><button title={tr("退出当前用户名")} onClick={() => chooseProfile('logout')}><LogOut size={16} /></button></> : <button className="login-button" onClick={() => {
          refreshProfiles();
          setModal('profiles');
        }}><MousePointer2 size={14} />{tr(" 选择用户名")}</button>}</div></header>
  <div className="app-body">
   <aside className="catalog-panel"><div className="panel-heading"><div><small>OBSERVER CATALOG</small><h2>{viewingProfile ? viewingProfile.name + tr(" 的气泡") : tr("气泡目录")} <span>{items.length}</span></h2></div><button title={tr("重新载入当前目录")} disabled={loading || !viewingId || saving} onClick={() => reload()}><RefreshCw size={15} className={loading ? 'spin' : ''} /></button></div><div className="observers"><div className="observers-heading"><span>{tr("参与者 ")}<b>{profiles.length}</b></span><button title={tr("选择或创建用户名")} onClick={() => {
              refreshProfiles();
              setModal('profiles');
            }}><Plus size={13} /></button></div><div className="observer-list">{profiles.map(p => <button key={p.id} className={viewingId === p.id ? 'active' : ''} onClick={() => browse(p)}><span className="observer-avatar">{p.name.charAt(0)}</span><span>{p.name}</span>{activeProfile?.id === p.id && <i>{tr("我")}</i>}<b>{p.count || 0}</b></button>)}{!profiles.length && <button onClick={() => setModal('profiles')}>{tr("+ 创建第一个用户名")}</button>}</div></div>{viewingId && !canEdit && <div className="browse-banner"><Eye size={12} /><span>{tr("正在浏览 ")}{viewingProfile?.name}</span><button disabled={profileBusy} onClick={() => chooseProfile('select', viewingId)}>{tr("使用此用户名")}</button></div>}<div className="catalog-search"><Search size={15} /><input aria-label={tr("搜索气泡")} placeholder={tr("搜索名称、坐标或备注")} value={search} onChange={e => setSearch(e.target.value)} /></div><div className="catalog-filter"><select aria-label={tr("筛选气泡分类")} value={filter} onChange={e => setFilter(e.target.value)}><option value="all">{tr("全部分类")}</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><span>{filtered.length}{tr(" 个结果")}</span></div>
    {loadError && <div className="load-error">{loadError}<button onClick={() => reload(true)}>{tr("重试")}</button></div>}
    <div className="catalog-list">{filtered.map((b, i) => <button className={`catalog-item ${draft?.id === b.id ? 'active' : ''}`} key={b.id} onClick={() => {
            if (pick(b)) stage.current?.focus(b);
          }}><span className="item-number">{String(i + 1).padStart(2, '0')}</span><div><strong>{b.name}</strong><span>{b.ra.toFixed(5)}° · {b.dec.toFixed(5)}°</span><small><i className={'status-dot ' + b.confidence} />{STATUS[b.confidence]} <b>{(2 * b.a_arcsec).toFixed(1)}″ × {(2 * b.b_arcsec).toFixed(1)}″</b></small></div><Crosshair size={14} /></button>)}{!filtered.length && !loading && <div className="catalog-empty"><svg viewBox="0 0 80 64" width="76" height="60"><ellipse cx="38" cy="34" rx="23" ry="15" /><ellipse cx="48" cy="22" rx="13" ry="9" /><path d="M38 11v8m0 31v8M7 34h8m46 0h8" /></svg><b>{search || filter !== 'all' ? tr("没有匹配的气泡") : tr("还没有标注气泡")}</b><p>{user ? tr("点击「添加圆」，从地图上的第一个候选结构开始。") : tr("选择用户名，建立自己的气泡目录，也可浏览所有参与者的标注。")}</p></div>}</div>
    <div className="catalog-bottom"><div><Eye size={14} /><span>{canEdit ? tr("正在编辑当前用户名的目录") : tr("浏览模式 \xB7 标注按用户名分开")}</span></div><button className="export-main" disabled={!items.length} onClick={() => setModal('export')}><Download size={15} />{tr(" 导出当前目录 ")}<ArrowUpRight size={14} /></button><button className="source-link" onClick={() => setModal('about')}><Info size={13} />{tr(" 数据来源与坐标说明")}</button></div>
   </aside>
   <main className="map-workspace"><div className="map-toolbar"><div className="tool-group"><button className={tool === 'select' ? 'active' : ''} title={tr("选择 / 调整 (V)")} onClick={() => setTool('select')}><MousePointer2 size={17} /></button><button className={tool === 'pan' ? 'active' : ''} title={tr("平移 (P)")} onClick={() => setTool('pan')}><Hand size={17} /></button></div><button className="add-button" disabled={!canEdit || !ready || saving} onClick={() => {
            if (create()) setTool('select');
          }}><Plus size={17} />{tr(" 添加圆 ")}<kbd>N</kbd></button><button className={`draw-button ${tool === 'draw' ? 'active' : ''}`} title={tr("在地图上按下并拖出一个圆")} disabled={!canEdit || saving} onClick={() => {
            if (mayLeave()) setTool(t => t === 'draw' ? 'select' : 'draw');
          }}>{tr("拖绘")}</button><div className="toolbar-divider" /><button className={visible ? '' : 'muted'} onClick={() => setVisible(v => !v)} title={tr("显示 / 隐藏全部椭圆 (H)")}>{visible ? <Eye size={16} /> : <EyeOff size={16} />}<span className="button-label">{visible ? tr("标注可见") : tr("标注隐藏")}</span></button><select className="visibility-grade" aria-label={tr('可见标注分类')} value={visibilityGrade} onChange={e=>setVisibilityGrade(e.target.value)}><option value="all">{tr('全部可见')}</option>{Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v}{tr('可见')}</option>)}</select><div className="toolbar-end"><button className={grid ? 'active' : ''} title={tr("天球坐标网格")} onClick={() => setGrid(v => !v)}><Grid2X2 size={16} /></button><button className={labels ? 'active' : ''} title={tr("显示选中椭圆名称")} onClick={() => setLabels(v => !v)}><Tag size={15} /></button><button title={tr("跳转到 RA / Dec")} onClick={() => setModal('goto')}><Target size={16} /></button><button title={tr("导出当前视图 PNG")} disabled={!ready} onClick={snapshot}><ImageDown size={16} /></button><button title={tr("参数面板")} className={inspectorOpen ? 'active' : ''} onClick={() => setInspectorOpen(v => !v)}><SlidersHorizontal size={16} /></button></div></div>
    <div className="map-container"><Stage ref={stage} meta={meta} display={display} items={items.filter(b=>visibilityGrade==='all'||b.confidence===visibilityGrade)} draft={draft&&(visibilityGrade==='all'||draft.confidence===visibilityGrade)?draft:null} visible={visible} labels={labels} grid={grid} rotation={rotation} tool={tool} onPick={pick} onNew={create} readOnly={!canEdit || saving} onChange={g => {
            if (!canEdit || saving) return;
            setDraft(d => d ? {
              ...d,
              ...g
            } : null);
          }} onGesture={remember} onCursor={setCursor} onZoom={setZoom} onReady={() => setReady(true)} />{!user && !viewingId && <div className="signin-card"><span className="eyebrow">EXPLORE. MARK. DISCOVER.</span><h1>{tr("寻找 M31 中的气泡")}</h1><p>{tr("在恒星消光图上勾勒结构，")}<br />{tr("把每一次发现保存为天球坐标。")}</p><button className="start-profile" onClick={() => {
              refreshProfiles();
              setModal('profiles');
            }}><MousePointer2 size={16} />{tr(" 选择用户名，开始标注 ")}<ArrowUpRight size={16} /></button><small>{tr("无需密码 \xB7 所有参与者的目录均可浏览")}</small></div>}<div className="map-instruction">{tool === 'draw' ? tr("按下并拖动绘圆 \xB7 松开后用手柄拉伸、旋转") : draft ? tr("拖动椭圆移动 \xB7 方轴手柄拉伸 \xB7 圆形手柄旋转") : tr("滚轮缩放 \xB7 拖动空白处平移 \xB7 点击椭圆编辑")}</div></div>
    <section className="display-dock" aria-label={tr("图像显示设置")}><div className="display-title"><SlidersHorizontal size={14} /><b>{tr("图像显示")}</b><span>{tr("实时渲染")}</span><button title={tr("重置显示")} onClick={() => setDisplay(DEFAULT)}><RotateCcw size={13} /></button></div><div className="display-settings"><div className="stretch-control" aria-label={tr("颜色映射模式")}>{(['linear', 'log', 'hist'] as Stretch[]).map(s => <button key={s} className={display.stretch === s ? 'active' : ''} onClick={() => setDisplay(d => ({
                ...d,
                stretch: s
              }))} title={s === 'hist' ? tr("按当前颜色范围内的原始地图全局直方图均衡") : s === 'log' ? tr("log(1 + 强度 \xD7 归一化数值)") : tr("线性颜色映射")}>{s === 'linear' ? 'Linear' : s === 'log' ? 'Log' : 'Hist'}</button>)}</div><label className="palette-select"><span>{tr("配色")}</span><select value={display.palette} onChange={e => setDisplay(d => ({
                ...d,
                palette: e.target.value
              }))}>{Object.keys(PALETTES).map(s => <option key={s} value={s}>{s === 'gray' ? 'Gray' : s[0].toUpperCase() + s.slice(1)}</option>)}</select></label><button className={display.reverse ? 'active small-control' : 'small-control'} onClick={() => setDisplay(d => ({
              ...d,
              reverse: !d.reverse
            }))} title={tr("反转色条")}>{tr("反转")}</button><button className="small-control" title={tr("1%–99% 分位数范围")} onClick={() => setDisplay(d => ({
              ...d,
              min: Number(meta.percentiles[0].toFixed(2)),
              max: Number(meta.percentiles[4].toFixed(2))
            }))}>{tr("自动范围")}</button></div><div className="color-range"><NumberField label={tr("下限")} value={display.min} onChange={v => changeRange('min', v)} step={.05} unit="mag" /><div className="colorbar-wrap"><div className="colorbar-values"><span>Aᵥ / mag</span><span>{display.stretch === 'hist' ? tr("全局直方图均衡") : display.stretch === 'log' ? tr(`Log · 强度 ${display.logStrength}`) : 'Linear'}</span></div><div className="colorbar" style={{
                background: legendGradient(display, meta)
              }} />
     <div className="colorbar-ticks">{[0, .25, .5, .75, 1].map(t => <span key={t}>{(display.min + (display.max - display.min) * t).toFixed(2)}</span>)}</div></div><NumberField label={tr("上限")} value={display.max} onChange={v => changeRange('max', v)} step={.05} unit="mag" /></div><div className="range-sliders"><label><span>{tr("下限")}</span><input aria-label={tr("动态颜色下限")} type="range" min="0" max="8" step=".01" value={display.min} onChange={e => {
                const v = +e.target.value;
                if (v < display.max - .009) setDisplay(d => ({
                  ...d,
                  min: v
                }));
              }} /></label><label><span>{tr("上限")}</span><input aria-label={tr("动态颜色上限")} type="range" min="0" max="8" step=".01" value={display.max} onChange={e => {
                const v = +e.target.value;
                if (v > display.min + .009) setDisplay(d => ({
                  ...d,
                  max: v
                }));
              }} /></label>{display.stretch === 'log' && <label><span>{tr("Log 强度")}</span><input aria-label={tr("Log 强度")} type="range" min="1" max="1000" step="1" value={display.logStrength} onChange={e => setDisplay(d => ({
                ...d,
                logStrength: +e.target.value
              }))} /></label>}</div></section>
   </main>
   {inspectorOpen && <aside className="inspector-panel"><div className="panel-heading"><div><small>REGION INSPECTOR</small><h2>{tr("椭圆参数")}</h2></div><button title={tr("收起参数面板")} onClick={() => setInspectorOpen(false)}><PanelRightClose size={16} /></button></div><div className="inspector-scroll">{draft && sky ? <><div className="draft-state"><span className={dirty ? 'state-dot unsaved' : 'state-dot'} />{!canEdit ? tr("浏览模式 \xB7 参数只读") : dirty ? tr("未保存的修改") : tr("已保存至该用户名的目录")}<div><button disabled={!history.length || saving} title={tr("撤销 (⌘/Ctrl Z)")} onClick={undo}><Undo2 size={15} /></button><button disabled={!future.length || saving} title={tr("重做 (⌘/Ctrl Shift Z)")} onClick={redo}><Redo2 size={15} /></button></div></div><label className="form-label">{tr("气泡名称")}<input value={draft.name} maxLength={100} disabled={saving || !canEdit} onChange={e => edit({
                name: e.target.value
              })} /></label><div className="section-label">{tr("天球中心 ")}<span>ICRS · J2000</span></div><NumberField label={tr("赤经 RA")} value={+sky.ra.toFixed(7)} step={.0001} min={0} max={360} unit="deg" disabled={saving || !canEdit} onChange={v => changeSky('ra', v)} /><NumberField label={tr("赤纬 Dec")} value={+sky.dec.toFixed(7)} step={.0001} min={-90} max={90} unit="deg" disabled={saving || !canEdit} onChange={v => changeSky('dec', v)} /><button className="sexagesimal" title={tr("复制中心 RA / Dec")} onClick={() => {
              navigator.clipboard.writeText(`${sky.ra.toFixed(8)} ${sky.dec.toFixed(8)}`).then(() => notify(tr("已复制 ICRS 中心坐标"))).catch(() => notify(tr("复制失败，可从参数框中复制坐标。")));
            }}>{sexagesimal(sky)}<Copy size={12} /></button><div className="section-label">{tr("椭圆形状 ")}<span>{tr("角尺度")}</span></div><div className="axis-fields"><NumberField label={tr("长半轴 a")} value={+sky.a_arcsec.toFixed(3)} min={.8} max={3200} step={.5} unit="″" disabled={saving || !canEdit} onChange={v => changeSky('a_arcsec', v)} /><NumberField label={tr("短半轴 b")} value={+sky.b_arcsec.toFixed(3)} min={.8} max={3200} step={.5} unit="″" disabled={saving || !canEdit} onChange={v => changeSky('b_arcsec', v)} /></div><NumberField label={tr("方位角 PA")} value={+sky.pa_deg.toFixed(3) % 180} min={0} max={179.999} step={1} unit="deg" disabled={saving || !canEdit} onChange={v => changeSky('pa_deg', v)} /><p className="field-hint">{tr("PA 从天球北向东计，范围 0–180\xB0。")}{!sky.pa_defined ? tr("近圆形的 PA 无唯一意义。") : tr("尺寸为半轴，非直径。")}</p><div className="diameters"><span>{tr("全长 \xD7 全宽")}</span><b>{(sky.a_arcsec * 2).toFixed(1)}″ × {(sky.b_arcsec * 2).toFixed(1)}″</b></div><label className="form-label">{tr("标注分类")}<select value={draft.confidence} disabled={saving || !canEdit} onChange={e => edit({
                confidence: e.target.value as Bubble['confidence']
              })}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label className="form-label">{tr("观察备注")}<textarea placeholder={tr("记录壳层、边缘、重叠结构或不确定性…")} value={draft.notes} maxLength={4000} disabled={saving || !canEdit} onChange={e => edit({
                notes: e.target.value
              })} /></label><div className="selection-tools"><button disabled={saving || !canEdit} onClick={() => {
                remember();
                setDraft(d => d ? {
                  ...d,
                  ry: d.rx
                } : null);
              }}>{tr("恢复为圆")}</button><button disabled={saving || !canEdit} onClick={() => stage.current?.focus(draft)}><Crosshair size={12} />{tr(" 定位")}</button></div></> : <div className="inspector-empty"><div className="inspector-illustration"><svg width="118" height="100" viewBox="0 0 118 100"><ellipse cx="57" cy="53" rx="39" ry="25" transform="rotate(-22 57 53)" /><path d="M25 33l64 40M47 28l20 50" /><circle cx="57" cy="53" r="3" /><rect x="17" y="28" width="7" height="7" /><rect x="88" y="68" width="7" height="7" /><circle cx="40" cy="13" r="4" /><path d="M42 17l4 10" /></svg></div><b>{tr("从一个圆开始")}</b><p>{tr("添加圆后，拖动中心移动位置，")}<br />{tr("拉动手柄调整大小和轴比，")}<br />{tr("拖动顶部手柄旋转。")}</p><button disabled={!canEdit || !ready} onClick={() => create()}><Plus size={14} />{tr(" 添加第一个圆")}</button><small>{tr("选中已有气泡，也可以继续编辑")}</small></div>}
    <div className="view-settings"><div className="section-label">{tr("视图方向 ")}<span>{tr("仅影响显示")}</span></div><div className="orientation-buttons"><button className={rotation === 0 ? 'active' : ''} onClick={() => setRotation(0)}>{tr("长轴水平")}</button><button className={Math.abs(rotation - (-90 - meta.display_pa_deg) * Math.PI / 180) < .001 ? 'active' : ''} onClick={() => setRotation((-90 - meta.display_pa_deg) * Math.PI / 180)}>{tr("北向上")}</button></div><label className="rotation-slider"><input aria-label={tr("旋转显示角度")} type="range" min="-180" max="180" step="1" value={Math.round(rotation * 180 / Math.PI)} onChange={e => setRotation(+e.target.value * Math.PI / 180)} /><span>{(rotation * 180 / Math.PI).toFixed(0)}°</span></label><p className="field-hint">{tr("旋转不改变保存的 RA、Dec 和 PA。")}</p></div></div><div className="inspector-actions"><button className="save-button" disabled={!draft || !dirty || saving || !canEdit} onClick={save}><Check size={16} />{saving ? tr("正在保存…") : tr("确认并保存")}<kbd>⌘ S</kbd></button><div><button onClick={cancel} disabled={!draft || !dirty || saving || !canEdit}>{tr("取消修改")}</button><button className="delete-button" disabled={!draft || saving || !canEdit} onClick={() => draft?.id ? setModal('delete') : (() => {
              if (mayLeave()) {
                setDraft(null);
                setBaseline(null);
                setTool('select');
              }
            })()}><Trash2 size={13} /> {draft?.id ? tr("删除") : tr("放弃草稿")}</button></div></div></aside>}
  </div>
  <footer className="status-bar"><div><span className="live-dot" />{saving ? tr("正在保存") : dirty ? tr("草稿待确认") : canEdit ? tr("当前用户名目录已连接") : viewingId ? tr("浏览其他参与者的目录") : tr("选择用户名后可保存标注")}<span className="footer-divider" />{skyCursor ? <span className="cursor-sky">RA {skyCursor.ra.toFixed(6)}° <span>Dec {skyCursor.dec.toFixed(6)}°</span></span> : <span>{tr("ICRS \xB7 TAN 投影")}</span>}</div><div>{cursor && <span>Aᵥ {cursor.av === null ? tr("无覆盖") : cursor.av.toFixed(3) + ' mag'}{cursor.resolution ? ' · ' + cursor.resolution + tr("″ 分辨率") : ''}</span>}<span className="footer-divider" /><span>{Math.round(zoom * 100)}%</span><button onClick={() => setModal('about')}>{tr("1.6″ / 显示像素 ")}<Info size={12} /></button></div></footer>
  {notice && <div className="toast" role="status"><CheckCircle2 size={16} />{notice}<button title={tr("关闭提示")} onClick={() => setNotice('')}><X size={14} /></button></div>}
  {modal && <div className="modal-backdrop" onClick={() => !saving && !profileBusy && setModal(null)}><section key={modal} className={modal === 'statistics' ? 'modal statistics-modal' : modal === 'help' ? 'modal guide-modal' : 'modal'} role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e => e.stopPropagation()}><button className="modal-close" title={tr("关闭对话框")} disabled={profileBusy} onClick={() => setModal(null)}><X size={18} /></button>
   {modal === 'profiles' && <><span className="eyebrow">CHOOSE AN OBSERVER</span><h2 id="modal-title">{tr("选择标注用户名")}</h2><p>{tr("用户名只用来分开标注，无需密码。所有目录公开可浏览；选择已有用户名，也可以继续编辑该目录。")}</p><div className="profile-picker">{profiles.map(p => <div key={p.id}><span className="observer-avatar">{p.name.charAt(0)}</span><span><b>{p.name}</b><small>{p.count || 0}{tr(" 个气泡")}{activeProfile?.id === p.id ? tr(" \xB7 当前标注者") : ''}</small></span><button disabled={profileBusy} onClick={() => browse(p)}>{tr("浏览")}</button><button className="select-profile" disabled={profileBusy} onClick={() => chooseProfile('select', p.id)}>{tr("选择")}</button></div>)}{!profiles.length && <p>{tr("还没有用户名，创建第一个吧。")}</p>}</div>{activeProfile && <button className="manage-profile-button" onClick={() => {
            setRenameName(activeProfile.name);
            setDeleteName('');
            setProfileError('');
            setModal('manage-profile');
          }}><SlidersHorizontal size={14} />{tr(" 管理当前用户：")}{activeProfile.name}</button>}<div className="new-profile"><label className="form-label">{tr("创建新用户名")}<input autoComplete="off" aria-label={tr("新用户名")} placeholder={tr("输入你的名字或观察者编号")} maxLength={100} value={profileName} onChange={e => setProfileName(e.target.value)} onKeyDown={e => {
                if (e.key === 'Enter' && validUsername(profileName)) chooseProfile('create');
              }} /></label><p className="username-limit">{tr("用户名长度：")}{usernameWidth(profileName)}{tr("/20（汉字计 2，半角字符计 1）")}</p><button className="save-button" disabled={!validUsername(profileName) || profileBusy} onClick={() => chooseProfile('create')}><Plus size={15} />{profileBusy ? tr("正在选择…") : tr("创建并进入")}</button></div></>}
   {modal === 'manage-profile' && activeProfile && <><span className="eyebrow">MANAGE OBSERVER</span><h2 id="modal-title">{tr("管理用户名")}</h2><p>{tr("当前用户：")}<b>{activeProfile.name}</b>{tr("。重命名保留全部标注与坐标。")}</p><label className="form-label">{tr("新用户名")}<input aria-label={tr("重命名用户名")} maxLength={100} disabled={profileBusy} value={renameName} onChange={e => setRenameName(e.target.value)} /></label><p className="username-limit">{tr("用户名长度：")}{usernameWidth(renameName)}{tr("/20（汉字计 2，半角字符计 1）")}</p><button className="save-button" disabled={profileBusy || !validUsername(renameName) || renameName === activeProfile.name} onClick={() => manageProfile('rename')}>{tr("保存新用户名")}</button><div className="profile-delete-section"><h3>{tr("删除用户")}</h3><p>{tr("将永久删除 ")}<b>{activeProfile.name}</b>{tr(" 的全部标注，并退出所有使用该用户名的会话。请先导出需要保留的目录。")}</p><label className="form-label">{tr("输入当前完整用户名确认")}<input aria-label={tr("删除用户确认名称")} autoComplete="off" disabled={profileBusy} value={deleteName} onChange={e => setDeleteName(e.target.value)} /></label><button className="profile-delete-confirm" disabled={profileBusy || deleteName !== activeProfile.name} onClick={() => manageProfile('delete')}>{profileBusy ? tr("正在处理…") : tr("永久删除用户及全部标注")}</button></div>{profileError && <p className="profile-error" role="alert">{profileError}</p>}<button className="manage-profile-back" disabled={profileBusy} onClick={() => setModal('profiles')}>{tr("返回用户名名单")}</button></>}
   {modal === 'help' && <HelpGuide initialSection={helpSection} />}
   {modal === 'statistics' && <StatisticsPanel items={items} viewingId={viewingId} viewingName={viewingProfile?.name || ''} meta={meta} onHelp={() => {
          setHelpSection('statistics');
          setModal('help');
        }} />}
   {modal === 'about' && <><span className="eyebrow">DATA & COORDINATES</span><h2 id="modal-title">{tr("可追溯的每一次标注")}</h2><p>{tr("底图来自 Sun et al. 的 M31 PHAT / PHAST 恒星示踪 V 波段消光图，使用本地原始 FITS 的 HEALPix 数值。未做平滑、插值或银河系前景扣除。")}</p><dl className="about-facts"><div><dt>{tr("投影")}</dt><dd>{tr("以 M31 为中心的 ICRS TAN")}</dd></div><div><dt>{tr("显示采样")}</dt><dd>{tr("1.6 角秒 / 像素")}</dd></div><div><dt>{tr("原始有效分辨率")}</dt><dd>{tr("6.44 / 3.22 / 1.61 角秒")}</dd></div><div><dt>{tr("显示数值精度")}</dt><dd>{tr("0.001 mag（仅显示量化）")}</dd></div><div><dt>{tr("椭圆参数")}</dt><dd>{tr("局部切平面半轴；PA 从北向东")}</dd></div></dl><p>{tr("「长轴水平」仅将视图旋转到近似长轴方向（显示基准 38\xB0），不进行盘面去投影。参数在服务端从原始 WCS 重新计算。JSON 另存 96 个 ICRS 边界点，以精确保留绘制轮廓；DS9 椭圆采用局部近似。")}</p><p className="data-note">{tr("透明暗底是未覆盖区域，不代表零消光。中心约 3′ 内受拥挤影响，PHAST 双波段区域细结构较不可靠；较粗分辨率数值会重复到细网格，不能当作独立测量。Hist 使用原始细网格覆盖面积的全局分布。")}</p><div className="source-buttons"><a href={meta.paper_url} target="_blank" rel="noreferrer">{tr("阅读论文 ")}<ArrowUpRight size={14} /></a><a href={meta.source_url} target="_blank" rel="noreferrer">{tr("NADC 数据 ")}<ArrowUpRight size={14} /></a></div></>}
   {modal === 'export' && <><span className="eyebrow">EXPORT CATALOG</span><h2 id="modal-title">{tr("导出 ")}{viewingProfile?.name}{tr(" 的 ")}{items.length}{tr(" 个气泡")}</h2><p>{tr("仅导出当前浏览目录已确认保存的记录。RA / Dec 为 ICRS 度，a / b 为角秒半轴，PA 从北向东计。")}</p>{dirty && <p className="data-note">{tr("当前草稿尚未保存，不包含在本次导出中。")}</p>}<div className="export-options">{[['csv', tr("CSV 表格"), tr("天球坐标、半轴、PA、分类和备注")], ['json', tr("JSON 完整目录"), tr("包含 WCS、显示设置和精确天球边界")], ['ds9', tr("DS9 区域文件"), tr("用于 SAOImage DS9 的 ICRS 椭圆区域")]].map(([key, title, desc]) => <button key={key} onClick={() => exportData(key)}><Download size={19} /><span><b>{title}</b><small>{desc}</small></span><ArrowUpRight size={17} /></button>)}</div></>}
   {modal === 'delete' && <><span className="eyebrow">DELETE REGION</span><h2 id="modal-title">{tr("删除 ")}{draft?.name}？</h2><p>{tr("这将从当前用户名的目录移除这个椭圆。该操作不影响其他用户名的目录。")}</p><div className="modal-actions"><button onClick={() => setModal(null)}>{tr("取消")}</button><button className="danger" disabled={saving || !canEdit} onClick={remove}>{saving ? tr("正在删除…") : tr("确认删除")}</button></div></>}
   {modal === 'goto' && <><span className="eyebrow">GO TO COORDINATES</span><h2 id="modal-title">{tr("跳转到天球坐标")}</h2><p>{tr("输入 ICRS 十进制度坐标。地图方向不会改变。")}</p><label className="form-label">{tr("RA（度）")}<input type="number" value={jump.ra} onChange={e => setJump(s => ({
              ...s,
              ra: e.target.value
            }))} /></label><label className="form-label">{tr("Dec（度）")}<input type="number" value={jump.dec} onChange={e => setJump(s => ({
              ...s,
              dec: e.target.value
            }))} /></label><button className="save-button" onClick={() => {
            const ra = Number(jump.ra),
              dec = Number(jump.dec),
              pos = skyToPixel({
                ra,
                dec
              }, meta);
            if (!jump.ra.trim() || !jump.dec.trim() || !Number.isFinite(ra) || !Number.isFinite(dec) || ra < 0 || ra >= 360 || dec <= -90 || dec >= 90 || !Number.isFinite(pos.x) || pos.x < 0 || pos.y < 0 || pos.x >= meta.width || pos.y >= meta.height) {
              notify(tr("请输入地图范围内的有效 RA / Dec。"));
              return;
            }
            stage.current?.focus(pos);
            setModal(null);
          }}><Target size={15} />{tr(" 定位坐标")}</button></>}
  </section></div>}
 </div>;
}
