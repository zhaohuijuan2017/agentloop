import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import PhaseTimeline from './PhaseTimeline.jsx';

const VIEWS = [
  { key: 'loopforge', label: 'LoopForge' },
  { key: 'timeline', label: '阶段时间线' },
];

function Root() {
  const [view, setView] = useState('loopforge');
  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          zIndex: 1000,
          display: 'flex',
          gap: 4,
          padding: 4,
          borderRadius: 999,
          background: 'rgba(8,20,40,0.85)',
          border: '1px solid rgba(255,255,255,0.12)',
          backdropFilter: 'blur(6px)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setView(v.key)}
            style={{
              border: 'none',
              cursor: 'pointer',
              borderRadius: 999,
              padding: '6px 14px',
              fontSize: 12.5,
              fontWeight: 600,
              color: view === v.key ? '#05101f' : '#9db4d4',
              background: view === v.key ? '#4cb4ea' : 'transparent',
            }}
          >
            {v.label}
          </button>
        ))}
      </div>
      {view === 'loopforge' ? <App /> : <PhaseTimeline />}
    </>
  );
}

createRoot(document.getElementById('root')).render(<Root />);
