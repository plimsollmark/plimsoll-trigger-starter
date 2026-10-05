# Spreadsheet example and provider portability

Goal: give a new Trigger.dev user a visible, reproducible spreadsheet analysis example
and an accurate explanation of moving its code tool between Plimsoll providers.

User requested the example and documentation improvements, and asked whether provider
switching without changing the Trigger.dev application is a useful pitch.

Steps and status:
1. Inspect the integration and verify provider limitations. Done: the tool supports
   automatic sessions or fresh projects; state does not persist on E2B or Docker Cloud.
2. Add a shared spreadsheet scenario, a no-AI local replay through Trigger's chat
   harness, and a light HTML walkthrough with real sandbox results. Pending.
3. Rewrite the README entry point and document provider switching and its limits. Pending.
4. Run npm ci, typecheck, deploy dry run, and the local scenario; inspect the rendered
   page and commit the completed work. Pending.

Scope: starter repository only. No publishing, external posts, live model calls, or
paid sandbox calls. Existing codeChat integration remains the integration under test.
The recorded walkthrough is explicitly scripted, not evidence of model reasoning.
