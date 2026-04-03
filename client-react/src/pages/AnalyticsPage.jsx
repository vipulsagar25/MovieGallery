import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../config/api';

const POLL_INTERVAL = 3000; // 3 seconds
const MAX_HISTORY = 30;     // Keep 30 data points for charts

export default function AnalyticsPage() {
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const intervalRef = useRef(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const data = await apiFetch('/stats/dashboard');
      setCurrent(data);
      setHistory((prev) => {
        const next = [...prev, data].slice(-MAX_HISTORY);
        return next;
      });
    } catch (err) {
      console.warn('Dashboard fetch failed:', err);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    intervalRef.current = setInterval(fetchDashboard, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [fetchDashboard]);

  if (!current) {
    return (
      <section className="view analytics-page">
        <div className="analytics-hero">
          <h1>📊 Real-Time Analytics</h1>
          <p>Connecting to API...</p>
        </div>
      </section>
    );
  }

  const uptime = formatUptime(current.uptime_seconds);
  const cacheHits = current.cache?.hits || 0;
  const cacheMisses = current.cache?.misses || 0;
  const cacheTotal = cacheHits + cacheMisses;
  const hitRate = cacheTotal > 0 ? ((cacheHits / cacheTotal) * 100).toFixed(1) : '0';

  return (
    <section className="view analytics-page">
      {/* Hero */}
      <div className="analytics-hero">
        <div className="analytics-hero-content">
          <div className="analytics-eyebrow">
            <span className={`live-dot${current.redis_ok ? ' pulse' : ''}`}></span>
            LIVE MONITORING
          </div>
          <h1>System Analytics</h1>
          <p>Real-time performance metrics · Refreshing every 3s</p>
        </div>
      </div>

      {/* ── Metric Cards ── */}
      <div className="analytics-grid">
        <MetricCard
          label="Uptime"
          value={uptime}
          icon="⏱️"
          color="var(--teal)"
        />
        <MetricCard
          label="Memory"
          value={`${current.memory_mb} MB`}
          icon="💾"
          color="var(--purple)"
        />
        <MetricCard
          label="Movies Loaded"
          value={(current.data_info?.total_movies || 0).toLocaleString()}
          icon="🎬"
          color="var(--blue, #3b82f6)"
          sub="In blazing fast RAM cache"
        />
        <MetricCard
          label="Total Users"
          value={(current.data_info?.total_users || 0).toLocaleString()}
          icon="👥"
          color="var(--accent)"
          sub={`Includes ${current.data_info?.new_users || 0} newly registered`}
        />
        <MetricCard
          label="Cache Hit Rate"
          value={`${hitRate}%`}
          icon="🎯"
          color="#10b981"
          sub={`${cacheHits} hits / ${cacheMisses} misses`}
        />
        <MetricCard
          label="Queue Depth"
          value={current.queue?.pending || 0}
          icon="📋"
          color="var(--gold)"
          sub={`${current.queue?.processing || 0} processing · ${current.queue?.dlq || 0} DLQ`}
        />
        <MetricCard
          label="Total Ratings"
          value={current.ratings?.total || 0}
          icon="⭐"
          color="var(--accent)"
        />
        <MetricCard
          label="Redis"
          value={current.redis_ok ? 'Connected' : 'Offline'}
          icon={current.redis_ok ? '🟢' : '🔴'}
          color={current.redis_ok ? '#10b981' : 'var(--accent)'}
        />
      </div>

      {/* ── Cache Performance Chart ── */}
      <div className="analytics-section">
        <h2>Cache Performance</h2>
        <div className="chart-container">
          <MiniBarChart
            data={history.map((h) => {
              const hits = h.cache?.hits || 0;
              const misses = h.cache?.misses || 0;
              const total = hits + misses;
              return total > 0 ? (hits / total) * 100 : 0;
            })}
            color="#10b981"
            label="Hit Rate %"
            max={100}
          />
        </div>
      </div>

      {/* ── Memory Usage Chart ── */}
      <div className="analytics-section">
        <h2>Memory Usage</h2>
        <div className="chart-container">
          <MiniBarChart
            data={history.map((h) => h.memory_mb || 0)}
            color="var(--purple)"
            label="MB"
            max={Math.max(...history.map((h) => h.memory_mb || 0), 100)}
          />
        </div>
      </div>

      {/* ── Recent Rating Activity ── */}
      <div className="analytics-section">
        <h2>Recent Rating Activity</h2>
        {(current.ratings?.recent?.length || 0) === 0 ? (
          <div className="empty-activity">
            <p>No ratings recorded yet. Rate some movies to see activity here!</p>
          </div>
        ) : (
          <div className="activity-feed">
            {current.ratings.recent.map((r, i) => (
              <div className="activity-item" key={i}>
                <span className={`activity-icon ${r.rating}`}>
                  {r.rating === 'up' ? '👍' : '👎'}
                </span>
                <span className="activity-text">
                  User <strong>{r.user_id}</strong> rated movie <strong>#{r.movie_id}</strong>
                </span>
                <span className="activity-time">{timeAgo(r.timestamp)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Metric Card Component ──
function MetricCard({ label, value, icon, color, sub }) {
  return (
    <div className="a-metric-card">
      <div className="a-metric-icon" style={{ background: `${color}15`, color }}>{icon}</div>
      <div className="a-metric-info">
        <div className="a-metric-value" style={{ color }}>{value}</div>
        <div className="a-metric-label">{label}</div>
        {sub && <div className="a-metric-sub">{sub}</div>}
      </div>
    </div>
  );
}

// ── Mini Bar Chart (pure SVG) ──
function MiniBarChart({ data, color, label, max }) {
  const width = 600;
  const height = 120;
  const barWidth = Math.max(4, (width / MAX_HISTORY) - 3);

  return (
    <div className="mini-chart">
      <div className="chart-label">{label}</div>
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg">
        {data.map((val, i) => {
          const barHeight = max > 0 ? (val / max) * (height - 10) : 0;
          const x = i * (width / MAX_HISTORY) + 2;
          const y = height - barHeight;
          const isLatest = i === data.length - 1;

          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={2}
                fill={color}
                opacity={isLatest ? 1 : 0.4 + (i / data.length) * 0.5}
              />
              {isLatest && (
                <text
                  x={x + barWidth / 2}
                  y={y - 6}
                  textAnchor="middle"
                  fill={color}
                  fontSize="11"
                  fontWeight="700"
                >
                  {typeof val === 'number' ? val.toFixed(1) : val}
                </text>
              )}
            </g>
          );
        })}
        {/* Baseline */}
        <line x1="0" y1={height} x2={width} y2={height} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      </svg>
    </div>
  );
}

// ── Helpers ──
function formatUptime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function timeAgo(timestamp) {
  const diff = Math.floor(Date.now() / 1000) - timestamp;
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
