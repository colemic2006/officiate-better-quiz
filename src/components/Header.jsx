import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthProvider.jsx'

export default function Header({ stats }) {
  const { user, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  return (
    <>
      <header className="site-header">
        <div className="site-header__inner">
          <Link to="/" className="brand">
            <span className="brand__primary">Officiate Better</span>
            <span className="brand__accent">Rules Quiz</span>
          </Link>
          <nav className="site-nav">
            {user ? (
              <>
                <NavLink to="/dashboard">Dashboard</NavLink>
                <NavLink to="/quiz">Take a Quiz</NavLink>
                <NavLink to="/missed">Missed Questions</NavLink>
                {isAdmin && <NavLink to="/admin">Admin</NavLink>}
                <NavLink to="/profile">Profile</NavLink>
                <button className="linklike" onClick={handleSignOut}>
                  Sign Out
                </button>
              </>
            ) : (
              <NavLink to="/">Sign In</NavLink>
            )}
          </nav>
        </div>
      </header>
      {stats && (
        <div className="stats-bar">
          <div className="stats-bar__inner">
            {stats.map((s) => (
              <div className="stat" key={s.label}>
                <span className="stat__value">{s.value}</span>
                <span className="stat__label">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
