# Spreadsheet workspace and execution ledger

This example has two independently reproducible parts:

1. **Spreadsheet workspace:** the actual Trigger.dev chat integration, driven by a
   scripted model through its offline harness, calls a real local Plimsoll sandbox.
   It loads the synthetic CSV, computes return counts and rates, reuses Python state,
   observes sandbox closure on suspension, and starts a new run without old variables.
2. **Execution ledger:** Plimsoll's real `plimsoll-attest` command executes two JavaScript
   calculations over the same data and signs their checked records. It verifies the
   original and rejects modified or incomplete evidence. A separate TypeScript client
   call demonstrates automatic rejection of a corrupted response.

The second part is a separate signing integration example, not automatic signing inside
`executeCode`. Neither part calls an AI provider, Trigger.dev Cloud tasks, E2B, or Docker
Cloud. This demonstrates execution and verification, not the quality of an AI model.

## View the recorded walkthrough

From the starter repository root:

```sh
python3 -m http.server 18865 --bind 127.0.0.1 --directory docs/demo
```

Open [the local walkthrough](http://localhost:18865/). Click **Analyse a spreadsheet**,
then **Follow-up**. The sample shows trail-shoe returns increasing from 8 to 24 and
their return rate from 4% to 12%, with unchanged shipments. These numbers come from
six synthetic rows, chosen to separate a change in return rate from sales volume.
They are not customer measurements or a causal diagnosis.

Click **Catch changed or missing results** and choose each verification case. All
results are recorded from the real commands, with the raw fixtures beside the page.
The browser displays recorded verifier output; it does not verify signatures itself.
A loading error means the JSON files could not be fetched; serve this directory over
HTTP, not by opening the HTML file directly.

## Reproduce the workspace locally

Use the [self-hosted recipe](../../self-hosted/README.md) or an existing local Docker
Plimsoll daemon with Python, sessions and verified gVisor. The replay defaults to the
kernel isolation tier. `PLIMSOLL_TEST_FLOOR=container` is available only for running
this fixed, trusted example without gVisor; it is not suitable for hostile code.

```sh
npm ci
npm run typecheck
# Set PLIMSOLL_URL to your local daemon and PLIMSOLL_TOKEN from your secret manager.
npm run demo
```

The replay checks counts, rates, interpreter reuse, closure on suspension and a fresh
workspace in a new run. It also executes the portable pattern, attaching the file and
setup on a fresh call, using local Docker only. Failure exits nonzero and does not write
a new successful result file. A previous result file, if present, remains dated; do not
mistake it for evidence of the failed run.

The script lives in [scripts/replay-demo.ts](../../scripts/replay-demo.ts); sample data
and Python live in [src/demo/scenario.ts](../../src/demo/scenario.ts). The first tool
call attaches the CSV as a file. This walkthrough does not include a live upload/chat
frontend; to build one, connect Trigger.dev's chat transport and supply uploaded files
through an authenticated application tool. Do not trust a user-supplied conversation ID.

## Reproduce the ledger

Install the public command with Go 1.26.6 or newer:

```sh
go install github.com/plimsollmark/plimsoll/cmd/plimsoll-attest@v0.19.0
```

Put Go's binary directory on your PATH, or set `PLIMSOLL_ATTEST_BIN` to that binary's
absolute path. With the same local Docker daemon settings as above:

```sh
npm run demo:ledger
```

The script saves public evidence under `docs/demo/ledger/`. It generates a temporary
signing key inside the ignored `tmp/` directory and deletes it on completion. The public
key is kept for verification. Do not use this disposable example key as a production
trust anchor. For production, retain the harness's trusted public key and expected
request list independently of the bundle being checked.

From `docs/demo/ledger/`, verify the recorded fixtures without any daemon:

```sh
plimsoll-attest verify -pub harness.pub -expect expected.txt bundle.jsonl
plimsoll-attest verify -pub harness.pub -expect expected.txt changed-output.jsonl
plimsoll-attest verify -pub harness.pub -expect expected.txt missing-run.jsonl
plimsoll-attest verify -pub harness.pub earlier-valid-bundle.jsonl
plimsoll-attest verify -pub harness.pub -expect expected.txt earlier-valid-bundle.jsonl
```

Expected results, in order: pass, reject, reject, pass, reject. The earlier valid bundle
passes its signatures and links. The separately saved list reveals that the later
calculation is missing. This is why integrity and completeness are different checks.
The ledger includes one signed checkpoint per CLI invocation; checkpoints are not
additional code executions.

A checksum detects disagreement between data and its recorded fingerprint. A signer
with a trusted key makes later modifications detectable; signatures do not prove that
the program's answer is correct or that the host is honest. Production signing belongs
outside the execution daemon, as implemented by the Plimsoll harness.

[EXTERNAL · run-record documentation ↗](https://github.com/plimsollmark/plimsoll/blob/main/docs/run-records.md)

## Run a real model

The existing `code-chat` task can use a real model, following the root README, but that
spends the model provider's credits. This walkthrough does not require it. The model's
code and answers can differ from this fixed script; the script is a reproducible
integration example, not evidence that a model will always produce these answers.
