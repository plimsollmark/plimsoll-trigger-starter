// A real signed execution ledger. Uses the public Plimsoll CLI, never implements
// a second verifier. Synthetic inputs only; temporary signing key is deleted.
import { PlimsollClient } from '@plimsollmark/client';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { csv } from '../src/demo/scenario.ts';

const url = process.env.PLIMSOLL_URL;
if (!url || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Use a local Docker daemon via PLIMSOLL_URL.');
const info = await new PlimsollClient({ baseUrl: url, token: process.env.PLIMSOLL_TOKEN }).describe();
if (info.sandbox !== 'docker') throw new Error('This example refuses paid providers.');
const binary = process.env.PLIMSOLL_ATTEST_BIN ?? 'plimsoll-attest';
const floor = process.env.PLIMSOLL_TEST_FLOOR ?? 'kernel';
if (!['container', 'kernel'].includes(floor)) throw new Error('Use kernel or container for this local sample.');
await mkdir('tmp', { recursive: true });
await mkdir('docs/demo/ledger', { recursive: true });
const dir = await mkdtemp(resolve('tmp/ledger-'));
const bundle = join(dir, 'bundle.jsonl');
const key = join(dir, 'harness');
const expected: string[] = [];
function cli(args: string[], pass = true) {
  const run = spawnSync(binary, args, { encoding: 'utf8', timeout: 60000, env: { ...process.env, PLIMSOLL_CALLER_TOKEN: process.env.PLIMSOLL_TOKEN ?? '' } });
  if (run.error) throw run.error;
  const detail = (run.stdout + run.stderr).trim();
  if (pass) assert.equal(run.status, 0, detail);
  else assert.notEqual(run.status, 0, 'Tampered bundle unexpectedly passed');
  return { accepted: run.status === 0, detail };
}
const parse = `const lines = ${JSON.stringify(csv)}.trim().split(String.fromCharCode(10));
const products = new Map();
for (const line of lines.slice(1)) {
  const [name, period, shipped, returned] = line.split(',');
  if (!products.has(name)) products.set(name, {});
  products.get(name)[period] = { shipped: Number(shipped), returned: Number(returned) };
}
`;
const codes = [
  parse + `console.log(JSON.stringify([...products].map(([product,p]) => ({product, previous:p.previous.returned, current:p.current.returned, increase:p.current.returned-p.previous.returned})).sort((a,b)=>b.increase-a.increase)))`,
  parse + `console.log(JSON.stringify([...products].map(([product,p]) => ({product, previous:100*p.previous.returned/p.previous.shipped, current:100*p.current.returned/p.current.shipped}))))`,
];
try {
  cli(['keygen', '-out', key]);
  let earlier = '';
  const runs = [];
  for (let i = 0; i < codes.length; i++) {
    const request = { protocol: 2, minimumIsolation: floor, javascript: { code: codes[i] } };
    const file = join(dir, `request-${i+1}.json`);
    await writeFile(file, JSON.stringify(request));
    const run = cli(['run', '-daemon', url, '-key', key + '.key', '-bundle', bundle, file]);
    assert.match(run.detail, /exit 0/, 'Both calculations must succeed');
    const digest = /; request ([a-f0-9]{64})/.exec(run.detail)?.[1];
    assert.ok(digest, 'CLI must return the request digest for our independent expected list');
    expected.push(digest);
    runs.push({ name: i === 0 ? 'Count returned products' : 'Compare return rates', requestSha256: digest, detail: run.detail.replaceAll(dir, '<example-directory>') });
    if (i === 0) earlier = await readFile(bundle, 'utf8');
  }
  const expect = join(dir, 'expected.txt');
  await writeFile(expect, expected.join('\n') + '\n');
  const verify = (file: string, pass: boolean, requireExpected = true) => cli(['verify', '-pub', key + '.pub', ...(requireExpected ? ['-expect', expect] : []), file], pass);
  const checks = [{ name: 'Original ledger: both expected calculations', ...verify(bundle, true) }];
  const alteredClient = new PlimsollClient({ baseUrl: url, token: process.env.PLIMSOLL_TOKEN, fetch: async (input, init) => {
    const response = await fetch(input, init);
    if (!String(input).endsWith('/Run') || !response.ok) return response;
    const body = await response.json() as any;
    assert.equal(Buffer.from(body.javascript.stdout, 'base64').toString(), '24 returns\n');
    body.javascript.stdout = Buffer.from('20 returns\n').toString('base64');
    return new Response(JSON.stringify(body), { status: response.status, headers: { 'content-type': 'application/json' } });
  }});
  await assert.rejects(() => alteredClient.runJavaScript('console.log("24 returns")', { minimumIsolation: floor as 'kernel' | 'container' }), (error: any) => {
    assert.equal(error.code, 'data_loss');
    checks.push({ name: 'Client checksum check: changed response rejected before delivery', accepted: false, detail: error.message });
    return true;
  });
  const original = await readFile(bundle, 'utf8');
  const lines = original.trim().split(String.fromCharCode(10));
  const edited = JSON.parse(lines[0]);
  const response = Buffer.from(edited.response, 'base64');
  const offset = response.indexOf(Buffer.from('"current":24'));
  assert.ok(offset >= 0, 'Find the real returned value before changing it: ' + response.toString('utf8'));
  response.write('"current":20', offset, 'utf8');
  edited.response = response.toString('base64');
  const changed = join(dir, 'changed-output.jsonl');
  await writeFile(changed, [JSON.stringify(edited), ...lines.slice(1)].join('\n') + '\n');
  checks.push({ name: 'Changed output: 24 returns changed to 20', ...verify(changed, false) });
  const removed = join(dir, 'missing-run.jsonl');
  await writeFile(removed, lines.slice(1).join('\n') + '\n');
  checks.push({ name: 'First calculation removed', ...verify(removed, false) });
  const rollback = join(dir, 'earlier-valid-bundle.jsonl');
  await writeFile(rollback, earlier);
  checks.push({ name: 'Earlier valid ledger, signatures only: accepted', ...verify(rollback, true, false) });
  checks.push({ name: 'Earlier ledger against both expected requests: rejected', ...verify(rollback, false) });
  for (const [source, name] of [[bundle, 'bundle.jsonl'], [key + '.pub', 'harness.pub'], [expect, 'expected.txt'], [changed, 'changed-output.jsonl'], [removed, 'missing-run.jsonl'], [rollback, 'earlier-valid-bundle.jsonl']]) {
    await copyFile(source!, `docs/demo/ledger/${name}`);
  }
  await writeFile('docs/demo/ledger/results.json', JSON.stringify({ recordedAt: new Date().toISOString(), provider: info.sandbox, floor, runs, checks }, null, 2) + '\n');
  console.log('Verified original, changed output, missing run, and rollback against independently saved request list. Published only the public key, never the signing key.');
} finally {
  await rm(dir, { recursive: true, force: true });
}
