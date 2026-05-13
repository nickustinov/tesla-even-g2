import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { getBridge } from './state'

const KEY = 'tesla:quick-actions'

let cachedIds: string[] | null = null
const loadedListeners: Array<() => void> = []
const changeListeners: Array<() => void> = []

export function onQuickActionsLoaded(cb: () => void): void {
  loadedListeners.push(cb)
}

export function onQuickActionsChanged(cb: () => void): void {
  changeListeners.push(cb)
}

export async function loadQuickActionPrefs(b: EvenAppBridge): Promise<void> {
  const raw = await b.getLocalStorage(KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
        cachedIds = parsed
      }
    } catch {
      // ignore malformed value, fall back to defaults
    }
  }
  for (const cb of loadedListeners) cb()
}

// Returns the saved id order, or null if the user hasn't customised yet.
// Callers fall back to category defaults when null.
export function getQuickActionIds(): string[] | null {
  return cachedIds
}

export async function setQuickActionIds(ids: string[]): Promise<void> {
  cachedIds = ids
  const b = getBridge()
  if (b) await b.setLocalStorage(KEY, JSON.stringify(ids))
  for (const cb of changeListeners) cb()
}
