import { useState } from 'react';

// Faithful React port of the design "Phase Timeline.dc.html" (LoopEngineer).
// The source is a self-contained interactive prototype authored in a custom
// .dc.html DSL (DCLogic / sc-for / sc-if) with inline string styles. This port
// preserves its state machine, seed data, and visuals 1:1. Style strings from
// the original view-models are converted to React style objects via css().

const C = {
  cyan: '#4cb4ea',
  ok: '#63d68e',
  fail: '#f6867f',
  warn: '#f2c078',
  info: '#6fc3ee',
  mut: '#7d93b3',
  violet: '#b58cf0',
};

// Convert a CSS declaration string ("a:b;c:d") into a React style object.
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

function typeMeta(t) {
  return t === 'bug' ? { l: 'BUG', c: C.fail } : { l: 'FEAT', c: C.cyan };
}
function kindMeta(k) {
  return {
    script: { l: '脚本', c: C.cyan, icon: '⌘' },
    judge: { l: 'LLM 裁判', c: C.violet, icon: '◇' },
    human: { l: '人工', c: C.warn, icon: '◆' },
  }[k];
}
function cstatMeta(s) {
  return (
    {
      pass: { c: C.ok, l: '通过' },
      fail: { c: C.fail, l: '失败' },
      running: { c: C.info, l: '运行中' },
      pending: { c: '#5a719a', l: '待执行' },
    }[s] || { c: '#5a719a', l: '待执行' }
  );
}
function statusMeta(st) {
  return (
    {
      running: [C.info, '运行中'],
      'awaiting-human': [C.warn, '待人工'],
      'needs-fix': [C.fail, '待修复'],
      done: [C.ok, '已交付'],
    }[st] || [C.info, '运行中']
  );
}

function featurePhases() {
  return [
    {
      key: 'clarify',
      name: '需求澄清',
      artifact: { name: '规格文档', file: 'spec.md' },
      checks: [
        { kind: 'script', name: '必备章节完整性', detail: 'SPEC 含 目标 / 验收标准 / 边界 章节', cmd: 'spec_check' },
        { kind: 'judge', name: '验收标准可测性', detail: '每条验收是否明确、可被测试验证' },
        { kind: 'judge', name: '需求歧义检测', detail: '是否残留未澄清的模糊假设' },
      ],
      gate: {
        title: '需求澄清 · 请确认假设',
        body: '我的理解与假设:① 仅导出用户有权限的列;② 列排序持久化到用户偏好;③ 单次导出上限 50 列。是否正确?',
        opts: [
          { label: '✓ 假设无误,继续', kind: 'approve' },
          { label: '✎ 补充 / 修改', kind: 'reject' },
        ],
      },
    },
    {
      key: 'design',
      name: '设计',
      artifact: { name: '设计文档', file: 'design.md' },
      checks: [
        { kind: 'script', name: '设计文档结构校验', detail: '含 接口 / 数据模型 / 风险 章节', cmd: 'design_check' },
        { kind: 'judge', name: '设计-需求一致性', detail: '设计是否覆盖全部验收项' },
        { kind: 'judge', name: '技术方案合理性', detail: '有无明显缺陷 / 是否存在更优解' },
      ],
    },
    {
      key: 'code',
      name: '编码',
      artifact: { name: '代码变更', file: 'diff' },
      checks: [
        { kind: 'script', name: '构建', detail: '编译 / 打包通过', cmd: 'build' },
        { kind: 'script', name: '代码规范', detail: 'lint 无 error', cmd: 'lint' },
        { kind: 'script', name: '类型检查', detail: 'tsc 无类型错误', cmd: 'tsc' },
        { kind: 'script', name: '单元测试', detail: '新增及既有单测全绿', cmd: 'test:unit' },
        { kind: 'judge', name: '代码风格一致性', detail: '是否遵循项目既有约定与惯例' },
      ],
    },
    {
      key: 'verify',
      name: '验证 · e2e 检视',
      artifact: { name: '检视报告', file: 'review.md' },
      checks: [
        { kind: 'script', name: '前置检查点复核', detail: '汇总前序阶段 gate 是否仍全绿', cmd: 'verify-all' },
        { kind: 'script', name: 'E2E 测试', detail: '端到端关键场景通过', cmd: 'test:e2e' },
        { kind: 'judge', name: '设计实现一致性', detail: '实现是否与 design.md 一致' },
        { kind: 'judge', name: '无关改动 / 残留检视', detail: '无调试代码、无越界改动' },
      ],
    },
    {
      key: 'merge',
      name: '合入',
      artifact: { name: 'Pull Request', file: 'PR' },
      checks: [
        { kind: 'script', name: '冲突检测', detail: '与主干无合并冲突', cmd: 'merge-check' },
        { kind: 'judge', name: 'PR 描述完整性', detail: '改动 / 原因 / 验证是否清晰' },
        { kind: 'human', name: '人工 Review', detail: '最终合入确认' },
      ],
      gate: {
        title: '合入 Review · 需人工确认',
        body: '全部检查点已通过。是否批准合入主干?',
        opts: [
          { label: '✓ 批准合入', kind: 'approve' },
          { label: '✎ 打回并说明', kind: 'reject' },
        ],
      },
    },
  ];
}

