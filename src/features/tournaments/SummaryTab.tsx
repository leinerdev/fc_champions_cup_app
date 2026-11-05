import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Check, Flag, Play, Shuffle, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { friendlyError } from '@/lib/supabase'
import {
  STAGE_LABEL,
  blockingTies,
  computeStandings,
  expectedLeagueMatches,
  knockoutStagesOf,
  stageRank,
} from '@/lib/tournament-engine'
import type { KnockoutStage, Match } from '@/lib/types'
import { MatchCard } from '@/features/matches/MatchCard'
import { ScoreDialog } from '@/features/matches/ScoreDialog'
import { useCloseLeague, useDeleteTournament, useStartTournament } from './api'
import { ChampionBanner } from './ChampionBanner'
import { InvitePanel } from './InvitePanel'
import type { TournamentView } from './view'

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100)
  return (
    <div
      className="h-2.5 overflow-hidden rounded-full bg-night-950"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemax={max}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-neon-500 to-neon-300 transition-all duration-700"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function SummaryTab({ view }: { view: TournamentView }) {
  const { t, members, matches, isAdmin, me } = view
  const toast = useToast()
  const navigate = useNavigate()
  const start = useStartTournament(t, members)
  const closeLeague = useCloseLeague(t, members, matches)
  const del = useDeleteTournament()

  const [confirmStart, setConfirmStart] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing, setEditing] = useState<Match | null>(null)

  const missing = t.config.size - members.length
  const leagueMatches = matches.filter((m) => m.stage === 'league')
  const leaguePlayed = leagueMatches.filter((m) => m.status === 'played').length

  const standings = useMemo(
    () =>
      computeStandings(
        members.map((m) => m.id),
        matches,
      ),
    [members, matches],
  )
  const advance = t.config.league?.advance_count ?? 0
  const blocking = blockingTies(standings.unresolvedTies, advance)

  const myUpcoming = useMemo(() => {
    if (!me) return []
    return matches
      .filter(
        (m) =>
          m.status !== 'played' &&
          m.home_id &&
          m.away_id &&
          (m.home_id === me.id || m.away_id === me.id),
      )
      .sort(
        (a, b) =>
          (a.stage === 'league' ? -100 + a.round : stageRank(a.stage)) -
          (b.stage === 'league' ? -100 + b.round : stageRank(b.stage)),
      )
      .slice(0, 3)
  }, [matches, me])

  async function run(fn: () => Promise<unknown>, okMessage: string) {
    try {
      await fn()
      toast.success(okMessage)
    } catch (err) {
      toast.error(friendlyError(err))
      throw err
    }
  }

  const stages = knockoutStagesOf(t.type, t.config)

  return (
    <div className="space-y-5">
      {t.status === 'finished' && <ChampionBanner view={view} />}

      {t.status === 'draft' && (
        <>
          <section className="card space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="field-label !mb-0">Plazas</p>
                <p className="font-display text-5xl leading-none font-extrabold text-gold-300 tabular-nums">
                  {members.length}
                  <span className="text-2xl text-slate-500">/{t.config.size}</span>
                </p>
              </div>
              <p className="text-right text-sm text-slate-400">
                {missing > 0 ? `Faltan ${missing} jugador${missing === 1 ? '' : 'es'}` : 'Plantilla completa'}
              </p>
            </div>
            <ProgressBar value={members.length} max={t.config.size} />

            {isAdmin ? (
              <button
                type="button"
                className="btn btn-gold w-full"
                disabled={missing > 0 || start.isPending}
                onClick={() => setConfirmStart(true)}
              >
                {t.type === 'league' ? <Play size={20} /> : <Shuffle size={20} />}
                {t.type === 'league' ? 'Iniciar liga' : 'Sortear y comenzar copa'}
              </button>
            ) : (
              <p className="text-sm text-slate-400">
                Esperando a que un administrador inicie el torneo.
              </p>
            )}
          </section>
          <InvitePanel t={t} />
        </>
      )}

      {t.status === 'league' && (
        <section className="card space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="field-label !mb-0">Fase de liga</p>
              <p className="font-display text-5xl leading-none font-extrabold text-neon-300 tabular-nums">
                {leaguePlayed}
                <span className="text-2xl text-slate-500">
                  /{leagueMatches.length || expectedLeagueMatches(t.config.size, t.config.league?.double_leg ?? false)}
                </span>
              </p>
            </div>
            <p className="text-right text-sm text-slate-400">partidos jugados</p>
          </div>
          <ProgressBar value={leaguePlayed} max={leagueMatches.length} />

          {standings.complete && blocking.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-gold-500/40 bg-gold-500/10 px-3 py-2 text-sm text-gold-200">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              Hay un empate en la línea de clasificación. Resuélvelo en la pestaña «Tabla» con un partido de desempate.
            </p>
          )}

          {isAdmin &&
            (standings.complete ? (
              <button
                type="button"
                className="btn btn-gold w-full"
                disabled={blocking.length > 0 || closeLeague.isPending}
                onClick={() => setConfirmClose(true)}
              >
                <Flag size={20} /> Cerrar liga y sortear eliminatorias
              </button>
            ) : (
              <p className="text-sm text-slate-400">
                Cuando se jueguen todos los partidos podrás cerrar la liga y sortear las eliminatorias.
              </p>
            ))}
          {!isAdmin && (
            <p className="text-sm text-slate-400">
              Los {advance} mejores avanzan a eliminatorias.
            </p>
          )}
        </section>
      )}

      {t.status !== 'draft' && myUpcoming.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-2xl font-bold tracking-wider text-slate-300 uppercase">Tus próximos partidos</h3>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {myUpcoming.map((m) => (
              <MatchCard key={m.id} view={view} match={m} onEdit={setEditing} />
            ))}
          </div>
        </section>
      )}

      <section className="card space-y-3">
        <h3 className="text-2xl font-bold tracking-wider text-slate-300 uppercase">Formato</h3>
        <ul className="space-y-2 text-sm text-slate-300">
          {t.type === 'league' && t.config.league && (
            <>
              <Row>
                Liga de {t.config.size} jugadores, todos contra todos{t.config.league.double_leg ? ' a ida y vuelta' : ' a una vuelta'}.
              </Row>
              <Row>Clasifican {t.config.league.advance_count} a eliminatorias, con cruces al azar.</Row>
              <Row>Desempate: puntos, diferencia de goles, enfrentamiento directo y partido de desempate.</Row>
            </>
          )}
          {t.type === 'cup' && <Row>Copa de {t.config.size} participantes con eliminación directa y sorteo al azar.</Row>}
          {stages.map((s) => (
            <Row key={s}>
              {STAGE_LABEL[s]}:{' '}
              {s === 'third_place' ? 'partido único' : t.config.knockout.two_legged[s as KnockoutStage] ? 'ida y vuelta' : 'partido único'}
            </Row>
          ))}
          <Row>Eliminatorias: global, goles de visitante y penales.</Row>
        </ul>
      </section>

      {isAdmin && (
        <section className="flex justify-end pt-2">
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} /> Eliminar torneo
          </button>
        </section>
      )}

      <ScoreDialog view={view} match={editing} onClose={() => setEditing(null)} />

      <ConfirmDialog
        open={confirmStart}
        title={t.type === 'league' ? 'Iniciar liga' : 'Sortear copa'}
        message={
          t.type === 'league'
            ? 'Se generará el calendario de la liga. Después ya no se podrán agregar ni quitar jugadores.'
            : 'Se sorteará la primera ronda al azar. Después ya no se podrán agregar ni quitar participantes.'
        }
        confirmLabel="Comenzar"
        onConfirm={() => run(() => start.mutateAsync(), '¡Que ruede el balón!')}
        onClose={() => setConfirmStart(false)}
      />
      <ConfirmDialog
        open={confirmClose}
        title="Cerrar fase de liga"
        message={`Se tomarán los ${advance} primeros de la tabla y se sortearán las eliminatorias. Esta acción no se puede deshacer.`}
        confirmLabel="Sortear"
        onConfirm={() => run(() => closeLeague.mutateAsync(), 'Eliminatorias sorteadas')}
        onClose={() => setConfirmClose(false)}
      />
      <ConfirmDialog
        open={confirmDelete}
        danger
        title="Eliminar torneo"
        message={`Se eliminará "${t.name}" con todos sus partidos. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        onConfirm={async () => {
          await run(() => del.mutateAsync(t.id), 'Torneo eliminado')
          navigate('/', { replace: true })
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <Check size={16} className="mt-0.5 shrink-0 text-neon-400" />
      <span>{children}</span>
    </li>
  )
}
