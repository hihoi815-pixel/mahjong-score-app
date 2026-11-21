import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { makeCsv, newData, newDraft, parseBackup, readNumber, STORAGE_KEY, type Data } from './data'
import { calculateRound, rankEntries, TOTAL_POINTS, validChips, validPoints } from './scoring'
import './style.css'

const tabs = [
  { id: 'input', label: '点数入力', icon: '▦' },
  { id: 'history', label: '履歴', icon: '◷' },
  { id: 'stats', label: '累計成績', icon: '▥' },
] as const

type Tab = typeof tabs[number]['id']
type Result = ReturnType<typeof calculateRound>
const number = new Intl.NumberFormat('ja-JP')
const date = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' })

function dayKey(value: Date) {
  return [value.getFullYear(), value.getMonth() + 1, value.getDate()]
    .map(part => String(part).padStart(2, '0')).join('-')
}

function signed(value: number) {
  return (value > 0 ? '+' : '') + number.format(value)
}

function Money({ value }: { value: number }) {
  return <span className={value > 0 ? 'positive' : value < 0 ? 'negative' : ''}>{signed(value)}円</span>
}

function Results({ rows, names, detailed = false }: { rows: Result; names: string[]; detailed?: boolean }) {
  return <ol className="results">{rows.map(row => <li key={row.index}>
    <span className="rank">{row.rank}位</span>
    <div className="result-name"><strong>{names[row.index]}</strong>
      {detailed && <small>{number.format(row.points)}点 ／ ウマ {signed(row.uma)} ／ チップ {signed(row.chips)}枚</small>}
    </div>
    <strong className="result-money"><Money value={row.net} /></strong>
  </li>)}</ol>
}

function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function loadData() {
  try {
    const json = localStorage.getItem(STORAGE_KEY)
    return { data: json === null ? newData() : parseBackup(json), error: '' }
  } catch {
    return { data: newData(), error: '保存データを読み込めませんでした。バックアップから復元できます。' }
  }
}

