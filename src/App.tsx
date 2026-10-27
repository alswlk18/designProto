import { useEffect, useMemo, useState } from 'react'

const YEARS = [2020, 2021, 2022, 2023, 2024, 2025]
const ACCENT = '#FF8A3D'
const RESPONSE_KEYS = [
  '전혀 만족하지 않는다',
  '만족하지 않는다',
  '다소 만족하지 않는다',
  '보통이다',
  '다소 만족한다',
  '만족한다',
  '매우 만족한다',
] as const
const RESPONSE_COLORS = ['#343434', '#505050', '#707070', '#aaaaaa', '#80421f', '#bd612d', ACCENT]
type Metric = 'avg' | 'satisfied'
type Sort = 'desc' | 'asc' | 'original'
type Cell = { sample: number | null; responses: (number | null)[]; avg: number | null; satisfied: number | null }
type Row = { category: string; group: string; values: Record<number, Cell> }
type Tip = { x: number; y: number; title: string; lines: string[]; low?: boolean } | null

function parseCSV(text: string) {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/)
  const parse = (line: string) => {
    const out: string[] = []
    let cell = '', quote = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') quote = !quote
      else if (c === ',' && !quote) { out.push(cell); cell = '' }
      else cell += c
    }
    out.push(cell)
    return out
  }
  return lines.slice(2).map(parse).map((r): Row => {
    const values = {} as Record<number, Cell>
    YEARS.forEach((year, yi) => {
      const start = 2 + yi * 9
      const nums = r.slice(start, start + 9).map(v => v === '-' || v === '' ? null : Number(v))
      const responses = nums.slice(1, 8)
      values[year] = {
        sample: nums[0],
        responses,
        avg: nums[8],
        satisfied: responses.slice(4).some(v => v == null) ? null : responses.slice(4).reduce<number>((a, b) => a + (b ?? 0), 0),
      }
    })
    return { category: r[0], group: r[1], values }
  })
}

const valueOf = (cell: Cell, metric: Metric) => metric === 'avg' ? cell.avg : cell.satisfied
const fmt = (n: number | null, suffix = '') => n == null ? '—' : `${n.toFixed(1)}${suffix}`
const sampleFmt = (n: number | null) => n == null ? '—' : n.toLocaleString('ko-KR')
const pathFor = (points: { x: number; y: number; valid: boolean }[]) => {
  let d = ''
  points.forEach((p, i) => {
    if (!p.valid) return
    const prev = points[i - 1]
    d += `${!prev?.valid ? 'M' : 'L'}${p.x},${p.y} `
  })
  return d
}

function Toggle({ metric, setMetric }: { metric: Metric; setMetric: (m: Metric) => void }) {
  return <div className="toggle" aria-label="지표 선택">
    <button className={metric === 'avg' ? 'active' : ''} onClick={() => setMetric('avg')}>평균(7점)</button>
    <button className={metric === 'satisfied' ? 'active' : ''} onClick={() => setMetric('satisfied')}>만족 비율(%)</button>
  </div>
}

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null
  return <div className="tooltip" style={{ left: tip.x, top: tip.y }}>
    <strong>{tip.title}</strong>
    {tip.lines.map((line, i) => <span key={i}>{line}</span>)}
    {tip.low && <em>표본 적음</em>}
  </div>
}

function SectionHead({ index, title, note, right }: { index: string; title: string; note: string; right?: React.ReactNode }) {
  return <div className="section-head">
    <div><span className="eyebrow">{index}</span><h2>{title}</h2><p>{note}</p></div>
    {right && <div className="controls">{right}</div>}
  </div>
}

