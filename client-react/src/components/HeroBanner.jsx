import { useState, useEffect, useRef } from 'react';

const BACKDROPS = [
  'https://image.tmdb.org/t/p/original/rAiYTfKGqDCRIIqo664sY9XZIvQ.jpg',
  'https://image.tmdb.org/t/p/original/dqK9Hag1054tghRQSqLSfrkvQnA.jpg',
  'https://image.tmdb.org/t/p/original/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg',
  'https://image.tmdb.org/t/p/original/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg',
  'https://image.tmdb.org/t/p/original/4HodYYKEIsGOdinkGi2Ucz6X9i0.jpg',
  'https://image.tmdb.org/t/p/original/xJHokMbljvjEVAeUCN11ebL43iJ.jpg',
];

export default function HeroBanner() {
  const [slide, setSlide] = useState(0);
  const bannerRef = useRef(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setSlide((prev) => (prev + 1) % BACKDROPS.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const bgStyle = {
    backgroundImage: `linear-gradient(to right, rgba(10,10,15,0.95) 0%, rgba(10,10,15,0.4) 100%), url('${BACKDROPS[slide]}')`,
    backgroundSize: 'cover',
    backgroundPosition: 'top 20% center',
    transition: 'background-image 1.5s ease-in-out',
  };

  return (
    <div className="hero-banner" ref={bannerRef} style={bgStyle}>
      <div className="hero-content">
        <div className="hero-eyebrow">✨ Personalized Discovery</div>
        <h1 className="hero-title">
          Explore the<br /><span>86K+</span> Movie Universe
        </h1>
        <p className="hero-sub">
          Discover blockbuster hits, hidden gems, and critically acclaimed shows tailored just for you.
        </p>
      </div>
      <div className="hero-glow"></div>
    </div>
  );
}

export function LoginBackdrop() {
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSlide((prev) => (prev + 1) % BACKDROPS.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="login-bg-blur"
      style={{
        backgroundImage: `url('${BACKDROPS[slide]}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        transition: 'background-image 1.5s ease-in-out',
      }}
    />
  );
}
