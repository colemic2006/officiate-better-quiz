import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [deactivatedNotice, setDeactivatedNotice] = useState(false)

  const loadProfile = useCallback(async (userId) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (error) return null
    return data
  }, [])

  useEffect(() => {
    let cancelled = false

    async function init() {
      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession()
      if (cancelled) return

      if (initialSession) {
        const p = await loadProfile(initialSession.user.id)
        if (cancelled) return
        // Deactivated accounts are blocked at session-check time, not just
        // hidden in the UI: sign them out immediately rather than trusting
        // the client to avoid calling further protected queries.
        if (p && p.is_active === false) {
          await supabase.auth.signOut()
          setSession(null)
          setProfile(null)
          setDeactivatedNotice(true)
        } else {
          setSession(initialSession)
          setProfile(p)
        }
      }
      setLoading(false)
    }
    init()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!newSession) {
        setSession(null)
        setProfile(null)
        return
      }
      const p = await loadProfile(newSession.user.id)
      if (p && p.is_active === false) {
        await supabase.auth.signOut()
        setSession(null)
        setProfile(null)
        setDeactivatedNotice(true)
        return
      }
      setSession(newSession)
      setProfile(p)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const signUp = useCallback(async (email, password, displayName) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    })
    return { error }
  }, [])

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!session) return
    const p = await loadProfile(session.user.id)
    setProfile(p)
  }, [session, loadProfile])

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    isAdmin: !!profile?.is_admin,
    loading,
    deactivatedNotice,
    clearDeactivatedNotice: () => setDeactivatedNotice(false),
    signUp,
    signIn,
    signOut,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
