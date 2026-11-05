import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { BarChart3, Crown, Flame, Goal, Shield, Swords, Target, Trophy, type LucideIcon } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Segmented } from '@/components/ui/Controls'
import { PageLoader } from '@/components/ui/Spinner'
import { useAuth } from '@/features/auth/AuthProvider'
import { friendlyError } from '@/lib/supabase'
import { STAGE_SHORT } from '@/lib/tournament-engine'
import { cn } from '@/lib/utils'
import { useStatsData } from './api'
import {
  MIN_GAMES_FOR_AVERAGES,
  computeStats,
  headToHead,
  ranking,
  rivalsOf,
  type PlayedGame,
  type PlayerStats,
  type RankingMetric,
  type RankingRow,
  type Stats,
} from './compute'

type View = 'ranking' | 'h2h'

const METRICS: { id: RankingMetric; label: string; icon: LucideIcon; unit: string }[] = [
  { id: 'goals', label: 'Goleadores', icon: Goal, unit: 'goles' },
  { id: 'wins', label: 'Victorias', icon: Flame, unit: 'victorias' },
  { id: 'titles', label: 'Títulos', icon: Trophy, unit: 'títulos' },
  { id: 'defense', label: 'Defensa', icon: Shield, unit: 'goles por partido en contra' },
  { id: 'effectiveness', label: 'Efectividad', icon: Target, unit: '% de puntos' },
]

function formatValue(metric: RankingMetric, value: number): string {
  if (metric === 'defense') return value.toFixed(2)
  if (metric === 'effectiveness') return `${Math.round(value)}%`
  return String(value)
}

export function StatsPage() {
  const { userId } = useAuth()
  const { data, isPending, error } = useStatsData()
  const [view, setView] = useState<View>('ranking')
  const stats = useMemo(() => (data ? computeStats(data) : null), [data])

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="font-display text-lg tracking-[0.3em] text-neon-400 uppercase">Entre amigos</p>
        <h1 className="flex items-center gap-3 text-4xl leading-none font-extrabold text-white uppercase sm:text-5xl">
          <BarChart3 className="text-gold-400" size={34} /> Estadísticas
        </h1>
        <p className="text-slate-400">Goleadores, récords y el historial de cada rivalidad.</p>
      </header>

      {isPending ? (
        <PageLoader />
      ) : error ? (
        <p role="alert" className="card text-loss">
          {friendlyError(error)}
        </p>
      ) : !stats || stats.games.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-12 text-center">
          <BarChart3 size={44} className="text-slate-600" />
          <p className="font-display text-2xl text-slate-300 uppercase">Aún no hay partidos jugados</p>
          <p className="max-w-xs text-sm text-slate-500">
            Cuando registres resultados en tus torneos, aquí verás quién manda en el campo.
          </p>
        </div>
      ) : (
        <>
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'ranking', label: 'Ranking' },
              { value: 'h2h', label: 'Cara a cara' },
            ]}
          />
          {view === 'ranking' ? (
            <RankingView stats={stats} meId={userId} />
          ) : (
            <HeadToHeadView stats={stats} meId={userId} />
          )}
        </>
      )}
    </div>
  )
}

/* --------------------------------- Ranking ---------------------------------- */

function RankingView({ stats, meId }: { stats: Stats; meId: string | null }) {
  const [metric, setMetric] = useState<RankingMetric>('goals')
  const rows = useMemo(() => ranking(stats.players, metric), [stats.players, metric])
  const current = METRICS.find((m) => m.id === metric)!
  const averages = metric === 'defense' || metric === 'effectiveness'

  return (
    <div className="space-y-5">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Tipo de ranking">
        {METRICS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={metric === id}
            onClick={() => setMetric(id)}
            className={cn('btn btn-sm shrink-0', metric === id ? 'btn-neon' : 'btn-ghost')}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="card py-8 text-center text-sm text-slate-500">
          {averages
            ? `Aún nadie llega a ${MIN_GAMES_FOR_AVERAGES} partidos jugados.`
            : metric === 'titles'
              ? 'Todavía no hay campeones: termina un torneo para coronar al primero.'
              : 'Sin datos todavía.'}
        </div>
      ) : (
        <>
          <Podium rows={rows.slice(0, 3)} metric={metric} meId={meId} />
          {rows.length > 3 && (
            <ol className="space-y-2">
              {rows.slice(3).map((row, i) => (
                <RankRow key={row.player.userId} row={row} rank={i + 4} metric={metric} meId={meId} />
              ))}
            </ol>
          )}
          <p className="text-center text-xs text-slate-500">
            {averages
              ? `Cuentan quienes jugaron al menos ${MIN_GAMES_FOR_AVERAGES} partidos. `
              : ''}
            Valor: {current.unit}. Los jugadores sin cuenta no aparecen en los rankings.
          </p>
        </>
      )}

      <RecordsView records={stats.records} players={stats.players} />
    </div>
  )
}

