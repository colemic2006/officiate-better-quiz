import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthProvider.jsx'

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, isAdmin, loading } = useAuth()

  if (loading) return <div className="page">Loading…</div>
  if (!user) return <Navigate to="/" replace />
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />
  return children
}
