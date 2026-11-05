import { useState } from 'react'
import { Minus, Plus, RotateCcw, Save } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { friendlyError } from '@/lib/supabase'
import { STAGE_LABEL } from '@/lib/tournament-engine'
import type { Match, Member } from '@/lib/types'
import { memberLabel, useClearResult, useSaveResult } from '@/features/tournaments/api'
import type { TournamentView } from '@/features/tournaments/view'
import { needsPenalties } from './utils'

interface ScoreDialogProps {
  view: TournamentView
  match: Match | null
  onClose: () => void
}

export function ScoreDialog({ view, match, onClose }: ScoreDialogProps) {
  return (
    <Modal open={Boolean(match)} onClose={onClose} title="Registrar resultado">
      {match && <ScoreForm key={match.id} view={view} match={match} onClose={onClose} />}
    </Modal>
  )
}

function Counter({
  value,
  onChange,
  label,
  size = 'lg',
}: {
  value: number
  onChange: (v: number) => void
  label: string
  size?: 'lg' | 'md'
}) {
  const clamp = (n: number) => Math.min(99, Math.max(0, n))
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        className="btn btn-ghost !min-h-10 !w-14 !px-0"
        onClick={() => onChange(clamp(value + 1))}
        aria-label={`Sumar a ${label}`}
      >
        <Plus size={20} />
      </button>
      <input
        inputMode="numeric"
        aria-label={`Goles de ${label}`}
        className={`input !px-0 text-center font-display font-extrabold tabular-nums ${
          size === 'lg' ? '!w-20 !text-5xl !min-h-20' : '!w-16 !text-3xl !min-h-14'
        }`}
        value={value}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const n = parseInt(e.target.value.replace(/\D/g, ''), 10)
          onChange(Number.isNaN(n) ? 0 : clamp(n))
        }}
      />
      <button
        type="button"
        className="btn btn-ghost !min-h-10 !w-14 !px-0"
        onClick={() => onChange(clamp(value - 1))}
        aria-label={`Restar a ${label}`}
      >
        <Minus size={20} />
      </button>
    </div>
  )
}

function Team({ member }: { member: Member | undefined }) {
  const name = memberLabel(member)
  return (
    <div className="flex w-full flex-col items-center gap-1.5 text-center">
      <Avatar name={name} url={member?.profile?.avatar_url} size={52} />
      <span className="line-clamp-2 font-display text-lg leading-tight font-semibold text-white">{name}</span>
    </div>
  )
}

function ScoreForm({
  view,
  match,
  onClose,
}: {
  view: TournamentView
  match: Match
  onClose: () => void
}) {
  const toast = useToast()
  const save = useSaveResult(view.t, view.isAdmin)
  const clear = useClearResult(view.t, view.isAdmin)

  const [home, setHome] = useState(match.home_score ?? 0)
  const [away, setAway] = useState(match.away_score ?? 0)
  const [pensHome, setPensHome] = useState(match.pens_home ?? 0)
  const [pensAway, setPensAway] = useState(match.pens_away ?? 0)
  const [error, setError] = useState<string | null>(null)

  const homeM = match.home_id ? view.memberById.get(match.home_id) : undefined
  const awayM = match.away_id ? view.memberById.get(match.away_id) : undefined
  const pens = needsPenalties(match, home, away, view.matches)
  const busy = save.isPending || clear.isPending

  async function onSave() {
    setError(null)
    if (pens && pensHome === pensAway) {
      return setError('Los penales no pueden terminar empatados: indica quién ganó.')
    }
    try {
      await save.mutateAsync({
        match,
        home,
        away,
        pensHome: pens ? pensHome : null,
        pensAway: pens ? pensAway : null,
      })
      toast.success('Resultado guardado')
      onClose()
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  async function onClear() {
    try {
      await clear.mutateAsync(match)
      toast.success('Resultado eliminado')
      onClose()
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-center text-xs font-semibold tracking-widest text-slate-500 uppercase">
        {match.stage === 'league' ? `Jornada ${match.round}` : STAGE_LABEL[match.stage]}
        {match.leg === 2 ? ' · Vuelta' : match.stage !== 'league' && view.matches.some((m) => m.stage === match.stage && m.slot === match.slot && m.leg === 2) ? ' · Ida' : ''}
      </p>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex flex-col items-center gap-3">
          <Team member={homeM} />
          <Counter value={home} onChange={setHome} label={memberLabel(homeM)} />
        </div>
        <span className="font-display text-4xl text-slate-600">:</span>
        <div className="flex flex-col items-center gap-3">
          <Team member={awayM} />
          <Counter value={away} onChange={setAway} label={memberLabel(awayM)} />
        </div>
      </div>

      {pens && (
        <div className="rounded-xl border border-gold-500/30 bg-gold-500/5 p-3">
          <p className="mb-2 text-center font-display text-lg tracking-wider text-gold-300 uppercase">
            Tanda de penales
          </p>
          <p className="mb-3 text-center text-xs text-slate-400">
            Hay empate total: se decide desde los once metros.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Counter value={pensHome} onChange={setPensHome} label={`penales de ${memberLabel(homeM)}`} size="md" />
            <span className="pt-2 font-display text-2xl text-slate-600">:</span>
            <Counter value={pensAway} onChange={setPensAway} label={`penales de ${memberLabel(awayM)}`} size="md" />
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <button type="button" className="btn btn-gold w-full" onClick={() => void onSave()} disabled={busy}>
          {save.isPending ? <Spinner className="h-5 w-5 border-night-950/30 border-t-night-950" /> : <Save size={20} />}
          Guardar resultado
        </button>
        {view.isAdmin && match.status === 'played' && (
          <button type="button" className="btn btn-danger w-full" onClick={() => void onClear()} disabled={busy}>
            <RotateCcw size={18} /> Borrar resultado
          </button>
        )}
      </div>
    </div>
  )
}
