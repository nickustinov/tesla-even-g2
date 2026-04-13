import {
  CreateStartUpPageContainer,
  ImageContainerProperty,
  ImageRawDataUpdate,
  ListContainerProperty,
  ListItemContainerProperty,
  RebuildPageContainer,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../_shared/log'
import { getMap } from './api'
import { displayTemp, displayRange } from './units'
import {
  DISPLAY_WIDTH,
  DISPLAY_HEIGHT,
  HEADER_HEIGHT,
  FOOTER_HEIGHT,
  BODY_TOP,
  BODY_HEIGHT,
  MAP_WIDTH,
  MAP_TILE_HEIGHT,
  MAP_TOP,
  TEXT_WIDTH,
} from './layout'
import { resetSelectedIndex } from './events'
import { state, getBridge } from './state'
import type { VehicleState } from './state'
import { quickActions, resolveLabel, categories } from './actions'
import type { MenuLevel } from './navigation'
import * as navigation from './navigation'

// --- Rebuild helper ---

async function rebuildPage(config: {
  containerTotalNum: number
  textObject?: TextContainerProperty[]
  listObject?: ListContainerProperty[]
  imageObject?: ImageContainerProperty[]
}): Promise<void> {
  const b = getBridge()
  if (!b) return

  if (!state.startupRendered) {
    resetSelectedIndex()
    await b.createStartUpPageContainer(new CreateStartUpPageContainer(config))
    state.startupRendered = true
    return
  }

  resetSelectedIndex()
  await b.rebuildPageContainer(new RebuildPageContainer(config))
}

// --- Text helpers ---

function batteryBar(level: number): string {
  const filled = Math.round(level / 10)
  return '\u2501'.repeat(filled) + '\u2500'.repeat(10 - filled)
}

function headerText(v: VehicleState): string {
  const battery = `${v.batteryLevel}% ${batteryBar(v.batteryLevel)} ${displayRange(v.range)}`
  const lock = v.locked ? 'Locked' : 'Unlocked'
  const isCharging = v.chargingState !== 'Disconnected' && v.chargingState !== 'Complete'
  const parts = [battery, lock]
  if (isCharging) parts.push('Charging')
  return parts.join(' \u00B7 ')
}

function footerStatusText(v: VehicleState): string {
  const interior = `Interior ${displayTemp(v.insideTemp)}`
  const exterior = `Exterior ${displayTemp(v.outsideTemp)}`
  const climate = `Climate ${v.climateOn ? 'ON' : 'OFF'}`
  const sentry = `Sentry ${v.sentryMode ? 'ON' : 'OFF'}`
  return [interior, exterior, climate, sentry].join(' \u00B7 ')
}

// --- Map ---

async function pushMapImage(): Promise<void> {
  const b = getBridge()
  if (!b) return

  const halves = await getMap()
  if (!halves) {
    appendEventLog('Map: no data')
    return
  }

  const topBytes = Array.from(new Uint8Array(halves.top))
  const topResult = await b.updateImageRawData(new ImageRawDataUpdate({
    containerID: 4,
    containerName: 'map-top',
    imageData: topBytes,
  }))

  const bottomBytes = Array.from(new Uint8Array(halves.bottom))
  const bottomResult = await b.updateImageRawData(new ImageRawDataUpdate({
    containerID: 5,
    containerName: 'map-bottom',
    imageData: bottomBytes,
  }))

  appendEventLog(`Map: top=${String(topResult)} bottom=${String(bottomResult)}`)
}

// --- Dashboard screen ---

export async function showDashboard(): Promise<void> {
  state.screen = 'dashboard'
  navigation.reset()

  if (!state.vehicle) {
    await rebuildPage({
      containerTotalNum: 1,
      textObject: [
        new TextContainerProperty({
          containerID: 1,
          containerName: 'loading',
          content: 'Loading vehicle state...',
          xPosition: 0,
          yPosition: 0,
          width: DISPLAY_WIDTH,
          height: DISPLAY_HEIGHT,
          isEventCapture: 1,
          paddingLength: 4,
        }),
      ],
    })
    return
  }

  const v = state.vehicle
  const actions = quickActions()
  const labels = actions.map((a) => resolveLabel(a, v))
  labels.push('More \u203A')

  await rebuildPage({
    containerTotalNum: 5,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'header',
        content: headerText(v),
        xPosition: 0,
        yPosition: 0,
        width: DISPLAY_WIDTH,
        height: HEADER_HEIGHT,
        isEventCapture: 0,
        paddingLength: 4,
      }),
      new TextContainerProperty({
        containerID: 3,
        containerName: 'footer',
        content: footerStatusText(v),
        xPosition: 0,
        yPosition: HEADER_HEIGHT + BODY_HEIGHT + 8,
        width: DISPLAY_WIDTH,
        height: FOOTER_HEIGHT,
        isEventCapture: 0,
        paddingLength: 4,
      }),
    ],
    listObject: [
      new ListContainerProperty({
        containerID: 2,
        containerName: 'actions',
        xPosition: 0,
        yPosition: BODY_TOP,
        width: TEXT_WIDTH,
        height: BODY_HEIGHT,
        borderWidth: 1,
        borderColor: 5,
        borderRadius: 4,
        paddingLength: 4,
        isEventCapture: 1,
        itemContainer: new ListItemContainerProperty({
          itemCount: labels.length,
          itemWidth: TEXT_WIDTH - 10,
          isItemSelectBorderEn: 1,
          itemName: labels,
        }),
      }),
    ],
    imageObject: [
      new ImageContainerProperty({
        containerID: 4,
        containerName: 'map-top',
        xPosition: TEXT_WIDTH + 8,
        yPosition: MAP_TOP,
        width: MAP_WIDTH,
        height: MAP_TILE_HEIGHT,
      }),
      new ImageContainerProperty({
        containerID: 5,
        containerName: 'map-bottom',
        xPosition: TEXT_WIDTH + 8,
        yPosition: MAP_TOP + MAP_TILE_HEIGHT,
        width: MAP_WIDTH,
        height: MAP_TILE_HEIGHT,
      }),
    ],
  })

  appendEventLog(`Dashboard: ${v.batteryLevel}% ${v.range}km`)

  void pushMapImage()
}

