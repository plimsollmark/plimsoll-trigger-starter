import { existsSync } from "node:fs";
import { defineConfig } from "@trigger.dev/sdk";
import type { BuildExtension } from "@trigger.dev/build";
import { additionalFiles } from "@trigger.dev/build/extensions/core";

// The self-hosted recipe's daemon certificate, which self-hosted/setup.sh writes. When
// it exists, a deploy copies it into the task image and points NODE_EXTRA_CA_CERTS at
// it, so the tasks trust that daemon's certificate on top of the usual public roots.
// A deploy without the recipe is unchanged. See self-hosted/README.md.
const plimsollCert = "./self-hosted/state/tls/cert.pem";

function plimsollDaemonCert(): BuildExtension[] {
  if (!existsSync(plimsollCert)) return [];
  return [
    additionalFiles({ files: [plimsollCert] }),
    {
      name: "plimsoll-daemon-cert",
      onBuildComplete(context) {
        // `trigger dev` runs tasks on this machine, where /app does not exist.
        if (context.target === "dev") return;
        // The task image's Containerfile turns this build argument into the image's
        // NODE_EXTRA_CA_CERTS. Tested with CLI 4.7.2: the variable set in the
        // dashboard is overridden by the image's own empty value, and
        // build.extraCACerts in this file leaves that value empty too.
        context.addLayer({
          id: "plimsoll-daemon-cert",
          build: { env: { NODE_EXTRA_CA_CERTS: `/app/${plimsollCert.slice(2)}` } },
        });
      },
    },
  ];
}

export default defineConfig({
  // Replace this with the project ref from your own Trigger.dev account.
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_replace_me",
  dirs: ["./src/trigger"],
  maxDuration: 3600,
  build: { extensions: plimsollDaemonCert() },
});