function LineChart({ rows, metric, active, setActive, height = 340 }: {
  rows: Row[]; metric: Metric; active?: string | null; setActive?: (s: string | null) => void; height?: number
}) {
  const [tip, setTip] = useState<Tip>(null)
  const W = 900, H = height, P = { l: 48, r: 24, t: 34, b: 40 }
  const all = rows.flatMap(r => YEARS.map(y => valueOf(r.values[y], metric))).filter((v): v is number => v != null)
  const min = metric === 'avg' ? Math.floor(Math.min(...all) * 5) / 5 - .1 : Math.floor(Math.min(...all) / 10) * 10
  const max = metric === 'avg' ? Math.ceil(Math.max(...all) * 5) / 5 + .1 : Math.ceil(Math.max(...all) / 10) * 10
  const x = (i: number) => P.l + i * (W - P.l - P.r) / 5
  const y = (v: number) => P.t + (max - v) / (max - min || 1) * (H - P.t - P.b)
  const showValue = rows.length === 1
  const onTip = (e: React.MouseEvent, row: Row, year: number, cell: Cell) => {
    const rect = e.currentTarget.closest('.chart-wrap')!.getBoundingClientRect()
    setTip({ x: e.clientX - rect.left + 10, y: e.clientY - rect.top - 10, title: `${year} · ${row.group}`, lines: [`${metric === 'avg' ? '평균' : '만족 비율'} ${fmt(valueOf(cell, metric), metric === 'avg' ? '점' : '%')}`, `표본수 ${sampleFmt(cell.sample)}명`], low: (cell.sample ?? Infinity) < 150 })
  }
  return <div className="chart-wrap">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="연도별 추이 선 그래프">
      {[0, .25, .5, .75, 1].map(t => {
        const val = min + (max - min) * (1 - t), yy = P.t + t * (H - P.t - P.b)
        return <g key={t}><line className="grid" x1={P.l} x2={W - P.r} y1={yy} y2={yy}/><text className="axis" x={P.l - 10} y={yy + 4} textAnchor="end">{val.toFixed(metric === 'avg' ? 1 : 0)}</text></g>
      })}
      {YEARS.map((year, i) => <text className="axis" x={x(i)} y={H - 12} textAnchor="middle" key={year}>{year}</text>)}
      {rows.map((row, ri) => {
        const pts = YEARS.map((year, i) => {
          const v = valueOf(row.values[year], metric)
          return { x: x(i), y: v == null ? 0 : y(v), valid: v != null, year, cell: row.values[year] }
        })
        const selected = !active || active === row.group
        const low = YEARS.some(year => (row.values[year].sample ?? Infinity) < 150)
        return <g key={row.group} className="series" style={{ opacity: selected ? 1 : .12 }} onClick={() => setActive?.(active === row.group ? null : row.group)}>
          <path d={pathFor(pts)} fill="none" stroke={active === row.group ? ACCENT : ri === 0 && rows.length === 1 ? '#fff' : '#e9e9e9'} strokeWidth={active === row.group ? 3.5 : 2} strokeDasharray={low ? '7 6' : undefined}/>
          {pts.filter(p => p.valid).map(p => <g key={p.year}>
            <circle cx={p.x} cy={p.y} r={active === row.group ? 5 : 4} fill={active === row.group ? ACCENT : '#0a0a0a'} stroke={active === row.group ? ACCENT : '#fff'} strokeWidth="2" onMouseMove={e => onTip(e, row, p.year, p.cell)} onMouseLeave={() => setTip(null)}/>
            {showValue && <text className="point-label" x={p.x} y={p.y - 13} textAnchor="middle">{fmt(valueOf(p.cell, metric), metric === 'avg' ? '' : '%')}</text>}
          </g>)}
        </g>
      })}
    </svg>
    <Tooltip tip={tip}/>
  </div>
}

function Distribution({ row }: { row: Row }) {
  const [tip, setTip] = useState<Tip>(null)
  return <div className="distribution chart-wrap">
    {YEARS.map(year => {
      const cell = row.values[year]
      return <div className="dist-row" key={year}>
        <b>{year}</b><div className="stacked">
          {cell.responses.map((v, i) => v != null && <div key={i} style={{ width: `${v}%`, background: RESPONSE_COLORS[i] }} onMouseMove={e => {
            const rect = e.currentTarget.closest('.chart-wrap')!.getBoundingClientRect()
            setTip({ x: e.clientX - rect.left + 10, y: e.clientY - rect.top - 10, title: `${year} · ${RESPONSE_KEYS[i]}`, lines: [`응답 비율 ${v.toFixed(1)}%`, `표본수 ${sampleFmt(cell.sample)}명`] })
          }} onMouseLeave={() => setTip(null)}/>)}
        </div>
      </div>
    })}
    <div className="dist-legend">{RESPONSE_KEYS.map((k, i) => <span key={k}><i style={{ background: RESPONSE_COLORS[i] }}/>{k}</span>)}</div>
    <Tooltip tip={tip}/>
  </div>
}

