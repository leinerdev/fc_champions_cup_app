import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  friendlyError,
  isSupabaseConfigured,
  supabase,
  usernameToEmail,
  validatePassword,
  validateUsername,
} from '@/lib/supabase'
import { detachFromUser } from '@/lib/push'
import type { Profile, ProfilePrivate } from '@/lib/types'

interface AuthContextValue {
  session: Session | null
  userId: string | null
  profile: Profile | null
  privateData: ProfilePrivate | null
  /** Sesión restaurada y (si hay usuario) perfil cargado. */
  loading: boolean
  /** Falta nombre completo, foto o email. */
  profileIncomplete: boolean
  isSuperAdmin: boolean
  signIn: (username: string, password: string) => Promise<void>
  signUp: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [sessionReady, setSessionReady] = useState(!isSupabaseConfigured)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? null

  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId!).single()
      if (error) throw error
      return data as Profile
    },
  })

  const privateQuery = useQuery({
    queryKey: ['profile-private', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profile_private')
        .select('*')
        .eq('id', userId!)
        .single()
      if (error) throw error
      return data as ProfilePrivate
    },
  })

  const signIn = useCallback(async (username: string, password: string) => {
    const uErr = validateUsername(username)
    if (uErr) throw new Error(uErr)
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    })
    if (error) throw new Error(friendlyError(error))
  }, [])

  const signUp = useCallback(
    async (username: string, password: string) => {
      const uErr = validateUsername(username)
      if (uErr) throw new Error(uErr)
      const pErr = validatePassword(password)
      if (pErr) throw new Error(pErr)
      const clean = username.trim().toLowerCase()
      const email = usernameToEmail(clean)
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username: clean } },
      })
      if (error) throw new Error(friendlyError(error))
      if (!data.session) {
        // Si la confirmación por email sigue activada en Supabase no hay sesión inmediata.
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) {
          throw new Error(
            'La cuenta se creó pero Supabase exige confirmar el email. Desactiva "Confirm email" en Authentication → Providers → Email.',
          )
        }
      }
    },
    [],
  )

  const signOut = useCallback(async () => {
    // Este dispositivo deja de recibir los avisos del usuario que sale.
    await detachFromUser().catch(() => undefined)
    await supabase.auth.signOut()
    queryClient.clear()
  }, [queryClient])

  const refreshProfile = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['profile', userId] }),
      queryClient.invalidateQueries({ queryKey: ['profile-private', userId] }),
    ])
  }, [queryClient, userId])

  const profile = profileQuery.data ?? null
  const privateData = privateQuery.data ?? null

  const loading =
    !sessionReady || (Boolean(userId) && (profileQuery.isPending || privateQuery.isPending))

  const profileIncomplete = Boolean(
    userId &&
      !loading &&
      (!profile?.full_name?.trim() || !profile?.avatar_url || !privateData?.email?.trim()),
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      userId,
      profile,
      privateData,
      loading,
      profileIncomplete,
      isSuperAdmin: Boolean(profile?.is_super_admin),
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
    [session, userId, profile, privateData, loading, profileIncomplete, signIn, signUp, signOut, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
