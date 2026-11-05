import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from './AuthProvider'
import { AuthShell } from './AuthShell'
import { nextFromSearch } from './next'

export function LoginPage() {
  const { session, signIn } = useAuth()
  const navigate = useNavigate()
  const { search } = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const next = nextFromSearch(search)

  if (session) return <Navigate to={next} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signIn(username, password)
      navigate(next, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Entrar al campo"
      subtitle="Inicia sesión con tu usuario y contraseña."
      footer={
        <>
          ¿Aún no tienes cuenta?{' '}
          <Link
            to={`/registro${search}`}
            className="font-semibold text-gold-400 underline-offset-4 hover:underline"
          >
            Regístrate
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
            className="input"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="leinerdev"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="password" className="field-label">
            Contraseña
          </label>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-gold w-full" disabled={busy || !username || !password}>
          {busy ? <Spinner className="h-5 w-5 border-night-950/30 border-t-night-950" /> : <LogIn size={20} />}
          Entrar
        </button>

        <p className="text-center text-xs text-slate-500">
          ¿Olvidaste tu contraseña? Pídele al administrador de la app que la restablezca.
        </p>
      </form>
    </AuthShell>
  )
}
