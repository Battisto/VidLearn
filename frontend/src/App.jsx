import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Navbar from './components/Navbar'
import HomePage from './pages/HomePage'
import UploadPage from './pages/UploadPage'
import VideosPage from './pages/VideosPage'
import TranscriptPage from './pages/TranscriptPage'

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
        <Navbar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/videos" element={<VideosPage />} />
          <Route path="/videos/:id/transcript" element={<TranscriptPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
