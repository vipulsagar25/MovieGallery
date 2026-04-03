export default function ComputingState({ step = 0 }) {
  const steps = [
    { emoji: '🔍', text: 'Analyzing taste profile' },
    { emoji: '✨', text: 'Finding matches' },
    { emoji: '🎬', text: 'Preparing recommendations' },
    { emoji: '🍿', text: 'Ready for you!' },
  ];

  return (
    <div className="computing-state">
      <div className="computing-inner">
        <div className="neural-loader">
          <div className="nl-ring"></div>
          <div className="nl-ring nl-ring--2"></div>
          <div className="nl-ring nl-ring--3"></div>
          <div className="nl-core">🧠</div>
        </div>
        <h3>Curating Your Lineup</h3>
        <p>Analyzing your unique taste profile to find your perfect matches...</p>
        <div className="computing-steps">
          {steps.map((s, i) => {
            let cls = 'step';
            if (i < step) cls += ' done';
            else if (i === step) cls += ' active';
            return (
              <div className={cls} key={i}>
                {s.emoji} {s.text}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
