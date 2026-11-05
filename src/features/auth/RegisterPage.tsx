import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Spinner } from '@/components/ui/Spinner'
import { validatePassword, validateUsername } from '@/lib/supabase'
import { useAuth } from './AuthProvider'
import { AuthShell } from './AuthShell'
import { nextFromSearch } from './next'

export function RegisterPage() {
  const { session, signUp } = useAuth()
  const navigate = useNavigate()
  const { search } = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const next = nextFromSearch(search)

  if (session) return <Navigate to={next} replace />

  const usernameHint = username ? validateUsername(username) : null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const uErr = validateUsername(username)
    if (uErr) return setError(uErr)
    const pErr = validatePassword(password)
    if (pErr) return setError(pErr)
    if (password !== confirm) return setError('Las contraseñas no coinciden.')

    setBusy(true)
    try {
      await signUp(username, password)
      navigate(next, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Crea tu cuenta"
      subtitle="Elige un usuario y una contraseña. Después completarás tu perfil."
      footer={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link
            to={`/login${search}`}
            className="font-semibold text-gold-400 underline-offset-4 hover:underline"
          >
            Inicia sesión
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="username" className="field-label">
            Usuario
          </label>
          <input
            id="username"
            className={`input ${usernameHint ? 'input-error' : ''}`}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="leinerdev"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            required
          />
          <p className={`mt-1.5 text-xs ${usernameHint ? 'text-loss' : 'text-slate-500'}`}>
            {usernameHint ?? 'Letras minúsculas, números y guion bajo (3 a 20).'}
          </p>
        </div>
        <div>
          <label htmlFor="password" className="field-label">
            Contraseña
          </label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="confirm" className="field-label">
            Repite la contraseña
          </label>
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="btn btn-gold w-full"
          disabled={busy || !username || !password || !confirm}
        >
          {busy ? <Spinner className="h-5 w-5 border-night-950/30 border-t-night-950" /> : <UserPlus size={20} />}
          Crear cuenta
        </button>
      </form>
    </AuthShell>
  )
}
