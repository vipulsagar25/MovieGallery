import { useEffect } from 'react';
import HeroBanner from '../components/HeroBanner';
import GenreChips from '../components/GenreChips';
import MovieGrid from '../components/MovieGrid';
import { SkeletonGrid } from '../components/SkeletonCard';
import { useExplore } from '../hooks/useExplore';

export default function HomePage() {
  const {
    movies, page, totalPages, loading, genre,
    fetchExplore, changeGenre, nextPage, prevPage,
  } = useExplore();

  useEffect(() => {
    fetchExplore(1, 'All');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section id="exploreView" className="view">
      <HeroBanner />

      {/* Filter Bar */}
      <div className="filter-bar">
        <GenreChips active={genre} onChange={changeGenre} />
        <div className="pagination-bar">
          <button className="pg-btn" disabled={page <= 1} onClick={prevPage}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span className="pg-label">Page {page} of {totalPages}</span>
          <button className="pg-btn" disabled={page >= totalPages} onClick={nextPage}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Movie Grid */}
      {loading ? <SkeletonGrid count={24} /> : <MovieGrid movies={movies} />}
    </section>
  );
}
