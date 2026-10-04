import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  // Replace this with the project ref from your own Trigger.dev account.
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_replace_me",
  dirs: ["./src/trigger"],
  maxDuration: 3600,
});
