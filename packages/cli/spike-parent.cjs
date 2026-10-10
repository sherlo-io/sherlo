const { execFileSync } = require('child_process');
const child = __dirname + '/spike-detect.cjs';
const run = (label, env) =>
  console.log(label, execFileSync(process.execPath, [child], { encoding: 'utf8', env }).trim());

run('inherited env:', process.env);
run('empty env (like env -i):', {});
run('PATH only:', { PATH: process.env.PATH });
console.log(
  'agent-ish vars here:',
  Object.keys(process.env).filter((k) =>
    /^(CLAUDE|CODEX|CURSOR|OPENCODE|GEMINI|KIRO|KILO|COPILOT|REPLIT|PI_|BOLT|RORK|MUSE|CLINE|ANTIGRAVITY)/.test(k)
  )
);
