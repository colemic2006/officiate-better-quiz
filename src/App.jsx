import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import Header from './components/Header.jsx'
import Footer from './components/Footer.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import { useAuth } from './lib/AuthProvider.jsx'
import { fetchCategories, fetchQuestionCount, fetchUserCategoryStats, fetchAttemptHistory, computeStreakDays } from './lib/api'

import Home from './pages/Home.jsx'
import Dashboard from './pages/Dashboard.jsx'
import QuizSetup from './pages/QuizSetup.jsx'
import QuizPlay from './pages/QuizPlay.jsx'
import QuizResults from './pages/QuizResults.jsx'
import MissedQuestions from './pages/MissedQuestions.jsx'
import Admin from './pages/Admin.jsx'
import Profile from './pages/Profile.jsx'

export default function App() {
  const { user, deactivatedNotice, clearDeactivatedNotice } = useAuth()
  const [stats, setStats] = useState(null)

  useEffect(() => {
    if (!user) {
      setStats(null)
      return
    }
    let cancelled = false
    async function load() {
      try {
        const [categories, questionCount, statsByCategoryId, attempts] = await Promise.all([
          fetchCategories(),
          fetchQuestionCount(),
          fetchUserCategoryStats(user.id),
          fetchAttemptHistory(user.id),
        ])
        if (cancelled) return
        let correct = 0
        let total = 0
        for (const s of statsByCategoryId.values()) {
          correct += s.correct_count
          total += s.total_count
        }
        const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0
        setStats([
          { label: 'Categories', value: categories.length },
          { label: 'Questions in Bank', value: questionCount },
          { label: 'Your Accuracy', value: `${accuracy}%` },
          { label: 'Current Streak', value: computeStreakDays(attempts) },
        ])
      } catch {
        // Non-fatal — stats bar just stays hidden.
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [user])

  return (
    <div>
      <Header stats={user ? stats : null} />
      {deactivatedNotice && (
        <div className="page" style={{ paddingBottom: 0 }}>
          <div className="card" style={{ borderColor: '#c0392b' }}>
            <strong>Your account has been deactivated.</strong>{' '}
            <span className="muted">Contact your administrator if you believe this is a mistake.</span>{' '}
            <button className="btn btn--sm btn--outline" onClick={clearDeactivatedNotice}>
              Dismiss
            </button>
          </div>
        </div>
      )}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quiz"
          element={
            <ProtectedRoute>
              <QuizSetup />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quiz/play"
          element={
            <ProtectedRoute>
              <QuizPlay />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quiz/results"
          element={
            <ProtectedRoute>
              <QuizResults />
            </ProtectedRoute>
          }
        />
        <Route
          path="/missed"
          element={
            <ProtectedRoute>
              <MissedQuestions />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute adminOnly>
              <Admin />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
      </Routes>
      <Footer />
    </div>
  )
}
