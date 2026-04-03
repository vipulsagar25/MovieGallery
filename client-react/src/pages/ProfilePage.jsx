import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../config/api';
import MovieRow from '../components/MovieRow';
import ComputingState from '../components/ComputingState';

const POLL_INTERVAL = 1200;

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const [popular, setPopular] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [history, setHistory] = useState([]);
  const [computing, setComputing] = useState(false);
  const [step, setStep] = useState(0);
  const [dataLoaded, setDataLoaded] = useState(false);
  const pollTimerRef = useRef(null);

  // ── Fetch + poll recommendations (same pattern as MyListPage) ──
  useEffect(() => {
    if (!user?.internalId) return;
    let cancelled = false;

    const poll = async (attempt = 0) => {
      if (cancelled) return;

      // Advance step animation
      if (attempt > 0 && attempt <= 3) setStep(attempt);

      try {
        const data = await apiFetch(`/recommend/${user.internalId}`);

        if (data.cached === false) {
          // Still computing — poll again
          if (!cancelled) {
            setComputing(true);
            pollTimerRef.current = setTimeout(() => poll(attempt + 1), POLL_INTERVAL);
          }
          return;
        }

        // Got data — could be empty for truly new users
        if (!cancelled) {
          setStep(4);
          setTimeout(() => {
            setRecommendations(data.recommendations || []);
            setHistory(data.history || []);
            setComputing(false);
            setDataLoaded(true);
          }, computing ? 600 : 0); // Only delay if we showed the computing animation
        }
      } catch (err) {
        console.warn('Could not load profile recs:', err);
        if (!cancelled) {
          setComputing(false);
          setDataLoaded(true);
        }
      }
    };

    setComputing(false);
    setDataLoaded(false);
    poll(0);

    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [user?.internalId]);

  // ── Fetch popular movies (always, for cold-start fallback) ──
  useEffect(() => {
    let cancelled = false;
    apiFetch('/recommend/popular?limit=10')
      .then((data) => { if (!cancelled) setPopular(data.movies || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // ── Determine if user truly has no data ──
  const hasHistory = history.length > 0;
  const hasRecs = recommendations.length > 0;
  const isEmptyProfile = dataLoaded && !hasHistory && !hasRecs;

  // Compute stats only from real data
  const topGenres = hasHistory ? getTopGenres(history) : [];

  return (
    <section className="view profile-page">
      {/* Profile Hero */}
      <div className="profile-hero">
        <div className="profile-hero-inner">
          <div className="profile-avatar-lg">
            {user?.isDemo
              ? String(user.internalId).slice(-2)
              : (user?.displayName?.[0]?.toUpperCase() || '?')}
          </div>
          <div className="profile-info">
            <h1 className="profile-name">
              {user?.isDemo ? `Demo User #${user.internalId}` : user?.displayName || 'User'}
            </h1>
            {user?.email && <p className="profile-email">{user.email}</p>}
            <div className="profile-badges">
              {user?.isDemo && <span className="profile-badge demo">Demo Mode</span>}
              {!user?.isDemo && <span className="profile-badge auth">Authenticated</span>}
              {isEmptyProfile && <span className="profile-badge new">New User</span>}
            </div>
          </div>
          <button className="profile-logout-btn" onClick={logout}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign Out
          </button>
        </div>
      </div>

      {/* ── Computing animation (shown while polling) ── */}
      {computing && <ComputingState step={step} />}

      {/* ── Empty profile (no watch history, no recs — truly new user) ── */}
      {isEmptyProfile && (
        <div className="cold-start-section">
          <div className="cold-start-card">
            <div className="cold-start-icon">🚀</div>
            <h2>Welcome to MovieAI!</h2>
            <p>
              We don't have any watch history for you yet. As you explore and interact
              with movies, our AI engine will learn your taste and deliver
              personalized recommendations.
            </p>
            <div className="cold-start-steps">
              <div className="cs-step">
                <div className="cs-step-num">1</div>
                <div>
                  <strong>Explore</strong>
                  <p>Browse the 86K+ movie universe on the Home page</p>
                </div>
              </div>
              <div className="cs-step">
                <div className="cs-step-num">2</div>
                <div>
                  <strong>Discover</strong>
                  <p>Visit My List to see what our engine recommends for you</p>
                </div>
              </div>
              <div className="cs-step">
                <div className="cs-step-num">3</div>
                <div>
                  <strong>Personalize</strong>
                  <p>The more you interact, the smarter our recommendations become</p>
                </div>
              </div>
            </div>
          </div>

          {/* Show trending movies so the page isn't empty */}
          <MovieRow movies={popular} title="🔥 Trending Now" badge={`${popular.length} movies`} />
        </div>
      )}

      {/* ── User has actual data ── */}
      {dataLoaded && (hasHistory || hasRecs) && (
        <div className="profile-stats-section">
          {/* Stats cards */}
          <div className="stats-cards">
            <div className="stat-card">
              <div className="stat-value">{history.length}</div>
              <div className="stat-label">Movies Watched</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{recommendations.length}</div>
              <div className="stat-label">Recommendations</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{topGenres.length}</div>
              <div className="stat-label">Genres Explored</div>
            </div>
          </div>

          {/* Genre breakdown */}
          {topGenres.length > 0 && (
            <div className="top-genres">
              <h3>Your Top Genres</h3>
              <div className="genre-bars">
                {topGenres.slice(0, 5).map(({ genre, count, pct }) => (
                  <div className="genre-bar-item" key={genre}>
                    <span className="genre-bar-label">{genre}</span>
                    <div className="genre-bar-track">
                      <div className="genre-bar-fill" style={{ width: `${pct}%` }}></div>
                    </div>
                    <span className="genre-bar-count">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actual data rows */}
          {hasRecs && (
            <MovieRow
              movies={recommendations}
              title="Your Recommendations"
              badge={`${recommendations.length} movies`}
            />
          )}
          {hasHistory && (
            <MovieRow
              movies={history}
              title="Your Watch History"
              badge={`${history.length} movies`}
            />
          )}
        </div>
      )}
    </section>
  );
}

// ── Helper: extract top genres from movie list ──
function getTopGenres(movies) {
  const counts = {};
  movies.forEach((m) => {
    (m.genres || []).forEach((g) => {
      if (g && g !== '(no genres listed)') {
        counts[g] = (counts[g] || 0) + 1;
      }
    });
  });
  const sorted = Object.entries(counts)
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count);

  const max = sorted[0]?.count || 1;
  return sorted.map((s) => ({ ...s, pct: Math.round((s.count / max) * 100) }));
}
