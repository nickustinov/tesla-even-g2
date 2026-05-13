import { OsEventTypeList, type EvenHubEvent } from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../_shared/log'
import { sendCommand } from './api'
import { quickActions, resolveLabel, resolveCommand, categories } from './actions'
import type { ActionItem } from './actions'
import * as navigation from './navigation'
import { getBridge, state } from './state'
import type { ActionParams } from './state'
import { showDashboard, showMenu, showLoading, showConfirmation, showConfirm } from './renderer'

// Forward declaration – set by app.ts to avoid circular import
let refreshStateFn: () => Promise<void> = async () => {}

export function setRefreshState(fn: () => Promise<void>): void {
  refreshStateFn = fn
}

// Protobuf omits zero-value fields, so currentSelectItemIndex arrives as
// undefined when the cursor is at item 0. Default to 0 in that case
// instead of guessing from prior state.
function readListIndex(event: EvenHubEvent): number {
  const idx = event.listEvent?.currentSelectItemIndex
  if (typeof idx !== 'number' || idx < 0) return 0
  return idx
}

// --- Event normalisation ---

export function resolveEventType(event: EvenHubEvent): OsEventTypeList | undefined {
  const raw =
    event.listEvent?.eventType ??
    event.textEvent?.eventType ??
    event.sysEvent?.eventType ??
    ((event.jsonData ?? {}) as Record<string, unknown>).eventType ??
    ((event.jsonData ?? {}) as Record<string, unknown>).event_type ??
    ((event.jsonData ?? {}) as Record<string, unknown>).Event_Type ??
    ((event.jsonData ?? {}) as Record<string, unknown>).type

  if (typeof raw === 'number') {
    switch (raw) {
      case 0: return OsEventTypeList.CLICK_EVENT
      case 1: return OsEventTypeList.SCROLL_TOP_EVENT
      case 2: return OsEventTypeList.SCROLL_BOTTOM_EVENT
      case 3: return OsEventTypeList.DOUBLE_CLICK_EVENT
      default: return undefined
    }
  }

  if (typeof raw === 'string') {
    const v = raw.toUpperCase()
    if (v.includes('DOUBLE')) return OsEventTypeList.DOUBLE_CLICK_EVENT
    if (v.includes('CLICK')) return OsEventTypeList.CLICK_EVENT
    if (v.includes('SCROLL_TOP') || v.includes('UP')) return OsEventTypeList.SCROLL_TOP_EVENT
    if (v.includes('SCROLL_BOTTOM') || v.includes('DOWN')) return OsEventTypeList.SCROLL_BOTTOM_EVENT
  }

  if (event.listEvent || event.textEvent || event.sysEvent) return OsEventTypeList.CLICK_EVENT

  return undefined
}

// --- Command execution ---

async function executeCommand(cmd: string, label: string, params?: ActionParams): Promise<void> {
  await showLoading(label)

  const result = await sendCommand(cmd, params)
  if (result.ok) {
    appendEventLog(`Command: ${label} succeeded`)
    await showConfirmation(label + ' \u2013 OK')
  } else {
    appendEventLog(`Command: ${label} failed: ${result.error}`)
    await showConfirmation(`Failed: ${result.error}`)
  }

  setTimeout(() => {
    if (state.screen === 'confirmation') {
      void refreshStateFn()
    }
  }, 2000)
}

// --- Action handler (shared by dashboard and menu) ---

async function handleAction(item: ActionItem): Promise<void> {
  if (item.type === 'refresh') {
    await refreshStateFn()
    return
  }

  if (item.type === 'submenu') {
    navigation.push({ kind: 'actions', label: item.label, items: item.children })
    await showMenu()
    return
  }

  const resolved = resolveCommand(item, state.vehicle)
  if (!resolved) return

  const label = resolveLabel(item, state.vehicle)

  if ((item.type === 'command' || item.type === 'toggle') && item.confirm) {
    state.pendingAction = { cmd: resolved.cmd, label, params: resolved.params }
    await showConfirm(label)
    return
  }

  await executeCommand(resolved.cmd, label, resolved.params)
}

