import React, { useState, useEffect, useRef } from 'react'
import teslaLogo from '../src/tesla.png'
import { createRoot } from 'react-dom/client'
import { checkConnection, getToken, setToken, onSettingsLoaded } from './api'
import { getTempUnit, setTempUnit, getDistUnit, setDistUnit, onUnitsLoaded, type TempUnit, type DistUnit } from './units'
import { actionCatalog, defaultQuickActionIds, getActionId, resolveLabel, type ActionItem } from './actions'
import { getQuickActionIds, setQuickActionIds, onQuickActionsLoaded } from './prefs'

function TokenAndStatus() {
  const [token, setTokenValue] = useState(getToken())
  const [status, setStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Save the value and probe the connection. Does NOT auto-trigger a
  // glasses reconnect — the page-load auto-connect in src/main.ts owns
  // that for restored tokens.
  const probe = async (value: string): Promise<boolean> => {
    setToken(value)
    setStatus('checking')
    const ok = await checkConnection()
    setStatus(ok ? 'connected' : 'disconnected')
    return ok
  }

  // For user-driven edits (typing/pasting): probe, then if valid, kick
  // off the connect flow so the glasses pick up the new token without
  // a manual button click.
  const probeAndConnect = async (value: string) => {
    const ok = await probe(value)
    if (ok) document.getElementById('connectBtn')?.click()
  }

  useEffect(() => {
    void probe(getToken())
    onSettingsLoaded(() => {
      setTokenValue(getToken())
      void probe(getToken())
    })
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const handleChange = (value: string) => {
    setTokenValue(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { void probeAndConnect(value) }, 300)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').trim()
    if (!pasted) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setTimeout(() => { void probeAndConnect(pasted) }, 0)
  }

  const dotColor = status === 'connected'
    ? 'var(--color-positive)'
    : status === 'disconnected'
      ? 'var(--color-negative)'
      : 'var(--color-text-muted)'

  const statusLabel = status === 'checking'
    ? 'Checking...'
    : status === 'connected'
      ? 'Token valid'
      : 'Token invalid'

  return (
    <>
      <input
        type="password"
        value={token}
        onChange={(e) => handleChange(e.target.value)}
        onPaste={handlePaste}
        placeholder="Enter your Tessie API token"
        style={{
          height: 36,
          width: '100%',
          background: 'var(--color-input-bg)',
          color: 'var(--color-text)',
          border: 'none',
          borderRadius: 'var(--radius-default)',
          padding: '0 16px',
          fontFamily: 'var(--font-body)',
          outline: 'none',
        }}
        className="text-medium-body"
      />
      {token && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'var(--spacing-same)' }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            backgroundColor: dotColor, display: 'inline-block',
            ...(status === 'connected' ? { animation: 'pulse-dot 2s ease-in-out infinite' } : {}),
          }} />
          <span className="text-subtitle" style={{ color: dotColor }}>{statusLabel}</span>
        </div>
      )}
    </>
  )
}

const toggleStyle: React.CSSProperties = {
  display: 'inline-flex',
  borderRadius: 'var(--radius-default)',
  overflow: 'hidden',
  border: '1px solid var(--color-border, #333)',
}

const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 16px',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  background: active ? 'var(--color-accent, #007AFF)' : 'var(--color-input-bg, #2a2a2a)',
  color: active ? 'var(--color-text-highlight, #fff)' : 'var(--color-text-dim, #888)',
})

function pickedItemLabel(item: ActionItem): string {
  // Strip the trailing chevron used for submenu rows in the on-glasses list.
  return resolveLabel(item, null).replace(/\s*›\s*$/, '')
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 12px',
  background: 'var(--color-surface)',
  borderRadius: 'var(--radius-default)',
}

const iconBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  border: 'none',
  borderRadius: 6,
  background: 'transparent',
  color: 'var(--color-text-dim)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 18,
  lineHeight: 1,
  flexShrink: 0,
}

