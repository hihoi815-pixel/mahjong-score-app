const DETAIL_TAB = '対局明細'
const HEADERS = ['対局日時', '対局ID', 'プレイヤー', '点数', '順位', '換算スコア', 'ウマ',
  'チップ枚数', '点数収支（円）', 'チップ収支（円）', '最終収支（円）']

function setup() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet()
  if (!spreadsheet || !spreadsheet.getSheetByName(DETAIL_TAB)) throw new Error('対局明細タブのあるシートから実行してください。')
  const properties = PropertiesService.getScriptProperties()
  properties.setProperty('spreadsheetId', spreadsheet.getId())
  if (!properties.getProperty('syncKey')) {
    properties.setProperty('syncKey', (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase())
  }
  console.log('連携キー: ' + properties.getProperty('syncKey'))
}

function doPost(event) {
  try {
    const properties = PropertiesService.getScriptProperties()
    const key = properties.getProperty('syncKey')
    const body = event && event.postData && event.postData.contents
    if (!key || typeof body !== 'string' || body.length > 5000000) return reply(false)
    const { key: provided, managed, rows } = JSON.parse(body)
    if (!matchesKey(provided, key) || !validSnapshot(managed, rows)) return reply(false)

    const lock = LockService.getScriptLock()
    lock.waitLock(20000)
    try {
      const sheet = SpreadsheetApp.openById(properties.getProperty('spreadsheetId')).getSheetByName(DETAIL_TAB)
      if (!sheet) throw new Error('対局明細タブがありません。')
      if (sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0].some((cell, i) => cell !== HEADERS[i])) {
        throw new Error('対局明細の見出しが一致しません。')
      }
      const existingCount = Math.max(0, sheet.getLastRow() - 1)
      const existing = existingCount ? sheet.getRange(2, 1, existingCount, HEADERS.length).getValues() : []
      const updated = mergeRows(existing, managed, rows)
      if (updated.length) {
        const missing = updated.length + 1 - sheet.getMaxRows()
        if (missing > 0) sheet.insertRowsAfter(sheet.getMaxRows(), missing)
        sheet.getRange(2, 1, updated.length, HEADERS.length).setValues(updated)
      }
      SpreadsheetApp.flush()
      return reply(true)
    } finally {
      lock.releaseLock()
    }
  } catch (error) {
    console.error(String(error))
    return reply(false)
  }
}

function matchesKey(provided, key) {
  if (typeof provided !== 'string' || provided.length !== key.length) return false
  let diff = 0
  for (let i = 0; i < key.length; i++) diff |= provided.charCodeAt(i) ^ key.charCodeAt(i)
  return diff === 0
}

function validSnapshot(managed, rows) {
  if (!Array.isArray(managed) || !Array.isArray(rows) || rows.length % 4 !== 0) return false
  const ids = new Set(managed)
  if (!managed.every(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id))) return false
  const ranksById = new Map()
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== HEADERS.length || typeof row[0] !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row[0]) || !ids.has(row[1]) ||
        typeof row[2] !== 'string' || !row[2].trim() || row[2].length > 24 ||
        !row.slice(3).every(Number.isSafeInteger) || row[4] < 1 || row[4] > 4) return false
    const ranks = ranksById.get(row[1]) || new Set()
    if (ranks.has(row[4])) return false
    ranks.add(row[4])
    ranksById.set(row[1], ranks)
  }
  return [...ranksById.values()].every(ranks => ranks.size === 4)
}

function mergeRows(existing, managed, rows) {
  const ids = new Set(managed)
  const result = rows.concat(existing.filter(row => row.some(cell => cell !== '') && !ids.has(row[1])))
  const safe = result.map(row => row.map(cell => typeof cell === 'string' && /^[\s]*[=+\-@']/.test(cell) ? "'" + cell : cell))
  while (safe.length < existing.length) safe.push(Array(HEADERS.length).fill(''))
  return safe
}

function reply(ok) {
  return ContentService.createTextOutput(JSON.stringify({ ok })).setMimeType(ContentService.MimeType.JSON)
}
