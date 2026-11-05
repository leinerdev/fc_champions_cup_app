// Edge Function: el super admin restablece la contraseña de otro usuario.
//
// - Verifica el JWT del que llama y que `profiles.is_super_admin = true`.
// - Usa la service role key (disponible solo en el servidor) para cambiar la contraseña.
//
// Despliegue:  supabase functions deploy admin-reset-password
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autenticado' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // 1) ¿Quién llama?
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userError } = await caller.auth.getUser()
    if (userError || !userData.user) return json({ error: 'Sesión inválida' }, 401)

    // 2) ¿Es super admin?
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('is_super_admin')
      .eq('id', userData.user.id)
      .single()
    if (profileError || !profile?.is_super_admin) {
      return json({ error: 'Solo el super admin puede restablecer contraseñas' }, 403)
    }

    // 3) Validar entrada
    const body = await req.json().catch(() => null)
    const userId = body?.user_id
    const newPassword = body?.new_password
    if (typeof userId !== 'string' || !UUID_RE.test(userId)) {
      return json({ error: 'user_id inválido' }, 400)
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 72) {
      return json({ error: 'La contraseña debe tener entre 6 y 72 caracteres' }, 400)
    }

    // 4) Cambiar la contraseña
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password: newPassword,
    })
    if (updateError) return json({ error: updateError.message }, 400)

    return json({ ok: true })
  } catch (err) {
    console.error(err)
    return json({ error: 'Error interno' }, 500)
  }
})
