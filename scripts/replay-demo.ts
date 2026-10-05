// Scripted model + real local sandbox. No hosted model, Trigger deployment, or paid provider.
import { mockChatAgent } from '@trigger.dev/sdk/ai/test';
import { MockLanguageModelV3 } from 'ai/test';
import { simulateReadableStream } from 'ai';
import { PlimsollClient, CodeSandboxes } from '@plimsollmark/client';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { codeChatAgent } from '../src/trigger/chat.ts';
import { models } from '../src/trigger/models.ts';
import { csv, load, followup, questions, expectedCounts, expectedRates } from '../src/demo/scenario.ts';

const url = process.env.PLIMSOLL_URL;
if (!url || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) {
  throw new Error('Set PLIMSOLL_URL to a local Docker-backed daemon. This replay refuses remote endpoints.');
}
const client = new PlimsollClient({ baseUrl: url, token: process.env.PLIMSOLL_TOKEN });
const info = await client.describe();
if (info.sandbox !== 'docker') throw new Error('This replay only runs on local Docker, never a paid sandbox provider.');
const floor = process.env.PLIMSOLL_TEST_FLOOR ?? 'kernel';
if (floor !== 'kernel' && floor !== 'container') throw new Error('Use kernel, or container for trusted local sample code.');

const usage = { inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 0, text: 0, reasoning: undefined } };
const files = [{ path: 'returns.csv', content: csv }];
const steps = [
  { code: load, files },
  { text: 'Trail shoes account for 16 of the 20 additional returns. This identifies where to investigate, not why customers returned them.' },
  { code: followup },
  { text: 'Trail-shoe returns rose from 4% to 12%. Shipments were unchanged, so higher sales do not explain this sample’s increase.' },
  { code: "print('products' in globals())" },
  { text: 'The resumed conversation has a new workspace. Reload the spreadsheet before continuing.' },
];
let stepIndex = 0;
models.chat = () => new MockLanguageModelV3({
  doStream: async () => {
    const step = steps[stepIndex++];
    if (!step) throw new Error('Unexpected model call beyond the fixed script');
    const chunks: any[] = 'code' in step
      ? [{ type: 'tool-call', toolCallId: `demo-${stepIndex}`, toolName: 'executeCode', input: JSON.stringify({ ...step, language: 'python' }) }, { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_use' }, usage }]
      : [{ type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: step.text }, { type: 'text-end', id: 't' }, { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage }];
    return { stream: simulateReadableStream({ chunks }) };
  },
});

// Observe the real close RPC so the reset is verified after the actual suspend hook.
let closed = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const response = await originalFetch(input, init);
  if (String(input).startsWith(url) && String(input).endsWith('/CloseSession') && response.ok) closed++;
  return response;
};
let harness = mockChatAgent(codeChatAgent({ id: 'spreadsheet-replay', minimumIsolation: floor, idleTimeoutInSeconds: 3 }), { chatId: 'spreadsheet-demo' });
const outputs: any[] = [];
const transcripts: any[] = [];
async function turn(text: string) {
  const result = await harness.sendMessage({ id: `question-${transcripts.length}`, role: 'user', parts: [{ type: 'text', text }] });
  const results = result.chunks.filter((c: any) => c.type === 'tool-output-available').map((c: any) => c.output);
  assert.equal(results.length, 1);
  const output = results[0] as any;
  assert.equal(output.exitCode, 0, JSON.stringify(output));
  assert.match(output.recordSha256, /^[a-f0-9]{64}$/);
  assert.equal(output.isolation, floor);
  outputs.push(output);
  transcripts.push({ question: text, answer: result.chunks.filter((c: any) => c.type === 'text-delta').map((c: any) => c.delta).join(''), output });
}
try {
  await turn(questions[0]);
  assert.deepEqual(JSON.parse(outputs[0].stdout), expectedCounts);
  await turn(questions[1]);
  assert.deepEqual(JSON.parse(outputs[1].stdout), expectedRates);
  assert.equal(outputs[1].stateKept, true);
  assert.ok(!outputs[1].freshInterpreter);
  const deadline = Date.now() + 20000;
  while (!closed) {
    if (Date.now() > deadline) throw new Error('The suspend hook did not close the sandbox');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await harness.close();
  harness = mockChatAgent(codeChatAgent({ id: 'spreadsheet-replay-new-run', minimumIsolation: floor, idleTimeoutInSeconds: 3 }), { chatId: 'spreadsheet-demo-new-run' });
  await turn('In a new run after suspension, is the previous Python workspace still there?');
  assert.equal(outputs[2].stdout.trim(), 'False');
  assert.equal(outputs[2].freshSandbox, true);

  // Same client, deliberately fresh executions on Docker: exercise the portable pattern
  // without claiming that E2B or Docker Cloud was run or spending on those services.
  const fresh = new CodeSandboxes({ client, sessions: 'never', minimumIsolation: floor, timeoutMs: 30000 });
  let portable;
  try {
    portable = await fresh.run('portable-demo', { language: 'python', files, code: load + '\n' + followup });
    assert.equal(portable.exitCode, 0, JSON.stringify(portable));
    assert.equal(portable.stateKept, false);
    assert.deepEqual(JSON.parse(portable.stdout.trim().split('\n').at(-1)!), expectedRates);
  } finally { await fresh.dispose('portable-demo'); }
  await mkdir('docs/demo', { recursive: true });
  await writeFile('docs/demo/results.json', JSON.stringify({ recordedAt: new Date().toISOString(), mode: 'Scripted model, real local Docker sandbox, Trigger.dev offline chat harness', provider: info.sandbox, floor, csv, code: [load, followup, "print('products' in globals())"], transcripts, portable }, null, 2) + '\n');
  await writeFile('docs/demo/returns.csv', csv);
  console.log('Verified: counts, rates, workspace reuse, close on suspend, fresh workspace after resume, and portable reload. Open docs/demo/index.html through a local web server.');
} finally {
  await harness.close();
  globalThis.fetch = originalFetch;
}
