// PM2 config for the agentloop backend (FastAPI / uvicorn on :8000).
// 常驻后端 + autorestart，避免“前端在、后端不在”——Vite proxy 会把 ECONNREFUSED 包成 HTTP 500。
//
// 关键：显式钉死 cwd 和 AGENTLOOP_DB。db.get_db_path() 读的是 os.environ.get("AGENTLOOP_DB","agentloop.db")，
// 是 cwd 相对路径；uvicorn 常驻后若 cwd/DB 不固定，会读到不同工作目录下的 agentloop.db，
// 造成“有数据但不是同一份”的来源歧义（正是 R5 要防的）。这里用 __dirname 解析为绝对路径，一次钉死。
//
// 用法：
//   scripts/setup-backend            # 首次：建 .venv 装依赖
//   pm2 start ecosystem.backend.config.js && pm2 save
//   pm2 logs agentloop-backend       # 看日志
//   健康检查： curl --noproxy '*' http://127.0.0.1:8000/api/loop-runs
//
// 备注：脚本路径按 Windows venv 布局（.venv\Scripts\python.exe）；非 Windows 环境需改成 .venv/bin/python。
const path = require('path')

const backendDir = path.join(__dirname, 'backend')
const python = path.join(backendDir, '.venv', 'Scripts', 'python.exe')

module.exports = {
  apps: [
    {
      name: 'agentloop-backend',
      script: python,
      args: '-m uvicorn app.main:app --host 127.0.0.1 --port 8000',
      cwd: backendDir,
      interpreter: 'none',
      env: {
        AGENTLOOP_DB: path.join(backendDir, 'agentloop.db'),
      },
      autorestart: true,
      max_restarts: 20,
    },
  ],
}
