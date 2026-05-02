import { useState } from 'react'
import type { ElevationProfile } from '../lib/elevation'
import { useMediaQuery, MOBILE_QUERY } from '../lib/use-media-query'
import './ElevationChart.css'

type Props = {
  profile: ElevationProfile
}

const CHART_W = 600
const CHART_H = 120
const PAD = { top: 12, right: 12, bottom: 22, left: 44 }

export function ElevationChart({ profile }: Props) {
  const isMobile = useMediaQuery(MOBILE_QUERY)
  const [collapsed, setCollapsed] = useState(isMobile)

  const innerW = CHART_W - PAD.left - PAD.right
  const innerH = CHART_H - PAD.top - PAD.bottom

  const totalKm = profile.total_distance_km
  const yMin = profile.min_elevation_m
  const yMax = profile.max_elevation_m
  const yRange = Math.max(yMax - yMin, 1)

  const scaleX = (km: number) => (totalKm > 0 ? (km / totalKm) * innerW : 0) + PAD.left
  const scaleY = (m: number) => innerH - ((m - yMin) / yRange) * innerH + PAD.top

  const linePath = profile.points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.distance_km).toFixed(1)} ${scaleY(p.elevation_m).toFixed(1)}`)
    .join(' ')

  const baselineY = innerH + PAD.top
  const lastX = scaleX(profile.points[profile.points.length - 1].distance_km).toFixed(1)
  const firstX = scaleX(profile.points[0].distance_km).toFixed(1)
  const fillPath = `${linePath} L ${lastX} ${baselineY.toFixed(1)} L ${firstX} ${baselineY.toFixed(1)} Z`

  return (
    <div className={`elev-panel ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="elev-stats">
        <span className="elev-stat">
          <span className="elev-stat-label">距離</span>
          <span className="elev-stat-value">{totalKm.toFixed(2)} km</span>
        </span>
        <span className="elev-stat">
          <span className="elev-stat-label">↑ 上昇</span>
          <span className="elev-stat-value">{Math.round(profile.total_ascent_m)} m</span>
        </span>
        <span className="elev-stat">
          <span className="elev-stat-label">↓ 下降</span>
          <span className="elev-stat-value">{Math.round(profile.total_descent_m)} m</span>
        </span>
        <span className="elev-stat">
          <span className="elev-stat-label">最大勾配</span>
          <span className="elev-stat-value">{profile.max_slope_pct.toFixed(1)} %</span>
        </span>
        <button
          type="button"
          className="elev-toggle"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={collapsed ? 'false' : 'true'}
          title={collapsed ? '勾配グラフを展開' : '勾配グラフを折り畳む'}
        >
          {collapsed ? '▲' : '▼'}
        </button>
      </div>
      {!collapsed && (
        <svg
          className="elev-chart"
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="ルートの勾配プロファイル"
        >
          <line
            x1={PAD.left}
            y1={baselineY}
            x2={innerW + PAD.left}
            y2={baselineY}
            stroke="#D1D5DB"
            strokeWidth={1}
          />
          <path d={fillPath} fill="#3B82F6" fillOpacity={0.18} />
          <path d={linePath} fill="none" stroke="#2563EB" strokeWidth={1.8} />
          <text x={4} y={PAD.top + 6} fontSize="10" fill="#6B7280">
            {Math.round(yMax)} m
          </text>
          <text x={4} y={baselineY + 4} fontSize="10" fill="#6B7280">
            {Math.round(yMin)} m
          </text>
          <text x={PAD.left} y={CHART_H - 4} fontSize="10" fill="#6B7280">
            0 km
          </text>
          <text x={innerW + PAD.left} y={CHART_H - 4} fontSize="10" fill="#6B7280" textAnchor="end">
            {totalKm.toFixed(1)} km
          </text>
        </svg>
      )}
    </div>
  )
}
