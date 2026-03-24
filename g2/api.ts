import type { VehicleState, ActionParams } from './state'

const TOKEN_KEY = 'tesla:tessie-token'
const VIN_KEY = 'tesla:vin'

const TESSIE_API = 'https://api.tessie.com'

// --- Token ---

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? ''
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
  // Clear cached VIN when token changes so we re-discover
  localStorage.removeItem(VIN_KEY)
  cachedVin = null
}

// --- VIN discovery (client-side) ---

let cachedVin: string | null = localStorage.getItem(VIN_KEY)

async function tessieGet(path: string): Promise<Response> {
  return fetch(`${TESSIE_API}${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
}

async function tessiePost(path: string): Promise<Response> {
  return fetch(`${TESSIE_API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
  })
}

async function getVin(): Promise<string> {
  if (cachedVin) {
      return cachedVin
  }

  const res = await tessieGet('/vehicles')
  if (!res.ok) throw new Error(`Failed to list vehicles: ${res.status}`)
  const data = await res.json() as { results: Array<{ vin: string }> }
  const first = data.results?.[0]
  if (!first) throw new Error('No vehicles found on this Tessie account')

  cachedVin = first.vin
  localStorage.setItem(VIN_KEY, cachedVin)
  return cachedVin
}

// --- State ---

export async function getState(): Promise<VehicleState> {
  const vin = await getVin()
  const res = await tessieGet(`/${vin}/state`)
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

    const qsStr = qs.toString()
    const url = `${TESSIE_API}${path}${qsStr ? '?' + qsStr : ''}`

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
    })
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
const MAP_HEIGHT = 100

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

export async function getMap(): Promise<ArrayBuffer | null> {
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

    // Export as PNG ArrayBuffer
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob(resolve!, 'image/png'))
    return await blob.arrayBuffer()
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