const PODIUM_STYLE = [
  { h: 'h-28', ring: 'ring-gold-400', num: 'text-gold-300', bg: 'from-gold-500/30' },
  { h: 'h-20', ring: 'ring-slate-300', num: 'text-slate-200', bg: 'from-slate-300/20' },
  { h: 'h-14', ring: 'ring-orange-400', num: 'text-orange-300', bg: 'from-orange-400/20' },
]

function Podium({ rows, metric, meId }: { rows: RankingRow[]; metric: RankingMetric; meId: string | null }) {
  // Orden visual: 2.º, 1.º, 3.º
  const order = [1, 0, 2].filter((i) => rows[i])
  return (
    <div className="card card-gold">
      <div className="grid grid-cols-3 items-end gap-2">
        {order.map((i) => {
          const row = rows[i]
          const style = PODIUM_STYLE[i]
          const me = row.player.userId === meId
          return (
            <motion.div
              key={row.player.userId}
              className="flex min-w-0 flex-col items-center gap-1.5 text-center"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              {i === 0 && <Crown size={22} className="text-gold-400" aria-hidden />}
              <Avatar
                name={row.player.name}
                url={row.player.avatarUrl}
                size={i === 0 ? 72 : 56}
                className={cn('ring-2', style.ring)}
              />
              <span className={cn('line-clamp-2 w-full font-display text-lg leading-tight font-semibold break-words', me ? 'text-gold-300' : 'text-white')}>
                {row.player.name}
              </span>
              <div
                className={cn(
                  'flex w-full flex-col items-center justify-start rounded-t-xl bg-gradient-to-b to-transparent pt-2',
                  style.h,
                  style.bg,
                )}
              >
                <span className={cn('font-display text-4xl leading-none font-extrabold tabular-nums', style.num)}>
                  {formatValue(metric, row.value)}
                </span>
                <span className="mt-1 px-1 text-[11px] leading-tight text-slate-400">{i + 1}.º</span>
              </div>
            </motion.div>
          )
        })}
      </div>
      <p className="mt-3 text-center text-xs text-slate-400">{rows[0].detail}</p>
    </div>
  )
}

function RankRow({
  row,
  rank,
  metric,
  meId,
}: {
  row: RankingRow
  rank: number
  metric: RankingMetric
  meId: string | null
}) {
  const me = row.player.userId === meId
  return (
    <li className={cn('card flex items-center gap-3 !p-3', me && 'border-neon-400/40')}>
      <span className="w-7 text-center font-display text-2xl font-bold text-slate-500">{rank}</span>
      <Avatar name={row.player.name} url={row.player.avatarUrl} size={40} ring={me} />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate font-display text-xl leading-tight font-semibold', me ? 'text-gold-300' : 'text-white')}>
          {row.player.name}
        </p>
        <p className="truncate text-xs text-slate-500">{row.detail}</p>
      </div>
      <span className="font-display text-3xl font-extrabold text-white tabular-nums">
        {formatValue(metric, row.value)}
      </span>
    </li>
  )
}

function RecordsView({ records, players }: { records: Stats['records']; players: PlayerStats[] }) {
  if (!records.biggestWin && !records.mostGoals) return null
  const names = new Map(players.map((p) => [p.userId, p.name]))
  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-bold tracking-wider text-slate-300 uppercase">Récords</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {records.biggestWin && (
          <RecordCard title="Mayor goleada" icon={Flame} value={`+${records.biggestWin.value}`} game={records.biggestWin.game} names={names} />
        )}
        {records.mostGoals && (
          <RecordCard title="Partido con más goles" icon={Goal} value={String(records.mostGoals.value)} game={records.mostGoals.game} names={names} />
        )}
      </div>
    </section>
  )
}

function RecordCard({
  title,
  icon: Icon,
  value,
  game,
  names,
}: {
  title: string
  icon: LucideIcon
  value: string
  game: PlayedGame
  names: Map<string, string>
}) {
  const home = (game.homeUser && names.get(game.homeUser)) || 'Jugador'
  const away = (game.awayUser && names.get(game.awayUser)) || 'Jugador'
  return (
    <div className="card flex items-center gap-4">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gold-500/10 text-gold-400">
        <Icon size={28} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold tracking-widest text-slate-500 uppercase">{title}</p>
        <p className="font-display text-xl leading-tight font-semibold text-white">
          {home} <span className="text-gold-300 tabular-nums">{game.homeScore} - {game.awayScore}</span> {away}
        </p>
        <p className="truncate text-xs text-slate-500">
          {game.tournamentName} · {STAGE_SHORT[game.stage]}
        </p>
      </div>
      <span className="font-display text-4xl font-extrabold text-gold-300 tabular-nums">{value}</span>
    </div>
  )
}

/* ------------------------------- Cara a cara -------------------------------- */

