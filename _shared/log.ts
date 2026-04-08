// Redact anything that looks like a bearer token or long secret so nothing
// sensitive can leak into the visible log, even via error messages.
function redact(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [redacted]')
    .replace(/[A-Za-z0-9_\-]{32,}/g, '[redacted]')
}

export function appendEventLog(text: string): void {
  const el = document.getElementById('event-log')
  if (!el) return

  const time = new Date().toLocaleTimeString()
  const safe = redact(text)
  const existing = el.textContent ?? ''
  el.textContent = (existing ? existing + '\n' : '') + `[${time}] ${safe}`

  const lines = el.textContent.split('\n')
  if (lines.length > 200) {
    el.textContent = lines.slice(-200).join('\n')
  }

  el.scrollTop = el.scrollHeight
}
