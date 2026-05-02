import { useEffect, useState } from 'react'
import { fetchSapporoWeather, weatherEmoji, type WeatherForecast } from '../lib/weather'
import { useMediaQuery, MOBILE_QUERY } from '../lib/use-media-query'
import './WeatherCard.css'

const TODAY_LABEL = ['今日', '明日', '明後日']

function formatDateLabel(iso: string, idx: number): string {
  if (idx < TODAY_LABEL.length) return TODAY_LABEL[idx]
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function WeatherCard() {
  const isMobile = useMediaQuery(MOBILE_QUERY)
  const [forecast, setForecast] = useState<WeatherForecast | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(isMobile)

  useEffect(() => {
    let cancelled = false
    fetchSapporoWeather()
      .then((f) => {
        if (cancelled) return
        setForecast(f)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message || '天気予報取得に失敗しました')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error && !forecast) {
    return (
      <div className="weather-card weather-card-error" role="status">
        ⚠️ 天気: {error}
      </div>
    )
  }

  if (!forecast) {
    return (
      <div className="weather-card weather-card-loading" role="status">
        ☁️ 天気予報を取得中...
      </div>
    )
  }

  const visibleDays = forecast.days.slice(0, 2)

  return (
    <div className={`weather-card ${collapsed ? 'is-collapsed' : ''}`}>
      <header className="weather-header">
        <div className="weather-title">
          <span className="weather-area">{forecast.area}</span>
          <span className="weather-source">気象庁</span>
        </div>
        <button
          type="button"
          className="weather-toggle"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={collapsed ? 'false' : 'true'}
          title={collapsed ? '天気を展開' : '天気を折り畳む'}
        >
          {/* On mobile the card is anchored at the bottom and grows upward,
              so the arrow direction is reversed vs. the top-anchored desktop. */}
          {isMobile ? (collapsed ? '▲' : '▼') : (collapsed ? '▼' : '▲')}
        </button>
      </header>
      {!collapsed && (
        <ul className="weather-days">
          {visibleDays.map((day, i) => (
            <li key={day.date} className="weather-day">
              <div className="weather-day-label">
                <span className="weather-day-name">{formatDateLabel(day.date, i)}</span>
                <span className="weather-day-icon">{weatherEmoji(day.weatherCode)}</span>
              </div>
              <div className="weather-day-text">{day.weather}</div>
              <div className="weather-day-meta">
                {day.popMax !== null && (
                  <span className="weather-meta-item">降水 {day.popMax}%</span>
                )}
                {(day.tempMin !== null || day.tempMax !== null) && (
                  <span className="weather-meta-item">
                    {day.tempMin !== null ? `${day.tempMin}°` : '—'}
                    {' / '}
                    {day.tempMax !== null ? `${day.tempMax}°` : '—'}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
