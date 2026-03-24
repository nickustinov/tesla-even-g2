import type { VehicleState, ActionParams } from './state'
import { tempPresetValues } from './units'

export type SimpleAction = {
  type: 'command'
  label: string
  cmd: string
  params?: ActionParams
  confirm?: boolean
}

export type ToggleAction = {
  type: 'toggle'
  onLabel: string
  offLabel: string
  onCmd: string
  offCmd: string
  isOn: (v: VehicleState) => boolean
  confirm?: boolean
}

export type SubMenuAction = {
  type: 'submenu'
  label: string
  children: ActionItem[]
}

export type RefreshAction = {
  type: 'refresh'
  label: string
}

export type ActionItem = SimpleAction | ToggleAction | SubMenuAction | RefreshAction

export type Category = {
  label: string
  items: ActionItem[]
}

// --- Resolve helpers ---

export function resolveLabel(item: ActionItem, v: VehicleState | null): string {
  switch (item.type) {
    case 'toggle':
      return v && item.isOn(v) ? item.onLabel : item.offLabel
    case 'submenu':
    case 'command':
    case 'refresh':
      return item.label
  }
}

export function resolveCommand(item: ActionItem, v: VehicleState | null): { cmd: string; params?: ActionParams } | null {
  switch (item.type) {
    case 'toggle':
      return v && item.isOn(v)
        ? { cmd: item.onCmd }
        : { cmd: item.offCmd }
    case 'command':
      return { cmd: item.cmd, params: item.params }
    case 'submenu':
    case 'refresh':
      return null
  }
}

// --- Temperature presets ---

function temperaturePresets(): ActionItem[] {
  return tempPresetValues().map(({ displayLabel, celsius }) => ({
    type: 'command' as const,
    label: displayLabel,
    cmd: 'set_temperatures',
    params: { temperature: celsius },
  }))
}

// --- Charge limit presets ---

function chargeLimitPresets(): ActionItem[] {
  return [50, 60, 70, 80, 90, 100].map((p) => ({
    type: 'command' as const,
    label: `${p}%`,
    cmd: 'set_charge_limit',
    params: { percent: p },
  }))
}

// --- Charging amps presets ---

function chargingAmpsPresets(): ActionItem[] {
  return [8, 16, 24, 32, 48].map((a) => ({
    type: 'command' as const,
    label: `${a}A`,
    cmd: 'set_charging_amps',
    params: { amps: a },
  }))
}

// --- Seat heating presets ---

const SEAT_NAMES = ['front_left', 'front_right']
const SEAT_LABELS = ['Left', 'Right']

function seatHeatingPresets(): ActionItem[] {
  return SEAT_NAMES.map((seat, i) => ({
    type: 'submenu' as const,
    label: `${SEAT_LABELS[i]} seat`,
    children: [0, 1, 2, 3].map((level) => ({
      type: 'command' as const,
      label: level === 0 ? 'Off' : `Level ${level}`,
      cmd: 'set_seat_heat',
      params: { seat, level },
    })),
  }))
}

// --- Seat cooling presets ---

function seatCoolingPresets(): ActionItem[] {
  return SEAT_NAMES.map((seat, i) => ({
    type: 'submenu' as const,
    label: `${SEAT_LABELS[i]} seat`,
    children: [0, 1, 2, 3].map((level) => ({
      type: 'command' as const,
      label: level === 0 ? 'Off' : `Level ${level}`,
      cmd: 'set_seat_cool',
      params: { seat, level },
    })),
  }))
}

// --- Categories ---

