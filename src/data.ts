import { calculateRound, START_POINTS, validInputOrder, type Entry } from './scoring'

export const STORAGE_KEY = 'mahjong-score-app:v1'
export type Draft = { points: string; chips: string; inputOrder?: number }
export type Round = { id: string; date: string; entries: Entry[] }
export type Data = {
  version: 1
  names: string[]
  draft: Draft[]
  rounds: Round[]
  editing: { id: string; draft: Draft[] } | null
}

export function newDraft(): Draft[] {
  return Array.from({ length: 4 }, () => ({ points: String(START_POINTS), chips: '0' }))
}

export function newData(): Data {
  return { version: 1, names: ['坂上', '岸本', '玉田', '肥田'], draft: newDraft(), rounds: [], editing: null }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isDraft(value: unknown): value is Draft[] {
  return Array.isArray(value) && value.length === 4 && value.every(row =>
    isObject(row) && typeof row.points === 'string' && typeof row.chips === 'string' && validInputOrder(row.inputOrder))
}

function isRound(value: unknown): value is Round {
  if (!isObject(value) || typeof value.id !== 'string' || !value.id ||
      typeof value.date !== 'string' || !Number.isFinite(Date.parse(value.date)) ||
      !Array.isArray(value.entries) || !value.entries.every(isObject)) return false
  try {
    calculateRound(value.entries as Entry[])
    return true
  } catch {
    return false
  }
}

export function parseBackup(json: string): Data {
  const value: unknown = JSON.parse(json)
  if (!isObject(value) || value.version !== 1 || !Array.isArray(value.names) ||
      value.names.length !== 4 || !value.names.every(name => typeof name === 'string' && name.length <= 24) ||
      !isDraft(value.draft) || !Array.isArray(value.rounds) || !value.rounds.every(isRound)) {
    throw new Error('バックアップの形式が正しくありません。')
  }

  const ids = new Set(value.rounds.map(round => round.id))
  if (ids.size !== value.rounds.length ||
      (value.editing !== null && (!isObject(value.editing) ||
        typeof value.editing.id !== 'string' || !ids.has(value.editing.id) || !isDraft(value.editing.draft)))) {
    throw new Error('バックアップの対局情報が正しくありません。')
  }
  return value as Data
}

export function readNumber(text: string) {
  return /^[-+]?\d+$/.test(text.trim()) ? Number(text.trim()) : NaN
}

function csvCell(value: string | number) {
  const text = typeof value === 'string' && /^[\s]*[=+\-@]/u.test(value) ? "'" + value : String(value)
  return '"' + text.replaceAll('"', '""') + '"'
}

export function makeCsv(data: Data) {
  const rows = [['対局日時', '対局ID', 'プレイヤー', '点数', '順位', '換算スコア', 'ウマ', 'チップ枚数', '点数収支（円）', 'チップ収支（円）', '最終収支（円）']]
  const results = data.rounds.flatMap(round => calculateRound(round.entries).map(row => [
    round.date, round.id, data.names[row.index].trim() || `プレイヤー${row.index + 1}`, row.points,
    row.rank, row.baseScore, row.uma, row.chips, row.pointsYen, row.chipYen, row.net,
  ]))
  return '\uFEFF' + [...rows, ...results].map(row => row.map(csvCell).join(',')).join('\r\n')
}