function RankChart({ rows, year, metric, sort }: { rows: Row[]; year: number; metric: Metric; sort: Sort }) {
  const [tip, setTip] = useState<Tip>(null)
  const valid = rows.map((r, i) => ({ row: r, i, v: valueOf(r.values[year], metric) })).filter(x => x.v != null) as { row: Row; i: number; v: number }[]
  const data = [...valid].sort((a, b) => sort === 'original' ? a.i - b.i : sort === 'desc' ? b.v - a.v : a.v - b.v)
  const best = Math.max(...valid.map(x => x.v))
  const min = metric === 'avg' ? 4 : Math.floor(Math.min(...valid.map(x => x.v)) / 10) * 10
  const max = Math.ceil(Math.max(...valid.map(x => x.v)) * (metric === 'avg' ? 5 : .1)) / (metric === 'avg' ? 5 : .1)
  return <div className="bar-chart chart-wrap">
    {data.map(({ row, v }) => <div className="bar-row" key={row.group}>
      <span>{row.group}{(row.values[year].sample ?? Infinity) < 150 && <em>표본 적음</em>}</span>
      <div className="bar-track"><div className="bar" style={{ width: `${Math.max(2, (v - min) / (max - min || 1) * 100)}%`, background: v === best ? ACCENT : '#eee' }}
        onMouseMove={e => {
          const rect = e.currentTarget.closest('.chart-wrap')!.getBoundingClientRect()
          setTip({ x: e.clientX - rect.left + 10, y: e.clientY - rect.top - 10, title: `${year} · ${row.group}`, lines: [`${metric === 'avg' ? '평균' : '만족 비율'} ${fmt(v, metric === 'avg' ? '점' : '%')}`, `표본수 ${sampleFmt(row.values[year].sample)}명`], low: (row.values[year].sample ?? Infinity) < 150 })
        }} onMouseLeave={() => setTip(null)}/></div>
      <b>{fmt(v)}</b>
    </div>)}
    <Tooltip tip={tip}/>
  </div>
}

function Dumbbell({ rows }: { rows: Row[] }) {
  const [tip, setTip] = useState<Tip>(null)
  const data = rows.map(row => ({ row, a: row.values[2020].avg!, b: row.values[2025].avg!, delta: row.values[2025].avg! - row.values[2020].avg! })).sort((x, y) => y.delta - x.delta)
  const min = 4, max = 5.4
  const pct = (v: number) => (v - min) / (max - min) * 100
  return <div className="dumbbell chart-wrap">
    <div className="db-axis"><span>4.0</span><span>4.5</span><span>5.0</span><span>5.4</span></div>
    {data.map(({ row, a, b, delta }) => <div className="db-row" key={row.group}>
      <span>{row.group}</span><div className="db-track">
        <i style={{ left: `${pct(Math.min(a, b))}%`, width: `${Math.abs(pct(b) - pct(a))}%`, background: delta >= 0 ? ACCENT : '#fff' }}/>
        {[{ y: 2020, v: a }, { y: 2025, v: b }].map(p => <button key={p.y} style={{ left: `${pct(p.v)}%`, borderColor: delta >= 0 ? ACCENT : '#fff', background: p.y === 2025 ? (delta >= 0 ? ACCENT : '#fff') : '#0a0a0a' }}
          onMouseMove={e => {
            const rect = e.currentTarget.closest('.chart-wrap')!.getBoundingClientRect()
            setTip({ x: e.clientX - rect.left + 10, y: e.clientY - rect.top - 10, title: `${p.y} · ${row.group}`, lines: [`평균 ${p.v.toFixed(1)}점`, `표본수 ${sampleFmt(row.values[p.y].sample)}명`], low: (row.values[p.y].sample ?? Infinity) < 150 })
          }} onMouseLeave={() => setTip(null)}/>)}
      </div><b className={delta >= 0 ? 'up' : ''}>{delta >= 0 ? '+' : ''}{delta.toFixed(1)}</b>
    </div>)}
    <Tooltip tip={tip}/>
  </div>
}

