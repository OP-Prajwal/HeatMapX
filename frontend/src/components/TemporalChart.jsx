import React, { useState } from 'react';
import axios from 'axios';
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, Loader2, ChevronDown, ChevronUp, CalendarDays, Thermometer, Leaf, Building2 } from 'lucide-react';

// ─── Custom Tooltip ──────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(255,255,255,0.97)',
      border: '1px solid rgba(0,0,0,0.06)',
      borderRadius: '14px',
      padding: '14px 18px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
      fontSize: '0.9rem',
      minWidth: '180px'
    }}>
      <p style={{ fontWeight: 800, marginBottom: '8px', fontSize: '1rem', color: '#0f172a' }}>{label}</p>
      {payload.map((entry, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', color: entry.color, marginBottom: '4px', fontWeight: 600 }}>
          <span>{entry.name}</span>
          <span>{typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}{entry.unit || ''}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Trend Badge ─────────────────────────────────────────────────────────────
const TrendBadge = ({ first, last, unit = '', invert = false }) => {
  if (first == null || last == null) return null;
  const delta = last - first;
  const isWorse = invert ? delta < 0 : delta > 0;
  const Icon = Math.abs(delta) < 0.01 ? Minus : isWorse ? TrendingUp : TrendingDown;
  const color = Math.abs(delta) < 0.01 ? '#64748b' : isWorse ? '#dc2626' : '#059669';
  const bg = Math.abs(delta) < 0.01 ? '#f1f5f9' : isWorse ? '#fef2f2' : '#ecfdf5';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '4px 10px', borderRadius: '99px', fontSize: '0.8rem',
      fontWeight: 700, background: bg, color
    }}>
      <Icon size={12} />
      {delta > 0 ? '+' : ''}{delta.toFixed(2)}{unit}
    </span>
  );
};

// ─── Stat Mini Card ──────────────────────────────────────────────────────────
const MiniStat = ({ label, icon: Icon, first, last, unit, invert, color }) => (
  <div style={{
    background: '#f8fafc', borderRadius: '12px', padding: '14px 16px',
    display: 'flex', flexDirection: 'column', gap: '6px',
    border: '1px solid rgba(0,0,0,0.04)'
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '0.82rem', fontWeight: 600 }}>
      <Icon size={14} color={color} />
      {label}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>
        {last != null ? last.toFixed(2) : 'N/A'}{unit}
      </span>
      <TrendBadge first={first} last={last} unit={unit} invert={invert} />
    </div>
    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>vs {first != null ? first.toFixed(2) + unit : 'N/A'} in {' '}earliest year</span>
  </div>
);

