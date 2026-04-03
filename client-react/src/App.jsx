import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import MyListPage from './pages/MyListPage';
import ProfilePage from './pages/ProfilePage';
import AnalyticsPage from './pages/AnalyticsPage';

// ── Page transition wrapper ──
const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const pageTransition = {
  type: 'tween',
  ease: 'easeInOut',
  duration: 0.25,
};

function AnimatedPage({ children }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
    >
      {children}
    </motion.div>
  );
}

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', color: 'var(--text-2)', fontSize: '1rem',
      }}>
        <div className="neural-loader" style={{ transform: 'scale(0.6)' }}>
          <div className="nl-ring"></div>
          <div className="nl-ring nl-ring--2"></div>
          <div className="nl-ring nl-ring--3"></div>
          <div className="nl-core">🎬</div>
        </div>
      </div>
    );
  }

  return isAuthenticated ? children : <LoginPage />;
}

function AnimatedRoutes() {
  const location = useLocation();
  const { user } = useAuth();

  if (user?.isAdmin) {
    return (
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/analytics" element={<AnimatedPage><AnalyticsPage /></AnimatedPage>} />
          <Route path="*" element={<Navigate to="/analytics" replace />} />
        </Routes>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<AnimatedPage><HomePage /></AnimatedPage>} />
        <Route path="/my-list" element={<AnimatedPage><MyListPage /></AnimatedPage>} />
        <Route path="/profile" element={<AnimatedPage><ProfilePage /></AnimatedPage>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

function AppLayout() {
  return (
    <div className="app">
      <Navbar />
      <AnimatedRoutes />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