function bugPhases() {
  return [
    {
      key: 'plan',
      name: '修复方案规划',
      artifact: { name: '复现 + 方案', file: 'plan.md' },
      checks: [
        { kind: 'script', name: '复现脚本稳定失败', detail: 'repro 可稳定复现该 bug', cmd: 'test:repro' },
        { kind: 'judge', name: '根因定位合理性', detail: '定位是否指向真正的根因' },
        { kind: 'judge', name: '修复方案评审', detail: '最小改动、不引入回归' },
      ],
    },
    {
      key: 'code',
      name: '编码',
      artifact: { name: '代码变更', file: 'diff' },
      checks: [
        { kind: 'script', name: '构建', detail: '编译 / 打包通过', cmd: 'build' },
        { kind: 'script', name: '代码规范', detail: 'lint 无 error', cmd: 'lint' },
        { kind: 'script', name: '类型检查', detail: 'tsc 无类型错误', cmd: 'tsc' },
        { kind: 'script', name: '单元测试', detail: '受影响单测全绿', cmd: 'test:unit' },
      ],
    },
    {
      key: 'verify',
      name: '验证',
      artifact: { name: '测试报告', file: 'report.md' },
      checks: [
        { kind: 'script', name: '复现测试转绿', detail: '原复现用例由红转绿', cmd: 'test:repro' },
        { kind: 'script', name: '回归测试', detail: '既有用例无退化', cmd: 'test:regression' },
        { kind: 'script', name: '受影响用例', detail: '增量跑受影响范围', cmd: 'test:impacted' },
        { kind: 'judge', name: '修复有效性研判', detail: '是否真正解决且无副作用' },
      ],
    },
    {
      key: 'merge',
      name: '合入',
      artifact: { name: 'Pull Request', file: 'PR' },
      checks: [
        { kind: 'script', name: '冲突检测', detail: '与主干无合并冲突', cmd: 'merge-check' },
        { kind: 'script', name: '复现固化为回归', detail: '复现用例纳入回归集', cmd: 'test:regression' },
        { kind: 'judge', name: 'PR 描述完整性', detail: '改动 / 原因 / 验证是否清晰' },
      ],
    },
  ];
}

function seed() {
  const r = {};
  r.r517 = {
    id: 'r517', idLabel: '#517', title: '导出报表支持自定义列与排序', type: 'feature', repo: 'analytics', branch: 'feat/517-custom-columns',
    phases: featurePhases(), currentPhase: 2, currentChecks: ['pass', 'pass', 'pass', 'fail', 'pass'], overrides: {}, resolved: {}, attempts: {},
    budget: { steps: '23/40', tokens: '184k', cost: '$1.92', elapsed: '6m24s' },
  };
  r.r530 = {
    id: 'r530', idLabel: '#530', title: '深色模式偏好持久化', type: 'feature', repo: 'web-app', branch: 'feat/530-theme-persist',
    phases: featurePhases(), currentPhase: 0, currentChecks: ['pass', 'pass', 'pass'], overrides: {}, resolved: {}, attempts: {},
    budget: { steps: '6/40', tokens: '41k', cost: '$0.44', elapsed: '1m38s' },
  };
  r.r482 = {
    id: 'r482', idLabel: '#482', title: '修复登录态过期后未自动刷新', type: 'bug', repo: 'web-app', branch: 'fix/482-session-refresh',
    phases: bugPhases(), currentPhase: 2, currentChecks: ['pass', 'pass', 'pass', 'pass'], overrides: {}, resolved: {}, attempts: { 1: 2 },
    budget: { steps: '19/40', tokens: '156k', cost: '$1.64', elapsed: '5m11s' },
  };
  r.r468 = {
    id: 'r468', idLabel: '#468', title: '修复并发写入丢失更新', type: 'bug', repo: 'core-api', branch: 'fix/468-lost-update',
    phases: bugPhases(), currentPhase: 1, currentChecks: ['pass', 'pass', 'running', 'pending'], overrides: {}, resolved: {}, attempts: {},
    budget: { steps: '11/40', tokens: '88k', cost: '$0.93', elapsed: '3m02s' },
  };
  r.r495 = {
    id: 'r495', idLabel: '#495', title: 'Webhook 重试改指数退避', type: 'bug', repo: 'core-api', branch: 'fix/495-backoff',
    phases: bugPhases(), currentPhase: 4, currentChecks: [], overrides: {}, resolved: {}, attempts: {},
    budget: { steps: '14/40', tokens: '102k', cost: '$1.08', elapsed: '3m54s' },
  };
  return r;
}

function defaultChecks(run) {
  if (run.currentPhase >= run.phases.length) return [];
  return run.phases[run.currentPhase].checks.map((c) => (c.kind === 'human' ? 'pending' : 'pass'));
}

function derive(run) {
  const cur = run.currentPhase;
  const done = cur >= run.phases.length;
  const phases = run.phases.map((ph, i) => {
    const pstat = i < cur ? 'done' : i === cur ? 'current' : 'todo';
    const checks = ph.checks.map((c, ci) => {
      let st;
      if (i < cur) st = 'pass';
      else if (i > cur) st = 'pending';
      else {
        if (c.kind === 'human') st = run.resolved[i] === 'approved' ? 'pass' : 'pending';
        else st = run.overrides[ci] || run.currentChecks[ci] || 'pending';
      }
      return { ...c, status: st, ci };
    });
    const gateActive = !!ph.gate && i === cur && run.resolved[i] !== 'approved';
    const nonHuman = checks.filter((c) => c.kind !== 'human');
    const allPass = nonHuman.every((c) => c.status === 'pass');
    const passCount = checks.filter((c) => c.status === 'pass').length;
    return {
      ...ph, idx: i, pstat, checks, gateActive, allPass, passCount, total: checks.length,
      hasFail: checks.some((c) => c.status === 'fail'), hasRun: checks.some((c) => c.status === 'running'),
    };
  });
  const curPhase = done ? null : phases[cur];
  const advanceEnabled = !done && curPhase.allPass && !curPhase.gateActive;
  let status;
  if (done) status = 'done';
  else if (curPhase.gateActive) status = 'awaiting-human';
  else if (curPhase.hasFail) status = 'needs-fix';
  else status = 'running';
  return { phases, cur, done, curPhase, advanceEnabled, status };
}

function defaultSel(run) {
  const d = derive(run);
  const pi = d.done ? run.phases.length - 1 : d.cur;
  const checks = d.phases[pi].checks;
  let ci = checks.findIndex((c) => c.status === 'fail');
  if (ci < 0) ci = 0;
  return { phase: pi, check: ci };
}

