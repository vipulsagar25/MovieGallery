import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Navbar() {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (!isAuthenticated) return null;

  const isActive = (path) => location.pathname === path ? 'nav-link active' : 'nav-link';

  return (
    <nav className="topnav">
      <div className="topnav-logo" onClick={() => navigate(user?.isAdmin ? '/analytics' : '/')}>
        Movie<span>Gallery</span>
      </div>
      <div className="topnav-links">
        {!user?.isAdmin && (
          <>
            <button className={isActive('/')} onClick={() => navigate('/')}>Home</button>
            <button className={isActive('/my-list')} onClick={() => navigate('/my-list')}>My List</button>
            <button className={isActive('/profile')} onClick={() => navigate('/profile')}>Profile</button>
          </>
        )}
        {user?.isAdmin && (
          <button className={isActive('/analytics')} onClick={() => navigate('/analytics')}>Admin Dashboard</button>
        )}
      </div>
      <div className="topnav-user" id="userBadge">
        <div
          className="user-avatar"
          onClick={() => navigate(user?.isAdmin ? '/analytics' : '/profile')}
          style={{ cursor: 'pointer' }}
        >
          {user?.isDemo ? String(user.internalId).slice(-2) : (user?.displayName?.[0]?.toUpperCase() || '✨')}
        </div>
        <span id="userLabel">
          {user?.isDemo ? `User ${user.internalId}` : user?.displayName || 'User'}
        </span>
        <button className="logout-btn" title="Sign Out" onClick={logout}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </nav>
  );
}
