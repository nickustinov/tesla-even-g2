import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { getBridge } from './state'

const TEMP_KEY = 'tesla:temp-unit'
const DIST_KEY = 'tesla:dist-unit'

export type TempUnit = 'F' | 'C'
export type DistUnit = 'mi' | 'km'

let cachedTempUnit: TempUnit = 'F'
let cachedDistUnit: DistUnit = 'mi'
const unitListeners: Array<() => void> = []

export function onUnitsLoaded(cb: () => void): void {
  unitListeners.push(cb)
}

export async function loadUnits(b: EvenAppBridge): Promise<void> {
  const rawTemp = await b.getLocalStorage(TEMP_KEY)
  if (rawTemp === 'F' || rawTemp === 'C') {
    cachedTempUnit = rawTemp
  } else if (cachedTempUnit !== 'F') {
    // UI set a unit before bridge connected – sync to SDK
    await b.setLocalStorage(TEMP_KEY, cachedTempUnit)
  }

  const rawDist = await b.getLocalStorage(DIST_KEY)
  if (rawDist === 'mi' || rawDist === 'km') {
    cachedDistUnit = rawDist
  } else if (cachedDistUnit !== 'mi') {
    await b.setLocalStorage(DIST_KEY, cachedDistUnit)
  }

  for (const cb of unitListeners) cb()
}

export function getTempUnit(): TempUnit {
  return cachedTempUnit
}

export async function setTempUnit(unit: TempUnit): Promise<void> {
  cachedTempUnit = unit
  const b = getBridge()
  if (b) await b.setLocalStorage(TEMP_KEY, unit)
}

export function getDistUnit(): DistUnit {
  return cachedDistUnit
}

export async function setDistUnit(unit: DistUnit): Promise<void> {
  cachedDistUnit = unit
  const b = getBridge()
  if (b) await b.setLocalStorage(DIST_KEY, unit)
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
