const GENRES = [
  'All', 'Action', 'Comedy', 'Drama', 'Sci-Fi',
  'Horror', 'Romance', 'Thriller', 'Animation', 'Documentary',
];

export default function GenreChips({ active, onChange }) {
  return (
    <div className="genre-chips" id="genreChips">
      {GENRES.map((g) => (
        <button
          key={g}
          className={`chip${active === g ? ' active' : ''}`}
          data-genre={g}
          onClick={() => onChange(g)}
        >
          {g}
        </button>
      ))}
    </div>
  );
}
