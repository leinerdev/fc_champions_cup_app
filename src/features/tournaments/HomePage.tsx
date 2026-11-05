import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, KeyRound, Plus, Trophy } from 'lucide-react'
import { PageLoader } from '@/components/ui/Spinner'
import { useAuth } from '@/features/auth/AuthProvider'
import { friendlyError } from '@/lib/supabase'
import { useMyTournaments } from './api'
import { TournamentCard } from './TournamentCard'

export function HomePage() {
  const { profile, userId } = useAuth()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const { data, isPending, error } = useMyTournaments(userId)

  const firstName = (profile?.full_name || profile?.username || '').split(' ')[0]

  function onJoin(e: FormEvent) {
    e.preventDefault()
    if (/^\d{6}$/.test(code)) navigate(`/join/${code}`)
  }

  return (
    <div className="space-y-8">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-1"
      >
        <p className="font-display text-lg tracking-[0.3em] text-neon-400 uppercase">Matchday</p>
        <h1 className="text-4xl leading-none font-extrabold text-white uppercase sm:text-5xl">
          Hola, <span className="text-gradient-gold">{firstName}</span>
        </h1>
        <p className="text-slate-400">¿Listo para escribir tu historia en el campo?</p>
      </motion.section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <Link
            to="/torneos/nuevo"
            className="card card-gold group flex h-full flex-col justify-between gap-6 overflow-hidden transition hover:-translate-y-0.5 hover:shadow-glow-gold"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-500 text-night-950 shadow-glow-gold">
              <Plus size={30} strokeWidth={3} />
            </span>
            <div>
              <h2 className="text-3xl font-extrabold text-white uppercase">Crear torneo</h2>
              <p className="mt-1 text-sm text-slate-400">
                Liga, liguilla o copa. Tú pones las reglas, tus amigos ponen el talento.
              </p>
            </div>
            <span className="flex items-center gap-2 font-display text-lg tracking-wider text-gold-300 uppercase">
              Empezar <ArrowRight size={18} className="transition group-hover:translate-x-1" />
            </span>
            <Trophy
              aria-hidden
              size={150}
              className="pointer-events-none absolute -right-6 -bottom-6 text-gold-500/10"
            />
          </Link>
        </motion.div>

        <motion.form
          onSubmit={onJoin}
          className="card flex h-full flex-col justify-between gap-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neon-400/15 text-neon-300">
            <KeyRound size={28} />
          </span>
          <div>
            <h2 className="text-3xl font-extrabold text-white uppercase">Unirme con código</h2>
            <p className="mt-1 text-sm text-slate-400">Ingresa los 6 dígitos que te compartieron.</p>
          </div>
          <div className="flex gap-2">
            <input
              className="input text-center font-display text-3xl font-bold tracking-[0.35em]"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              placeholder="000000"
              aria-label="Código de torneo de 6 dígitos"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            <button
              type="submit"
              className="btn btn-neon !px-4"
              disabled={code.length !== 6}
              aria-label="Unirme al torneo"
            >
              <ArrowRight size={22} />
            </button>
          </div>
        </motion.form>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-bold tracking-wider text-slate-300 uppercase">Mis torneos</h2>
        {isPending ? (
          <PageLoader />
        ) : error ? (
          <p role="alert" className="card text-loss">
            {friendlyError(error)}
          </p>
        ) : data.length === 0 ? (
          <div className="card flex flex-col items-center gap-2 py-10 text-center">
            <Trophy size={44} className="text-slate-600" />
            <p className="font-display text-2xl text-slate-300 uppercase">Aún no juegas ningún torneo</p>
            <p className="max-w-xs text-sm text-slate-500">
              Crea el tuyo o únete con un código para ver aquí tus torneos.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.map((t, i) => (
              <TournamentCard key={t.id} t={t} index={i} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