function scriptOutput(check, status) {
  const S = {
    build: { ok: ['webpack 5.89 compiling…', '  analytics.[hash].js   312 KiB', '  vendors.[hash].js     540 KiB', 'compiled successfully in 4.2s'], dur: '4.2s' },
    lint: { ok: ['eslint . --max-warnings 0', '✔ 214 files linted', '0 errors, 0 warnings'], dur: '1.8s' },
    tsc: { ok: ['tsc --noEmit', 'Found 0 errors.'], dur: '3.1s' },
    'test:unit': {
      ok: ['Test Suites: 3 passed, 3 total', 'Tests:       24 passed, 24 total', 'Time:        2.14 s'],
      fail: ['FAIL  src/export/export.spec.ts', '  ✕ empty column adds trailing comma (12 ms)', '    Expected: "name,email"', '    Received: "name,,email"', '', 'Tests: 1 failed, 23 passed, 24 total'],
      dur: '2.1s',
    },
    spec_check: { ok: ['checking SPEC required sections…', '  目标        ✓', '  验收标准    ✓', '  边界        ✓', 'all required sections present'], dur: '0.3s' },
    design_check: { ok: ['checking design.md…', '  接口定义    ✓', '  数据模型    ✓', '  风险评估    ✓', 'structure valid'], dur: '0.4s' },
    'test:e2e': { ok: ['playwright run · 8 scenarios', '  ✓ 导出默认列 (3.1s)', '  ✓ 自定义选列 (4.2s)', '  ✓ 排序持久化 (2.8s)', '8 passed (34s)'], dur: '34s' },
    'verify-all': { ok: ['check-spec        ✓', 'backend_tests     ✓', 'contract_tests    ✓', 'VERIFY-ALL: PASSED'], dur: '1m12s' },
    'test:regression': { ok: ['regression suite', 'Tests: 128 passed, 128 total'], dur: '6.4s' },
    'test:impacted': { ok: ['impacted range: 24 tests', '24 passed, 0 failed'], dur: '1.9s' },
    'merge-check': { ok: ['git merge --no-commit --no-ff origin/main', 'Already up to date — no conflicts'], dur: '0.6s' },
  };
  if (check.name === '复现脚本稳定失败') return { lines: ['repro: session-write concurrency', '  ✕ concurrent write loses update (RED)', 'bug reproduced — stable failure', '→ 复现成功 = 该检查通过'], dur: '1.2s' };
  if (check.name === '复现测试转绿') return { lines: ['repro: session.refresh.spec.ts', '  ✓ silent refresh after 401', 'repro GREEN — fix confirmed'], dur: '1.2s' };
  if (check.name === '复现固化为回归') return { lines: ['tagging repro as regression…', '  + regression/session-refresh.spec.ts', 'added to regression suite'], dur: '0.5s' };
  const e = S[check.cmd] || { ok: ['$ ' + (check.cmd || 'check'), 'done'], dur: '0.5s' };
  const lines = status === 'fail' ? e.fail || e.ok : status === 'running' ? [...(e.ok || []).slice(0, 1), '… running'] : e.ok;
  return { lines, dur: e.dur };
}

function judgeEv(name) {
  const J = {
    '验收标准可测性': { score: 92, rubric: [['每条验收有明确通过条件', true], ['可映射到自动化或人工检查', true], ['无"体验良好"类不可测表述', true]], rationale: '5 条验收标准均给出可观测的判定条件,已可逐条映射到 e2e 场景。建议为"排序持久化"补充跨会话验证点。', artifact: 'spec.md' },
    '需求歧义检测': { score: 88, rubric: [['关键名词有唯一定义', true], ['边界条件已明确', true], ['无相互冲突的假设', true]], rationale: '识别出 3 处需澄清假设(权限范围、排序持久化、列上限),已通过需求澄清 Gate 与人工确认,当前无残留歧义。', artifact: 'spec.md' },
    '设计-需求一致性': { score: 95, rubric: [['覆盖全部验收项', true], ['无超出需求的设计', true], ['数据流可追溯到需求', true]], rationale: '设计的 ColumnPicker + exportConfig 扩展完整覆盖 5 项验收,未见镀金设计。', artifact: 'design.md' },
    '技术方案合理性': { score: 84, rubric: [['无明显性能/安全缺陷', true], ['复用现有抽象', true], ['考虑了失败与边界', false]], rationale: '整体合理且复用了既有 exportConfig。空列与超长列(>50)边界处理描述偏薄,已在后续验收补测覆盖。', artifact: 'design.md' },
    '代码风格一致性': { score: 90, rubric: [['遵循项目命名与目录约定', true], ['与既有组件模式一致', true], ['注释与文档风格统一', true]], rationale: 'ColumnPicker 沿用项目既有受控组件模式与命名规范,与周边代码一致,无风格突兀之处。', artifact: 'diff' },
    '设计实现一致性': { score: 93, rubric: [['实现结构与设计一致', true], ['接口签名与设计吻合', true], ['无偏离设计的隐式行为', true]], rationale: '实现的组件边界、数据流与 design.md 描述一致;新增的空列过滤属修复范畴,不构成设计偏离。', artifact: 'diff ↔ design.md' },
    '无关改动 / 残留检视': { score: 96, rubric: [['无 console/debug 残留', true], ['无越界文件改动', true], ['无注释掉的死代码', true]], rationale: 'diff 仅触及 export 相关文件,无调试语句与无关格式化改动,变更聚焦。', artifact: 'diff' },
    '修复有效性研判': { score: 94, rubric: [['复现用例由红转绿', true], ['根因被真正消除', true], ['无引入新副作用', true]], rationale: '单飞锁 + await 消除了竞态根因,复现转绿且受影响用例无回归,判定为有效修复。', artifact: 'report.md' },
    'PR 描述完整性': { score: 89, rubric: [['说明改了什么', true], ['说明为什么改', true], ['给出如何验证', true]], rationale: 'PR 描述覆盖动机、方案与验证方式,并链接复现测试。可再补一句回滚说明。', artifact: 'PR' },
    '根因定位合理性': { score: 91, rubric: [['定位有证据支撑', true], ['指向根因而非表象', true], ['排除了其他可能', true]], rationale: '结合堆栈与 git 历史定位到并发写路径缺少版本校验,证据充分,非表层修补。', artifact: 'plan.md' },
    '修复方案评审': { score: 87, rubric: [['改动范围最小', true], ['不引入回归风险', true], ['方案可测试', true]], rationale: '采用乐观锁 + 冲突重试,改动集中且可由并发复现验证,风险可控。', artifact: 'plan.md' },
  };
  return J[name] || { score: 90, rubric: [['符合检查目标', true]], rationale: '该项由 LLM 裁判评审,结论为通过。', artifact: '交付件' };
}

