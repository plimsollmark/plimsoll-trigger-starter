import { randomUUID } from "node:crypto";
import { task } from "@trigger.dev/sdk";
import { CodeSandboxes, PlimsollClient } from "@plimsollmark/client";

// This task makes no AI call. It proves the deployed worker can reach a real
// plimsolld, keep one Python interpreter for two cells, enforce the floor, and
// receive a checked run-record digest for each call.
export const deployedCellTrial = task({
  id: "deployed-cell-trial",
  maxDuration: 120,
  retry: { maxAttempts: 1 },
  run: async () => {
    const url = process.env.PLIMSOLL_URL;
    const token = process.env.PLIMSOLL_TOKEN;
    if (!url || !token) throw new Error("PLIMSOLL_URL and PLIMSOLL_TOKEN are required");
    const sandboxes = new CodeSandboxes({
      client: new PlimsollClient({ baseUrl: url, token }),
      sessions: "always",
      languages: ["python"],
      minimumIsolation: "kernel",
      timeoutMs: 30_000,
    });
    const key = randomUUID();
    try {
      const first = await sandboxes.run(key, { code: "numbers = [2, 3, 5]\nlen(numbers)" });
      const second = await sandboxes.run(key, { code: "sum(numbers)" });
      if (first.exitCode !== 0 || first.stdout.trim() !== "3" || !first.stateKept || !first.freshInterpreter || !first.freshSandbox) {
        throw new Error(`first cell failed: ${JSON.stringify(first)}`);
      }
      if (second.exitCode !== 0 || second.stdout.trim() !== "10" || !second.stateKept || second.freshInterpreter || second.freshSandbox) {
        throw new Error(`second cell did not reuse the interpreter: ${JSON.stringify(second)}`);
      }
      if (first.isolation !== "kernel" || second.isolation !== "kernel") throw new Error("the kernel isolation floor was not met");
      if (!/^[0-9a-f]{64}$/.test(first.recordSha256) || !/^[0-9a-f]{64}$/.test(second.recordSha256)) {
        throw new Error("a checked run-record digest is missing");
      }
      if (first.recordSha256 === second.recordSha256) throw new Error("the two cells returned the same record digest");
      return {
        first: { stdout: first.stdout, isolation: first.isolation, recordSha256: first.recordSha256 },
        second: { stdout: second.stdout, isolation: second.isolation, recordSha256: second.recordSha256 },
        interpreterReused: true,
      };
    } finally {
      await sandboxes.dispose(key);
    }
  },
});
