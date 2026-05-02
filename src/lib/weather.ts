// JMA (気象庁) public forecast API.
// Endpoint format (proxied through Vite to bypass missing CORS):
//   /api/weather/{officeCode} → https://www.jma.go.jp/bosai/forecast/data/forecast/{officeCode}.json
//
// Office codes (北海道):
//   016000 — 石狩・空知・後志地方  (Sapporo is here)
//   017000 — 渡島・檜山地方
//   etc.
//
// We narrow down to 石狩地方 (016010) for weather/precip and 札幌 (14163) for
// temperature within the office-level response.

const SAPPORO_OFFICE_CODE = '016000'
const SAPPORO_AREA_CODE = '016010' // 石狩地方
const SAPPORO_CITY_CODE = '14163' // 札幌

export type WeatherDay = {
  date: string // YYYY-MM-DD (Asia/Tokyo)
  weather: string
  weatherCode: string
  popMax: number | null // max precipitation probability (0-100), null if unknown
  tempMin: number | null
  tempMax: number | null
}

export type WeatherForecast = {
  publishingOffice: string
  reportDatetime: string
  area: string
  days: WeatherDay[]
}

type JmaArea = {
  area: { name: string; code: string }
  weatherCodes?: string[]
  weathers?: string[]
  pops?: string[]
  temps?: string[]
}

type JmaTimeSeries = {
  timeDefines: string[]
  areas: JmaArea[]
}

type JmaShortTerm = {
  publishingOffice: string
  reportDatetime: string
  timeSeries: JmaTimeSeries[]
}

type JmaResponse = JmaShortTerm[]

function findArea(ts: JmaTimeSeries | undefined, code: string): JmaArea | undefined {
  if (!ts) return undefined
  return ts.areas.find((a) => a.area.code === code) ?? ts.areas[0]
}

function parseIntOrNull(v: string | undefined): number | null {
  if (!v) return null
  const n = parseInt(v, 10)
  return Number.isNaN(n) ? null : n
}

function dateOf(iso: string): string {
  return iso.slice(0, 10)
}

export async function fetchSapporoWeather(): Promise<WeatherForecast> {
  const res = await fetch(`/api/weather/${SAPPORO_OFFICE_CODE}`)
  if (!res.ok) {
    throw new Error(`天気予報取得失敗: ${res.status} ${res.statusText}`)
  }
  const data = (await res.json()) as JmaResponse
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('天気予報のレスポンスが想定外です')
  }

  const short = data[0]
  const tsWeather = short.timeSeries[0]
  const tsPop = short.timeSeries[1]
  const tsTemp = short.timeSeries[2]

  const weatherArea = findArea(tsWeather, SAPPORO_AREA_CODE)
  const popArea = findArea(tsPop, SAPPORO_AREA_CODE)
  const tempArea = findArea(tsTemp, SAPPORO_CITY_CODE)

  if (!weatherArea?.weathers || !weatherArea.weatherCodes) {
    throw new Error('天気テキストの抽出に失敗')
  }

  const days: WeatherDay[] = []
  for (let i = 0; i < tsWeather.timeDefines.length; i++) {
    const dateIso = tsWeather.timeDefines[i]
    const date = dateOf(dateIso)

    let popMax: number | null = null
    if (popArea?.pops) {
      const popsForDay = tsPop.timeDefines
        .map((td, idx) => (dateOf(td) === date ? parseIntOrNull(popArea.pops?.[idx]) : null))
        .filter((n): n is number => n !== null)
      if (popsForDay.length > 0) popMax = Math.max(...popsForDay)
    }

    let tempMin: number | null = null
    let tempMax: number | null = null
    if (tempArea?.temps) {
      const tempsForDay = tsTemp.timeDefines
        .map((td, idx) => (dateOf(td) === date ? parseIntOrNull(tempArea.temps?.[idx]) : null))
        .filter((n): n is number => n !== null)
      if (tempsForDay.length > 0) {
        tempMin = Math.min(...tempsForDay)
        tempMax = Math.max(...tempsForDay)
      }
    }

    days.push({
      date,
      weather: weatherArea.weathers[i] ?? '',
      weatherCode: weatherArea.weatherCodes[i] ?? '',
      popMax,
      tempMin,
      tempMax,
    })
  }

  return {
    publishingOffice: short.publishingOffice,
    reportDatetime: short.reportDatetime,
    area: weatherArea.area.name,
    days,
  }
}

export function weatherEmoji(code: string): string {
  const n = parseInt(code, 10)
  if (Number.isNaN(n)) return ''
  if (n >= 100 && n < 200) return '☀️'
  if (n >= 200 && n < 300) return '☁️'
  if (n >= 300 && n < 400) return '🌧️'
  if (n >= 400) return '❄️'
  return ''
}