export const categories: Category[] = [
  {
    label: 'Quick actions',
    items: [
      { type: 'toggle', onLabel: 'Unlock', offLabel: 'Lock', onCmd: 'unlock', offCmd: 'lock', isOn: (v) => v.locked, confirm: true },
      { type: 'toggle', onLabel: 'Climate off', offLabel: 'Climate on', onCmd: 'stop_climate', offCmd: 'start_climate', isOn: (v) => v.climateOn },
      { type: 'command', label: 'Open frunk', cmd: 'activate_front_trunk', confirm: true },
      { type: 'command', label: 'Open trunk', cmd: 'activate_rear_trunk', confirm: true },
      { type: 'command', label: 'Flash lights', cmd: 'flash' },
      { type: 'command', label: 'Honk', cmd: 'honk' },
      { type: 'refresh', label: 'Refresh' },
    ],
  },
  {
    label: 'Climate',
    items: [
      { type: 'toggle', onLabel: 'Climate off', offLabel: 'Climate on', onCmd: 'stop_climate', offCmd: 'start_climate', isOn: (v) => v.climateOn },
      { type: 'toggle', onLabel: 'Defrost off', offLabel: 'Defrost on', onCmd: 'stop_max_defrost', offCmd: 'start_max_defrost', isOn: (v) => v.defrostMode },
      { type: 'command', label: 'Wheel heater on', cmd: 'start_steering_wheel_heater' },
      { type: 'command', label: 'Wheel heater off', cmd: 'stop_steering_wheel_heater' },
      { type: 'submenu', label: 'Set temperature \u203A', children: temperaturePresets() },
      { type: 'submenu', label: 'Seat heating \u203A', children: seatHeatingPresets() },
      { type: 'submenu', label: 'Seat cooling \u203A', children: seatCoolingPresets() },
    ],
  },
  {
    label: 'Charging',
    items: [
      { type: 'toggle', onLabel: 'Close charge port', offLabel: 'Open charge port', onCmd: 'close_charge_port', offCmd: 'open_charge_port', isOn: (v) => v.chargePortDoorOpen },
      { type: 'toggle', onLabel: 'Stop charging', offLabel: 'Start charging', onCmd: 'stop_charging', offCmd: 'start_charging', isOn: (v) => v.chargingState === 'Charging' },
      { type: 'submenu', label: 'Charge limit \u203A', children: chargeLimitPresets() },
      { type: 'submenu', label: 'Charging amps \u203A', children: chargingAmpsPresets() },
    ],
  },
  {
    label: 'Security',
    items: [
      { type: 'toggle', onLabel: 'Sentry off', offLabel: 'Sentry on', onCmd: 'disable_sentry', offCmd: 'enable_sentry', isOn: (v) => v.sentryMode },
      { type: 'toggle', onLabel: 'Valet off', offLabel: 'Valet on', onCmd: 'disable_valet', offCmd: 'enable_valet', isOn: (v) => v.valetMode },
      { type: 'command', label: 'Guest on', cmd: 'enable_guest' },
      { type: 'command', label: 'Guest off', cmd: 'disable_guest' },
      { type: 'command', label: 'Keyless driving', cmd: 'remote_start', confirm: true },
    ],
  },
  {
    label: 'Windows',
    items: [
      { type: 'command', label: 'Vent windows', cmd: 'vent_windows' },
      { type: 'command', label: 'Close windows', cmd: 'close_windows' },
      { type: 'command', label: 'Vent sunroof', cmd: 'vent_sunroof' },
      { type: 'command', label: 'Close sunroof', cmd: 'close_sunroof' },
    ],
  },
  {
    label: 'Other',
    items: [
      { type: 'command', label: 'HomeLink', cmd: 'trigger_homelink' },
      { type: 'command', label: 'Boombox', cmd: 'remote_boombox' },
      { type: 'submenu', label: 'Bio defense \u203A', children: [
        { type: 'command', label: 'Bio defense on', cmd: 'set_bioweapon_mode', params: { on: true } },
        { type: 'command', label: 'Bio defense off', cmd: 'set_bioweapon_mode', params: { on: false } },
      ]},
      { type: 'command', label: 'Wake', cmd: 'wake' },
    ],
  },
]

// --- Quick actions for dashboard ---

export function quickActions(): ActionItem[] {
  return categories[0].items
}