function App() {
  const [initial] = useState(loadData)
  const [data, setData] = useState(initial.data)
  const [sessionDate, setSessionDate] = useState(() => {
    const editing = initial.data.rounds.find(round => round.id === initial.data.editing?.id)
    return dayKey(editing ? new Date(editing.date) : new Date())
  })
  const [settings, setSettings] = useState(false)
  const [notice, setNotice] = useState(initial.error)
  const [storageError, setStorageError] = useState(false)
  const importInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (initial.error && data === initial.data) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      setStorageError(false)
    } catch {
      setStorageError(true)
    }
  }, [data, initial])

  const names = data.names.map((name, index) => name.trim() || `プレイヤー${index + 1}`)
  const draft = data.editing?.draft ?? data.draft
  const entries = draft.map(row => ({ points: readNumber(row.points), chips: readNumber(row.chips), inputOrder: row.inputOrder }))
  const pointsOk = entries.every(row => validPoints(row.points))
  const chipsOk = entries.every(row => validChips(row.chips))
  const pointTotal = entries.reduce((sum, row) => sum + row.points, 0)
  const chipTotal = entries.reduce((sum, row) => sum + row.chips, 0)
  const result = pointsOk && chipsOk && pointTotal === TOTAL_POINTS && chipTotal === 0
    ? calculateRound(entries) : null
  const ranks = pointsOk ? rankEntries(entries) : []
  const rounds = data.rounds.map(round => ({ ...round, result: calculateRound(round.entries) }))
  const savedDates = [...new Set(rounds.map(round => dayKey(new Date(round.date))))].sort().reverse()
  const dailyRounds = rounds.filter(round => dayKey(new Date(round.date)) === sessionDate)
  const dayTotals = names.map((name, index) => {
    const rows = dailyRounds.flatMap(round => round.result.filter(row => row.index === index))
    return {
      name,
      net: rows.reduce((sum, row) => sum + row.net, 0),
      score: rows.reduce((sum, row) => sum + row.baseScore + row.uma, 0),
      chips: rows.reduce((sum, row) => sum + row.chips, 0),
    }
  })
  const stats = names.map((name, index) => {
    const played = rounds.flatMap(round => round.result.filter(row => row.index === index))
    return {
      index, name, net: played.reduce((sum, row) => sum + row.net, 0),
      averageRank: played.length ? played.reduce((sum, row) => sum + row.rank, 0) / played.length : null,
      wins: played.filter(row => row.rank === 1).length,
      chips: played.reduce((sum, row) => sum + row.chips, 0),
    }
  }).sort((a, b) => b.net - a.net || a.index - b.index)

  function navigate(next: Tab) {
    setSettings(false)
    requestAnimationFrame(() => document.getElementById(next)?.scrollIntoView({ block: 'start' }))
  }

  function changeValue(index: number, field: 'points' | 'chips', value: string | number) {
    setData(current => {
      const rows = current.editing?.draft ?? current.draft
      const updated = rows.map((row, rowIndex) => {
        if (rowIndex !== index) return row
        const previous = readNumber(row[field])
        const inputOrder = field === 'points' && row.inputOrder === undefined
          ? rows.filter(entry => entry.inputOrder !== undefined).length : row.inputOrder
        return { ...row, inputOrder, [field]: typeof value === 'number' ? String((Number.isFinite(previous) ? previous : 0) + value) : value }
      })
      return current.editing ? { ...current, editing: { ...current.editing, draft: updated } } : { ...current, draft: updated }
    })
  }

  function saveRound() {
    if (!result) return
    const id = data.editing?.id
    const now = new Date()
    const playedAt = sessionDate === dayKey(now) ? now : new Date(sessionDate + 'T12:00:00')
    if (!Number.isFinite(playedAt.getTime())) return
    const newRound = id ? null : { id: crypto.randomUUID(), date: playedAt.toISOString(), entries }
    setData(current => newRound
      ? { ...current, rounds: [newRound, ...current.rounds], draft: newDraft() }
      : { ...current, rounds: current.rounds.map(round => round.id === id ? { ...round, entries } : round), editing: null })
    setNotice(id ? '変更を保存しました。' : '半荘を登録しました。')
    navigate('history')
  }

  async function restore(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const restored = parseBackup(await file.text())
      if (!window.confirm('現在のデータをバックアップの内容で上書きしますか？')) return
      setData(restored)
      const editing = restored.rounds.find(round => round.id === restored.editing?.id)
      setSessionDate(dayKey(editing ? new Date(editing.date) : new Date()))
      setNotice('バックアップを復元しました。')
      navigate('input')
    } catch {
      setNotice('復元できませんでした。麻雀点帳から保存したJSONファイルを選択してください。')
    }
  }

  return <>
    <header className="top"><div className="top-content">
      <div className="hero-heading">
        <div className="brand"><span className="brand-mark" aria-hidden="true">四</span> 四人打ち</div>
        <button type="button" className="settings-button" aria-expanded={settings} onClick={() => {
          setSettings(!settings)
          window.scrollTo(0, 0)
        }}>{settings ? '閉じる' : '設定'}</button>
      </div>
      <h1>麻雀点数帳</h1>
      <p className="hero-names">{names.join('・')}</p>
      <div className="rates"><span>1,000点 <b>50円</b></span><span>チップ1枚 <b>100円</b></span><span>ウマ <b>10–20</b></span></div>
      <div className="tiles" aria-hidden="true"><span>東</span><span>南</span></div>
    </div></header>

    <main>
      {storageError && <p className="warning" role="alert">自動保存できません。設定からJSONバックアップを保存してください。</p>}
      {notice && <div className="notice" role="status">{notice}<button type="button" aria-label="通知を閉じる" onClick={() => setNotice('')}>×</button></div>}
      {settings ? <>
        <h2>設定</h2>
        <section className="panel"><h2>プレイヤー名</h2>
          <p className="muted">名前の変更は履歴と累計成績にも反映されます。</p>
          <div className="name-fields">{data.names.map((name, index) =>
            <label key={index}>プレイヤー {index + 1}
              <input value={name} maxLength={24} autoComplete="off" onChange={event => {
                const value = event.target.value
                setData(current => ({ ...current, names: current.names.map((old, i) => i === index ? value : old) }))
              }} />
            </label>)}
          </div>
        </section>
        <section className="panel"><h2>データ管理</h2>
          <div className="actions">
            <button type="button" onClick={() => download(JSON.stringify(data, null, 2), 'mahjong-backup.json', 'application/json')}>JSONバックアップ</button>
            <button type="button" onClick={() => importInput.current?.click()}>JSONから復元</button>
            <button type="button" onClick={() => download(makeCsv(data), 'mahjong-results.csv', 'text/csv;charset=utf-8')}>CSV出力</button>
            <input type="file" accept=".json,application/json" ref={importInput} onChange={restore} hidden />
          </div>
          <button type="button" className="danger erase" onClick={() => {
            if (!window.confirm('対局履歴、プレイヤー名、入力途中のデータをすべて削除しますか？')) return
            setData(newData())
            setSessionDate(dayKey(new Date()))
            setNotice('全データを削除しました。')
            navigate('input')
          }}>全データを削除</button>
        </section>
      </> : <>
        <section className="panel session" aria-labelledby="session-heading">
          <h2 id="session-heading">対局日</h2>
          <div className="name-fields">
            <label>日付を選ぶ<input type="date" value={sessionDate} disabled={Boolean(data.editing)}
              onChange={event => { if (event.target.value) setSessionDate(event.target.value) }} /></label>
            <label>保存済みの対局<select value={savedDates.includes(sessionDate) ? sessionDate : ''}
              disabled={Boolean(data.editing) || savedDates.length === 0} onChange={event => setSessionDate(event.target.value)}>
              <option value="" disabled>{savedDates.length ? '対局日を選ぶ' : '保存済みの対局なし'}</option>
              {savedDates.map(day => <option key={day} value={day}>{day.replaceAll('-', '/')}</option>)}
            </select></label>
          </div>
        </section>
        <section className="panel" id="input" aria-labelledby="score-heading">
        <div className="heading"><div><h2 id="score-heading">{data.editing ? '対局を編集' : '半荘の得点'}</h2>
          <p className="muted">4人打ち ／ 25,000点返し ／ ウマ 10–20</p></div>
          {!data.editing && <span className="rank">第{dailyRounds.length + 1}半荘</span>}
          {data.editing && <button type="button" onClick={() => {
            setData(current => ({ ...current, editing: null }))
            navigate('history')
          }}>編集をやめる</button>}
        </div>
        <p className={pointsOk && pointTotal === TOTAL_POINTS ? 'total' : 'total warning'} aria-live="polite">
          <span>点数合計</span><strong>{Number.isFinite(pointTotal) ? number.format(pointTotal) + '点' : '—'} / 100,000点</strong>
        </p>
        <div className="player-grid">{draft.map((row, index) => {
          const rank = ranks.findIndex(player => player.index === index) + 1
          return <div className="player" key={index}>
            <div className="player-heading"><h2>{names[index]}</h2><span className="rank">{rank ? `${rank}位` : '—'}</span></div>
            <div className="score-control"><input className="score" aria-label={`${names[index]}の点数`} type="text" inputMode="decimal"
              autoComplete="off" value={row.points} onFocus={event => event.currentTarget.select()}
              onChange={event => changeValue(index, 'points', event.target.value)} />
              <button type="button" aria-label={`${names[index]}の点数の正負を切り替える`}
                onClick={() => changeValue(index, 'points', row.points.startsWith('-') ? row.points.slice(1) : '-' + row.points.replace(/^\+/, ''))}>±</button>
            </div>
            <div className="increments">{[-1000, -100, 100, 1000].map(step =>
              <button type="button" key={step} aria-label={`${names[index]}の点数 ${signed(step)}点`}
                onClick={() => changeValue(index, 'points', step)}>{signed(step)}</button>)}</div>
          </div>
        })}</div>
        </section>
        <section className="panel" aria-labelledby="chip-heading">
          <h2 id="chip-heading">チップの増減</h2>
          <div className="player-grid">{draft.map((row, index) => <div className="player" key={index}>
            <strong>{names[index]}</strong>
            <div className="chip-control">
              <button type="button" aria-label={`${names[index]}のチップを1枚減らす`} onClick={() => changeValue(index, 'chips', -1)}>−</button>
              <input aria-label={`${names[index]}のチップ枚数`} type="text" inputMode="decimal" value={row.chips}
                onFocus={event => event.currentTarget.select()} onChange={event => changeValue(index, 'chips', event.target.value)} />
              <button type="button" aria-label={`${names[index]}のチップを1枚増やす`} onClick={() => changeValue(index, 'chips', 1)}>＋</button>
            </div>
          </div>)}</div>
          <p className="muted" aria-live="polite">チップ合計 {chipsOk ? signed(chipTotal) + '枚' : '—'}</p>
        </section>
        <section className="panel preview"><h2>半荘の収支を確認</h2>
          <div aria-live="polite">
            {!pointsOk && <p className="warning">4人の点数を100点単位の整数で入力してください。</p>}
            {pointsOk && pointTotal !== TOTAL_POINTS && <p className="warning">点数合計を100,000点にしてください。</p>}
            {!chipsOk && <p className="warning">チップを整数で入力してください。</p>}
            {chipsOk && chipTotal !== 0 && <p className="warning">チップの合計を0枚にしてください（現在 {signed(chipTotal)}枚）。</p>}
          </div>
          {result && <Results rows={result} names={names} detailed />}
          <button type="button" className="primary" disabled={!result} onClick={saveRound}>{data.editing ? '変更を保存' : 'この半荘を登録'}</button>
        </section>
        <section className="panel" aria-labelledby="day-total-heading">
          <div className="heading"><h2 id="day-total-heading">対局日の収支</h2><span className="rank">{dailyRounds.length}半荘</span></div>
          <div className="player-grid">{dayTotals.map((player, index) => <div className="day-total" key={index}>
            <strong>{player.name}</strong>
            <div className="day-money"><Money value={player.net} /></div>
            <small>得点 {signed(player.score)} ／ チップ {signed(player.chips)}枚</small>
          </div>)}</div>
        </section>
        <section className="panel" id="history" aria-labelledby="history-heading">
        <h2 id="history-heading">対局履歴</h2><p className="muted">{sessionDate.replaceAll('-', '/')} ／ {dailyRounds.length}半荘</p>
        {dailyRounds.length === 0 && <p className="empty">この日の対局はありません。</p>}
        {dailyRounds.map((round, index) => <article className="panel history" key={round.id}>
          <div className="heading"><h3>第 {dailyRounds.length - index} 半荘</h3><time dateTime={round.date}>{date.format(new Date(round.date))}</time></div>
          <Results rows={round.result} names={names} detailed />
          <div className="actions">
            <button type="button" onClick={() => {
              if (data.editing && data.editing.id !== round.id && !window.confirm('別の対局の編集中の変更を破棄しますか？')) return
              setData(current => current.editing?.id === round.id ? current : {
                ...current, editing: { id: round.id, draft: round.entries.map(entry => ({
                  points: String(entry.points), chips: String(entry.chips), inputOrder: entry.inputOrder,
                })) },
              })
              navigate('input')
            }}>編集</button>
            <button type="button" className="danger" onClick={() => {
              if (!window.confirm(`第 ${dailyRounds.length - index} 半荘を削除しますか？`)) return
              setData(current => ({ ...current, rounds: current.rounds.filter(item => item.id !== round.id),
                editing: current.editing?.id === round.id ? null : current.editing }))
              setNotice('対局を削除しました。')
            }}>削除</button>
          </div>
        </article>)}
        </section>
        <section className="panel" id="stats" aria-labelledby="stats-heading">
        <h2 id="stats-heading">累計成績</h2><p className="muted">全 {rounds.length} 半荘</p>
        {rounds.length === 0 && <p className="empty">半荘を登録すると、収支ランキングとプレイヤー別の成績を表示します。</p>}
        {rounds.length > 0 && <div className="ranking"><h3>収支ランキング</h3>
          <ol className="results">{stats.map(player => <li key={player.index}>
            <span className="rank">{stats.findIndex(item => item.net === player.net) + 1}位</span>
            <div className="result-name"><strong>{player.name}</strong>
              <small>平均 {player.averageRank?.toFixed(2)}位 ／ トップ {player.wins}回 ／ チップ {signed(player.chips)}枚</small>
            </div>
            <strong className="result-money"><Money value={player.net} /></strong>
          </li>)}</ol>
        </div>}
        </section>
      </>}
    </main>

    <nav className="bottom" aria-label="メインメニュー"><div className="nav-content">{tabs.map(item =>
      <button type="button" key={item.id} onClick={() => navigate(item.id)}>
        <span aria-hidden="true">{item.icon}</span>{item.label}
      </button>)}</div></nav>
  </>
}

createRoot(document.getElementById('root')!).render(<App />)
