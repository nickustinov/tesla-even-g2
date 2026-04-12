import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { VehicleState, ActionParams } from './state'
import { getBridge } from './state'

const TOKEN_KEY = 'tesla:token'
const VIN_KEY = 'tesla:vin'

const TESSIE_API = 'https://api.tessie.com'

// --- Settings (SDK local storage + memory cache) ---

let cachedToken = ''
let cachedVin: string | null = null
const settingsListeners: Array<() => void> = []

export function onSettingsLoaded(cb: () => void): void {
  settingsListeners.push(cb)
}

export async function loadSettings(b: EvenAppBridge): Promise<void> {
  const rawToken = await b.getLocalStorage(TOKEN_KEY)
  if (rawToken) {
    cachedToken = rawToken
  } else if (cachedToken) {
    await b.setLocalStorage(TOKEN_KEY, cachedToken)
  }

  const rawVin = await b.getLocalStorage(VIN_KEY)
  if (rawVin) {
    cachedVin = rawVin
  }

  for (const cb of settingsListeners) cb()
}

export function getToken(): string {
  return cachedToken
}

export function setToken(token: string): void {
  cachedToken = token
  cachedVin = null
  const b = getBridge()
  if (b) {
    void b.setLocalStorage(TOKEN_KEY, token)
    void b.setLocalStorage(VIN_KEY, '')
  }
}

// Use query-param auth instead of a Bearer header. WebViews trigger a CORS
// preflight for custom headers, which Tessie handles inconsistently per
// endpoint; a plain GET with ?access_token= is a CORS "simple request" and
// avoids the preflight entirely. Tessie documents both methods as supported.
function tessieUrl(path: string): string {
  const sep = path.includes('?') ? '&' : '?'
  return `${TESSIE_API}${path}${sep}access_token=${encodeURIComponent(getToken())}`
}

async function tessieGet(path: string): Promise<Response> {
  return fetch(tessieUrl(path))
}

function clearVinCache(): void {
  cachedVin = null
  const b = getBridge()
  if (b) void b.setLocalStorage(VIN_KEY, '')
}

async function fetchVin(): Promise<string> {
  const res = await tessieGet('/vehicles?only_active=true')
  if (!res.ok) throw new Error(`Failed to list vehicles: ${res.status}`)
  const data = await res.json() as { results: Array<{ vin: string; is_active?: boolean }> }
  const first = data.results?.find(v => v.is_active !== false) ?? data.results?.[0]
  if (!first) throw new Error('No active vehicles found on this Tessie account')

  cachedVin = first.vin
  const b = getBridge()
  if (b) void b.setLocalStorage(VIN_KEY, cachedVin)
  return cachedVin
}

async function getVin(): Promise<string> {
  if (cachedVin) return cachedVin
  return fetchVin()
}

// --- State ---

export async function getState(): Promise<VehicleState> {
  let vin = await getVin()
  let res = await tessieGet(`/${vin}/state`)

  // Cached VIN may be stale (e.g. archived vehicle from a prior version).
  // On 403/404, invalidate cache, re-list, and retry once.
  if ((res.status === 403 || res.status === 404) && cachedVin) {
    clearVinCache()
    vin = await fetchVin()
    res = await tessieGet(`/${vin}/state`)
  }

  if (!res.ok) throw new Error(`State fetch failed: ${res.status}`)
  const data = await res.json()

  const charge = data.charge_state ?? {}
  const climate = data.climate_state ?? {}
  const vehicle = data.vehicle_state ?? {}

  return {
    batteryLevel: charge.battery_level ?? 0,
    range: charge.battery_range ?? 0,
    climateOn: climate.is_climate_on ?? false,
    insideTemp: climate.inside_temp ?? 0,
    outsideTemp: climate.outside_temp ?? 0,
    locked: vehicle.locked ?? true,
    chargingState: charge.charging_state ?? 'Unknown',
    sentryMode: vehicle.sentry_mode ?? false,
    chargePortDoorOpen: charge.charge_port_door_open ?? false,
    chargeLimitSoc: charge.charge_limit_soc ?? 80,
    chargeAmps: charge.charge_current_request ?? 0,
    driverTempSetting: climate.driver_temp_setting ?? 20,
    defrostMode: climate.defrost_mode !== 0 && climate.defrost_mode !== undefined,
    seatHeaterLeft: climate.seat_heater_left ?? 0,
    seatHeaterRight: climate.seat_heater_right ?? 0,
    valetMode: vehicle.valet_mode ?? false,
    sunRoofPercentOpen: vehicle.sun_roof_percent_open ?? 0,
    homelinkNearby: vehicle.homelink_nearby ?? false,
  }
}

// --- Commands ---

