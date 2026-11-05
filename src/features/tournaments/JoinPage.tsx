import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, Frown, LogIn, Swords, Trophy, Users } from 'lucide-react'
import { PageLoader, Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { friendlyError } from '@/lib/supabase'
import { TYPE_LABEL } from '@/lib/tournament-engine'
import { useJoinTournament, usePreview } from './api'
import { StatusChip } from './TournamentCard'

export function JoinPage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const preview = usePreview(code)
  const join = useJoinTournament()

  async function onJoin() {
    try {
      const id = await join.mutateAsync(code)
      toast.success('¡Ya estás dentro del torneo!')
      navigate(`/torneos/${id}`, { replace: true })
    } catch (err) {
      toast.error(friendlyError(err))
    }
  }

  if (!/^\d{6}$/.test(code)) return <NotFound text="El código debe tener 6 dígitos." />
  if (preview.isPending) return <PageLoader />
  if (preview.error) return <NotFound text={friendlyError(preview.error)} />
  const t = preview.data
  if (!t) return <NotFound text="No existe ningún torneo con ese código." />

  const full = t.members >= t.size
  const started = t.status !== 'draft'
  const Icon = t.type === 'league' ? Swords : Trophy

  return (
    <motion.div
      className="mx-auto max-w-md pt-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="card card-gold space-y-5 text-center">
        <p className="field-label !mb-2">Te invitaron a jugar</p>
        <span
          className={`mx-auto flex h-20 w-20 items-center justify-center rounded-2xl ${
            t.type === 'league' ? 'bg-neon-400/15 text-neon-300' : 'bg-gold-500/15 text-gold-400'
          }`}
        >
          <Icon size={40} />
        </span>
        <div>
          <h1 className="text-4xl leading-tight font-extrabold text-white uppercase">{t.name}</h1>
          <p className="text-sm text-slate-400">Organizado por {t.creator ?? '—'}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="chip">{TYPE_LABEL[t.type]}</span>
          <StatusChip status={t.status} />
          <span className="chip">
            <Users size={12} /> {t.members}/{t.size}
          </span>
        </div>

        {t.already_member ? (
          <Link to={`/torneos/${t.id}`} className="btn btn-gold w-full">
            Ir al torneo <ArrowRight size={20} />
          </Link>
        ) : started ? (
          <p className="rounded-lg border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
            Este torneo ya comenzó y no admite más jugadores.
          </p>
        ) : full ? (
          <p className="rounded-lg border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
            Este torneo ya está completo.
          </p>
        ) : (
          <button className="btn btn-gold w-full" onClick={() => void onJoin()} disabled={join.isPending}>
            {join.isPending ? (
              <Spinner className="h-5 w-5 border-night-950/30 border-t-night-950" />
            ) : (
              <LogIn size={20} />
            )}
            Unirme como invitado
          </button>
        )}
      </div>
    </motion.div>
  )
}

function NotFound({ text }: { text: string }) {
  return (
    <div className="card mx-auto mt-10 flex max-w-md flex-col items-center gap-3 py-10 text-center">
      <Frown size={44} className="text-slate-600" />
      <h1 className="text-3xl font-bold text-white uppercase">Código no válido</h1>
      <p className="text-sm text-slate-400">{text}</p>
      <Link to="/" className="btn btn-ghost mt-2">
        Volver al inicio
      </Link>
    </div>
  )
}
