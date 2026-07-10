import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthProvider.jsx'
import { supabase } from '../lib/supabaseClient'
import SectionHeader from '../components/SectionHeader.jsx'

export default function Profile() {
  const { user, profile, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    try {
      const { error } = await supabase.from('profiles').update({ display_name: displayName }).eq('id', user.id)
      if (!error) {
        await refreshProfile()
        setSaved(true)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  return (
    <div className="page">
      <SectionHeader>Profile</SectionHeader>
      <div className="card" style={{ maxWidth: '28rem' }}>
        <form onSubmit={handleSave}>
          <div className="field">
            <label>Email</label>
            <input value={user.email} disabled />
          </div>
          <div className="field">
            <label htmlFor="displayName">Display Name</label>
            <input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          {profile?.is_admin && <p className="help-text">Admin account</p>}
          {saved && <p className="help-text">Saved.</p>}
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </div>
      <button className="btn btn--outline" style={{ marginTop: '1rem' }} onClick={handleSignOut}>
        Sign Out
      </button>
    </div>
  )
}
