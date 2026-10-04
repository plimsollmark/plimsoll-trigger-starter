import { tasks } from "@trigger.dev/sdk";

if (!process.env.TRIGGER_SECRET_KEY) {
  throw new Error("Set TRIGGER_SECRET_KEY to this project's production API key before running the deployed trial");
}

const run = await tasks.triggerAndPoll("deployed-cell-trial", {}, { pollIntervalMs: 1000 });
if (run.status !== "COMPLETED" || !run.output?.interpreterReused) {
  throw new Error(`deployed trial failed: ${run.id} (${run.status})`);
}
console.log(JSON.stringify({ runId: run.id, output: run.output }, null, 2));
