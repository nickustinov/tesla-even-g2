import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { AppActions, SetStatus } from '../_shared/app-types'
import { appendEventLog } from '../_shared/log'
import { initApp, refreshState } from './app'
import { initUI } from './ui'

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`Even bridge not detected within ${timeoutMs}ms`))
    }, timeoutMs)

    promise
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => window.clearTimeout(timer))
  })
}

export function createTeslaActions(setStatus: SetStatus): AppActions {
  initUI()
  let connected = false

  return {
    async connect() {
      setStatus('Tesla: connecting to Even bridge...')
      appendEventLog(`Tesla plugin v${__APP_VERSION__}`)
      appendEventLog('Tesla: connect requested')

      try {
        const bridge = await withTimeout(waitForEvenAppBridge(), 6000)
        await initApp(bridge)
        connected = true
        setStatus('Tesla: connected. Tap=actions, DblTap=refresh.')
        appendEventLog('Tesla: connected to bridge')
      } catch (err) {
        console.error('[tesla] connect failed', err)
        setStatus('Tesla: bridge not found. Running in mock mode.')
        appendEventLog('Tesla: connection failed')
      }
    },
    async action() {
      if (!connected) {
        setStatus('Tesla: not connected')
        appendEventLog('Tesla: action blocked (not connected)')
        return
      }

      await refreshState()
      setStatus('Tesla: vehicle state refreshed')
      appendEventLog('Tesla: manual refresh via action button')
    },
  }
}
