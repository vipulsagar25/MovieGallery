import { useHealthCheck } from '../hooks/useHealthCheck';
import { API_BASE } from '../config/api';

export default function StatsWidget() {
  const { online, label } = useHealthCheck();

  return (
    <div
      className="stats-widget"
      onClick={() => window.open(`${API_BASE}/docs`, '_blank')}
    >
      <div className={`stats-dot${online ? ' ok' : ''}`}></div>
      <span>{label}</span>
    </div>
  );
}
