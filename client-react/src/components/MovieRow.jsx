import MovieCard from './MovieCard';

export default function MovieRow({ movies, title, badge }) {
  if (!movies || movies.length === 0) return null;
  return (
    <div>
      <div className="section-header">
        <h3 className="section-title">{title}</h3>
        <span className="section-badge">{badge || `${movies.length} movies`}</span>
      </div>
      <div className="movie-row">
        {movies.map((m) => <MovieCard key={m.movie_id} movie={m} />)}
      </div>
    </div>
  );
}
