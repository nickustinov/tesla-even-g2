import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../_shared/log'
import { getState, getToken, loadSettings } from './api'
import { loadUnits } from './units'
import { state, setBridge } from './state'
import { showDashboard } from './renderer'
import { onEvenHubEvent, setRefreshState } from './events'

export async function refreshState(): Promise<void> {
  if (!getToken()) {
    appendEventLog('State: no token configured')
    return
  }

  try {
    state.vehicle = await getState()
    appendEventLog('State: refreshed')
  } catch (err) {
    console.error('[tesla] refreshState failed', err)
    appendEventLog(`State: refresh failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (state.screen === 'dashboard' || state.screen === 'confirmation') {
    await showDashboard()
  }
}

let refreshInterval: ReturnType<typeof setInterval> | null = null

export async function initApp(appBridge: EvenAppBridge): Promise<void> {
  setBridge(appBridge)
  setRefreshState(refreshState)

  appBridge.onEvenHubEvent((event) => {
    onEvenHubEvent(event)
  })

  await loadSettings(appBridge)
  await loadUnits(appBridge)

  if (getToken()) {
    appendEventLog('Tesla: token found, auto-connecting')
    await refreshState()
    await showDashboard()
  }

  if (!refreshInterval) {
    refreshInterval = setInterval(() => { void refreshState() }, 60_000)
  }
}
