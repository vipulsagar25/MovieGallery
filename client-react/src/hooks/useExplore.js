import { useState, useCallback, useRef } from 'react';
import { apiFetch } from '../config/api';

export function useExplore() {
  const [movies, setMovies] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [genre, setGenre] = useState('All');
  const controllerRef = useRef(null);
  const seedRef = useRef(Math.floor(Math.random() * 999999));

  const fetchExplore = useCallback(async (p = page, g = genre) => {
    // Cancel any in-flight request
    if (controllerRef.current) controllerRef.current.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: p, limit: 24, genre: g, seed: seedRef.current,
      });
      const data = await apiFetch(`/recommend/explore?${params}`, {
        signal: controller.signal,
      });

      setMovies(data.movies || []);
      setTotalPages(data.pages || 1);
      setPage(data.page || p);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Explore fetch failed:', err);
        setMovies([]);
      }
    } finally {
      setLoading(false);
    }
  }, [page, genre]);

  const changeGenre = useCallback((g) => {
    setGenre(g);
    fetchExplore(1, g);
  }, [fetchExplore]);

  const nextPage = useCallback(() => {
    if (page < totalPages) fetchExplore(page + 1, genre);
  }, [page, totalPages, genre, fetchExplore]);

  const prevPage = useCallback(() => {
    if (page > 1) fetchExplore(page - 1, genre);
  }, [page, genre, fetchExplore]);

  return {
    movies, page, totalPages, loading, genre,
    fetchExplore, changeGenre, nextPage, prevPage,
  };
}
