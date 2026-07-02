import { useEffect, useMemo, useState } from 'react';
import './styles.css';

const phaseOrder = ['spec', 'design', 'code', 'test', 'review', 'done'];

const forwardTargets = {
  spec: { to: 'design', gate: 'spec_check' },
  design: { to: 'code', gate: 'design_check' },
  code: { to: 'test', gate: 'backend_tests' },
  test: { to: 'review', gate: 'contract_tests' },
  review: { to: 'done', gate: 'e2e_tests' },
};

const rollbackTargets = {
  design: ['spec'],
  code: ['design'],
  test: ['code'],
  review: ['code', 'test'],
};

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.error || `HTTP ${response.status}`);
    error.body = data;
    throw error;
  }
  return data;
}

function CuteStarfish() {
  return (
    <svg className="cute-starfish-icon" viewBox="0 0 100 100" style={{ width: '42px', height: '42px' }}>
      <path d="M50 5 L63 36 L96 36 L70 56 L80 88 L50 68 L20 88 L30 56 L4 36 L37 36 Z" fill="#ff9f7d" stroke="#e06a4b" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="42" cy="48" r="4" fill="#ff6b6b" opacity="0.6" />
      <circle cx="58" cy="48" r="4" fill="#ff6b6b" opacity="0.6" />
      <circle cx="45" cy="44" r="3" fill="#1a2f4c" />
      <circle cx="55" cy="44" r="3" fill="#1a2f4c" />
      <circle cx="44" cy="43" r="1" fill="#ffffff" />
      <circle cx="54" cy="43" r="1" fill="#ffffff" />
      <path d="M47 52 Q50 55 53 52" fill="none" stroke="#1a2f4c" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CuteShell() {
  return (
    <svg viewBox="0 0 100 100" style={{ width: '24px', height: '24px', verticalAlign: 'middle', marginRight: '6px' }}>
      <path d="M50 15 C25 15 15 35 15 65 C15 78 30 85 50 85 C70 85 85 78 85 65 C85 35 75 15 50 15 Z" fill="#bae6fd" stroke="#0284c7" strokeWidth="3" strokeLinejoin="round" />
      <path d="M50 15 L50 85 M50 15 C40 30 35 50 35 85 M50 15 C60 30 65 50 65 85" fill="none" stroke="#0284c7" strokeWidth="2" />
    </svg>
  );
}

function CuteJellyfish({ message }) {
  return (
    <div className="empty-state">
      <svg viewBox="0 0 100 100" style={{ width: '70px', height: '70px', animation: 'float 4s infinite ease-in-out' }}>
        <path d="M20 50 C20 20 80 20 80 50 C80 55 70 58 50 58 C30 58 20 55 20 50 Z" fill="#fed7aa" stroke="#ea580c" strokeWidth="3" />
        <path d="M30 58 Q25 70 30 85 M40 58 Q42 72 38 85 M50 58 Q50 70 52 85 M60 58 Q58 72 62 85 M70 58 Q75 70 70 85" fill="none" stroke="#ea580c" strokeWidth="3" strokeLinecap="round" />
        <circle cx="40" cy="46" r="3" fill="#ff6b6b" opacity="0.6" />
        <circle cx="60" cy="46" r="3" fill="#ff6b6b" opacity="0.6" />
        <circle cx="43" cy="42" r="2.5" fill="#1a2f4c" />
        <circle cx="57" cy="42" r="2.5" fill="#1a2f4c" />
        <circle cx="42" cy="41" r="0.8" fill="#ffffff" />
        <circle cx="56" cy="41" r="0.8" fill="#ffffff" />
        <path d="M48 48 Q50 50 52 48" fill="none" stroke="#1a2f4c" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <p style={{ marginTop: '12px' }}>{message}</p>
    </div>
  );
}

function App() {
  const [runs, setRuns] = useState([]);
  const [activeRun, setActiveRun] = useState(null);
  const [gates, setGates] = useState([]);
  const [title, setTitle] = useState('');
  const [rollbackReason, setRollbackReason] = useState('需要返工');
  const [error, setError] = useState('');

  async function refreshRuns(nextActiveId) {
    const nextRuns = await request('/api/loop-runs');
    setRuns(nextRuns);
    const selected = nextRuns.find((run) => run.id === nextActiveId) || nextRuns.at(-1) || null;
    setActiveRun(selected);
    if (selected) {
      setGates(await request(`/api/loop-runs/${selected.id}/gates`));
    } else {
      setGates([]);
    }
  }

  useEffect(() => {
    refreshRuns().catch((caught) => setError(caught.message));
  }, []);

  const legalTargets = useMemo(() => {
    if (!activeRun) {
      return [];
    }
    const targets = [];
    const forward = forwardTargets[activeRun.phase];
    if (forward) {
      targets.push({ kind: 'forward', to: forward.to });
    }
    for (const to of rollbackTargets[activeRun.phase] || []) {
      targets.push({ kind: 'rollback', to });
    }
    return targets;
  }, [activeRun]);

  async function createLoopRun(event) {
    event.preventDefault();
    setError('');
    try {
      const run = await request('/api/loop-runs', {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      setTitle('');
      await refreshRuns(run.id);
    } catch (caught) {
      setError(caught.body?.error || caught.message);
    }
  }

  async function runGate() {
    if (!activeRun) {
      return;
    }
    setError('');
    const gate = forwardTargets[activeRun.phase]?.gate;
    if (!gate) {
      setError('当前阶段没有前进门禁');
      return;
    }
    try {
      await request(`/api/loop-runs/${activeRun.id}/gates/run`, {
        method: 'POST',
        body: JSON.stringify({ gate_name: gate }),
      });
      setGates(await request(`/api/loop-runs/${activeRun.id}/gates`));
    } catch (caught) {
      if (caught.body?.error === 'gate_not_runnable') {
        setError(`门禁 ${gate} 过重，请用 CLI（verify-all / test-e2e）运行后再推进`);
      } else {
        setError(caught.body?.error || caught.message);
      }
    }
  }

  async function transition(target) {
    if (!activeRun) {
      return;
    }
    setError('');
    try {
      const body = { to: target.to };
      if (target.kind === 'rollback') {
        body.reason = rollbackReason;
      }
      const run = await request(`/api/loop-runs/${activeRun.id}/transition`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      await refreshRuns(run.id);
    } catch (caught) {
      setError(caught.body?.error || caught.message);
    }
  }

  return (
    <>
      <div className="ocean-background" aria-hidden="true">
        <div className="bubble bubble-1"></div>
        <div className="bubble bubble-2"></div>
        <div className="bubble bubble-3"></div>
        <div className="bubble bubble-4"></div>
        <div className="bubble bubble-5"></div>
        <div className="bubble bubble-6"></div>
      </div>

      <main className="shell">
        <header>
          <div className="header-logo">
            <CuteStarfish />
            <h1>LoopForge</h1>
          </div>
          <p>迭代 0：LoopRun 阶段状态机与脚本门禁。</p>
        </header>

        <section className="panel" aria-labelledby="create-heading">
          <h2 id="create-heading">
            <CuteShell /> 新建 LoopRun
          </h2>
          <form onSubmit={createLoopRun} className="create-form">
            <label>
              标题
              <input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} />
            </label>
            <button type="submit">创建 LoopRun</button>
          </form>
        </section>

        {error ? <div role="alert">{error}</div> : null}

        <div className="workspace">
          <section className="panel" aria-labelledby="list-heading">
            <h2 id="list-heading">
              <CuteShell /> LoopRun 列表
            </h2>
            {runs.length === 0 ? (
              <CuteJellyfish message="暂无 LoopRun。" />
            ) : (
              <ul className="run-list">
                {runs.map((run) => (
                  <li key={run.id}>
                    <button type="button" onClick={() => refreshRuns(run.id)}>
                      <span>{run.title}</span>
                      <strong>{run.phase}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel detail" role="region" aria-label="LoopRun 详情">
            {activeRun ? (
              <>
                <div>
                  <h2>{activeRun.title}</h2>
                  <p style={{ color: '#0284c7', fontWeight: 600 }}>当前阶段：{activeRun.phase}</p>
                </div>

                <div className="phase-track" aria-label="阶段列表">
                  {phaseOrder.map((phase) => (
                    <span key={phase} className={phase === activeRun.phase ? 'active' : ''}>
                      {phase}
                    </span>
                  ))}
                </div>

                <div className="actions">
                  {forwardTargets[activeRun.phase] ? (
                    <button type="button" onClick={runGate}>
                      运行门禁
                    </button>
                  ) : null}
                  {legalTargets.map((target) => (
                    <button
                      key={`${target.kind}-${target.to}`}
                      type="button"
                      className={target.kind === 'forward' ? 'btn-forward' : 'btn-rollback'}
                      onClick={() => transition(target)}
                    >
                      {target.kind === 'forward' ? '推进到' : '打回到'} {target.to}
                    </button>
                  ))}
                </div>

                {legalTargets.some((target) => target.kind === 'rollback') ? (
                  <label className="reason">
                    打回原因
                    <input value={rollbackReason} onChange={(event) => setRollbackReason(event.target.value)} />
                  </label>
                ) : null}

                <section aria-labelledby="gates-heading">
                  <h3 id="gates-heading" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1a2f4c' }}>
                    <CuteShell /> 门禁记录
                  </h3>
                  {gates.length === 0 ? (
                    <p style={{ color: '#64748b', fontSize: '0.95rem' }}>暂无门禁记录。</p>
                  ) : (
                    <ul className="gate-list">
                      {gates.map((gate) => (
                        <li key={gate.id}>
                          <span>{gate.gate_name}</span>
                          <strong className={gate.status === 'passed' ? 'gate-passed' : gate.status === 'failed' ? 'gate-failed' : ''}>
                            {gate.status}
                          </strong>
                          <small>{gate.evidence}</small>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            ) : (
              <CuteJellyfish message="创建或选择一个 LoopRun。" />
            )}
          </section>
        </div>
      </main>
    </>
  );
}

export default App;
