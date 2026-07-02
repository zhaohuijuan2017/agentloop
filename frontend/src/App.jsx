import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
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
      // 运行真门禁：后端跑真命令并按真实结果写 GateRecord（不再手点 passed）。
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
    <main className="shell">
      <header>
        <h1>LoopForge</h1>
        <p>迭代 0：LoopRun 阶段状态机与脚本门禁。</p>
      </header>

      <section className="panel" aria-labelledby="create-heading">
        <h2 id="create-heading">新建 LoopRun</h2>
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
          <h2 id="list-heading">LoopRun 列表</h2>
          {runs.length === 0 ? (
            <p>暂无 LoopRun。</p>
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

        <section className="panel detail" aria-label="LoopRun 详情">
          {activeRun ? (
            <>
              <div>
                <h2>{activeRun.title}</h2>
                <p>当前阶段：{activeRun.phase}</p>
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
                  <button key={`${target.kind}-${target.to}`} type="button" onClick={() => transition(target)}>
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
                <h3 id="gates-heading">门禁记录</h3>
                {gates.length === 0 ? (
                  <p>暂无门禁记录。</p>
                ) : (
                  <ul className="gate-list">
                    {gates.map((gate) => (
                      <li key={gate.id}>
                        <span>{gate.gate_name}</span>
                        <strong>{gate.status}</strong>
                        <small>{gate.evidence}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : (
            <p>创建或选择一个 LoopRun。</p>
          )}
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
