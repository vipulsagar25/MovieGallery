import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../config/api';

const HEALTH_INTERVAL = 8000;

export function useHealthCheck() {
  const [status, setStatus] = useState({ online: false, label: 'Connecting...' });
  const intervalRef = useRef(null);

  useEffect(() => {
    const check = async () => {
      try {
        const data = await apiFetch('/health');
        if (data.redis) {
          setStatus({ online: true, label: `Redis OK · ${data.uptime_seconds}s uptime` });
        } else {
          setStatus({ online: false, label: 'Redis degraded' });
        }
      } catch {
        setStatus({ online: false, label: 'API offline' });
      }
    };

    check();
    intervalRef.current = setInterval(check, HEALTH_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, []);

  return status;
}
