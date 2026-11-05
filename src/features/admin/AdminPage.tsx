import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, KeyRound, RefreshCw, Search, ShieldCheck, Trash2, Trophy, Users } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { PageLoader, Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { friendlyError, supabase } from '@/lib/supabase'
import { STATUS_LABEL, TYPE_LABEL } from '@/lib/tournament-engine'
import type { Profile, Tournament } from '@/lib/types'
import { cn, copyText, formatDate, randomPassword } from '@/lib/utils'

type UserRow = Profile & { profile_private: { email: string | null } | null }
type TournamentRow = Tournament & {
  creator: { username: string; full_name: string | null } | null
  members: { count: number }[]
}

export function AdminPage() {
  const [tab, setTab] = useState<'users' | 'tournaments'>('users')
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
          <ShieldCheck size={26} />
        </span>
        <div>
          <h1 className="text-4xl font-extrabold text-white uppercase">Super admin</h1>
          <p className="text-sm text-slate-400">Gestiona usuarios, contraseñas y todos los torneos.</p>
        </div>
      </header>

      <div className="flex gap-2" role="tablist">
        {(
          [
            ['users', 'Usuarios', Users],
            ['tournaments', 'Torneos', Trophy],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'btn btn-sm',
              tab === id ? 'btn-gold' : 'btn-ghost',
            )}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {tab === 'users' ? <UsersTab /> : <TournamentsTab />}
    </div>
  )
}

/* ------------------------------ Usuarios ------------------------------ */

function UsersTab() {
  const [search, setSearch] = useState('')
  const [target, setTarget] = useState<UserRow | null>(null)

  const { data, isPending, error } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, profile_private(email)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as UserRow[]
    },
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data ?? []
    return (data ?? []).filter(
      (u) =>
        u.username.includes(q) ||
        (u.full_name ?? '').toLowerCase().includes(q) ||
        (u.profile_private?.email ?? '').toLowerCase().includes(q),
    )
  }, [data, search])

  if (isPending) return <PageLoader />
  if (error) return <p className="text-loss">{friendlyError(error)}</p>

  return (
    <section className="space-y-4">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-slate-500" />
        <input
          className="input pl-11"
          placeholder="Buscar por usuario, nombre o correo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <p className="text-xs tracking-widest text-slate-500 uppercase">
        {filtered.length} de {data.length} usuarios
      </p>

      <ul className="space-y-2">
        {filtered.map((u) => (
          <li key={u.id} className="card flex items-center gap-3 !p-3">
            <Avatar name={u.full_name || u.username} url={u.avatar_url} size={46} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate font-semibold text-white">
                {u.full_name || <span className="text-slate-400 italic">Sin nombre</span>}
                {u.is_super_admin && <span className="chip chip-gold">Super admin</span>}
              </p>
              <p className="truncate text-sm text-slate-400">
                @{u.username}
                {u.profile_private?.email ? ` · ${u.profile_private.email}` : ''}
              </p>
              <p className="text-xs text-slate-600">Registrado el {formatDate(u.created_at)}</p>
            </div>
            <button className="btn btn-ghost btn-sm shrink-0" onClick={() => setTarget(u)}>
              <KeyRound size={16} />
              <span className="hidden sm:inline">Restablecer</span>
            </button>
          </li>
        ))}
        {filtered.length === 0 && <li className="card text-center text-slate-400">Sin resultados.</li>}
      </ul>

      <ResetPasswordModal user={target} onClose={() => setTarget(null)} />
    </section>
  )
}

