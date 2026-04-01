import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth-context';
import { ToastProvider } from './components/Toast';
import { ProtectedRoute } from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import SkillEditorPage from './pages/SkillEditorPage';
import VersionHistoryPage from './pages/VersionHistoryPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/skills/new" element={<ProtectedRoute><SkillEditorPage /></ProtectedRoute>} />
          <Route path="/skills/:id/edit" element={<ProtectedRoute><SkillEditorPage /></ProtectedRoute>} />
          <Route path="/skills/:id/versions" element={<ProtectedRoute><VersionHistoryPage /></ProtectedRoute>} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--foreground-primary)',fontSize:24}}>404 — Page not found</div>} />
        </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