export async function sendCommand(cmd: string, params?: ActionParams): Promise<{ ok: boolean; error?: string }> {
  try {
    const vin = await getVin()
    const path = cmd === 'wake' ? `/${vin}/wake` : `/${vin}/command/${cmd}`

    const qs = new URLSearchParams()
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        qs.set(k, String(v))
      }
    }
    qs.set('access_token', getToken())

    const url = `${TESSIE_API}${path}?${qs.toString()}`

    const res = await fetch(url, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data.error ?? `HTTP ${res.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// --- Map (client-side canvas compositing) ---

const TILE_SIZE = 256
const MAP_ZOOM = 15
const MAP_WIDTH = 200
const MAP_TILE_HEIGHT = 108
const MAP_HEIGHT = MAP_TILE_HEIGHT * 2

function latLngToTileXY(lat: number, lng: number, zoom: number) {
  const n = 2 ** zoom
  const x = ((lng + 180) / 360) * n
  const y = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n
  return { x, y }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load tile: ${url}`))
    img.src = url
  })
}

export async function getMap(): Promise<{ top: ArrayBuffer; bottom: ArrayBuffer } | null> {
  try {
    const vin = await getVin()
    const stateRes = await tessieGet(`/${vin}/state`)
    if (!stateRes.ok) return null
    const stateData = await stateRes.json() as { drive_state?: { latitude?: number; longitude?: number } }

    const lat = stateData.drive_state?.latitude
    const lng = stateData.drive_state?.longitude
    if (typeof lat !== 'number' || typeof lng !== 'number') return null

    const { x: fx, y: fy } = latLngToTileXY(lat, lng, MAP_ZOOM)
    const centerTileX = Math.floor(fx)
    const centerTileY = Math.floor(fy)

    // Load 3x3 grid of tiles
    const tilePromises: Promise<{ img: HTMLImageElement; dx: number; dy: number }>[] = []
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = centerTileX + dx
        const ty = centerTileY + dy
        const url = `https://basemaps.cartocdn.com/dark_all/${MAP_ZOOM}/${tx}/${ty}.png`
        tilePromises.push(loadImage(url).then(img => ({ img, dx, dy })))
      }
    }

    const tiles = await Promise.all(tilePromises)

    // Composite onto offscreen canvas
    const gridSize = TILE_SIZE * 3
    const canvas = document.createElement('canvas')
    canvas.width = MAP_WIDTH
    canvas.height = MAP_HEIGHT
    const ctx = canvas.getContext('2d')!

    // Car's pixel position within the 3x3 grid
    const carPixelX = (fx - (centerTileX - 1)) * TILE_SIZE
    const carPixelY = (fy - (centerTileY - 1)) * TILE_SIZE

    // Crop offset (centered on car)
    const cropLeft = Math.max(0, Math.min(gridSize - MAP_WIDTH, Math.round(carPixelX - MAP_WIDTH / 2)))
    const cropTop = Math.max(0, Math.min(gridSize - MAP_HEIGHT, Math.round(carPixelY - MAP_HEIGHT / 2)))

    // Draw tiles with crop offset
    for (const { img, dx, dy } of tiles) {
      const tileX = (dx + 1) * TILE_SIZE - cropLeft
      const tileY = (dy + 1) * TILE_SIZE - cropTop
      ctx.drawImage(img, tileX, tileY, TILE_SIZE, TILE_SIZE)
    }

    // Draw car marker
    const markerX = Math.round(carPixelX - cropLeft)
    const markerY = Math.round(carPixelY - cropTop)
    ctx.beginPath()
    ctx.arc(markerX, markerY, 6, 0, Math.PI * 2)
    ctx.strokeStyle = 'white'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(markerX, markerY, 2, 0, Math.PI * 2)
    ctx.fillStyle = 'white'
    ctx.fill()

    // Split into two halves for separate image containers
    const topCanvas = document.createElement('canvas')
    topCanvas.width = MAP_WIDTH
    topCanvas.height = MAP_TILE_HEIGHT
    topCanvas.getContext('2d')!.drawImage(canvas, 0, 0, MAP_WIDTH, MAP_TILE_HEIGHT, 0, 0, MAP_WIDTH, MAP_TILE_HEIGHT)

    const bottomCanvas = document.createElement('canvas')
    bottomCanvas.width = MAP_WIDTH
    bottomCanvas.height = MAP_TILE_HEIGHT
    bottomCanvas.getContext('2d')!.drawImage(canvas, 0, MAP_TILE_HEIGHT, MAP_WIDTH, MAP_TILE_HEIGHT, 0, 0, MAP_WIDTH, MAP_TILE_HEIGHT)

    const topBlob = await new Promise<Blob>((resolve) => topCanvas.toBlob(resolve!, 'image/png'))
    const bottomBlob = await new Promise<Blob>((resolve) => bottomCanvas.toBlob(resolve!, 'image/png'))

    return {
      top: await topBlob.arrayBuffer(),
      bottom: await bottomBlob.arrayBuffer(),
    }
  } catch {
    return null
  }
}

// --- Connection check ---

export async function checkConnection(): Promise<boolean> {
  try {
    const res = await tessieGet('/vehicles')
    return res.ok
  } catch {
    return false
  }
}