function ResetPasswordModal({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const toast = useToast()
  const [password, setPassword] = useState(() => randomPassword())
  const [done, setDone] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const reset = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('admin-reset-password', {
        body: { user_id: user!.id, new_password: password },
      })
      if (error) {
        // FunctionsHttpError trae la respuesta en context
        const ctx = (error as { context?: Response }).context
        if (ctx && typeof ctx.json === 'function') {
          const body = await ctx.json().catch(() => null)
          if (body?.error) throw new Error(body.error)
        }
        throw error
      }
      if (data?.error) throw new Error(data.error)
    },
    onSuccess: () => setDone(password),
    onError: (e) => toast.error(friendlyError(e)),
  })

  function close() {
    setDone(null)
    setCopied(false)
    setPassword(randomPassword())
    onClose()
  }

  async function copy(text: string) {
    if (await copyText(text)) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Modal open={Boolean(user)} onClose={close} title="Restablecer contraseña">
      {user && !done && (
        <div className="space-y-4">
          <p className="text-slate-300">
            Nueva contraseña para <strong className="text-white">@{user.username}</strong>. Compártela
            con la persona y recomiéndale cambiarla desde su perfil.
          </p>
          <div>
            <label className="field-label" htmlFor="new-pw">
              Contraseña temporal
            </label>
            <div className="flex gap-2">
              <input
                id="new-pw"
                className="input font-mono"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
              />
              <button
                type="button"
                className="btn btn-ghost !px-3"
                onClick={() => setPassword(randomPassword())}
                aria-label="Generar otra"
              >
                <RefreshCw size={18} />
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">Mínimo 6 caracteres.</p>
          </div>
          <button
            className="btn btn-gold w-full"
            disabled={reset.isPending || password.length < 6}
            onClick={() => reset.mutate()}
          >
            {reset.isPending ? <Spinner className="h-5 w-5 border-night-950/30 border-t-night-950" /> : <KeyRound size={18} />}
            Restablecer
          </button>
        </div>
      )}
      {user && done && (
        <div className="space-y-4">
          <p className="rounded-lg border border-win/40 bg-win/10 px-3 py-2 text-win">
            Contraseña actualizada para @{user.username}.
          </p>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-night-950/70 p-3">
            <code className="flex-1 text-lg text-gold-300">{done}</code>
            <button className="btn btn-neon btn-sm" onClick={() => void copy(done)}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copiada' : 'Copiar'}
            </button>
          </div>
          <button className="btn btn-ghost w-full" onClick={close}>
            Listo
          </button>
        </div>
      )}
    </Modal>
  )
}

/* ------------------------------- Torneos ------------------------------ */

function TournamentsTab() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [toDelete, setToDelete] = useState<TournamentRow | null>(null)

  const { data, isPending, error } = useQuery({
    queryKey: ['admin', 'tournaments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select(
          '*, creator:profiles!created_by(username, full_name), members:tournament_members!tournament_id(count)',
        )
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as TournamentRow[]
    },
  })

  async function remove(t: TournamentRow) {
    const { error } = await supabase.from('tournaments').delete().eq('id', t.id)
    if (error) {
      toast.error(friendlyError(error))
      throw error
    }
    toast.success(`Torneo "${t.name}" eliminado`)
    await queryClient.invalidateQueries({ queryKey: ['admin', 'tournaments'] })
    await queryClient.invalidateQueries({ queryKey: ['tournaments'] })
  }

  if (isPending) return <PageLoader />
  if (error) return <p className="text-loss">{friendlyError(error)}</p>

  return (
    <section className="space-y-3">
      <p className="text-xs tracking-widest text-slate-500 uppercase">{data.length} torneos</p>
      <ul className="space-y-2">
        {data.map((t) => (
          <li key={t.id} className="card flex items-center gap-3 !p-3">
            <Link to={`/torneos/${t.id}`} className="min-w-0 flex-1">
              <p className="truncate text-xl font-bold text-white">{t.name}</p>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-400">
                <span className="chip chip-gold">{TYPE_LABEL[t.type]}</span>
                <span className="chip">{STATUS_LABEL[t.status]}</span>
                <span>
                  {t.members[0]?.count ?? 0}/{t.config.size} jugadores
                </span>
                <span>· código {t.code}</span>
              </p>
              <p className="text-xs text-slate-600">
                por @{t.creator?.username ?? '—'} · {formatDate(t.created_at)}
              </p>
            </Link>
            <button
              className="btn btn-danger btn-sm shrink-0"
              onClick={() => setToDelete(t)}
              aria-label={`Eliminar ${t.name}`}
            >
              <Trash2 size={16} />
            </button>
          </li>
        ))}
        {data.length === 0 && <li className="card text-center text-slate-400">Aún no hay torneos.</li>}
      </ul>

      <ConfirmDialog
        open={Boolean(toDelete)}
        danger
        title="Eliminar torneo"
        message={`Se eliminará "${toDelete?.name}" con todos sus partidos. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        onConfirm={() => remove(toDelete!)}
        onClose={() => setToDelete(null)}
      />
    </section>
  )
}