// --- Dashboard events ---

export async function handleDashboardEvent(event: EvenHubEvent, eventType: OsEventTypeList | undefined): Promise<void> {
  if (eventType === OsEventTypeList.CLICK_EVENT) {
    const idx = readListIndex(event)

    const actions = quickActions()
    // Last item is "More >"
    if (idx === actions.length) {
      navigation.push({ kind: 'categories', items: categories().slice(1) })
      await showMenu()
      return
    }

    if (idx >= actions.length) return

    await handleAction(actions[idx])
    return
  }

  if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    // Even Hub submission requirement: double-tap on the root page
    // must invoke the host exit dialogue. Refresh is still available
    // as the first quick action on the dashboard.
    const bridge = getBridge()
    if (bridge) {
      appendEventLog('Dashboard double-tap: shutDownPageContainer(1)')
      try {
        await bridge.shutDownPageContainer(1)
      } catch (err) {
        appendEventLog(`shutDownPageContainer failed: ${(err as Error).message}`)
      }
    }
    return
  }
}

// --- Menu events ---

export async function handleMenuEvent(event: EvenHubEvent, eventType: OsEventTypeList | undefined): Promise<void> {
  if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    await goBack()
    return
  }

  if (eventType !== OsEventTypeList.CLICK_EVENT) return

  const idx = readListIndex(event)

  // Index 0 is always "< Back"
  if (idx === 0) {
    await goBack()
    return
  }

  const level = navigation.current()
  if (!level) {
    await showDashboard()
    return
  }

  // Adjust for "< Back" at index 0
  const menuIdx = idx - 1

  if (level.kind === 'categories') {
    if (menuIdx >= level.items.length) return
    const cat = level.items[menuIdx]
    navigation.push({ kind: 'actions', label: cat.label, items: cat.items })
    await showMenu()
    return
  }

  if (menuIdx >= level.items.length) return
  await handleAction(level.items[menuIdx])
}

// --- Back navigation ---

async function goBack(): Promise<void> {
  navigation.pop()
  if (navigation.depth() === 0) {
    await showDashboard()
  } else {
    await showMenu()
  }
}

// --- Pre-execution confirm events ---

export async function handleConfirmEvent(event: EvenHubEvent, eventType: OsEventTypeList | undefined): Promise<void> {
  if (eventType !== OsEventTypeList.CLICK_EVENT) return

  const idx = readListIndex(event)

  const pending = state.pendingAction
  state.pendingAction = null

  if (idx === 1 && pending) {
    await executeCommand(pending.cmd, pending.label, pending.params)
  } else {
    // Cancel – go back to previous screen
    if (navigation.depth() === 0) {
      await showDashboard()
    } else {
      await showMenu()
    }
  }
}

// --- Post-execution confirmation events ---

export async function handleConfirmationEvent(): Promise<void> {
  await refreshStateFn()
}

// --- Top-level dispatcher ---

// Drop incoming events while a handler is still in flight. Prevents the SDK
// from re-entering navigation while we're mid-rebuild (which otherwise made
// Back appear to do nothing because a stale press was processed against
// freshly-rebuilt-but-still-loading state).
let processing = false

export function onEvenHubEvent(event: EvenHubEvent): void {
  if (processing) return

  const eventType = resolveEventType(event)
  appendEventLog(`Event: type=${String(eventType)} screen=${state.screen}`)

  let handler: Promise<void> | undefined
  switch (state.screen) {
    case 'dashboard':
      handler = handleDashboardEvent(event, eventType)
      break
    case 'menu':
      handler = handleMenuEvent(event, eventType)
      break
    case 'confirm':
      handler = handleConfirmEvent(event, eventType)
      break
    case 'confirmation':
      handler = handleConfirmationEvent()
      break
    case 'loading':
      if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
        const bridge = getBridge()
        if (bridge) {
          appendEventLog('Loading double-tap: shutDownPageContainer(1)')
          void bridge.shutDownPageContainer(1)
        }
      }
      break
  }

  if (handler) {
    processing = true
    void handler.finally(() => { processing = false })
  }
}
