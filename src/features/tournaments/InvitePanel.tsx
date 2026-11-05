import { useState } from 'react'
import { Check, Copy, Link2, Share2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import type { Tournament } from '@/lib/types'
import { copyText, inviteUrl } from '@/lib/utils'

export function InvitePanel({ t }: { t: Tournament }) {
  const toast = useToast()
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const url = inviteUrl(t.code)

  async function copy(what: 'code' | 'link') {
    const ok = await copyText(what === 'code' ? t.code : url)
    if (!ok) return toast.error('No se pudo copiar. Cópialo manualmente.')
    setCopied(what)
    window.setTimeout(() => setCopied(null), 1800)
  }

  async function share() {
    const data = {
      title: t.name,
      text: `Únete a "${t.name}" en FC CHAMPIONS CUP con el código ${t.code}`,
      url,
    }
    if (navigator.share) {
      try {
        await navigator.share(data)
      } catch {
        /* el usuario canceló */
      }
    } else {
      await copy('link')
      toast.info('Enlace copiado')
    }
  }

  return (
    <div className="card card-gold space-y-4">
      <div>
        <p className="field-label !mb-0">Código del torneo</p>
        <p
          className="text-gradient-gold animate-shimmer my-1 font-display text-6xl leading-none font-extrabold tracking-[0.2em] tabular-nums"
          aria-label={`Código ${t.code.split('').join(' ')}`}
        >
          {t.code}
        </p>
        <p className="text-sm text-slate-400">
          Compártelo o envía el enlace: quien se una entra como <strong className="text-slate-200">invitado</strong>.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy('code')}>
          {copied === 'code' ? <Check size={16} className="text-win" /> : <Copy size={16} />}
          {copied === 'code' ? 'Copiado' : 'Copiar código'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy('link')}>
          {copied === 'link' ? <Check size={16} className="text-win" /> : <Link2 size={16} />}
          {copied === 'link' ? 'Copiado' : 'Copiar enlace'}
        </button>
        <button type="button" className="btn btn-neon btn-sm" onClick={() => void share()}>
          <Share2 size={16} /> Compartir
        </button>
      </div>
    </div>
  )
}
