import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRecommendations } from '../hooks/useRecommendations';
import { useToast } from '../components/Toast';
import ComputingState from '../components/ComputingState';
import MovieRow from '../components/MovieRow';

export default function MyListPage() {
  const { user } = useAuth();
  const showToast = useToast();
  const {
    recommendations, history, computing, step, loaded,
    fetchRecs, cancel,
  } = useRecommendations(user?.internalId);

  useEffect(() => {
    if (user?.internalId && !loaded) {
      fetchRecs();
    }
    return cancel;
  }, [user?.internalId, loaded, fetchRecs, cancel]);

  useEffect(() => {
    if (loaded) {
      showToast(
        recommendations.length > 0
          ? '✅ We\'ve tailored these recommendations for you!'
          : '⚡ Top picks prepared instantly!',
        'success'
      );
    }
  }, [loaded, recommendations.length, showToast]);

  return (
    <section id="personalView" className="view">
      {/* Personal Hero */}
      <div className="personal-hero">
        <div className="personal-hero-content">
          <div className="personal-eyebrow">🎯 Top Picks for You</div>
          <h2 className="personal-title">
            Curated for <span>{user?.isDemo ? `User ${user.internalId}` : user?.displayName || '—'}</span>
          </h2>
          <p className="personal-sub">
            Because everyone's taste is unique. Handpicked recommendations ready instantly.
          </p>
        </div>
      </div>

      {/* Computing State */}
      {computing && <ComputingState step={step} />}

      {/* Results */}
      {loaded && (
        <>
          <MovieRow
            movies={recommendations}
            title="Recommended For You"
            badge={`${recommendations.length} movies`}
          />
          <MovieRow
            movies={history}
            title="Because You Watched"
            badge={`${history.length} movies`}
          />
        </>
      )}
    </section>
  );
}
