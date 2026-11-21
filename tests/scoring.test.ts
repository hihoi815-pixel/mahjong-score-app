import { describe, expect, it } from 'vitest'
import { calculateRound } from '../src/scoring'

const entries = (points: number[], chips = [0, 0, 0, 0]) =>
  points.map((value, index) => ({ points: value, chips: chips[index] }))

describe('半荘の精算', () => {
  it('2〜4位を切り捨て、トップで端数を調整し、ウマとチップを精算する', () => {
    const result = calculateRound(entries([20700, 40100, 10500, 28700], [-2, 2, -1, 1]))
    expect(result.map(row => row.index)).toEqual([1, 3, 0, 2])
    expect(result.map(row => row.baseScore)).toEqual([17, 3, -5, -15])
    expect(result.map(row => row.uma)).toEqual([20, 10, -10, -20])
    expect(result.map(row => row.net)).toEqual([2050, 750, -950, -1850])
    expect(result.reduce((sum, row) => sum + row.net, 0)).toBe(0)
  })

  it('同点は入力順で順位を決める', () => {
    const result = calculateRound(entries([25000, 25000, 25000, 25000]))
    expect(result.map(row => row.index)).toEqual([0, 1, 2, 3])
    expect(result.map(row => row.net)).toEqual([1000, 500, -500, -1000])
  })

  it('同点の場合は点数欄を変更した順を優先する', () => {
    const rows = entries([25000, 25000, 25000, 25000])
    const result = calculateRound(rows.map((row, index) => ({
      ...row, inputOrder: [undefined, 1, undefined, 0][index],
    })))
    expect(result.map(row => row.index)).toEqual([3, 1, 0, 2])
  })

  it('負の持ち点も1,000点未満を切り捨てる', () => {
    const result = calculateRound(entries([50100, 30400, 20000, -500]))
    expect(result.map(row => row.baseScore)).toEqual([26, 5, -5, -26])
    expect(result.reduce((sum, row) => sum + row.net, 0)).toBe(0)
  })

  it('点数合計の不一致を拒否する', () => {
    expect(() => calculateRound(entries([25000, 25000, 25000, 24900]))).toThrow('100,000点')
  })

  it('チップ合計の不一致を拒否する', () => {
    expect(() => calculateRound(entries([25000, 25000, 25000, 25000], [1, 0, 0, 0]))).toThrow('0枚')
  })

  it('人数や点数・チップの単位が不正な入力を拒否する', () => {
    expect(() => calculateRound(entries([25000, 25000, 50000]))).toThrow('4人分')
    expect(() => calculateRound(entries([25050, 24950, 25000, 25000]))).toThrow('4人分')
    expect(() => calculateRound(entries([25000, 25000, 25000, 25000], [0.5, -0.5, 0, 0]))).toThrow('4人分')
  })
})
