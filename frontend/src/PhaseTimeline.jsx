import { useCallback, useEffect, useState } from 'react';

// LoopEngineer 阶段时间线 —— 真实数据版。
// 视觉沿用 "Phase Timeline.dc.html" 设计稿；数据全部来自后端真实 API：
//   GET  /api/loop-runs                     运行队列
//   GET  /api/loop-runs/:id/gates           GateRecord（真实门禁结果 + evidence）
//   GET  /api/loop-runs/:id/executions      阶段执行记录（H2）
//   POST /api/loop-runs                     创建（f_id 走 issue-format 准入门禁）
//   POST /api/loop-runs/:id/gates/run       运行门禁（跑真命令）
//   POST /api/loop-runs/:id/transition      推进/打回（gate_required 由后端裁决）
//   POST /api/loop-runs/:id/executions      派发执行（v0 仅 spec 阶段）
// 设计稿里后端没有的数据（tokens/成本/LLM 裁判评分）一律不展示，不造假。

const C = {
  cyan: '#4cb4ea',
  ok: '#63d68e',
  fail: '#f6867f',
  warn: '#f2c078',
  info: '#6fc3ee',
  mut: '#7d93b3',
  violet: '#b58cf0',
};

// 真实阶段状态机（backend/app/state_machine.py 的镜像，仅用于展示）
const PHASES = [
  { key: 'spec', name: '需求澄清', gate: 'spec_check', next: 'design', artifact: { name: '规格文档', file: 'SPEC' } },
  { key: 'design', name: '设计', gate: 'design_check', next: 'code', artifact: { name: '设计文档', file: 'design' } },
  { key: 'code', name: '编码', gate: 'backend_tests', next: 'test', artifact: { name: '代码变更', file: 'diff' } },
  { key: 'test', name: '测试', gate: 'contract_tests', next: 'review', artifact: { name: '契约验证', file: 'pytest' } },
  { key: 'review', name: '评审', gate: 'e2e_tests', next: 'done', artifact: { name: '检视报告', file: 'e2e' } },
];
const GATE_DETAIL = {
  spec_check: 'SPEC 无占位标记（真实文件判据）',
  design_check: '必备设计章节齐全（真实文件判据）',
  backend_tests: '后端全量 pytest 通过（子进程真跑）',
  contract_tests: 'API 契约测试通过（子进程真跑）',
  e2e_tests: '前端关键路径 E2E（过重，由 CLI/verify-all 写回）',
};

function phaseIndex(phase) {
  if (phase === 'done') return PHASES.length;
  return PHASES.findIndex((p) => p.key === phase);
}

// "a:b;c:d" -> React style 对象
function css(str) {
  const out = {};
  if (!str) return out;
  for (const decl of str.split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim();
    const val = decl.slice(idx + 1).trim();
    if (!prop) continue;
    const camel = prop.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    out[camel] = val;
  }
  return out;
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function cstatMeta(s) {
  return (
    {
      passed: { c: C.ok, l: '通过' },
      failed: { c: C.fail, l: '失败' },
      pending: { c: '#5a719a', l: '未运行' },
    }[s] || { c: '#5a719a', l: '未运行' }
  );
}

async function api(path, opts) {
  let res;
  try {
    res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
  } catch (e) {
    throw new Error(`后端 API 不可用：请确认 FastAPI 已启动在 127.0.0.1:8000（${path}）`);
  }
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (!body && [500, 502, 503, 504].includes(res.status)) {
      throw new Error(`后端 API 不可用：请确认 FastAPI 已启动在 127.0.0.1:8000（${path}）`);
    }
    const code = body && body.error ? body.error : `http_${res.status}`;
    const extra = body ? Object.entries(body).filter(([k]) => k !== 'error').map(([k, v]) => `${k}=${v}`).join(' ') : '';
    throw new Error(`${code}${extra ? '：' + extra : ''}`);
  }
  return body;
}

