import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Camera, KeyRound, LogOut, Save, ShieldCheck } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { squareAvatarBlob } from '@/lib/image'
import { friendlyError, supabase, validatePassword } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { nextFromSearch } from '@/features/auth/next'
import { NotificationsCard } from '@/features/notifications/NotificationsCard'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Ruta del objeto dentro del bucket `avatars` a partir de la URL pública. */
function storagePathFromUrl(url: string | null): string | null {
  if (!url) return null
  const marker = '/avatars/'
  const i = url.indexOf(marker)
  return i === -1 ? null : url.slice(i + marker.length).split('?')[0]
}

export function ProfilePage() {
  const { userId, profile, privateData, profileIncomplete, isSuperAdmin, refreshProfile, signOut } =
    useAuth()
  const queryClient = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const { search } = useLocation()
  const fileRef = useRef<HTMLInputElement>(null)

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [email, setEmail] = useState(privateData?.email ?? '')
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [newPass, setNewPass] = useState('')
  const [newPass2, setNewPass2] = useState('')
  const [passBusy, setPassBusy] = useState(false)

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  if (!profile || !userId) return null

  const shownAvatar = preview ?? profile.avatar_url
  const displayName = fullName.trim() || profile.username

  async function onPickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const blob = await squareAvatarBlob(file)
      setPhoto(blob)
      setPreview(URL.createObjectURL(blob))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer la imagen.')
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (fullName.trim().length < 2) return setError('Escribe tu nombre completo.')
    if (!EMAIL_RE.test(email.trim())) return setError('Escribe un correo electrónico válido.')
    if (!shownAvatar) return setError('Sube una foto de perfil.')

    setSaving(true)
    try {
      let avatarUrl = profile!.avatar_url
      if (photo) {
        const path = `${userId}/avatar-${Date.now()}.jpg`
        const { error: upErr } = await supabase.storage
          .from('avatars')
          .upload(path, photo, { contentType: 'image/jpeg', cacheControl: '31536000' })
        if (upErr) throw upErr
        avatarUrl = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
        const old = storagePathFromUrl(profile!.avatar_url)
        if (old) await supabase.storage.from('avatars').remove([old])
      }

      const { error: pErr } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim(), avatar_url: avatarUrl })
        .eq('id', userId)
      if (pErr) throw pErr
      const { error: eErr } = await supabase
        .from('profile_private')
        .update({ email: email.trim() })
        .eq('id', userId)
      if (eErr) throw eErr

      setPhoto(null)
      setPreview(null)
      await refreshProfile()
      await queryClient.invalidateQueries({ queryKey: ['tournament'] })
      toast.success('Perfil actualizado')
      // Si venía redirigido (p. ej. desde un enlace de invitación), continúa allí.
      if (new URLSearchParams(search).has('next')) navigate(nextFromSearch(search), { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setSaving(false)
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault()
    const pErr = validatePassword(newPass)
    if (pErr) return toast.error(pErr)
    if (newPass !== newPass2) return toast.error('Las contraseñas no coinciden.')
    setPassBusy(true)
    const { error: err } = await supabase.auth.updateUser({ password: newPass })
    setPassBusy(false)
    if (err) return toast.error(friendlyError(err))
    setNewPass('')
    setNewPass2('')
    toast.success('Contraseña actualizada')
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h1 className="text-4xl font-extrabold text-white uppercase">Mi perfil</h1>
        <p className="text-sm text-slate-400">@{profile.username}</p>
      </header>

      {profileIncomplete && (
        <div className="card card-gold flex items-start gap-3 text-sm text-gold-200">
          <ShieldCheck className="mt-0.5 shrink-0 text-gold-400" size={20} />
          <p>
            <strong className="font-display text-lg tracking-wide uppercase">Último paso:</strong>{' '}
            completa tu nombre, foto y correo para entrar a los torneos.
          </p>
        </div>
      )}

      <form onSubmit={onSave} className="card space-y-5">
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neon-400"
            aria-label="Cambiar foto"
          >
            <Avatar name={displayName} url={shownAvatar} size={128} ring />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-night-950/60 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
              <Camera size={28} className="text-gold-300" />
            </span>
            <span className="absolute right-1 bottom-1 flex h-9 w-9 items-center justify-center rounded-full bg-gold-500 text-night-950 shadow-glow-gold">
              <Camera size={18} />
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPickPhoto}
          />
          <p className="text-xs text-slate-500">Se recorta en cuadrado automáticamente.</p>
        </div>

        <div>
          <label htmlFor="full_name" className="field-label">
            Nombre completo
          </label>
          <input
            id="full_name"
            className="input"
            autoComplete="name"
            placeholder="Leiner Barrios"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={80}
          />
        </div>

        <div>
          <label htmlFor="email" className="field-label">
            Correo electrónico
          </label>
          <input
            id="email"
            type="email"
            className="input"
            autoComplete="email"
            inputMode="email"
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-slate-500">
            Solo tú y el administrador de la app lo ven. Se usará para futuras integraciones.
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-gold w-full" disabled={saving}>
          {saving ? <Spinner className="h-5 w-5 border-night-950/30 border-t-night-950" /> : <Save size={20} />}
          Guardar perfil
        </button>
      </form>

      <NotificationsCard />

      <form onSubmit={onChangePassword} className="card space-y-4">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-white uppercase">
          <KeyRound size={20} className="text-neon-400" /> Cambiar contraseña
        </h2>
        <div>
          <label htmlFor="new_pass" className="field-label">
            Nueva contraseña
          </label>
          <PasswordInput
            id="new_pass"
            autoComplete="new-password"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="new_pass2" className="field-label">
            Repite la contraseña
          </label>
          <PasswordInput
            id="new_pass2"
            autoComplete="new-password"
            value={newPass2}
            onChange={(e) => setNewPass2(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-neon w-full" disabled={passBusy || !newPass}>
          {passBusy && <Spinner className="h-5 w-5" />}
          Actualizar contraseña
        </button>
      </form>

      <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
        {isSuperAdmin && (
          <span className="chip chip-gold self-start">
            <ShieldCheck size={14} /> Super admin
          </span>
        )}
        <button type="button" onClick={() => void signOut()} className="btn btn-danger sm:ml-auto">
          <LogOut size={18} /> Cerrar sesión
        </button>
      </div>
    </div>
  )
}
