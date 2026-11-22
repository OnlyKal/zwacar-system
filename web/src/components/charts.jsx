/* eslint-disable react-refresh/only-export-components */
/**
 * Graphiques thémés (Recharts) — palette ZwaCar.
 */
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtMonth } from '../utils/format'

export const PALETTE = ['#947A26', '#16140f', '#c9b26a', '#12805c', '#2b6cb0', '#b26a00', '#6b46c1', '#c0392b']

const axis = { stroke: '#a39e90', fontSize: 11.5, tickLine: false, axisLine: false }

function Tip({ active, payload, label, format = (v) => v, labelFormat = fmtMonth }) {
  if (!active || !payload?.length) return null
  return (
    <div className="tt">
      <div className="tt-title">{label ? labelFormat(label) : payload[0]?.name}</div>
      {payload.map((p) => (
        <div key={p.dataKey || p.name} className="row" style={{ gap: 8 }}>
          <i style={{ width: 8, height: 8, borderRadius: 2, background: p.color || p.payload?.fill, display: 'inline-block' }} />
          {p.name} : <b>{format(p.value, p.dataKey)}</b>
        </div>
      ))}
    </div>
  )
}

export const Legend = ({ items }) => (
  <div className="legend">
    {items.map(([label, color]) => (
      <span key={label}>
        <i style={{ background: color }} />
        {label}
      </span>
    ))}
  </div>
)

/** Courbe en aire (une ou plusieurs séries). series: [{ key, name, color }] */
export function AreaSeries({ data, series, format, height = 290 }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="#efebe1" vertical={false} />
          <XAxis dataKey="month" tickFormatter={fmtMonth} {...axis} />
          <YAxis {...axis} allowDecimals={false} width={48} />
          <Tooltip content={<Tip format={format} />} cursor={{ stroke: '#d9d1bc' }} />
          {series.map((s) => (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.5} fill={s.color} fillOpacity={0.12} animationDuration={900} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function BarSeries({ data, series, format, height = 290, stacked }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 8, left: -12, bottom: 0 }} barGap={4}>
          <CartesianGrid stroke="#efebe1" vertical={false} />
          <XAxis dataKey="month" tickFormatter={fmtMonth} {...axis} />
          <YAxis {...axis} allowDecimals={false} width={48} />
          <Tooltip content={<Tip format={format} />} cursor={{ fill: 'rgba(148,122,38,.06)' }} />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[3, 3, 0, 0]} maxBarSize={26} stackId={stacked ? 'a' : undefined} animationDuration={900} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function LineSeries({ data, series, height = 290 }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="#efebe1" vertical={false} />
          <XAxis dataKey="month" tickFormatter={fmtMonth} {...axis} />
          <YAxis {...axis} allowDecimals={false} width={48} />
          <Tooltip content={<Tip />} />
          {series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} animationDuration={900} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Anneau avec total au centre. data: [{ name, value }] */
export function Donut({ data, height = 230, centerLabel }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div style={{ height, position: 'relative' }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data.filter((d) => d.value > 0)} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="92%" paddingAngle={2} stroke="none" animationDuration={900}>
            {data.filter((d) => d.value > 0).map((d, i) => (
              <Cell key={d.name} fill={d.color || PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip content={<Tip labelFormat={(x) => x} />} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>{total}</div>
          <div className="small muted">{centerLabel}</div>
        </div>
      </div>
    </div>
  )
}