function evidenceLines(text) {
  return String(text || '')
    .split('\n')
    .map((t) => {
      let col = '#8fb3d6';
      if (/✓|passed|PASSED|无占位|齐全|success|present|0 errors|Found 0/.test(t)) col = '#7fd8a0';
      else if (/✕|FAIL|failed|命中|缺少|error|Error/.test(t)) col = '#f6a49d';
      else if (/^\s*[$#]|pytest|check-|exit /.test(t)) col = '#6d86ab';
      return { text: t === '' ? ' ' : t, color: col };
    });
}

export default function PhaseTimeline() {
  const [runs, setRuns] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [gates, setGates] = useState([]);
  const [execs, setExecs] = useState([]);
  const [selPhase, setSelPhase] = useState(null); // 展开的阶段（null=当前阶段）
  const [selGate, setSelGate] = useState(null); // 右侧证据面板选中的 gate_name
  const [alert, setAlert] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newFId, setNewFId] = useState('');

  const loadRuns = useCallback(async (selectId) => {
    const list = await api('/api/loop-runs');
    setRuns(list);
    setActiveId((cur) => {
      const want = selectId || cur;
      if (want && list.some((r) => r.id === want)) return want;
      return list.length ? list[list.length - 1].id : null;
    });
    return list;
  }, []);

  const loadDetail = useCallback(async (id) => {
    if (!id) {
      setGates([]);
      setExecs([]);
      return;
    }
    const [g, e] = await Promise.all([
      api(`/api/loop-runs/${id}/gates`),
      api(`/api/loop-runs/${id}/executions`),
    ]);
    setGates(g);
    setExecs(e);
  }, []);

  useEffect(() => {
    loadRuns().catch((e) => setAlert(String(e.message || e)));
  }, [loadRuns]);

  useEffect(() => {
    setSelPhase(null);
    setSelGate(null);
    loadDetail(activeId).catch((e) => setAlert(String(e.message || e)));
  }, [activeId, loadDetail]);

  const active = runs.find((r) => r.id === activeId) || null;
  const cur = active ? phaseIndex(active.phase) : -1;
  const done = active ? active.phase === 'done' : false;

  // 每个 gate 的记录（时间序），latest 决定检查状态
  const gateRecords = (name) => gates.filter((g) => g.gate_name === name);
  const latestGate = (name) => {
    const rs = gateRecords(name);
    return rs.length ? rs[rs.length - 1] : null;
  };
  const phaseExecs = (key) => execs.filter((e) => e.phase === key);
  const requiredGateProvenance = active
    ? PHASES.slice(0, done ? PHASES.length : Math.max(cur, 0)).map((ph) => ({
        phase: ph.key,
        gate: ph.gate,
        passed: latestGate(ph.gate)?.status === 'passed',
      }))
    : [];
  const missingProvenance = requiredGateProvenance.filter((x) => !x.passed);
  const phaseUnverified = missingProvenance.length > 0;
  const sourceRows = active
    ? [
        ['LoopRun', 'GET /api/loop-runs'],
        ['phase', 'GET /api/loop-runs.phase'],
        ['GateRecord', 'GET /api/loop-runs/:id/gates'],
        ['Execution', 'GET /api/loop-runs/:id/executions'],
      ]
    : [];

  const withBusy = (fn) => async () => {
    if (busy) return;
    setBusy(true);
    setAlert(null);
    try {
      await fn();
    } catch (e) {
      setAlert(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const createRun = withBusy(async () => {
    const payload = { title: newTitle };
    if (newFId.trim()) payload.f_id = newFId.trim();
    const run = await api('/api/loop-runs', { method: 'POST', body: JSON.stringify(payload) });
    setNewTitle('');
    setNewFId('');
    await loadRuns(run.id);
  });

  const runGate = (gateName) =>
    withBusy(async () => {
      await api(`/api/loop-runs/${activeId}/gates/run`, {
        method: 'POST',
        body: JSON.stringify({ gate_name: gateName }),
      });
      setSelGate(gateName);
      await loadDetail(activeId);
    })();

  const advance = (to) =>
    withBusy(async () => {
      await api(`/api/loop-runs/${activeId}/transition`, {
        method: 'POST',
        body: JSON.stringify({ to }),
      });
      setSelPhase(null);
      setSelGate(null);
      await loadRuns(activeId);
      await loadDetail(activeId);
    })();

  const dispatchExec = () =>
    withBusy(async () => {
      await api(`/api/loop-runs/${activeId}/executions`, { method: 'POST' });
      await loadDetail(activeId);
    })();

  // ---- 顶栏统计（真实计数）----
  const doneCount = runs.filter((r) => r.phase === 'done').length;
  const runningCount = runs.length - doneCount;

  // ---- 队列卡片 ----
  const queueCards = runs.map((r) => {
    const idx = phaseIndex(r.phase);
    const isDone = r.phase === 'done';
    const activeCard = r.id === activeId;
    const pct = Math.round((idx / PHASES.length) * 100);
    const sc = isDone ? C.ok : C.info;
    return {
      id: r.id,
      idLabel: r.f_id || r.id.slice(0, 8),
      title: r.title,
      phaseZh: isDone ? '已交付' : PHASES[idx].name,
      statusLabel: `phase=${r.phase}`,
      onClick: () => setActiveId(r.id),
      cardStyle: `width:100%;text-align:left;cursor:pointer;background:${activeCard ? 'rgba(76,180,234,0.1)' : 'rgba(255,255,255,0.03)'};border:1px solid ${activeCard ? 'rgba(76,180,234,0.45)' : 'rgba(255,255,255,0.07)'};border-radius:12px;padding:12px 13px;font-family:'Space Grotesk';`,
      typeStyle: `font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;color:${C.cyan};background:${hexA(C.cyan, 0.14)};padding:2px 6px;border-radius:5px;`,
      statusStyle: `font-size:10px;font-weight:600;color:${sc};`,
      barStyle: `height:100%;width:${pct}%;border-radius:4px;background:${sc};`,
    };
  });

  // ---- 时间线 ----
  const timeline = active
    ? PHASES.map((ph, i) => {
        const pstat = i < cur || done ? 'done' : i === cur ? 'current' : 'todo';
        const latest = latestGate(ph.gate);
        const gateStatus = latest ? latest.status : 'pending';
        const isCur = i === cur && !done;
        const hasFail = isCur && gateStatus === 'failed';
        const col = pstat === 'done' ? C.ok : pstat === 'current' ? (hasFail ? C.fail : C.cyan) : '#34496b';
        const expanded = selPhase != null ? selPhase === i : isCur;
        const records = gateRecords(ph.gate);
        const pexecs = phaseExecs(ph.key);
        const cm = cstatMeta(pstat === 'done' && !latest ? 'passed' : gateStatus);
        const isSel = selGate === ph.gate;
        const passedNow = gateStatus === 'passed';
        const advanceDisabled = !passedNow || busy;
        return {
          key: ph.key,
          name: ph.name,
          gate: ph.gate,
          artifactName: ph.artifact.name,
          artifactFile: ph.artifact.file,
          onToggle: () => setSelPhase(selPhase === i ? -1 : i),
          expanded,
          chevron: expanded ? '▾' : '▸',
          attemptBadge: records.length > 1 ? `迭代 ×${records.length}` : '',
          nodeMark: pstat === 'done' ? '✓' : hasFail ? '✕' : i + 1,
          nodeStyle: `width:30px;height:30px;border-radius:50%;flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;font-family:'JetBrains Mono',monospace;color:${pstat === 'todo' ? '#5a719a' : '#05101f'};background:${pstat === 'todo' ? 'rgba(255,255,255,0.05)' : col};border:1.5px solid ${col};${pstat === 'current' ? `box-shadow:0 0 0 4px ${hexA(col, 0.18)};` : ''}`,
          lineStyle: `width:2px;flex:1;background:${i < cur || done ? C.ok : 'rgba(255,255,255,0.09)'};margin-top:4px;min-height:20px;` + (i === PHASES.length - 1 ? 'display:none;' : ''),
          nameStyle: `font-size:14px;font-weight:600;color:${pstat === 'todo' ? '#7d93b3' : '#e8f0fb'};`,
          ratio: latest ? `门禁 ${cm.l}` : pstat === 'done' ? '已通过' : '门禁未运行',
          ratioStyle: `font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;color:${latest ? cm.c : col};`,
          headStyle: `width:100%;display:flex;align-items:center;gap:10px;cursor:pointer;background:${expanded ? 'rgba(255,255,255,0.03)' : 'transparent'};border:1px solid ${expanded ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)'};border-radius:11px;padding:11px 14px;font-family:'Space Grotesk';text-align:left;`,
          check: {
            name: `${ph.name} · 前进门禁`,
            detail: `${ph.gate} —— ${GATE_DETAIL[ph.gate]}`,
            statusLabel: cm.l,
            statusStyle: `font-size:11px;font-weight:600;color:${cm.c};`,
            dotStyle: `width:9px;height:9px;border-radius:50%;background:${cm.c};`,
            onClick: () => {
              setSelGate(ph.gate);
              setSelPhase(i);
            },
            rowStyle: `width:100%;display:flex;align-items:center;gap:12px;cursor:pointer;background:${isSel ? 'rgba(76,180,234,0.1)' : 'transparent'};border:1px solid ${isSel ? 'rgba(76,180,234,0.35)' : 'transparent'};border-radius:9px;padding:10px 12px;font-family:'Space Grotesk';`,
          },
          execs: pexecs.map((e) => ({
            id: e.id,
            statusLabel: e.status,
            artifact: e.artifact_path || '—',
            detail: e.detail || '',
            color: e.status === 'succeeded' ? C.ok : C.fail,
          })),
          isCur,
          canDispatch: isCur && ph.key === 'spec',
          showRun: isCur,
          runLabel: latest ? '↻ 重跑门禁' : '运行门禁',
          onRun: () => runGate(ph.gate),
          advanceLabel: `推进到 ${ph.next}`,
          onAdvance: () => advance(ph.next),
          advanceHint: hasFail ? '门禁失败，修复后重跑' : passedNow ? '门禁通过，可推进' : '推进需最新 passed 门禁',
          advanceDisabled,
          advanceStyle: `font-family:'Space Grotesk';font-size:12.5px;font-weight:600;border:none;border-radius:8px;padding:8px 14px;cursor:${advanceDisabled ? 'not-allowed' : 'pointer'};color:#05101f;background:${passedNow ? C.cyan : '#34496b'};${passedNow ? '' : 'opacity:0.75;'}`,
        };
      })
    : [];

  // ---- 右侧证据面板 ----
  const detail = (() => {
    if (!active) return { isEmpty: true, phaseName: '—', artifactName: '暂无运行', artifactFile: '' };
    if (!selGate) {
      const pi = done ? PHASES.length - 1 : cur;
      const ph = PHASES[pi];
      return { isEmpty: true, phaseName: ph.name, artifactName: ph.artifact.name, artifactFile: ph.artifact.file };
    }
    const latest = latestGate(selGate);
    if (!latest) {
      const ph = PHASES.find((p) => p.gate === selGate);
      return {
        isPendingGate: true,
        name: selGate,
        detail: GATE_DETAIL[selGate],
        phaseName: ph ? ph.name : selGate,
      };
    }
    const sm = cstatMeta(latest.status);
    return {
      isScript: true,
      name: latest.gate_name,
      detail: GATE_DETAIL[latest.gate_name],
      lines: evidenceLines(latest.evidence),
      createdAt: latest.created_at,
      verdictLabel: sm.l,
      verdictStyle: `font-size:12px;font-weight:600;color:${sm.c};background:${hexA(sm.c, 0.14)};padding:4px 12px;border-radius:14px;`,
      history: gateRecords(selGate),
    };
  })();

  const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
html, body, #root { height: 100%; }
body { margin: 0; }
.le-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
.le-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 8px; }
.le-scroll::-webkit-scrollbar-track { background: transparent; }
@keyframes le-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />
      <div style={css("height:100vh;width:100vw;padding:0;display:flex;align-items:stretch;justify-content:center;font-family:'Space Grotesk', system-ui, sans-serif;background:radial-gradient(1400px 900px at 30% -15%, #0d2f54 0%, #071a34 42%, #05101f 100%);")}>
        <div style={css('width:100%;height:100vh;flex:1 1 auto;display:flex;flex-direction:column;background:linear-gradient(180deg, #0a1a30 0%, #081428 100%);color:#e8f0fb;overflow:hidden;')}>

          {/* top bar */}
          <div style={css('height:56px;flex:0 0 auto;border-bottom:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;padding:0 20px;gap:16px;')}>
            <div style={css('display:flex;align-items:center;gap:10px;')}>
              <div style={css('width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg, #4cb4ea, #1f6fac);display:flex;align-items:center;justify-content:center;')}>
                <div style={css('width:11px;height:11px;border:2.5px solid #05101f;border-radius:50%;border-right-color:transparent;')} />
              </div>
              <span style={css('font-weight:700;font-size:16px;letter-spacing:-0.2px;')}>LoopEngineer</span>
              <span style={css("font-family:'JetBrains Mono', monospace;font-size:12px;color:#63789c;margin-left:2px;")}>/ 阶段时间线</span>
            </div>
            <div style={css('width:1px;height:24px;background:rgba(255,255,255,0.1);')} />
            <div style={css('display:flex;gap:8px;')}>
              <span style={css('font-size:12px;color:#9db4d4;background:rgba(111,195,238,0.12);border:1px solid rgba(111,195,238,0.25);padding:5px 11px;border-radius:20px;')}>● {runningCount} phase≠done</span>
              <span style={css('font-size:12px;color:#63d68e;background:rgba(99,214,142,0.1);border:1px solid rgba(99,214,142,0.25);padding:5px 11px;border-radius:20px;')}>✓ {doneCount} phase=done</span>
            </div>
            <div style={css("margin-left:auto;display:flex;align-items:center;gap:8px;font-family:'JetBrains Mono', monospace;font-size:11px;")}>
              <span style={css('color:#63789c;')}>门禁</span>
              <span style={css('color:#4cb4ea;background:rgba(76,180,234,0.12);padding:3px 9px;border-radius:6px;')}>⌘ 脚本 · 确定性命令 · 不认自报</span>
            </div>
          </div>

          {alert ? (
            <div role="alert" style={css('flex:0 0 auto;margin:10px 20px 0;padding:10px 14px;border-radius:10px;background:rgba(246,134,127,0.12);border:1px solid rgba(246,134,127,0.4);color:#f6a49d;font-size:12.5px;font-family:\'JetBrains Mono\', monospace;display:flex;gap:10px;align-items:center;')}>
              <span>✕</span>
              <span>{alert}</span>
              <button type="button" onClick={() => setAlert(null)} style={css('margin-left:auto;background:transparent;border:none;color:#f6a49d;cursor:pointer;font-size:13px;')}>关闭</button>
            </div>
          ) : null}

          <div style={css('flex:1;display:flex;min-height:0;')}>

            {/* LEFT rail */}
            <div className="le-scroll" style={css('width:280px;flex:0 0 auto;border-right:1px solid rgba(255,255,255,0.07);overflow-y:auto;padding:14px;')}>
              {/* 创建表单（A12/A13 入口） */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createRun();
                }}
                style={css('background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px;margin-bottom:14px;display:flex;flex-direction:column;gap:8px;')}
              >
                <label htmlFor="new-run-title" style={css('font-size:11px;letter-spacing:1px;color:#63789c;font-weight:600;')}>标题</label>
                <input
                  id="new-run-title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="LoopRun 标题"
                  style={css("font-family:'Space Grotesk';font-size:13px;color:#e8f0fb;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:8px 10px;outline:none;")}
                />
                <label htmlFor="new-run-fid" style={css('font-size:11px;letter-spacing:1px;color:#63789c;font-weight:600;')}>F 编号（可选，走准入门禁）</label>
                <input
                  id="new-run-fid"
                  value={newFId}
                  onChange={(e) => setNewFId(e.target.value)}
                  placeholder="如 F001"
                  style={css("font-family:'JetBrains Mono',monospace;font-size:12px;color:#e8f0fb;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:8px 10px;outline:none;")}
                />
                <button
                  type="submit"
                  disabled={busy || !newTitle.trim()}
                  style={css(`font-family:'Space Grotesk';font-size:13px;font-weight:600;color:#05101f;background:${!newTitle.trim() || busy ? '#34496b' : C.cyan};border:none;border-radius:8px;padding:9px 12px;cursor:${!newTitle.trim() || busy ? 'not-allowed' : 'pointer'};`)}
                >
                  创建 LoopRun
                </button>
              </form>

              <div style={css('font-size:11px;letter-spacing:1px;color:#63789c;font-weight:600;padding:4px 6px 10px;')}>运行队列 · {runs.length}</div>
              <div style={css('display:flex;flex-direction:column;gap:8px;')}>
                {queueCards.length === 0 ? (
                  <div style={css('font-size:12px;color:#63789c;padding:10px 6px;line-height:1.6;')}>暂无 LoopRun —— 用上方表单创建第一个。</div>
                ) : null}
                {queueCards.map((r) => (
                  <button key={r.id} type="button" onClick={r.onClick} style={css(r.cardStyle)}>
                    <div style={css('display:flex;align-items:center;gap:8px;margin-bottom:8px;')}>
                      <span style={css(r.typeStyle)}>FEAT</span>
                      <span style={css("font-family:'JetBrains Mono', monospace;font-size:11px;color:#63789c;")}>{r.idLabel}</span>
                      <span style={css('margin-left:auto;' + r.statusStyle)}>{r.statusLabel}</span>
                    </div>
                    <div style={css('font-size:13px;color:#e8f0fb;font-weight:500;line-height:1.35;margin-bottom:10px;text-align:left;')}>{r.title}</div>
                    <div style={css('display:flex;align-items:center;gap:8px;')}>
                      <div style={css('flex:1;height:4px;border-radius:4px;background:rgba(255,255,255,0.08);overflow:hidden;')}>
                        <div style={css(r.barStyle)} />
                      </div>
                      <span style={css("font-size:10px;color:#63789c;font-family:'JetBrains Mono', monospace;")}>{r.phaseZh}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* CENTER: timeline */}
            <section aria-label="LoopRun 详情" style={css('flex:1;min-width:0;display:flex;flex-direction:column;border-right:1px solid rgba(255,255,255,0.07);')}>
              {active ? (
                <>
                  <div style={css('flex:0 0 auto;border-bottom:1px solid rgba(255,255,255,0.07);padding:16px 24px;background:rgba(255,255,255,0.02);')}>
                    <div style={css('display:flex;align-items:center;gap:11px;margin-bottom:12px;flex-wrap:wrap;')}>
                      <span style={css(`font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:${C.cyan};background:${hexA(C.cyan, 0.14)};padding:3px 8px;border-radius:6px;`)}>FEAT</span>
                      <span style={css("font-family:'JetBrains Mono', monospace;font-size:12px;color:#63789c;")}>{active.f_id || active.id.slice(0, 8)}</span>
                      <span style={css('font-size:17px;color:#e8f0fb;font-weight:600;')}>{active.title}</span>
                      <span style={css(`font-size:11px;font-weight:600;color:${done ? C.ok : C.info};background:${hexA(done ? C.ok : C.info, 0.12)};padding:3px 10px;border-radius:14px;`)}>phase={active.phase}</span>
                      {active.source_issue_url ? (
                        <a href={active.source_issue_url} target="_blank" rel="noreferrer" style={css("font-family:'JetBrains Mono', monospace;font-size:11px;color:#4cb4ea;")}>来源 issue ↗</a>
                      ) : null}
                    </div>
                    <div style={css("display:flex;align-items:center;gap:20px;font-family:'JetBrains Mono', monospace;font-size:11px;color:#63789c;flex-wrap:wrap;")}>
                      <span>当前阶段：{active.phase}</span>
                      <span>阶段 <span style={css('color:#9db4d4;')}>{(done ? PHASES.length : cur + 1) + ' / ' + PHASES.length}</span></span>
                      <span>创建 <span style={css('color:#9db4d4;')}>{String(active.created_at).slice(0, 19).replace('T', ' ')}</span></span>
                      <span>更新 <span style={css('color:#9db4d4;')}>{String(active.updated_at).slice(0, 19).replace('T', ' ')}</span></span>
                    </div>
                    <div style={css('display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;')}>
                      {sourceRows.map(([label, source]) => (
                        <span key={label} style={css("font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#8ba3c4;background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.08);border-radius:7px;padding:4px 8px;")}>{label} ← {source}</span>
                      ))}
                    </div>
                    {phaseUnverified ? (
                      <div style={css('margin-top:12px;border:1px solid rgba(242,192,120,0.35);background:rgba(242,192,120,0.1);border-radius:10px;padding:10px 12px;color:#e6d3b3;font-size:12.5px;line-height:1.55;')}>
                        <strong style={css('color:#f2c078;')}>阶段来源未验证</strong>
                        <span>：当前 phase 已前进，但缺少历史 passed GateRecord（{missingProvenance.map((x) => x.gate).join(', ')}）。可能来自旧 seed / fixture 直写；建议清空后用真实门禁和 transition 重建。</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="le-scroll" style={css('flex:1;overflow-y:auto;padding:20px 24px;')}>
                    <div style={css('display:flex;flex-direction:column;')}>
                      {timeline.map((ph) => (
                        <div key={ph.key} style={css('display:flex;gap:16px;')}>
                          <div style={css('display:flex;flex-direction:column;align-items:center;flex:0 0 auto;')}>
                            <div style={css(ph.nodeStyle)}>{ph.nodeMark}</div>
                            <div style={css(ph.lineStyle)} />
                          </div>
                          <div style={css('flex:1;min-width:0;padding-bottom:16px;')}>
                            <button type="button" onClick={ph.onToggle} style={css(ph.headStyle)}>
                              <span style={css(ph.nameStyle)}>{ph.name}</span>
                              {ph.attemptBadge ? (
                                <span style={css("font-family:'JetBrains Mono', monospace;font-size:10px;font-weight:600;color:#f2c078;background:rgba(242,192,120,0.13);border:1px solid rgba(242,192,120,0.3);padding:2px 7px;border-radius:5px;")}>↺ {ph.attemptBadge}</span>
                              ) : null}
                              <span style={css("font-family:'JetBrains Mono', monospace;font-size:11px;color:#63789c;")}>{ph.artifactName} · {ph.artifactFile}</span>
                              <span style={css('margin-left:auto;' + ph.ratioStyle)}>{ph.ratio}</span>
                              <span style={css('font-size:11px;color:#5a719a;')}>{ph.chevron}</span>
                            </button>

                            {ph.expanded ? (
                              <div style={css('margin-top:10px;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:7px;')}>
                                <button type="button" onClick={ph.check.onClick} style={css(ph.check.rowStyle)}>
                                  <span style={css(`flex:0 0 auto;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;color:${C.cyan};background:${hexA(C.cyan, 0.13)};border:1px solid ${hexA(C.cyan, 0.28)};padding:3px 8px;border-radius:6px;white-space:nowrap;`)}>⌘ 脚本</span>
                                  <div style={css('flex:1;min-width:0;text-align:left;')}>
                                    <div style={css('font-size:13px;color:#dce8f6;font-weight:500;')}>{ph.check.name}</div>
                                    <div style={css('font-size:11.5px;color:#8ba3c4;line-height:1.4;margin-top:2px;')}>{ph.check.detail}</div>
                                  </div>
                                  <div style={css('display:flex;align-items:center;gap:6px;flex:0 0 auto;')}>
                                    <div style={css(ph.check.dotStyle)} />
                                    <span style={css(ph.check.statusStyle)}>{ph.check.statusLabel}</span>
                                    <span style={css('font-size:11px;color:#4a5f7f;margin-left:2px;')}>›</span>
                                  </div>
                                </button>

                                {ph.execs.map((e) => (
                                  <div key={e.id} style={css('display:flex;align-items:center;gap:12px;border:1px solid transparent;border-radius:9px;padding:8px 12px;')}>
                                    <span style={css(`flex:0 0 auto;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;color:${C.violet};background:${hexA(C.violet, 0.13)};border:1px solid ${hexA(C.violet, 0.28)};padding:3px 8px;border-radius:6px;`)}>◇ 执行</span>
                                    <div style={css('flex:1;min-width:0;text-align:left;')}>
                                      <div style={css("font-size:12px;color:#dce8f6;font-family:'JetBrains Mono',monospace;")}>{e.artifact}</div>
                                      {e.detail ? <div style={css('font-size:11px;color:#8ba3c4;margin-top:2px;')}>{e.detail}</div> : null}
                                    </div>
                                    <span style={{ ...css('font-size:11px;font-weight:600;'), color: e.color }}>{e.statusLabel}</span>
                                  </div>
                                ))}

                                {ph.isCur ? (
                                  <div style={css('display:flex;align-items:center;gap:10px;padding:9px 8px 5px;flex-wrap:wrap;')}>
                                    <span style={css('font-size:12px;color:#63789c;')}>{ph.advanceHint}</span>
                                    <div style={css('margin-left:auto;display:flex;gap:9px;flex-wrap:wrap;')}>
                                      {ph.canDispatch ? (
                                        <button type="button" disabled={busy} onClick={dispatchExec} style={css("font-family:'Space Grotesk';font-size:12.5px;font-weight:500;color:#b58cf0;background:rgba(181,140,240,0.1);border:1px solid rgba(181,140,240,0.35);border-radius:8px;padding:8px 14px;cursor:pointer;")}>◇ 派发执行</button>
                                      ) : null}
                                      <button type="button" disabled={busy} onClick={ph.onRun} style={css("font-family:'Space Grotesk';font-size:12.5px;font-weight:500;color:#4cb4ea;background:rgba(76,180,234,0.1);border:1px solid rgba(76,180,234,0.35);border-radius:8px;padding:8px 14px;cursor:pointer;")}>{ph.runLabel}</button>
                                      <button type="button" disabled={ph.advanceDisabled} onClick={ph.onAdvance} style={css(ph.advanceStyle)}>{ph.advanceLabel}</button>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div style={css('flex:1;display:flex;align-items:center;justify-content:center;color:#63789c;font-size:13px;')}>
                  暂无 LoopRun —— 在左侧创建一个开始。
                </div>
              )}
            </section>

            {/* RIGHT: evidence */}
            <div className="le-scroll" style={css('width:440px;flex:0 0 auto;overflow-y:auto;background:rgba(0,0,0,0.15);')}>
              {detail.isScript ? (
                <div style={css('padding:20px;')}>
                  <div style={css('font-size:11px;letter-spacing:1px;color:#63789c;font-weight:600;margin-bottom:14px;')}>门禁证据 · GateRecord</div>
                  <div style={css('display:flex;align-items:center;gap:9px;margin-bottom:6px;')}>
                    <span style={css("font-family:'JetBrains Mono', monospace;font-size:11px;font-weight:600;color:#4cb4ea;background:rgba(76,180,234,0.13);border:1px solid rgba(76,180,234,0.3);padding:3px 9px;border-radius:6px;")}>⌘ 脚本</span>
                    <span style={css("font-size:15px;font-weight:600;color:#e8f0fb;font-family:'JetBrains Mono',monospace;")}>{detail.name}</span>
                  </div>
                  <div style={css('font-size:12.5px;color:#8ba3c4;line-height:1.5;margin-bottom:16px;')}>{detail.detail}</div>

                  <div style={css('display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;')}>
                    <span style={css(detail.verdictStyle)}>{detail.verdictLabel}</span>
                    <span style={css("font-family:'JetBrains Mono', monospace;font-size:11px;color:#9db4d4;background:rgba(255,255,255,0.05);padding:4px 10px;border-radius:6px;")}>{String(detail.createdAt).slice(0, 19).replace('T', ' ')}</span>
                  </div>

                  <div style={css('background:#050e1c;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;overflow-x:auto;')}>
                    {detail.lines.map((ln, li) => (
                      <div key={li} style={{ ...css("font-family:'JetBrains Mono', monospace;font-size:11.5px;line-height:1.7;white-space:pre-wrap;"), color: ln.color }}>{ln.text}</div>
                    ))}
                  </div>

                  {detail.history.length > 1 ? (
                    <>
                      <div style={css('font-size:11px;letter-spacing:0.5px;color:#63789c;font-weight:600;margin:16px 0 8px;')}>历史记录 · {detail.history.length} 次</div>
                      <div style={css('display:flex;flex-direction:column;gap:6px;')}>
                        {[...detail.history].reverse().map((h) => (
                          <div key={h.id} style={css('display:flex;align-items:center;gap:9px;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);border-radius:9px;padding:8px 12px;')}>
                            <span style={{ ...css('font-size:11px;font-weight:600;'), color: h.status === 'passed' ? C.ok : C.fail }}>{h.status}</span>
                            <span style={css("font-family:'JetBrains Mono', monospace;font-size:11px;color:#63789c;")}>{String(h.created_at).slice(0, 19).replace('T', ' ')}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}

                  <div style={css('margin-top:16px;display:flex;align-items:center;gap:8px;font-size:11px;color:#63789c;')}>
                    <span style={css('width:6px;height:6px;border-radius:50%;background:#4cb4ea;')} />
                    确定性命令产出 · 写入 GateRecord，阶段前进只认此信号
                  </div>
                </div>
              ) : null}

              {detail.isPendingGate ? (
                <div style={css('padding:20px;')}>
                  <div style={css('font-size:11px;letter-spacing:1px;color:#63789c;font-weight:600;margin-bottom:14px;')}>门禁证据 · GateRecord</div>
                  <div style={css('display:flex;align-items:center;gap:9px;margin-bottom:6px;')}>
                    <span style={css("font-family:'JetBrains Mono', monospace;font-size:11px;font-weight:600;color:#4cb4ea;background:rgba(76,180,234,0.13);border:1px solid rgba(76,180,234,0.3);padding:3px 9px;border-radius:6px;")}>⌘ 脚本</span>
                    <span style={css("font-size:15px;font-weight:600;color:#e8f0fb;font-family:'JetBrains Mono',monospace;")}>{detail.name}</span>
                  </div>
                  <div style={css('font-size:12.5px;color:#8ba3c4;line-height:1.5;margin-bottom:16px;')}>{detail.detail}</div>
                  <div style={css('font-size:12.5px;color:#8ba3c4;line-height:1.6;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px;')}>该门禁尚无 GateRecord —— 在 {detail.phaseName} 阶段点击「运行门禁」跑真命令后，这里展示真实输出与结果。</div>
                </div>
              ) : null}

              {detail.isEmpty ? (
                <div style={css('padding:20px;')}>
                  <div style={css('font-size:11px;letter-spacing:1px;color:#63789c;font-weight:600;margin-bottom:14px;')}>交付件概览</div>
                  <div style={css('display:flex;align-items:center;gap:12px;margin-bottom:14px;')}>
                    <div style={css('width:40px;height:40px;border-radius:10px;background:rgba(76,180,234,0.12);display:flex;align-items:center;justify-content:center;font-size:17px;color:#4cb4ea;')}>◈</div>
                    <div>
                      <div style={css('font-size:15px;font-weight:600;color:#e8f0fb;')}>{detail.phaseName}</div>
                      <div style={css("font-family:'JetBrains Mono', monospace;font-size:11px;color:#63789c;margin-top:2px;")}>{detail.artifactName}{detail.artifactFile ? ' · ' + detail.artifactFile : ''}</div>
                    </div>
                  </div>
                  <div style={css('font-size:12.5px;color:#8ba3c4;line-height:1.6;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px;')}>点击任一阶段的门禁检查项，查看其真实 GateRecord 证据 —— 命令输出、结果与历史记录。</div>
                  {active ? (
                    <>
                      <div style={css('font-size:11px;letter-spacing:1px;color:#63789c;font-weight:600;margin:16px 0 10px;')}>数据来源</div>
                      <div style={css('display:flex;flex-direction:column;gap:7px;')}>
                        {sourceRows.map(([label, source]) => (
                          <div key={label} style={css("font-family:'JetBrains Mono',monospace;font-size:11px;color:#9db4d4;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:8px 10px;")}>{label} ← {source}</div>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
