export const START_POINTS = 25_000
export const TOTAL_POINTS = 4 * START_POINTS
export const UMA = [20, 10, -10, -20] as const

export type Entry = { points: number; chips: number; inputOrder?: number }

export function validPoints(points: number) {
  return Number.isSafeInteger(points) && points % 100 === 0 &&
    Math.abs(points) <= Math.floor(Number.MAX_SAFE_INTEGER / 4)
}

export function validChips(chips: number) {
  return Number.isSafeInteger(chips) &&
    Math.abs(chips) <= Math.floor(Number.MAX_SAFE_INTEGER / 1000)
}

export function validInputOrder(order: unknown) {
  return order === undefined || (typeof order === 'number' && Number.isInteger(order) && order >= 0 && order < 4)
}

export function rankEntries(entries: readonly Entry[]) {
  return entries.map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => b.points - a.points || (a.inputOrder ?? 4) - (b.inputOrder ?? 4) || a.index - b.index)
}

export function calculateRound(entries: readonly Entry[]) {
  if (entries.length !== 4 || !entries.every(row => validPoints(row.points) && validChips(row.chips) && validInputOrder(row.inputOrder))) {
    throw new Error('4人分の点数とチップを正しく入力してください。')
  }
  if (entries.reduce((sum, row) => sum + row.points, 0) !== TOTAL_POINTS) {
    throw new Error('点数合計を100,000点にしてください。')
  }
  if (entries.reduce((sum, row) => sum + row.chips, 0) !== 0) {
    throw new Error('チップの合計を0枚にしてください。')
  }

  const ranked = rankEntries(entries)
  const baseScores = ranked.map(row => Math.floor(row.points / 1000) - START_POINTS / 1000)
  const topScore = -baseScores.slice(1).reduce((sum, score) => sum + score, 0)
  baseScores[0] = topScore === 0 ? 0 : topScore

  return ranked.map((row, index) => {
    const uma = UMA[index]
    const baseScore = baseScores[index]
    const pointsYen = (baseScore + uma) * 50
    const chipYen = row.chips * 100
    return { ...row, rank: index + 1, baseScore, uma, pointsYen, chipYen, net: pointsYen + chipYen }
  })
}
