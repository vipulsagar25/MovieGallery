export default function SkeletonCard() {
  return (
    <div className="movie-card skeleton">
      <div className="poster-skel"></div>
      <div className="card-body" style={{ gap: 8, padding: 14 }}>
        <div className="skel-line"></div>
        <div className="skel-line short"></div>
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 24 }) {
  return (
    <div className="movie-grid">
      {Array.from({ length: count }, (_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}