function buildDetail(state) {
  const run = state.runs[state.activeId];
  const d = derive(run);
  const sc = state.selCheck;
  if (!sc) {
    const pi = d.done ? run.phases.length - 1 : d.cur;
    const ph = d.phases[pi];
    return { isEmpty: true, phaseName: ph.name, artifactName: ph.artifact.name, artifactFile: ph.artifact.file };
  }
  const ph = d.phases[sc.phase];
  const c = ph.checks[sc.check];
  if (!c) return { isEmpty: true, phaseName: ph.name, artifactName: ph.artifact.name, artifactFile: ph.artifact.file };
  const sm = cstatMeta(c.status);
  const verdictStyle = `font-size:12px;font-weight:600;color:${sm.c};background:${hexA(sm.c, 0.14)};padding:4px 12px;border-radius:14px;`;

  if (c.kind === 'script') {
    const o = scriptOutput(c, c.status);
    const lines = o.lines.map((t) => {
      let col = '#8fb3d6';
      if (/^\s*✓|passed|PASSED|GREEN|success|no conflict|present|0 errors|Found 0/.test(t)) col = '#7fd8a0';
      else if (/^\s*✕|FAIL|failed|RED|Expected|Received/.test(t)) col = '#f6a49d';
      else if (/^\s*[$#]|compiling|run|checking|eslint|tsc|git|webpack|playwright/.test(t)) col = '#6d86ab';
      return { text: t === '' ? ' ' : t, color: col };
    });
    return {
      isScript: true, name: c.name, detail: c.detail, cmd: c.cmd, lines, duration: o.dur,
      exit: c.status === 'pass' ? '0' : c.status === 'fail' ? '1' : '—',
      verdictLabel: sm.l, verdictStyle,
    };
  }
  if (c.kind === 'judge') {
    const j = judgeEv(c.name);
    const passed = c.status !== 'fail';
    const scoreColor = j.score >= 90 ? C.ok : j.score >= 75 ? C.warn : C.fail;
    return {
      isJudge: true, name: c.name, detail: c.detail,
      verdictLabel: passed ? '裁定通过' : '裁定不通过',
      verdictStyle: `font-size:12px;font-weight:600;color:${passed ? C.ok : C.fail};background:${hexA(passed ? C.ok : C.fail, 0.14)};padding:4px 12px;border-radius:14px;`,
      score: j.score + ' / 100', scoreColor, scoreBarStyle: `height:100%;width:${j.score}%;border-radius:6px;background:${scoreColor};`,
      rubric: j.rubric.map(([text, ok]) => ({ text, mark: ok ? '✓' : '✗', color: ok ? C.ok : C.fail })),
      rationale: j.rationale, model: 'claude-judge-v2', artifact: j.artifact,
    };
  }
  // human
  return {
    isHuman: true, name: c.name, detail: c.detail,
    verdictLabel: c.status === 'pass' ? '已确认' : '待确认',
    verdictStyle: `font-size:12px;font-weight:600;color:${c.status === 'pass' ? C.ok : C.warn};background:${hexA(c.status === 'pass' ? C.ok : C.warn, 0.14)};padding:4px 12px;border-radius:14px;`,
    note: c.status === 'pass' ? '已由团队 Lead 批准合入主干。' : '等待团队 Lead 在 Gate 处批准合入 —— 人工检查点不可被脚本或模型旁路。',
  };
}

const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
html, body, #root { height: 100%; }
body { margin: 0; }
.le-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
.le-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 8px; }
.le-scroll::-webkit-scrollbar-track { background: transparent; }
@keyframes le-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
@keyframes le-blink { 0%,100% { box-shadow: 0 0 0 0 rgba(242,192,120,0.5); } 50% { box-shadow: 0 0 0 5px rgba(242,192,120,0); } }
`;

export default function PhaseTimeline() {
  const [state, setState] = useState(() => ({ activeId: 'r517', selPhase: null, selCheck: null, runs: seed() }));

  const select = (id) => {
    const run = state.runs[id];
    const ds = defaultSel(run);
    setState((s) => ({ ...s, activeId: id, selPhase: null, selCheck: ds }));
  };
  const toggle = (idx) => setState((s) => ({ ...s, selPhase: s.selPhase === idx ? -1 : idx }));
  const selectCheck = (pi, ci) => setState((s) => ({ ...s, selCheck: { phase: pi, check: ci }, selPhase: pi }));
  const advance = (id) => {
    setState((s) => {
      const run = { ...s.runs[id] };
      const d = derive(run);
      if (!d.advanceEnabled) return s;
      run.currentPhase = Math.min(run.currentPhase + 1, run.phases.length);
      run.overrides = {};
      run.currentChecks = defaultChecks(run);
      return { ...s, runs: { ...s.runs, [id]: run }, selPhase: null, selCheck: defaultSel(run) };
    });
  };
  const rerun = (id) => {
    setState((s) => {
      const run = { ...s.runs[id] };
      const ov = { ...run.overrides };
      run.currentChecks.forEach((st, i) => {
        if (st === 'fail' || st === 'running') ov[i] = 'pass';
      });
      run.overrides = ov;
      const at = { ...run.attempts };
      at[run.currentPhase] = (at[run.currentPhase] || 1) + 1;
      run.attempts = at;
      return { ...s, runs: { ...s.runs, [id]: run } };
    });
  };
  const resolveGate = (id, kind) => {
    setState((s) => {
      const run = { ...s.runs[id] };
      const res = { ...run.resolved };
      res[run.currentPhase] = kind === 'approve' ? 'approved' : 'rejected';
      run.resolved = res;
      if (kind === 'approve') {
        run.currentPhase = Math.min(run.currentPhase + 1, run.phases.length);
        run.overrides = {};
        run.currentChecks = defaultChecks(run);
      }
      return { ...s, runs: { ...s.runs, [id]: run }, selPhase: null, selCheck: defaultSel(run) };
    });
  };

  const runs = Object.values(state.runs).map((run) => {
    const d = derive(run);
    const tm = typeMeta(run.type);
    const sm = statusMeta(d.status);
    const active = run.id === state.activeId;
    const pct = Math.round((d.cur / run.phases.length) * 100);
    const typeChip = `font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;color:${tm.c};background:${hexA(tm.c, 0.14)};padding:2px 6px;border-radius:5px;`;
    return {
      id: run.id, idLabel: run.idLabel, title: run.title, phaseZh: d.done ? '已交付' : d.curPhase.name,
      typeLabel: tm.l, statusLabel: sm[1], onClick: () => select(run.id),
      cardStyle: `width:100%;text-align:left;cursor:pointer;background:${active ? 'rgba(76,180,234,0.1)' : 'rgba(255,255,255,0.03)'};border:1px solid ${active ? 'rgba(76,180,234,0.45)' : 'rgba(255,255,255,0.07)'};border-radius:12px;padding:12px 13px;font-family:'Space Grotesk';`,
      typeStyle: typeChip,
      statusStyle: `font-size:10px;font-weight:600;color:${sm[0]};` + (d.status === 'awaiting-human' || d.status === 'needs-fix' ? 'animation:le-pulse 1.5s infinite;' : ''),
      barStyle: `height:100%;width:${pct}%;border-radius:4px;background:${sm[0]};`,
    };
  });
  const runCount = Object.keys(state.runs).length;

  const active = (() => {
    const run = state.runs[state.activeId];
    const d = derive(run);
    const tm = typeMeta(run.type);
    const sm = statusMeta(d.status);
    const selPhase = state.selPhase;

    const timeline = d.phases.map((ph, i) => {
      const col = ph.pstat === 'done' ? C.ok : ph.pstat === 'current' ? (ph.hasFail ? C.fail : ph.gateActive ? C.warn : C.cyan) : '#34496b';
      const expanded = selPhase != null ? selPhase === i : i === d.cur;
      const isCur = i === d.cur && !d.done;
      const attempts = run.attempts[i] || 1;
      let g = null;
      if (ph.gateActive && ph.gate) {
        g = {
          title: ph.gate.title, body: ph.gate.body,
          opts: ph.gate.opts.map((o) => ({
            label: o.label, onClick: () => resolveGate(run.id, o.kind),
            style: o.kind === 'approve'
              ? `font-family:'Space Grotesk';font-size:13px;font-weight:600;color:#05101f;background:${C.warn};border:none;border-radius:8px;padding:9px 16px;cursor:pointer;`
              : `font-family:'Space Grotesk';font-size:13px;font-weight:500;color:#f2c078;background:transparent;border:1px solid rgba(242,192,120,0.5);border-radius:8px;padding:9px 16px;cursor:pointer;`,
          })),
        };
      }
      const advEn = isCur && d.advanceEnabled;
      const nextNm = d.cur + 1 >= run.phases.length ? '标记已交付' : run.phases[d.cur + 1].name;
      const selC = state.selCheck;
      const checks = ph.checks.map((c, ci) => {
        const km = kindMeta(c.kind);
        const cm = cstatMeta(c.status);
        const isSel = selC && selC.phase === i && selC.check === ci;
        return {
          name: c.name, detail: c.detail, onClick: () => selectCheck(i, ci),
          kindIcon: km.icon, kindLabel: km.l,
          kindStyle: `flex:0 0 auto;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;color:${km.c};background:${hexA(km.c, 0.13)};border:1px solid ${hexA(km.c, 0.28)};padding:3px 8px;border-radius:6px;white-space:nowrap;`,
          statusLabel: cm.l, statusStyle: `font-size:11px;font-weight:600;color:${cm.c};`,
          dotStyle: `width:9px;height:9px;border-radius:50%;background:${cm.c};${c.status === 'running' ? 'animation:le-pulse 1s infinite;' : ''}`,
          rowStyle: `width:100%;display:flex;align-items:center;gap:12px;cursor:pointer;background:${isSel ? 'rgba(76,180,234,0.1)' : 'transparent'};border:1px solid ${isSel ? 'rgba(76,180,234,0.35)' : 'transparent'};border-radius:9px;padding:10px 12px;font-family:'Space Grotesk';`,
        };
      });
      return {
        key: ph.key + i, name: ph.name, artifactName: ph.artifact.name, artifactFile: ph.artifact.file,
        onToggle: () => toggle(i), expanded, chevron: expanded ? '▾' : '▸',
        attemptBadge: attempts > 1 ? '迭代 ×' + attempts : '',
        nodeMark: ph.pstat === 'done' ? '✓' : ph.hasFail && ph.pstat === 'current' ? '✕' : i + 1,
        nodeStyle: `width:30px;height:30px;border-radius:50%;flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;font-family:'JetBrains Mono',monospace;color:${ph.pstat === 'todo' ? '#5a719a' : '#05101f'};background:${ph.pstat === 'todo' ? 'rgba(255,255,255,0.05)' : col};border:1.5px solid ${col};${ph.pstat === 'current' ? `box-shadow:0 0 0 4px ${hexA(col, 0.18)};` : ''}`,
        lineStyle: `width:2px;flex:1;background:${i < d.cur ? C.ok : 'rgba(255,255,255,0.09)'};margin-top:4px;min-height:20px;` + (i === d.phases.length - 1 ? 'display:none;' : ''),
        nameStyle: `font-size:14px;font-weight:600;color:${ph.pstat === 'todo' ? '#7d93b3' : '#e8f0fb'};`,
        ratio: ph.pstat === 'todo' ? `${ph.total} 项待查` : `${ph.passCount}/${ph.total} 通过`,
        ratioStyle: `font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;color:${col};`,
        headStyle: `width:100%;display:flex;align-items:center;gap:10px;cursor:pointer;background:${expanded ? 'rgba(255,255,255,0.03)' : 'transparent'};border:1px solid ${expanded ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)'};border-radius:11px;padding:11px 14px;font-family:'Space Grotesk';text-align:left;`,
        checks, gate: g,
        showAdvance: isCur && !ph.gateActive, showRerun: isCur && ph.hasFail,
        advanceHint: ph.hasFail ? '存在失败检查,修复后推进' : advEn ? '全部通过,可推进' : '检查进行中',
        advanceLabel: '推进到 ' + nextNm + ' →',
        advanceStyle: `font-family:'Space Grotesk';font-size:12.5px;font-weight:600;border:none;border-radius:8px;padding:8px 14px;cursor:${advEn ? 'pointer' : 'not-allowed'};color:#05101f;background:${advEn ? C.cyan : '#34496b'};${advEn ? '' : 'opacity:0.6;'}`,
        onAdvance: advEn ? () => advance(run.id) : () => {}, onRerun: () => rerun(run.id),
      };
    });

    const typeChip = `font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:${tm.c};background:${hexA(tm.c, 0.14)};padding:3px 8px;border-radius:6px;`;
    const statusChip = `font-size:11px;font-weight:600;color:${sm[0]};background:${hexA(sm[0], 0.12)};padding:3px 10px;border-radius:14px;` + (d.status === 'awaiting-human' || d.status === 'needs-fix' ? 'animation:le-pulse 1.5s infinite;' : '');
    return {
      idLabel: run.idLabel, title: run.title, repo: run.repo, branch: run.branch,
      typeLabel: tm.l, typeStyle: typeChip, statusLabel: sm[1], statusStyle: statusChip,
      phaseProgress: (d.done ? run.phases.length : d.cur + 1) + ' / ' + run.phases.length,
      budget: run.budget, timeline,
    };
  })();

  const detail = buildDetail(state);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />
      <div style={css("height:100vh;width:100vw;padding:0;display:flex;align-items:stretch;justify-content:center;font-family:'Space Grotesk', system-ui, sans-serif;background:radial-gradient(1400px 900px at 30% -15%, #0d2f54 0%, #071a34 42%, #05101f 100%);")}>
        <div style={css('width:100%;height:100vh;flex:1 1 auto;display:flex;flex-direction:column;background:linear-gradient(180deg, #0a1a30 0%, #081428 100%);border:none;border-radius:0;box-shadow:none;color:#e8f0fb;overflow:hidden;')}>

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
              <span style={css('font-size:12px;color:#9db4d4;background:rgba(111,195,238,0.12);border:1px solid rgba(111,195,238,0.25);padding:5px 11px;border-radius:20px;')}>● 3 运行中</span>
              <span style={css('font-size:12px;color:#f2c078;background:rgba(242,192,120,0.12);border:1px solid rgba(242,192,120,0.28);padding:5px 11px;border-radius:20px;')}>◆ 1 待人工</span>
              <span style={css('font-size:12px;color:#f6867f;background:rgba(246,134,127,0.1);border:1px solid rgba(246,134,127,0.25);padding:5px 11px;border-radius:20px;')}>✕ 1 待修复</span>
            </div>
            <div style={css("margin-left:auto;display:flex;align-items:center;gap:8px;font-family:'JetBrains Mono', monospace;font-size:11px;")}>
              <span style={css('color:#63789c;')}>检查器</span>
              <span style={css('color:#4cb4ea;background:rgba(76,180,234,0.12);padding:3px 9px;border-radius:6px;')}>⌘ 脚本 · 确定性命令</span>
              <span style={css('color:#b58cf0;background:rgba(181,140,240,0.12);padding:3px 9px;border-radius:6px;')}>◇ LLM 裁判 · 模型评审</span>
            </div>
          </div>

          <div style={css('flex:1;display:flex;min-height:0;')}>

            {/* LEFT rail: loops */}
            <div className="le-scroll" style={css('width:260px;flex:0 0 auto;border-right:1px solid rgba(255,255,255,0.07);overflow-y:auto;padding:14px;')}>
              <div style={css('font-size:11px;letter-spacing:1px;color:#63789c;font-weight:600;padding:4px 6px 10px;')}>运行队列 · {runCount}</div>
              <div style={css('display:flex;flex-direction:column;gap:8px;')}>
                {runs.map((r) => (
                  <button key={r.id} type="button" onClick={r.onClick} style={css(r.cardStyle)}>
                    <div style={css('display:flex;align-items:center;gap:8px;margin-bottom:8px;')}>
                      <span style={css(r.typeStyle)}>{r.typeLabel}</span>
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
            <div style={css('flex:1;min-width:0;display:flex;flex-direction:column;border-right:1px solid rgba(255,255,255,0.07);')}>
              {/* run header + budget */}
              <div style={css('flex:0 0 auto;border-bottom:1px solid rgba(255,255,255,0.07);padding:16px 24px;background:rgba(255,255,255,0.02);')}>
                <div style={css('display:flex;align-items:center;gap:11px;margin-bottom:12px;')}>
                  <span style={css(active.typeStyle)}>{active.typeLabel}</span>
                  <span style={css("font-family:'JetBrains Mono', monospace;font-size:12px;color:#63789c;")}>{active.idLabel}</span>
                  <span style={css('font-size:17px;color:#e8f0fb;font-weight:600;')}>{active.title}</span>
                  <span style={css(active.statusStyle)}>{active.statusLabel}</span>
                  <span style={css("font-family:'JetBrains Mono', monospace;font-size:11px;color:#63789c;margin-left:4px;")}>{active.repo} · {active.branch}</span>
                </div>
                <div style={css("display:flex;align-items:center;gap:20px;font-family:'JetBrains Mono', monospace;font-size:11px;color:#63789c;")}>
                  <span>阶段 <span style={css('color:#9db4d4;')}>{active.phaseProgress}</span></span>
                  <span>预算 <span style={css('color:#9db4d4;')}>{active.budget.steps}</span> 步</span>
                  <span>tokens <span style={css('color:#9db4d4;')}>{active.budget.tokens}</span></span>
                  <span>成本 <span style={css('color:#9db4d4;')}>{active.budget.cost}</span></span>
                  <span>耗时 <span style={css('color:#9db4d4;')}>{active.budget.elapsed}</span></span>
                </div>
              </div>

              {/* timeline */}
              <div className="le-scroll" style={css('flex:1;overflow-y:auto;padding:20px 24px;')}>
                <div style={css('display:flex;flex-direction:column;')}>
                  {active.timeline.map((ph) => (
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
                            {ph.checks.map((c, ci) => (
                              <button key={ci} type="button" onClick={c.onClick} style={css(c.rowStyle)}>
                                <span style={css(c.kindStyle)}>{c.kindIcon} {c.kindLabel}</span>
                                <div style={css('flex:1;min-width:0;text-align:left;')}>
                                  <div style={css('font-size:13px;color:#dce8f6;font-weight:500;')}>{c.name}</div>
                                  <div style={css('font-size:11.5px;color:#8ba3c4;line-height:1.4;margin-top:2px;')}>{c.detail}</div>
                                </div>
                                <div style={css('display:flex;align-items:center;gap:6px;flex:0 0 auto;')}>
                                  <div style={css(c.dotStyle)} />
                                  <span style={css(c.statusStyle)}>{c.statusLabel}</span>
                                  <span style={css('font-size:11px;color:#4a5f7f;margin-left:2px;')}>›</span>
                                </div>
                              </button>
                            ))}

                            {ph.gate ? (
                              <div style={css('margin:6px;background:linear-gradient(180deg, rgba(242,192,120,0.13), rgba(242,192,120,0.04));border:1px solid rgba(242,192,120,0.4);border-radius:11px;padding:14px 16px;animation:le-blink 2s infinite;')}>
                                <div style={css('display:flex;align-items:center;gap:8px;margin-bottom:8px;')}>
                                  <span style={css('font-size:11px;font-weight:700;color:#05101f;background:#f2c078;padding:3px 8px;border-radius:6px;')}>人工 GATE</span>
                                  <span style={css('font-size:13px;font-weight:600;color:#f7d9a6;')}>{ph.gate.title}</span>
                                </div>
                                <div style={css('font-size:12.5px;color:#e6d3b3;line-height:1.55;margin-bottom:12px;')}>{ph.gate.body}</div>
                                <div style={css('display:flex;gap:9px;')}>
                                  {ph.gate.opts.map((o, oi) => (
                                    <button key={oi} type="button" onClick={o.onClick} style={css(o.style)}>{o.label}</button>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {ph.showAdvance ? (
                              <div style={css('display:flex;align-items:center;gap:10px;padding:9px 8px 5px;')}>
                                <span style={css('font-size:12px;color:#63789c;')}>{ph.advanceHint}</span>
                                <div style={css('margin-left:auto;display:flex;gap:9px;')}>
                                  {ph.showRerun ? (
                                    <button type="button" onClick={ph.onRerun} style={css("font-family:'Space Grotesk';font-size:12.5px;font-weight:500;color:#f6867f;background:rgba(246,134,127,0.1);border:1px solid rgba(246,134,127,0.35);border-radius:8px;padding:8px 14px;cursor:pointer;")}>↻ 修复并重跑</button>
                                  ) : null}
                                  <button type="button" onClick={ph.onAdvance} style={css(ph.advanceStyle)}>{ph.advanceLabel}</button>
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
            </div>

            {/* RIGHT: evidence detail */}
            <div className="le-scroll" style={css('width:440px;flex:0 0 auto;overflow-y:auto;background:rgba(0,0,0,0.15);')}>
              {detail.isScript ? (
                <div style={css('padding:20px;')}>
                  <div style={css('font-size:11px;letter-spacing:1px;color:#63789c;font-weight:600;margin-bottom:14px;')}>检查证据 · 脚本</div>
                  <div style={css('display:flex;align-items:center;gap:9px;margin-bottom:6px;')}>
                    <span style={css("font-family:'JetBrains Mono', monospace;font-size:11px;font-weight:600;color:#4cb4ea;background:rgba(76,180,234,0.13);border:1px solid rgba(76,180,234,0.3);padding:3px 9px;border-radius:6px;")}>⌘ 脚本</span>
                    <span style={css('font-size:15px;font-weight:600;color:#e8f0fb;')}>{detail.name}</span>
                  </div>
                  <div style={css('font-size:12.5px;color:#8ba3c4;line-height:1.5;margin-bottom:16px;')}>{detail.detail}</div>

                  <div style={css('display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;')}>
                    <span style={css(detail.verdictStyle)}>{detail.verdictLabel}</span>
                    <span style={css("font-family:'JetBrains Mono', monospace;font-size:11px;color:#9db4d4;background:rgba(255,255,255,0.05);padding:4px 10px;border-radius:6px;")}>exit {detail.exit}</span>
                    <span style={css("font-family:'JetBrains Mono', monospace;font-size:11px;color:#9db4d4;background:rgba(255,255,255,0.05);padding:4px 10px;border-radius:6px;")}>⏱ {detail.duration}</span>
                  </div>

                  <div style={css("font-family:'JetBrains Mono', monospace;font-size:11px;color:#63789c;margin-bottom:7px;")}>$ {detail.cmd}</div>
                  <div style={css('background:#050e1c;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;overflow-x:auto;')}>
                    {detail.lines.map((ln, li) => (
                      <div key={li} style={{ ...css("font-family:'JetBrains Mono', monospace;font-size:11.5px;line-height:1.7;white-space:pre;"), color: ln.color }}>{ln.text}</div>
                    ))}
                  </div>

                  <div style={css('margin-top:16px;display:flex;align-items:center;gap:8px;font-size:11px;color:#63789c;')}>
                    <span style={css('width:6px;height:6px;border-radius:50%;background:#4cb4ea;')} />
                    确定性命令产出 · 写入 GateRecord,阶段前进只认此信号
                  </div>
                </div>
              ) : null}

              {detail.isJudge ? (
                <div style={css('padding:20px;')}>
                  <div style={css('font-size:11px;letter-spacing:1px;color:#63789c;font-weight:600;margin-bottom:14px;')}>检查证据 · LLM 裁判</div>
                  <div style={css('display:flex;align-items:center;gap:9px;margin-bottom:6px;')}>
                    <span style={css("font-family:'JetBrains Mono', monospace;font-size:11px;font-weight:600;color:#b58cf0;background:rgba(181,140,240,0.13);border:1px solid rgba(181,140,240,0.3);padding:3px 9px;border-radius:6px;")}>◇ LLM 裁判</span>
                    <span style={css('font-size:15px;font-weight:600;color:#e8f0fb;')}>{detail.name}</span>
                  </div>
                  <div style={css('font-size:12.5px;color:#8ba3c4;line-height:1.5;margin-bottom:16px;')}>{detail.detail}</div>

                  <div style={css('display:flex;align-items:center;gap:10px;margin-bottom:16px;')}>
                    <span style={css(detail.verdictStyle)}>{detail.verdictLabel}</span>
                    <div style={css('flex:1;display:flex;align-items:center;gap:9px;')}>
                      <div style={css('flex:1;height:6px;border-radius:6px;background:rgba(255,255,255,0.08);overflow:hidden;')}>
                        <div style={css(detail.scoreBarStyle)} />
                      </div>
                      <span style={{ ...css("font-family:'JetBrains Mono', monospace;font-size:12px;font-weight:600;"), color: detail.scoreColor }}>{detail.score}</span>
                    </div>
                  </div>

                  <div style={css('font-size:11px;letter-spacing:0.5px;color:#63789c;font-weight:600;margin-bottom:9px;')}>评分标准 RUBRIC</div>
                  <div style={css('display:flex;flex-direction:column;gap:7px;margin-bottom:18px;')}>
                    {detail.rubric.map((rb, ri) => (
                      <div key={ri} style={css('display:flex;align-items:flex-start;gap:9px;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);border-radius:9px;padding:9px 12px;')}>
                        <span style={{ ...css('font-size:13px;flex:0 0 auto;line-height:1.4;'), color: rb.color }}>{rb.mark}</span>
                        <span style={css('font-size:12.5px;color:#cdddf0;line-height:1.45;')}>{rb.text}</span>
                      </div>
                    ))}
                  </div>

                  <div style={css('font-size:11px;letter-spacing:0.5px;color:#63789c;font-weight:600;margin-bottom:9px;')}>裁判结论</div>
                  <div style={css('background:rgba(181,140,240,0.06);border:1px solid rgba(181,140,240,0.2);border-radius:10px;padding:13px 15px;font-size:12.5px;color:#d8c9f0;line-height:1.6;')}>{detail.rationale}</div>

                  <div style={css("margin-top:14px;display:flex;align-items:center;gap:10px;font-family:'JetBrains Mono', monospace;font-size:11px;color:#63789c;")}>
                    <span>裁判模型 <span style={css('color:#b58cf0;')}>{detail.model}</span></span>
                    <span>· 评审对象 <span style={css('color:#9db4d4;')}>{detail.artifact}</span></span>
                  </div>
                </div>
              ) : null}

              {detail.isHuman ? (
                <div style={css('padding:20px;')}>
                  <div style={css('font-size:11px;letter-spacing:1px;color:#63789c;font-weight:600;margin-bottom:14px;')}>检查证据 · 人工</div>
                  <div style={css('display:flex;align-items:center;gap:9px;margin-bottom:6px;')}>
                    <span style={css("font-family:'JetBrains Mono', monospace;font-size:11px;font-weight:600;color:#f2c078;background:rgba(242,192,120,0.13);border:1px solid rgba(242,192,120,0.3);padding:3px 9px;border-radius:6px;")}>◆ 人工</span>
                    <span style={css('font-size:15px;font-weight:600;color:#e8f0fb;')}>{detail.name}</span>
                  </div>
                  <div style={css('font-size:12.5px;color:#8ba3c4;line-height:1.5;margin-bottom:16px;')}>{detail.detail}</div>
                  <div style={css('display:flex;gap:8px;margin-bottom:14px;')}>
                    <span style={css(detail.verdictStyle)}>{detail.verdictLabel}</span>
                  </div>
                  <div style={css('background:rgba(242,192,120,0.06);border:1px solid rgba(242,192,120,0.2);border-radius:10px;padding:13px 15px;font-size:12.5px;color:#e6d3b3;line-height:1.6;')}>{detail.note}</div>
                </div>
              ) : null}

              {detail.isEmpty ? (
                <div style={css('padding:20px;')}>
                  <div style={css('font-size:11px;letter-spacing:1px;color:#63789c;font-weight:600;margin-bottom:14px;')}>交付件概览</div>
                  <div style={css('display:flex;align-items:center;gap:12px;margin-bottom:14px;')}>
                    <div style={css('width:40px;height:40px;border-radius:10px;background:rgba(76,180,234,0.12);display:flex;align-items:center;justify-content:center;font-size:17px;color:#4cb4ea;')}>◈</div>
                    <div>
                      <div style={css('font-size:15px;font-weight:600;color:#e8f0fb;')}>{detail.phaseName}</div>
                      <div style={css("font-family:'JetBrains Mono', monospace;font-size:11px;color:#63789c;margin-top:2px;")}>{detail.artifactName} · {detail.artifactFile}</div>
                    </div>
                  </div>
                  <div style={css('font-size:12.5px;color:#8ba3c4;line-height:1.6;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px;')}>点击左侧任一检查项,查看其证据详情 —— 脚本检查展示命令与终端输出,LLM 裁判展示评分标准、结论与推理。</div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
