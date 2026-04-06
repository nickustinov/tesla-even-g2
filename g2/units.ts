import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { getBridge } from './state'

const TEMP_KEY = 'tesla:temp-unit'
const DIST_KEY = 'tesla:dist-unit'

export type TempUnit = 'F' | 'C'
export type DistUnit = 'mi' | 'km'

let cachedTempUnit: TempUnit = 'F'
let cachedDistUnit: DistUnit = 'mi'

export async function loadUnits(b: EvenAppBridge): Promise<void> {
  cachedTempUnit = ((await b.getLocalStorage(TEMP_KEY)) as TempUnit) ?? 'F'
  cachedDistUnit = ((await b.getLocalStorage(DIST_KEY)) as DistUnit) ?? 'mi'
}

export function getTempUnit(): TempUnit {
  return cachedTempUnit
}

export function setTempUnit(unit: TempUnit): void {
  cachedTempUnit = unit
  const b = getBridge()
  if (b) void b.setLocalStorage(TEMP_KEY, unit)
}

export function getDistUnit(): DistUnit {
  return cachedDistUnit
}

export function setDistUnit(unit: DistUnit): void {
  cachedDistUnit = unit
  const b = getBridge()
  if (b) void b.setLocalStorage(DIST_KEY, unit)
}

export function displayTemp(celsius: number): string {
  if (getTempUnit() === 'F') {
    return `${Math.round((celsius * 9) / 5 + 32)}\u00B0F`
  }
  return `${Math.round(celsius)}\u00B0C`
}

export function displayRange(miles: number): string {
  if (getDistUnit() === 'km') {
    return `${Math.round(miles * 1.60934)}km`
  }
  return `${Math.round(miles)}mi`
}

export function tempPresetValues(): { displayLabel: string; celsius: number }[] {
  if (getTempUnit() === 'F') {
    return [62, 66, 70, 74, 78].map(f => ({
      displayLabel: `${f}\u00B0F`,
      celsius: Math.round(((f - 32) * 5) / 9),
    }))
  }
  return [18, 20, 22, 24, 26].map(c => ({
    displayLabel: `${c}\u00B0C`,
    celsius: c,
  }))
}
