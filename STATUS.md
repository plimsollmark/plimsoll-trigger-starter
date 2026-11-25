# Starter status

2026-11-25: moved to plimsoll v0.29.0: `@plimsollmark/client` 0.29.0 (protocol 8), and the
self-hosted recipe's plimsolld installed from the v0.29.0 module with Go 1.26.11 (the
release's sandbox images now need its native helper as a second build context, which
`setup.sh` exports from the same verified module). The ledger example reads the protocol
number from the client instead of writing it. Ran: npm ci, typecheck, deploy dry run,
the recipe end to end under gVisor (setup, compose up, check.sh, the chat test and the
trial task's run function from the task network, a wrong token refused), and both local
examples against a loopback v0.29.0 daemon, their recorded results regenerated. No model
was called and nothing paid. The self-hosted Trigger.dev deployment was not repeated.
The provider notes now say E2B keeps sessions (plimsoll added them after v0.21.0).

2026-10-05: spreadsheet and execution-ledger examples complete locally. No push or
public deployment was performed. Implementation and validation are recorded in
[PLAN.md](PLAN.md). The root README now leads with the examples and links to
[provider portability](docs/providers.md).

View with the local HTTP command in [the example guide](docs/demo/README.md).
The walkthrough displays recorded results from actual local execution, explicitly
labelled as scripted. It is not a live model chat or upload frontend.

The workspace example uses Trigger.dev's real offline chat harness and Plimsoll's
published client. The ledger example separately invokes the published v0.21.0 signing
CLI and verifies original, corrupted, missing and rolled-back evidence. Its public
fixtures include no signing key. Checksums alone are not signatures; an older valid
ledger requires the independently retained expected request list to detect missing work.

Validation: dependency install, typecheck, deployment dry run, existing chat integration
test, both local examples, desktop/mobile Chromium interaction and visual inspection.
No paid AI or cloud sandbox calls. The spreadsheet does not test a live cloud resume:
it observes closure, then starts a new offline run and verifies its empty workspace.

Next public release step: review the walkthrough, then push this starter only when
Carroll requests publication. No Discord post or other outreach was sent.
