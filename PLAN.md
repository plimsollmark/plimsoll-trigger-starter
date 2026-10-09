# Spreadsheet example and provider portability

Goal: give a new Trigger.dev user a visible, reproducible spreadsheet analysis example
and an accurate explanation of moving its code tool between Plimsoll providers.

User requested the example and documentation improvements, and asked whether provider
switching without changing the Trigger.dev application is a useful pitch.

Steps and status:
1. Inspect the integration and verify provider limitations. Done: the tool supports
   automatic sessions or fresh projects; state does not persist on E2B or Docker Cloud.
2. Add a shared spreadsheet scenario, a no-AI local replay through Trigger's chat
   harness, and a light HTML walkthrough with real sandbox results. Done.
3. Rewrite the README entry point and document provider switching and its limits. Done.
4. Run npm ci, typecheck, deploy dry run, and the local scenario; inspect the rendered
   page and commit the completed work. Done.

Scope: starter repository only. No publishing, external posts, live model calls, or
paid sandbox calls. Existing codeChat integration remains the integration under test.
The recorded walkthrough is explicitly scripted, not evidence of model reasoning.

User steering: add a concrete ledger/checksum example. Implemented a real signed
bundle, response corruption, output editing, missing entry and rollback checks. The
rollback case explicitly compares against the caller's independently saved requests.
Session support verified by checking the current Go provider types: Docker implements
SessionProvider; E2B and DockerCloud do not. OpenShell implements it in its own package.
The first dry run needed the existing project reference instead of the placeholder.
The offline chat harness does not resume an exited run; the replay explicitly starts
a new run after suspension and labels that scope on the page.

Validation completed (re-run 2026-10-09 on `@plimsollmark/client` 0.21.0 against plimsolld
v0.21.0, evidence regenerated): npm ci; TypeScript checks including example scripts; Trigger.dev
deploy dry run with the existing starter project; existing chat integration test against
local Docker/gVisor; spreadsheet replay; signed-ledger replay with the published v0.21.0
CLI; Chromium desktop and mobile interactions, no script errors or horizontal overflow.
No live model or paid sandbox calls. No deployment or push. Preview is local only.
