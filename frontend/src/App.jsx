import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useContext } from 'react'
import './index.css'
import Navbar from './components/Navbar'
import HomePage from './pages/HomePage'
import DashboardPage from './pages/DashboardPage'
import UploadPage from './pages/UploadPage'
import VideosPage from './pages/VideosPage'
import TranscriptPage from './pages/TranscriptPage'
import PreprocessingPage from './pages/PreprocessingPage'
import SummaryPage from './pages/SummaryPage'
import ProcessingPage from './pages/ProcessingPage'
import QuizPage from './pages/QuizPage'
import QuizResultsPage from './pages/QuizResultsPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import { AuthProvider, AuthContext } from './context/AuthContext'

function HomeWrapper() {
  const { user, loading } = useContext(AuthContext);
  if (loading) return null;
  return user ? <DashboardPage /> : <HomePage />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
          <Navbar />
          <Routes>
            <Route path="/"                              element={<HomeWrapper />} />
            <Route path="/login"                          element={<LoginPage />} />
            <Route path="/register"                       element={<RegisterPage />} />
            <Route path="/upload"                        element={<UploadPage />} />
            <Route path="/videos"                        element={<VideosPage />} />
            <Route path="/videos/:id/processing"         element={<ProcessingPage />} />
            <Route path="/videos/:id/transcript"         element={<TranscriptPage />} />
            <Route path="/videos/:id/preprocessing"      element={<PreprocessingPage />} />
            <Route path="/videos/:id/summary"            element={<SummaryPage />} />
            <Route path="/quiz/:quizId"                  element={<QuizPage />} />
            <Route path="/quiz/:quizId/results"          element={<QuizResultsPage />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  )
}
