import { useEffect, useMemo, useRef, useState } from 'react'
import type { Data } from './data'
import { readConnection, sendSnapshot, storeConnection, syncRows, type SheetConnection, type SyncStatus } from './sheetSync'

export function useSheetSync(data: Data) {
  const [connection, setConnection] = useState(readConnection)
  const [status, setStatus] = useState<SyncStatus>('off')
  const [attempt, retry] = useState(0)
  const queue = useRef(Promise.resolve())
  const payload = useMemo(() => JSON.stringify({
    rows: syncRows(data),
    ids: data.rounds.map(round => round.id),
  }), [data.names, data.rounds])

  useEffect(() => {
    if (!connection) {
      setStatus('off')
      return
    }

    let cancelled = false
    let failed = false
    function schedule() { retry(count => count + 1) }
    const ids: string[] = JSON.parse(payload).ids
    setStatus('pending')
    queue.current = queue.current.then(async () => {
      if (cancelled) return
      const current = readConnection()
      if (!current || current.url !== connection.url || current.key !== connection.key) return
      const pending = { ...current, managed: [...new Set([...current.managed, ...ids])] }
      try {
        storeConnection(pending)
        await sendSnapshot(pending, payload)
        const latest = readConnection()
        if (latest?.url === pending.url && latest.key === pending.key) {
          storeConnection({ ...pending, managed: ids })
        }
        if (!cancelled) setStatus('done')
      } catch {
        failed = true
        if (!cancelled) setStatus('error')
      }
    })
    window.addEventListener('online', schedule)
    const timer = window.setInterval(() => {
      if (failed && navigator.onLine && document.visibilityState === 'visible') schedule()
    }, 60_000)
    return () => {
      cancelled = true
      window.removeEventListener('online', schedule)
      window.clearInterval(timer)
    }
  }, [connection, payload, attempt])

  return {
    connection, status,
    retry: () => retry(count => count + 1),
    configure(next: SheetConnection | null) {
      storeConnection(next)
      setConnection(next)
    },
  }
}
