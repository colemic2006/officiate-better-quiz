import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [deactivatedNotice, setDeactivatedNotice] = useState(false)
  // True after the user lands here via a "reset your password" email link.
  // Supabase establishes a real (short-lived) session for this, but we want
  // to force the "set a new password" screen rather than let them into the
  // app normally until they've done that.
  const [passwordRecovery, setPasswordRecovery] = useState(false)

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
      if (_event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)

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

  const signUp = useCallback(async (email, password, firstName, lastName, conference) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { first_name: firstName, last_name: lastName, conference } },
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

  const requestPasswordReset = useCallback(async (email) => {
    // No hash path here on purpose — Supabase appends the recovery tokens
    // to the URL hash, which would collide with HashRouter's own use of
    // the hash for routing. Redirecting to the bare site root lets
    // supabase-js auto-detect the tokens from the URL before the router
    // ever gets a chance to interpret them as a path; onAuthStateChange
    // then flips passwordRecovery, and App.jsx takes it from there.
    const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    return { error }
  }, [])

  const updatePassword = useCallback(async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (!error) setPasswordRecovery(false)
    return { error }
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
    passwordRecovery,
    signUp,
    signIn,
    signOut,
    refreshProfile,
    requestPasswordReset,
    updatePassword,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
