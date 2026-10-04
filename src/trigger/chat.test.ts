// Drives the chat agent through two real turns with Trigger.dev's offline harness
// (mockChatAgent) and a scripted model, so no AI provider is called, against the
// plimsolld that PLIMSOLL_URL names (PLIMSOLL_TOKEN its caller token). The daemon
// needs sessions and Python. The floor is kernel unless PLIMSOLL_TEST_FLOOR names
// another tier, for a local daemon without gVisor; the deployed agent keeps kernel.
// Skips without PLIMSOLL_URL.

import { mockChatAgent } from "@trigger.dev/sdk/ai/test"; // first: installs the task catalog
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";

import { codeChatAgent } from "./chat.ts";
import { models } from "./models.ts";

const skip = process.env.PLIMSOLL_URL ? false : "needs PLIMSOLL_URL";
const floor = (process.env.PLIMSOLL_TEST_FLOOR ?? "kernel") as "process" | "container" | "kernel" | "vm";

// Count the daemon procedures the agent calls.
const procedures: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = String(input);
  if (process.env.PLIMSOLL_URL && url.startsWith(process.env.PLIMSOLL_URL)) procedures.push(url.split("/").pop()!);
  return realFetch(input, init);
};
after(() => {
  globalThis.fetch = realFetch;
});

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

type Call = { code: string; language?: "python" | "javascript"; files?: { path: string; content: string }[] };

// Each model step either calls executeCode or answers with text.
function scripted(steps: (Call | { text: string })[]) {
  let i = 0;
  return new MockLanguageModelV3({
    doStream: async () => {
      const step = steps[i++] ?? { text: "done" };
      const chunks: any[] =
        "code" in step
          ? [
              { type: "tool-call", toolCallId: `call-${i}`, toolName: "executeCode", input: JSON.stringify(step) },
              { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_use" }, usage },
            ]
          : [
              { type: "text-start", id: "t" },
              { type: "text-delta", id: "t", delta: step.text },
              { type: "text-end", id: "t" },
              { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
            ];
      return { stream: simulateReadableStream({ chunks }) };
    },
  });
}

const user = (id: string, text: string) => ({ id, role: "user" as const, parts: [{ type: "text" as const, text }] });
const outputs = (chunks: any[]) => chunks.filter((c) => c.type === "tool-output-available").map((c) => c.output);
const count = (name: string) => procedures.filter((p) => p === name).length;

async function until(cond: () => boolean, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 100));
  }
}

// A 3 s idle window instead of Trigger.dev's default 30 s, so the suspend check does
// not wait half a minute; the second turn, sent the moment the first ends, is well
// inside it.
const agent = codeChatAgent({ id: "code-chat-test", idleTimeoutInSeconds: 3, minimumIsolation: floor });

test("one sandbox per run: a variable from the first turn is still there in the second, closed at suspend", { skip, timeout: 120_000 }, async () => {
  // One model across both turns, so the second turn continues the script.
  const model = scripted([
    { code: "import csv\nrows = list(csv.DictReader(open('orders.csv')))", files: [{ path: "orders.csv", content: "id,total\n1,30\n2,12\n" }] },
    { code: "len(rows)" },
    { text: "first" },
    { code: "sum(float(r['total']) for r in rows)" },
    { text: "second" },
  ]);
  models.chat = () => model;
  const harness = mockChatAgent(agent, { chatId: "chat-1" });
  try {
    const first = outputs((await harness.sendMessage(user("u1", "load the orders and count them"))).chunks);
    assert.equal(first.length, 2);
    for (const o of first) {
      assert.equal(o.exitCode, 0, JSON.stringify(o));
      assert.equal(o.stateKept, true);
      assert.equal(o.isolation, floor);
      assert.match(o.recordSha256, /^[0-9a-f]{64}$/, "the tool exposes its checked record");
    }
    assert.equal(first[1].stdout.trim(), "2");

    // The next turn, before the idle window passes: the same interpreter still holds rows.
    const [second] = outputs((await harness.sendMessage(user("u2", "and the total?"))).chunks);
    assert.equal(second.stdout.trim(), "42.0");
    assert.equal(second.freshInterpreter, undefined, "the interpreter was kept, so the flag is absent");
    assert.notEqual(second.recordSha256, first[1].recordSha256);
    assert.equal(count("OpenSession"), 1);
    assert.equal(count("CloseSession"), 0);

    // Idle: onChatSuspend closes the sandbox right before the run sleeps.
    await until(() => count("CloseSession") === 1, 60_000);
  } finally {
    await harness.close();
  }
});
