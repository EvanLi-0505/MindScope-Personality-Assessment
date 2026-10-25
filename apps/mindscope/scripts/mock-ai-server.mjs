// Development tool for the desktop smoke test: a tiny OpenAI-compatible
// server on 127.0.0.1 that streams a fixed answer and writes every request it
// receives (headers + body) to the file given as the first argument, so the
// test can check what the app actually sent. Never used by the app itself.
//
//   node scripts/mock-ai-server.mjs <requests.jsonl>
//   → prints "PORT <n>" once listening
import { appendFileSync } from 'node:fs';
import { createServer } from 'node:http';

const log = process.argv[2];
const answer = [
  '## 分析依据\n\n根据 1 次人格测评和 2 次心理状态自评（本机模拟服务器生成）。\n\n',
  '## 主要发现\n\n- **稳定的部分**：外向与实感倾向较明显。\n- 只有一次人格测评，无法判断变化。\n\n',
  '## 局限与提醒\n\n这是冒烟测试用的固定回答，不是真实 AI。',
];

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (log) appendFileSync(log, JSON.stringify({ method: req.method, url: req.url, headers: req.headers, body }) + '\n');
    if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) {
      res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":{"message":"not found"}}');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    let i = 0;
    const tick = () => {
      if (i < answer.length) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: answer[i++] } }] })}\n\n`);
        setTimeout(tick, 40);
      } else {
        res.write(`data: ${JSON.stringify({ choices: [], usage: { total_tokens: 321 } })}\n\n`);
        res.end('data: [DONE]\n\n');
      }
    };
    tick();
  });
});
server.listen(0, '127.0.0.1', () => console.log(`PORT ${server.address().port}`));
