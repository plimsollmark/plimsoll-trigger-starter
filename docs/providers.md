# Change the execution provider without replacing your Trigger.dev code tool

The application calls `@plimsollmark/client/trigger` and its `executeCode` tool.
The Plimsoll daemon selects the backend. Switching that selection keeps the tool's
input and output interface, but does not make backend capabilities identical.

## What stays and what can change

| Property | Switching behavior |
|---|---|
| Trigger.dev tool integration | Keep the existing Plimsoll client and `executeCode` tool. |
| Daemon connection | Keep the URL if reconfiguring that daemon, or set `PLIMSOLL_URL` and `PLIMSOLL_TOKEN` for another daemon. |
| Provider credentials and images | Configure these on the daemon. Do not add provider keys to the chat tool. |
| Python and installed libraries | Ensure the target image/template supplies them. An unchanged tool cannot supply a missing dependency. |
| Isolation requirement | The starter defaults to `kernel`. A lower tier is refused, not silently accepted. |
| Workspace state | Docker and OpenShell support Plimsoll sessions. E2B and Docker Cloud currently use fresh executions through Plimsoll. |
| Run records | The client checks returned records. A signed bundle additionally needs the external signing harness. |
| Operating cost | Local infrastructure and hosted provider charges differ. Changing providers is not a cost-neutral promise. |

These are Plimsoll adapter capabilities, not claims about all features the vendors offer.
The WASM provider only runs JavaScript snippets and is not a replacement for this
Python/project-based example. OpenShell's container tier does not meet this starter's
default kernel floor. Docker reaches kernel tier only with verified gVisor configuration.

## Two application patterns

**Persistent workspace:** load data once and reuse variables in follow-up calls. Require
a session-capable daemon, Python in its project image, and enabled sessions. The
`deployed-cell-trial` intentionally refuses a backend without these capabilities.

**Portable fresh calls:** attach required files and include setup in every call. The
spreadsheet replay demonstrates this with `sessions: "never"` on local Docker and
checks it returns the same rates. That is a local behavior check, not a live test of
E2B or Docker Cloud. The chat model must honor `stateKept` and `freshSandbox` and reload
what it needs; an automatic fallback cannot preserve missing Python variables.

## Switching procedure

1. Read the target provider's setup instructions and prepare its image, credentials and
   resource limits. Current daemon settings:
   [EXTERNAL · provider guide ↗](https://github.com/plimsollmark/plimsoll/blob/main/AGENTS.md#providers-sandbox_provider).
2. Start the target daemon and inspect `Describe`, the API that states its capabilities.
   Confirm Python, project support, isolation and, if needed, sessions. Do not lower a
   security requirement simply to make a trial pass.
3. Configure the Trigger.dev worker's daemon URL and caller token. For hosted providers,
   estimate and approve the provider spend before live use. The examples here refuse
   remote endpoints and non-Docker providers to avoid paid test runs.
4. Exercise a representative task and its follow-up. A refused isolation floor or
   missing language is a failed migration; a successful first call alone does not prove
   that a state-dependent follow-up works.

Suggested pitch: **“Keep your Trigger.dev code tool when changing sandbox providers.
Plimsoll provides a common execution interface, with explicit isolation and state
capabilities and checked run records.”** Do not promise identical behavior on every
backend or zero application changes for workloads that depend on persistence.