function QuickActionsEditor() {
  const [ids, setIds] = useState<string[]>(() => getQuickActionIds() ?? defaultQuickActionIds())
  const [dragId, setDragId] = useState<string | null>(null)
  const [targetIndex, setTargetIndex] = useState<number | null>(null)
  const [dragOffsetY, setDragOffsetY] = useState(0)
  const startY = useRef(0)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    onQuickActionsLoaded(() => {
      setIds(getQuickActionIds() ?? defaultQuickActionIds())
    })
  }, [])

  // Returns the index where the dragged row should land after release,
  // expressed in the post-removal array used by move(from, to).
  // Skips the dragged row itself so its translated rect doesn't pollute hit-testing.
  const insertIndexAtY = (clientY: number, fromIndex: number): number => {
    const list = listRef.current
    if (!list) return fromIndex
    const rows = Array.from(list.children) as HTMLElement[]
    let originalInsert = rows.length
    for (let i = 0; i < rows.length; i++) {
      if (i === fromIndex) continue
      const r = rows[i].getBoundingClientRect()
      if (clientY < r.top + r.height / 2) {
        originalInsert = i
        break
      }
    }
    return originalInsert > fromIndex ? originalInsert - 1 : originalInsert
  }

  const catalog = actionCatalog()
  const catalogById = new Map(catalog.map((item) => [getActionId(item), item]))

  const picked = ids
    .map((id) => ({ id, item: catalogById.get(id) }))
    .filter((x): x is { id: string; item: ActionItem } => !!x.item)

  const available = catalog.filter((item) => !ids.includes(getActionId(item)))

  const commit = (next: string[]) => {
    setIds(next)
    void setQuickActionIds(next)
  }

  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return
    const next = ids.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    commit(next)
  }

  const remove = (id: string) => {
    commit(ids.filter((x) => x !== id))
  }

  const add = (id: string) => {
    commit([...ids, id])
  }

  const reset = () => {
    commit(defaultQuickActionIds())
  }

  return (
    <>
      <h2 className="text-large-title" style={{ margin: `var(--spacing-cross) 0` }}>
        Quick actions
      </h2>

      <div style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-default)',
        padding: 'var(--spacing-card-margin)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--spacing-cross)' }}>
          <p className="text-normal-body" style={{ color: 'var(--color-text-dim)', margin: 0 }}>
            Drag the handle to reorder, tap × to remove.
          </p>
          <button
            onClick={reset}
            className="text-subtitle"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-dim)',
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            Reset
          </button>
        </div>

        {picked.length === 0 ? (
          <p className="text-subtitle" style={{ color: 'var(--color-text-dim)', margin: 0, padding: '12px 0' }}>
            No quick actions selected. Add some below.
          </p>
        ) : (
          <ul
            ref={listRef}
            style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}
          >
            {picked.map(({ id, item }, index) => {
              const isDragging = dragId === id
              return (
                <li
                  key={id}
                  style={{
                    ...rowStyle,
                    transform: isDragging ? `translateY(${dragOffsetY}px)` : undefined,
                    position: isDragging ? 'relative' : undefined,
                    zIndex: isDragging ? 10 : undefined,
                    boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.4)' : undefined,
                    opacity: isDragging ? 0.92 : 1,
                    touchAction: 'none',
                  }}
                >
                  <span
                    onPointerDown={(e) => {
                      if (e.button !== undefined && e.button !== 0) return
                      e.preventDefault()
                      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                      startY.current = e.clientY
                      setDragOffsetY(0)
                      setDragId(id)
                      setTargetIndex(index)
                    }}
                    onPointerMove={(e) => {
                      if (dragId !== id) return
                      setDragOffsetY(e.clientY - startY.current)
                      const idx = insertIndexAtY(e.clientY, index)
                      if (idx !== targetIndex) setTargetIndex(idx)
                    }}
                    onPointerUp={(e) => {
                      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
                      if (dragId === id && targetIndex !== null && targetIndex !== index) {
                        move(index, targetIndex)
                      }
                      setDragId(null)
                      setTargetIndex(null)
                      setDragOffsetY(0)
                    }}
                    onPointerCancel={() => {
                      setDragId(null)
                      setTargetIndex(null)
                      setDragOffsetY(0)
                    }}
                    aria-label={`Drag ${pickedItemLabel(item)}`}
                    style={{
                      color: 'var(--color-text-dim)',
                      fontSize: 18,
                      lineHeight: 1,
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      touchAction: 'none',
                      cursor: dragId === id ? 'grabbing' : 'grab',
                      padding: '6px 4px',
                      flexShrink: 0,
                    }}
                  >
                    ⋮⋮
                  </span>
                  <span className="text-medium-body" style={{ flex: 1, color: 'var(--color-text)' }}>
                    {pickedItemLabel(item)}
                  </span>
                  <button
                    onClick={() => remove(id)}
                    aria-label={`Remove ${pickedItemLabel(item)}`}
                    style={iconBtnStyle}
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {available.length > 0 && (
          <>
            <p className="text-subtitle" style={{ color: 'var(--color-text-dim)', margin: `var(--spacing-cross) 0 8px` }}>
              Add action
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {available.map((item) => {
                const id = getActionId(item)
                return (
                  <li key={id} style={{ ...rowStyle, background: 'var(--color-input-bg, var(--color-surface))' }}>
                    <span className="text-medium-body" style={{ flex: 1, color: 'var(--color-text-dim)' }}>
                      {pickedItemLabel(item)}
                    </span>
                    <button
                      onClick={() => add(id)}
                      aria-label={`Add ${pickedItemLabel(item)}`}
                      style={{ ...iconBtnStyle, color: 'var(--color-accent)' }}
                    >
                      +
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </>
  )
}

function SettingsPanel() {
  const [tempUnit, setTempUnitState] = useState<TempUnit>(getTempUnit())
  const [distUnit, setDistUnitState] = useState<DistUnit>(getDistUnit())

  useEffect(() => {
    onUnitsLoaded(() => {
      setTempUnitState(getTempUnit())
      setDistUnitState(getDistUnit())
    })
  }, [])

  return (
    <>
      <h2 className="text-large-title" style={{ margin: `0 0 var(--spacing-cross)` }}>Access token</h2>

      <div style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-default)',
        padding: 'var(--spacing-card-margin)',
      }}>
        <p className="text-normal-body" style={{ color: 'var(--color-text-dim)', margin: `0 0 var(--spacing-cross)` }}>
          Generate the token at <a target="_new" href="https://dash.tessie.com/settings/developer">tessie.com</a>. Stored locally.
        </p>
        <TokenAndStatus />
      </div>

      <h2 className="text-large-title" style={{ margin: `var(--spacing-cross) 0` }}>Units</h2>

      <div style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-default)',
        padding: 'var(--spacing-card-margin)',
        display: 'flex',
        gap: 24,
        alignItems: 'center',
      }}>
        <div>
          <p className="text-subtitle" style={{ color: 'var(--color-text-dim)', margin: '0 0 6px' }}>Temperature</p>
          <div style={toggleStyle}>
            <button style={toggleBtnStyle(tempUnit === 'F')} onClick={() => { setTempUnit('F'); setTempUnitState('F') }}>°F</button>
            <button style={toggleBtnStyle(tempUnit === 'C')} onClick={() => { setTempUnit('C'); setTempUnitState('C') }}>°C</button>
          </div>
        </div>
        <div>
          <p className="text-subtitle" style={{ color: 'var(--color-text-dim)', margin: '0 0 6px' }}>Distance</p>
          <div style={toggleStyle}>
            <button style={toggleBtnStyle(distUnit === 'mi')} onClick={() => { setDistUnit('mi'); setDistUnitState('mi') }}>mi</button>
            <button style={toggleBtnStyle(distUnit === 'km')} onClick={() => { setDistUnit('km'); setDistUnitState('km') }}>km</button>
          </div>
        </div>
      </div>

      <QuickActionsEditor />
    </>
  )
}

export function initUI(): void {
  const app = document.getElementById('app')
  if (!app) return

  for (const id of ['actionBtn']) {
    const el = document.getElementById(id)
    if (el) el.remove()
  }

  const connectBtn = document.getElementById('connectBtn')
  if (connectBtn) connectBtn.style.display = 'none'

  const heading = app.querySelector('h1')
  const logo = document.getElementById('logo')
  const subtitle = document.getElementById('subtitle')
  const status = document.getElementById('status')
  const logPanel = document.getElementById('log-panel')

  const container = document.createElement('div')

  if (heading) heading.remove()
  if (logo) {
    ;(logo as HTMLImageElement).src = teslaLogo
    app.appendChild(logo)
  }
  if (subtitle) app.appendChild(subtitle)
  app.appendChild(container)
  if (status) {
    status.style.display = 'none'
    app.appendChild(status)
  }
  if (logPanel) {
    app.appendChild(logPanel)
  }

  createRoot(container).render(
    <React.StrictMode>
      <SettingsPanel />
    </React.StrictMode>,
  )
}