// --- Menu screen (full width, no map) ---

export async function showMenu(): Promise<void> {
  state.screen = 'menu'

  const level = navigation.current()
  if (!level) {
    await showDashboard()
    return
  }

  const v = state.vehicle
  const labels: string[] = ['\u2039 Back']

  if (level.kind === 'categories') {
    for (const cat of level.items) {
      labels.push(cat.label)
    }
  } else {
    for (const item of level.items) {
      labels.push(resolveLabel(item, v))
    }
  }

  await rebuildPage({
    containerTotalNum: 1,
    listObject: [
      new ListContainerProperty({
        containerID: 1,
        containerName: 'menu',
        xPosition: 0,
        yPosition: 0,
        width: DISPLAY_WIDTH,
        height: DISPLAY_HEIGHT,
        borderWidth: 1,
        borderColor: 5,
        borderRadius: 4,
        paddingLength: 4,
        isEventCapture: 1,
        itemContainer: new ListItemContainerProperty({
          itemCount: labels.length,
          itemWidth: DISPLAY_WIDTH - 10,
          isItemSelectBorderEn: 1,
          itemName: labels,
        }),
      }),
    ],
  })
}

// --- Setup message (no token) ---

export async function showSetupMessage(): Promise<void> {
  state.screen = 'loading'

  await rebuildPage({
    containerTotalNum: 1,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'setup',
        content: 'No Tesla token configured.\n\nOpen this app in your phone browser and enter your Tessie API token in Settings.',
        xPosition: 0,
        yPosition: 0,
        width: DISPLAY_WIDTH,
        height: DISPLAY_HEIGHT,
        isEventCapture: 1,
        paddingLength: 6,
      }),
    ],
  })
}

// --- Loading screen ---

export async function showLoading(label: string): Promise<void> {
  state.screen = 'loading'

  await rebuildPage({
    containerTotalNum: 1,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'loading',
        content: `Sending: ${label}...`,
        xPosition: 0,
        yPosition: 0,
        width: DISPLAY_WIDTH,
        height: DISPLAY_HEIGHT,
        isEventCapture: 0,
        paddingLength: 4,
      }),
    ],
  })
}

// --- Pre-execution confirm screen ---

export async function showConfirm(label: string): Promise<void> {
  state.screen = 'confirm'

  await rebuildPage({
    containerTotalNum: 1,
    listObject: [
      new ListContainerProperty({
        containerID: 1,
        containerName: 'confirm',
        xPosition: 0,
        yPosition: 0,
        width: DISPLAY_WIDTH,
        height: DISPLAY_HEIGHT,
        borderWidth: 1,
        borderColor: 5,
        borderRadius: 4,
        paddingLength: 4,
        isEventCapture: 1,
        itemContainer: new ListItemContainerProperty({
          itemCount: 2,
          itemWidth: DISPLAY_WIDTH - 10,
          isItemSelectBorderEn: 1,
          itemName: ['Cancel', `Confirm: ${label}`],
        }),
      }),
    ],
  })
}

// --- Post-execution confirmation screen ---

export async function showConfirmation(message: string): Promise<void> {
  state.screen = 'confirmation'
  state.confirmationMessage = message

  await rebuildPage({
    containerTotalNum: 1,
    textObject: [
      new TextContainerProperty({
        containerID: 1,
        containerName: 'confirmation',
        content: message,
        xPosition: 0,
        yPosition: 0,
        width: DISPLAY_WIDTH,
        height: DISPLAY_HEIGHT,
        isEventCapture: 1,
        paddingLength: 4,
      }),
    ],
  })
}