// ─── Main Component ──────────────────────────────────────────────────────────
export default function TemporalChart({ position, drawBounds }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(true);
  const [activeMetric, setActiveMetric] = useState('heatRisk');

  const fetchTemporal = async () => {
    if (!position) return;
    setLoading(true);
    setError('');
    setData(null);

    try {
      const formData = new FormData();
      formData.append('lat', position.lat);
      formData.append('lng', position.lng);
      if (drawBounds) {
        formData.append('minLat', drawBounds.minLat);
        formData.append('maxLat', drawBounds.maxLat);
        formData.append('minLng', drawBounds.minLng);
        formData.append('maxLng', drawBounds.maxLng);
      }

      const res = await axios.post('http://localhost:5000/api/temporal', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Temporal analysis failed. Make sure GEE is available.');
    } finally {
      setLoading(false);
    }
  };

  const metrics = [
    { key: 'heatRisk', label: 'Heat Risk %', color: '#ef4444', unit: '%' },
    { key: 'lst', label: 'Surface Temp', color: '#f97316', unit: '°C' },
    { key: 'ndvi', label: 'NDVI (Vegetation)', color: '#10b981', unit: '' },
    { key: 'greenCover', label: 'Green Cover %', color: '#22c55e', unit: '%' },
    { key: 'builtUpCover', label: 'Built-up %', color: '#6366f1', unit: '%' },
  ];

  const active = metrics.find(m => m.key === activeMetric);
  const series = data?.series ?? [];
  const first = series[0];
  const last = series[series.length - 1];

  return (
    <div className="bento-card animate-fade-in" style={{ gridColumn: 'span 3', marginTop: '0' }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: data ? '1.5rem' : '0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ padding: '10px', background: 'linear-gradient(135deg, #dbeafe, #ede9fe)', borderRadius: '12px' }}>
            <CalendarDays size={22} color="#4f46e5" />
          </div>
          <div>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '2px' }}>Historical Trend Analysis</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {data ? `${data.yearsReturned} years of GEE data • 2019–2025` : 'Reveal how heat risk has changed at this location over years'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {data && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="btn btn-glass"
              style={{ padding: '8px 14px', fontSize: '0.85rem' }}
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          )}
          <button
            className="btn btn-primary"
            style={{ padding: '10px 22px', fontSize: '0.9rem' }}
            onClick={fetchTemporal}
            disabled={!position || loading}
          >
            {loading
              ? <><Loader2 className="spin" size={16} /> Fetching years...</>
              : <><CalendarDays size={16} /> {data ? 'Refresh Trend' : 'Analyze Trend'}</>
            }
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Loader2 className="spin" size={32} color="#4f46e5" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontWeight: 600 }}>Querying GEE for 7 years of satellite data...</p>
          <p style={{ fontSize: '0.85rem', marginTop: '6px' }}>This may take 20–40 seconds</p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div style={{ padding: '1rem 1.5rem', background: '#fef2f2', borderRadius: '12px', color: '#b91c1c', fontWeight: 600, fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      {/* Chart + Summary */}
      {data && expanded && !loading && (
        <>
          {/* Mini stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '1.5rem' }}>
            <MiniStat label="Heat Risk" icon={TrendingUp} first={first?.heatRisk} last={last?.heatRisk} unit="%" invert color="#ef4444" />
            <MiniStat label="Surface Temp" icon={Thermometer} first={first?.lst} last={last?.lst} unit="°C" invert color="#f97316" />
            <MiniStat label="NDVI" icon={Leaf} first={first?.ndvi} last={last?.ndvi} unit="" invert={false} color="#10b981" />
            <MiniStat label="Built-up Cover" icon={Building2} first={first?.builtUpCover} last={last?.builtUpCover} unit="%" invert color="#6366f1" />
          </div>

          {/* Metric selector tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1.2rem', flexWrap: 'wrap' }}>
            {metrics.map(m => (
              <button
                key={m.key}
                onClick={() => setActiveMetric(m.key)}
                style={{
                  padding: '7px 16px', borderRadius: '99px', border: 'none', cursor: 'pointer',
                  fontWeight: 700, fontSize: '0.82rem', fontFamily: 'var(--font-main)',
                  transition: 'all 0.2s',
                  background: activeMetric === m.key ? m.color : '#f1f5f9',
                  color: activeMetric === m.key ? '#fff' : '#475569',
                  boxShadow: activeMetric === m.key ? `0 4px 12px ${m.color}44` : 'none',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Area chart */}
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <AreaChart data={series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={active.color} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={active.color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 13, fontFamily: 'var(--font-main)', fontWeight: 600, fill: '#64748b' }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fontFamily: 'var(--font-main)', fill: '#94a3b8' }}
                  axisLine={false} tickLine={false}
                  tickFormatter={v => `${v}${active.unit}`}
                  width={50}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey={active.key}
                  name={active.label}
                  stroke={active.color}
                  strokeWidth={3}
                  fill="url(#colorGrad)"
                  dot={{ r: 5, fill: active.color, strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 7, fill: active.color }}
                  unit={active.unit}
                  animationDuration={800}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Multi-line comparison chart */}
          <div style={{ marginTop: '1.5rem' }}>
            <p style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              All Metrics Comparison
            </p>
            <div style={{ width: '100%', height: 200 }}>
              <ResponsiveContainer>
                <LineChart data={series} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                  <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#94a3b8', fontFamily: 'var(--font-main)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={35} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '0.8rem', fontFamily: 'var(--font-main)', paddingTop: '8px' }} />
                  <Line type="monotone" dataKey="heatRisk" name="Heat Risk %" stroke="#ef4444" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="lst" name="LST °C" stroke="#f97316" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="greenCover" name="Green Cover %" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="builtUpCover" name="Built-up %" stroke="#6366f1" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Raw data table */}
          <details style={{ marginTop: '1.5rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-muted)', userSelect: 'none', padding: '8px 0' }}>
              Raw data table
            </summary>
            <div style={{ overflowX: 'auto', marginTop: '10px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', fontFamily: 'var(--font-main)' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #f1f5f9', color: '#64748b', textAlign: 'left' }}>
                    {['Year', 'LST °C', 'NDVI', 'NDBI', 'NDWI', 'Green%', 'Built%', 'Heat Risk%'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {series.map(row => (
                    <tr key={row.year} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0f172a' }}>{row.year}</td>
                      <td style={{ padding: '8px 12px', color: '#f97316' }}>{row.lst ?? '—'}</td>
                      <td style={{ padding: '8px 12px', color: '#10b981' }}>{row.ndvi ?? '—'}</td>
                      <td style={{ padding: '8px 12px' }}>{row.ndbi ?? '—'}</td>
                      <td style={{ padding: '8px 12px', color: '#2563eb' }}>{row.ndwi ?? '—'}</td>
                      <td style={{ padding: '8px 12px', color: '#22c55e' }}>{row.greenCover ?? '—'}</td>
                      <td style={{ padding: '8px 12px', color: '#6366f1' }}>{row.builtUpCover ?? '—'}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 700, color: row.heatRisk > 70 ? '#dc2626' : row.heatRisk > 40 ? '#d97706' : '#059669' }}>
                        {row.heatRisk ?? '—'}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
