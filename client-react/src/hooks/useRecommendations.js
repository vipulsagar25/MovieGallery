import { useState, useCallback, useRef } from 'react';
import { apiFetch } from '../config/api';

const POLL_INTERVAL = 1200;

export function useRecommendations(userId) {
  const [recommendations, setRecommendations] = useState([]);
  const [history, setHistory] = useState([]);
  const [computing, setComputing] = useState(false);
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const timerRef = useRef(null);

  const fetchRecs = useCallback(async () => {
    if (!userId) return;

    setComputing(true);
    setStep(0);
    setLoaded(false);

    const poll = async (attempt = 0) => {
      // Advance step animation
      if (attempt > 0 && attempt <= 3) setStep(attempt);

      try {
        const data = await apiFetch(`/recommend/${userId}`);

        if (data.cached === false) {
          // Still computing — poll again
          timerRef.current = setTimeout(() => poll(attempt + 1), POLL_INTERVAL);
          return;
        }

        // Success
        setStep(4);
        setTimeout(() => {
          setRecommendations(data.recommendations || []);
          setHistory(data.history || []);
          setComputing(false);
          setLoaded(true);
        }, 600);
      } catch (err) {
        console.error('Recommendation fetch failed:', err);
        setComputing(false);
      }
    };

    poll(0);
  }, [userId]);

  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return {
    recommendations, history, computing, step, loaded,
    fetchRecs, cancel,
  };
}
