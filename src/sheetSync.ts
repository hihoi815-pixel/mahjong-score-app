import type { Data } from './data'
import { calculateRound } from './scoring'

const CONFIG_KEY = 'mahjong-score-app:sheet-sync:v1'

export type SheetConnection = { url: string; key: string; managed: string[] }
export type SyncStatus = 'off' | 'pending' | 'done' | 'error'

export function validConnection(url: string, key: string) {
  return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url) && /^[a-f0-9]{64}$/.test(key)
}

export function readConnection(): SheetConnection | null {
  try {
    const value = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? 'null')
    return value && validConnection(value.url, value.key) &&
      Array.isArray(value.managed) && value.managed.every((id: unknown) => typeof id === 'string') ? value : null
  } catch {
    return null
  }
}

export function storeConnection(connection: SheetConnection | null) {
  if (connection) localStorage.setItem(CONFIG_KEY, JSON.stringify(connection))
  else localStorage.removeItem(CONFIG_KEY)
}

export function syncRows(data: Pick<Data, 'rounds' | 'names'>) {
  return data.rounds.flatMap(round => calculateRound(round.entries).map(row => [
    round.date, round.id, data.names[row.index].trim() || `プレイヤー${row.index + 1}`,
    row.points, row.rank, row.baseScore, row.uma, row.chips, row.pointsYen, row.chipYen, row.net,
  ]))
}

export async function sendSnapshot(connection: SheetConnection, payload: string) {
  const { rows, ids } = JSON.parse(payload)
  const response = await fetch(connection.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ key: connection.key, managed: connection.managed, rows }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok || (await response.json()).ok !== true) throw new Error('Sync rejected')
  return ids as string[]
}
