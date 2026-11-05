import { LogoMark, Wordmark } from '@/components/ui/Logo'

export function SetupNotice() {
  return (
    <div className="stadium-bg flex min-h-dvh items-center justify-center p-5">
      <div className="card card-gold w-full max-w-lg space-y-4">
        <div className="flex items-center gap-3">
          <LogoMark size={52} />
          <Wordmark className="text-2xl" />
        </div>
        <h1 className="text-3xl font-bold text-gold-300 uppercase">Falta conectar Supabase</h1>
        <p className="text-slate-300">
          La app necesita las credenciales de tu proyecto de Supabase para funcionar.
        </p>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-300">
          <li>
            Crea un proyecto en <span className="text-neon-300">supabase.com</span> y ejecuta las
            migraciones de <code className="text-gold-300">supabase/migrations</code>.
          </li>
          <li>
            Copia <code className="text-gold-300">.env.example</code> a{' '}
            <code className="text-gold-300">.env.local</code>.
          </li>
          <li>
            Pega <code className="text-gold-300">VITE_SUPABASE_URL</code> y{' '}
            <code className="text-gold-300">VITE_SUPABASE_ANON_KEY</code> (Project Settings → API).
          </li>
          <li>Reinicia el servidor de desarrollo.</li>
        </ol>
        <p className="text-xs text-slate-500">
          Los pasos detallados están en el README del proyecto.
        </p>
      </div>
    </div>
  )
}
