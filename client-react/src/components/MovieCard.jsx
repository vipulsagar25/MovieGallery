import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../config/api';
import { useToast } from './Toast';

const GRADIENTS = [
  ['#e50914','#b50000'],['#7c3aed','#4c1d95'],['#06b6d4','#0e7490'],
  ['#f59e0b','#b45309'],['#10b981','#065f46'],['#ec4899','#9d174d'],
  ['#6366f1','#3730a3'],['#ef4444','#991b1b'],['#14b8a6','#0f766e'],
  ['#f97316','#c2410c'],
];

function gradientFor(id) {
  const [a, b] = GRADIENTS[id % GRADIENTS.length];
  return `linear-gradient(145deg, ${a}, ${b})`;
}

export default function MovieCard({ movie, showRating = true }) {
  const { user } = useAuth();
  const showToast = useToast();
  const [rated, setRated] = useState(null); // 'up' | 'down' | null
  const [ratingLoading, setRatingLoading] = useState(false);

  const hasImg = !!movie.poster_url;
  const posterStyle = hasImg
    ? { backgroundImage: `url('${movie.poster_url}')`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: gradientFor(movie.movie_id || 0) };

  const imdbId = movie.imdb_id
    ? (movie.imdb_id.startsWith('tt') ? movie.imdb_id : `tt${movie.imdb_id}`)
    : null;

  const handleRate = useCallback(async (rating) => {
    if (!user?.internalId || ratingLoading) return;

    // Toggle off if same rating
    if (rated === rating) {
      setRated(null);
      return;
    }

    setRatingLoading(true);
    try {
      await apiFetch(`/rate/${user.internalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movie_id: movie.movie_id, rating }),
      });
      setRated(rating);
      showToast(
        rating === 'up' ? `👍 Liked "${movie.title?.split(' (')[0]}"` : `👎 Not for you — noted!`,
        'success',
        2000
      );
    } catch (err) {
      console.error('Rating failed:', err);
      showToast('Could not save rating', 'error');
    } finally {
      setRatingLoading(false);
    }
  }, [user?.internalId, movie.movie_id, movie.title, rated, ratingLoading, showToast]);

  return (
    <div className={`movie-card${hasImg ? '' : ' no-img'}`}>
      <div className="poster" style={posterStyle}>
        {!hasImg && <div className="poster-title">{movie.title?.split(' (')[0]}</div>}

        {/* Rating overlay on poster hover */}
        {showRating && user && (
          <div className="rating-overlay">
            <button
              className={`rate-btn rate-up${rated === 'up' ? ' active' : ''}`}
              onClick={(e) => { e.stopPropagation(); handleRate('up'); }}
              title="Like this movie"
              disabled={ratingLoading}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill={rated === 'up' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
              </svg>
            </button>
            <button
              className={`rate-btn rate-down${rated === 'down' ? ' active' : ''}`}
              onClick={(e) => { e.stopPropagation(); handleRate('down'); }}
              title="Not for me"
              disabled={ratingLoading}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill={rated === 'down' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10zM17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
              </svg>
            </button>
          </div>
        )}
      </div>
      <div className="card-body">
        <div className="card-title">{movie.title || 'Unknown'}</div>
        <div className="card-genres">
          {(movie.genres || []).slice(0, 3).map((g) => (
            <span className="genre-tag" key={g}>{g}</span>
          ))}
        </div>
        {imdbId && (
          <a
            href={`https://www.imdb.com/title/${imdbId}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="imdb-btn"
            onClick={(e) => e.stopPropagation()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14.8 0H9.2L9.2 13.1 6.7 0H.8L.8 24H5.4V9.5L8.4 24H13.2L16.2 9.5V24H20.8V0H14.8Z" />
            </svg>
            IMDb
          </a>
        )}
      </div>
    </div>
  );
}
