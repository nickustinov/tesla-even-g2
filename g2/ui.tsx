import React, { useState, useEffect } from 'react'
import teslaLogo from '../src/tesla.png'
import { createRoot } from 'react-dom/client'
import { checkConnection, getToken, setToken } from './api'
import { getTempUnit, setTempUnit, getDistUnit, setDistUnit, type TempUnit, type DistUnit } from './units'

function TokenAndStatus({ onStatusChange }: { onStatusChange: (valid: boolean) => void }) {
  const [token, setTokenValue] = useState(getToken())
  const [status, setStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')

  const check = () => {
    setStatus('checking')
    checkConnection().then((ok) => {
      setStatus(ok ? 'connected' : 'disconnected')
      onStatusChange(ok)
    })
  }

  useEffect(() => { check() }, [])

  const handleBlur = () => {
    setToken(token)
    check()
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
        onChange={(e) => setTokenValue(e.target.value)}
        onBlur={handleBlur}
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

function SettingsPanel() {
  const [tokenValid, setTokenValid] = useState(false)
  const [tempUnit, setTempUnitState] = useState<TempUnit>(getTempUnit())
  const [distUnit, setDistUnitState] = useState<DistUnit>(getDistUnit())

  const handleConnect = () => {
    document.getElementById('connectBtn')?.click()
  }

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
        <TokenAndStatus onStatusChange={setTokenValid} />
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

      <button
        className="text-medium-title"
        disabled={!tokenValid}
        onClick={handleConnect}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: 48,
          border: 'none',
          borderRadius: 'var(--radius-default)',
          background: 'var(--color-accent)',
          color: 'var(--color-text-highlight)',
          cursor: 'pointer',
          marginTop: 'var(--spacing-cross)',
          opacity: tokenValid ? 1 : 0.4,
          pointerEvents: tokenValid ? 'auto' : 'none',
        }}
      >
        Connect Tesla
      </button>
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
  const eventLog = document.getElementById('event-log')

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
  if (eventLog) {
    eventLog.style.display = 'none'
    app.appendChild(eventLog)
  }

  createRoot(container).render(
    <React.StrictMode>
      <SettingsPanel />
    </React.StrictMode>,
  )
}
