# plimsoll Trigger.dev starter

A deployable Trigger.dev chat agent with a plimsoll `executeCode` tool, plus a
deterministic deployed task that tests the connection without making an AI call.
The tool returns cell persistence flags, the isolation tier, and the SHA-256 of
the run record checked by the client. The digest is a consistency check, not a
signature or proof that guest code computed honestly. See the
[plimsoll feature guide](https://github.com/plimsollmark/plimsoll/blob/main/docs/trigger-dev.md).

## What runs

| File | Purpose |
|---|---|
| `src/trigger/chat.ts` | Chat agent. Warm one sandbox per Trigger.dev run, use Python or JavaScript cells, close on suspend or completion. |
| `src/trigger/trial.ts` | Deployed task. Run two Python cells in one session and verify the second sees the first cell's variable, both meet the kernel floor, and both carry distinct checked record digests. It makes no AI call. |

The chat agent uses a bring-your-own Anthropic API key. Calling that agent
spends Anthropic credits according to your account and model; the deployed
trial task does not load or call it. Trigger.dev bills active task compute;
check its [current pricing](https://trigger.dev/pricing) before use.

## Prepare plimsolld

1. Build and configure a plimsoll daemon following its
   [getting started](https://github.com/plimsollmark/plimsoll/blob/main/docs/getting-started.md),
   [caller](https://github.com/plimsollmark/plimsoll/blob/main/docs/callers.md), and
   [hardened mode](https://github.com/plimsollmark/plimsoll/blob/main/docs/hardened-mode.md)
   guides. Its caller token needs `code:run`. Keep that token in a secret manager.
2. Use a provider with sessions and verified `kernel` isolation. For Docker,
   configure the project image with Python, `SANDBOX_MAX_SESSIONS` greater
   than zero, and `SANDBOX_DOCKER_RUNTIME=runsc`. Verify `Describe` reports
   `supportsSessions: true`, `python` in the project languages, and `kernel`
   isolation. Set resource, total memory, session and per-caller caps for your
   host. Start with `PLIMSOLL_HARDENED=1` for a production deployment and
   resolve every startup refusal.
3. Give the Trigger.dev worker a reachable HTTPS URL. The worker's `localhost`
   is not your daemon's machine. Put TLS and bearer authentication in front of
   the daemon, restrict exposure where possible, and confirm a request from
   outside the daemon host reaches it. A temporary tunnel is suitable for a
   controlled trial; operate a stable ingress for production.

`minimumIsolation: "kernel"` is in both tasks. Hostile code from untrusted
tenants must use a verified kernel or VM boundary. If your threat model calls
for a VM, set `minimumIsolation: "vm"` and use a VM provider. Current VM
providers do not keep cells, so this starter's persistence-dependent trial
will refuse; adapt the chat agent to fresh calls and heed `stateKept: false`.
The in-tree plimsoll example's `container` floor is a local demonstration,
not this production default.

## Test

`npm test` drives the chat agent through two turns with Trigger.dev's offline
harness and a scripted model, so it calls no AI provider, against the daemon that
`PLIMSOLL_URL` names (with `PLIMSOLL_TOKEN`). The daemon needs sessions and Python.
The test holds the agent to the `kernel` floor; set `PLIMSOLL_TEST_FLOOR=container`
for a local daemon without gVisor. It checks that a variable defined in the first
turn is still defined in the second, that every result carries a checked record
digest, and that the session closes when the run suspends. Without `PLIMSOLL_URL`
it skips.

## Deploy

1. Create a Trigger.dev project and copy its `proj_...` reference. Install
   Node.js 22.18 or later, then run `npm ci` and `npm run typecheck` here.
2. Set `TRIGGER_PROJECT_REF` for the CLI, or replace the placeholder in
   `trigger.config.ts`. In the Trigger.dev project's production environment,
   set `PLIMSOLL_URL` to the reachable HTTPS URL and `PLIMSOLL_TOKEN` as a
   secret. The client refuses cleartext HTTP outside loopback.
3. Run `npm run deploy -- --dry-run`, then `npm run deploy`. The project should
   list `code-chat` and `deployed-cell-trial` as deployed tasks.
4. Get a production API key with permission to trigger the trial task. Supply
   it as `TRIGGER_SECRET_KEY` in your shell or secret manager and run
   `npm run trial`. The command prints the run ID, `3` then `10`, `kernel` for
   both cells, distinct 64-character record digests, and
   `interpreterReused: true`. A failed floor or broken session makes the task
   fail and the command exits nonzero. Remove the key from the shell afterward.

Before serving outside users, run `npm audit --omit=dev` and `npm audit`
against the lockfile. The `ws` override pins the
[EXTERNAL · GitHub advisory's patched version ↗](https://github.com/advisories/GHSA-96hv-2xvq-fx4p)
because Trigger.dev's CLI dependency still selects an older one. On 2026-10-04
the production dependency audit found zero advisories; the full audit still
reported advisories in development tools. The task trial tests execution
behavior; it does not clear later dependency advisories.

The chat agent needs `ANTHROPIC_API_KEY` in Trigger.dev's production environment
only when you choose to call it. Wire a frontend with
[Trigger.dev's chat transport guide](https://trigger.dev/docs/ai-chat/frontend).
The chat's key is Trigger.dev's run ID, not a model-supplied value. A
production multi-user service must bind its Trigger.dev conversation to the
authenticated user's identity before sending messages. plimsoll binds a
session to its caller credential, not to the end user behind that credential.
See [who may share a session](https://github.com/plimsollmark/plimsoll/blob/main/docs/sessions.md#who-may-share-a-session).

If a worker dies before its suspend or completion hook, its client cannot
close the session. plimsoll's session idle timeout and lifetime bound how long
it remains; the add-on's idle close handles a worker that stays alive. Keep
those limits set and monitor ended sessions.