export default function App() {
  const [rows, setRows] = useState<Row[]>([])
  const [metric, setMetric] = useState<Metric>('avg')
  const [groupCat, setGroupCat] = useState('연령별')
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [rankCat, setRankCat] = useState('17개 시도별')
  const [rankYear, setRankYear] = useState(2025)
  const [sort, setSort] = useState<Sort>('desc')
  useEffect(() => { fetch('/kosis.csv').then(r => r.text()).then(t => setRows(parseCSV(t))) }, [])
  const categories = useMemo(() => [...new Set(rows.map(r => r.category))].filter(x => x !== '전체'), [rows])
  const total = rows.find(r => r.category === '전체')
  const groupRows = rows.filter(r => r.category === groupCat)
  const rankRows = rows.filter(r => r.category === rankCat)
  const cities = rows.filter(r => r.category === '17개 시도별')
  const noData = (cat: string, year?: number) => (cat === '권역별') || (cat === '가구주여부별' && (year ?? 2025) >= 2024) || ((cat === '근무 형태' || cat === '유연 근무제 여부') && (year ?? 2025) <= 2021)
  if (!total) return <main className="loading">데이터를 불러오는 중입니다…</main>
  const c25 = total.values[2025], c20 = total.values[2020]
  return <main>
    <header className="hero">
      <p className="kicker">KOSIS DATA STORY · 2020–2025</p>
      <h1>여가생활, 우리는<br/><span>얼마나 만족할까</span></h1>
      <p>지난 6년간 한국인의 여가생활 만족도는 어떻게 달라졌을까요? 전체 흐름부터 집단과 지역의 차이까지 살펴봅니다.</p>
    </header>

    <section className="kpis">
      {[
        ['2025 전체 평균', fmt(c25.avg, '점'), '7점 만점'],
        ['2025 만족 비율', fmt(c25.satisfied, '%'), '다소 만족 이상'],
        ['2020 대비 평균 증감', `${(c25.avg! - c20.avg!) >= 0 ? '+' : ''}${(c25.avg! - c20.avg!).toFixed(1)}점`, '6년간 변화'],
        ['2025 표본수', `${sampleFmt(c25.sample)}명`, '전국 조사'],
      ].map(([label, value, note]) => <article className="kpi" key={label}><p>{label}</p><strong>{value}</strong><span>{note}</span></article>)}
    </section>

    <section className="card">
      <SectionHead index="01" title="전체 추이" note="여가생활 만족도는 2021년 이후 꾸준히 상승했습니다." right={<Toggle metric={metric} setMetric={setMetric}/>}/>
      <LineChart rows={[total]} metric={metric}/>
    </section>

    <section className="card">
      <SectionHead index="02" title="응답 분포 변화" note="7단계 응답이 해마다 어떻게 이동했는지 비교합니다."/>
      <Distribution row={total}/>
    </section>

    <section className="card">
      <SectionHead index="03" title="집단별 추이" note="범례에 마우스를 올리거나 선을 클릭해 한 집단에 집중해 보세요." right={<>
        <select value={groupCat} onChange={e => { setGroupCat(e.target.value); setActiveGroup(null) }}>{categories.map(c => <option key={c}>{c}</option>)}</select>
        <Toggle metric={metric} setMetric={setMetric}/>
      </>}/>
      <div className="legend">{groupRows.map((r, i) => <button key={r.group} className={activeGroup === r.group ? 'active' : ''} onMouseEnter={() => setActiveGroup(r.group)} onMouseLeave={() => setActiveGroup(null)} onClick={() => setActiveGroup(activeGroup === r.group ? null : r.group)}><i style={{ background: activeGroup === r.group ? ACCENT : '#eee' }}/>{r.group}{YEARS.some(y => (r.values[y].sample ?? Infinity) < 150) && <em>표본 적음</em>}</button>)}</div>
      {noData(groupCat) && <p className="data-note">일부 연도는 해당 연도 자료 없음</p>}
      <LineChart rows={groupRows} metric={metric} active={activeGroup} setActive={setActiveGroup} height={390}/>
    </section>

    <section className="card">
      <SectionHead index="04" title="연도별 순위" note="같은 분류 안에서 집단별 수준을 비교합니다." right={<>
        <select value={rankCat} onChange={e => setRankCat(e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select>
        <Toggle metric={metric} setMetric={setMetric}/>
      </>}/>
      <div className="rank-tools">
        <label><span>{rankYear}년</span><input type="range" min="2020" max="2025" value={rankYear} onChange={e => setRankYear(Number(e.target.value))}/><small>2020</small><small>2025</small></label>
        <div className="sort">{([['desc','높은 순'],['asc','낮은 순'],['original','원래 순서']] as [Sort,string][]).map(([v,l]) => <button className={sort === v ? 'active' : ''} onClick={() => setSort(v)} key={v}>{l}</button>)}</div>
      </div>
      {noData(rankCat, rankYear) && <p className="data-note">해당 연도 자료 없음</p>}
      <RankChart rows={rankRows} year={rankYear} metric={metric} sort={sort}/>
      {metric === 'avg' && <p className="axis-note">축이 0이 아닌 4.0부터 시작합니다.</p>}
    </section>

    <section className="card">
      <SectionHead index="05" title="변화 비교" note="17개 시도의 2020년과 2025년 평균을 연결했습니다. 증감이 큰 순서입니다."/>
      <div className="db-legend"><span><i className="old"/>2020</span><span><i className="new"/>2025</span><span className="accent">상승</span><span>하락</span></div>
      <Dumbbell rows={cities}/>
      <p className="axis-note">평균 축은 4.0부터 시작합니다.</p>
    </section>

    <footer><p>출처: 문화체육관광부 「국민여가활동조사」, KOSIS(국가데이터처), 자료갱신일 2026-07-14</p><span>표본수가 150명 미만인 집단은 ‘표본 적음’으로 표시했습니다.</span></footer>
  </main>
}