function HeadToHeadView({ stats, meId }: { stats: Stats; meId: string | null }) {
  const players = useMemo(
    () => stats.players.toSorted((a, b) => a.name.localeCompare(b.name, 'es')),
    [stats.players],
  )
  const defaultA = players.find((p) => p.userId === meId)?.userId ?? players[0]?.userId ?? ''
  const defaultB = useMemo(() => {
    const rival = rivalsOf(stats.games, defaultA)[0]?.userId
    return rival ?? players.find((p) => p.userId !== defaultA)?.userId ?? ''
  }, [stats.games, defaultA, players])

  const [a, setA] = useState(defaultA)
  const [b, setB] = useState(defaultB)
  const byId = useMemo(() => new Map(players.map((p) => [p.userId, p])), [players])
  const pa = byId.get(a)
  const pb = byId.get(b)
  const h2h = useMemo(() => headToHead(stats.games, a, b), [stats.games, a, b])

  if (players.length < 2) {
    return <div className="card py-8 text-center text-sm text-slate-500">Necesitas al menos dos jugadores con cuenta.</div>
  }

  const total = Math.max(1, h2h.played)
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <PlayerSelect label="Jugador A" value={a} onChange={setA} players={players} />
        <button
          type="button"
          onClick={() => {
            setA(b)
            setB(a)
          }}
          className="btn btn-ghost !min-h-11 !px-3"
          aria-label="Intercambiar jugadores"
          title="Intercambiar"
        >
          <Swords size={20} />
        </button>
        <PlayerSelect label="Jugador B" value={b} onChange={setB} players={players} />
      </div>

      {!pa || !pb || a === b ? (
        <div className="card py-8 text-center text-sm text-slate-500">Elige dos jugadores distintos.</div>
      ) : (
        <>
          <div className="card card-gold space-y-5">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <Fighter player={pa} wins={h2h.aWins} meId={meId} />
              <span className="font-display text-3xl font-extrabold text-slate-600">VS</span>
              <Fighter player={pb} wins={h2h.bWins} meId={meId} />
            </div>

            {h2h.played === 0 ? (
              <p className="text-center text-sm text-slate-400">
                Aún no se han enfrentado en un partido. ¡Hora de una revancha!
              </p>
            ) : (
              <>
                <div
                  className="flex h-3 overflow-hidden rounded-full bg-night-950"
                  role="img"
                  aria-label={`${pa.name} ${h2h.aWins} victorias, ${h2h.draws} empates, ${pb.name} ${h2h.bWins} victorias`}
                >
                  <div className="bg-neon-400 transition-all" style={{ width: `${(h2h.aWins / total) * 100}%` }} />
                  <div className="bg-slate-500 transition-all" style={{ width: `${(h2h.draws / total) * 100}%` }} />
                  <div className="bg-gold-400 transition-all" style={{ width: `${(h2h.bWins / total) * 100}%` }} />
                </div>
                <div className="grid grid-cols-3 text-center">
                  <Figure label="Empates" value={h2h.draws} />
                  <Figure label="Partidos" value={h2h.played} />
                  <Figure label="Goles" value={`${h2h.aGoals} - ${h2h.bGoals}`} />
                </div>
              </>
            )}
          </div>

          {h2h.games.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-2xl font-bold tracking-wider text-slate-300 uppercase">Historial</h2>
              <ul className="space-y-2">
                {h2h.games.slice(0, 20).map(({ game, aScore, bScore }) => (
                  <li key={game.matchId} className="card flex items-center gap-3 !p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-200">{game.tournamentName}</p>
                      <p className="text-xs text-slate-500">
                        {STAGE_SHORT[game.stage]} ·{' '}
                        {new Date(game.date).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'rounded-lg bg-night-950 px-3 py-1 font-display text-2xl font-extrabold tabular-nums',
                        aScore > bScore ? 'text-neon-300' : aScore < bScore ? 'text-gold-300' : 'text-slate-300',
                      )}
                    >
                      {aScore} - {bScore}
                    </span>
                  </li>
                ))}
              </ul>
              {h2h.games.length > 20 && (
                <p className="text-center text-xs text-slate-500">Mostrando los 20 más recientes.</p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function PlayerSelect({
  label,
  value,
  onChange,
  players,
}: {
  label: string
  value: string
  onChange: (id: string) => void
  players: PlayerStats[]
}) {
  return (
    <label className="block min-w-0">
      <span className="field-label">{label}</span>
      <select className="input truncate" value={value} onChange={(e) => onChange(e.target.value)}>
        {players.map((p) => (
          <option key={p.userId} value={p.userId}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  )
}

function Fighter({ player, wins, meId }: { player: PlayerStats; wins: number; meId: string | null }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      <Avatar name={player.name} url={player.avatarUrl} size={64} ring={player.userId === meId} />
      <span className="line-clamp-2 font-display text-xl leading-tight font-semibold break-words text-white">
        {player.name}
      </span>
      <span className="font-display text-5xl leading-none font-extrabold text-gold-300 tabular-nums">{wins}</span>
      <span className="text-[11px] tracking-widest text-slate-500 uppercase">Victorias</span>
    </div>
  )
}

function Figure({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="font-display text-3xl font-bold text-white tabular-nums">{value}</p>
      <p className="text-[11px] tracking-widest text-slate-500 uppercase">{label}</p>
    </div>
  )
}
