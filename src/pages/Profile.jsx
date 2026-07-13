import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthProvider.jsx'
import { supabase } from '../lib/supabaseClient'
import SectionHeader from '../components/SectionHeader.jsx'

export default function Profile() {
  const { user, profile, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [conference, setConference] = useState(profile?.conference || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (!conference.trim()) {
      setError('Please enter the officiating conference you work for.')
      return
    }
    setSaving(true)
    setSaved(false)
    try {
      const { error: err } = await supabase
        .from('profiles')
        .update({ display_name: displayName, conference: conference.trim() })
        .eq('id', user.id)
      if (err) setError(err.message)
      else {
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
          <div className="field">
            <label htmlFor="conference">Officiating Conference</label>
            <input id="conference" required value={conference} onChange={(e) => setConference(e.target.value)} />
          </div>
          {profile?.is_admin && <p className="help-text">Admin account</p>}
          {error && <p className="error-text">{error}</p>}
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
