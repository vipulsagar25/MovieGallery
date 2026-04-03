import MovieCard from './MovieCard';

export default function MovieGrid({ movies }) {
  if (!movies || movies.length === 0) {
    return <div className="movie-grid"><p style={{ color: 'var(--text-2)', padding: 8 }}>No movies found.</p></div>;
  }
  return (
    <div className="movie-grid">
      {movies.map((m) => <MovieCard key={m.movie_id} movie={m} />)}
    </div>
  );
}
