#!/bin/sh
# Asks plimsolld what it is, the way a task run will: from a throwaway container on
# the plimsoll-sandbox network, at https://plimsolld:8746, trusting only the daemon's
# certificate, with the caller token. Prints the daemon's answer and no secret.
#
#   ./check.sh [token-file]    default: state/caller-token
set -eu
cd "$(dirname "$0")"
[ -f .env ] || { echo "check: run ./setup.sh first" >&2; exit 1; }
image=$(sed -n 's/^SANDBOX_DOCKER_IMAGE=//p' .env)
token_file=${1:-state/caller-token}
[ -r "$token_file" ] || { echo "check: no token file at $token_file" >&2; exit 1; }

PLIMSOLL_TOKEN=$(cat "$token_file")
export PLIMSOLL_TOKEN
# -e PLIMSOLL_TOKEN with no value copies it from this environment, so the token is
# never on a command line.
exec docker run --rm --network plimsoll-sandbox --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true \
  -e PLIMSOLL_TOKEN -e NODE_EXTRA_CA_CERTS=/ca.pem \
  -v "$(pwd)/state/tls/cert.pem:/ca.pem:ro" \
  --entrypoint node "$image" --input-type=module -e '
const res = await fetch("https://plimsolld:8746/plimsoll.v1.SandboxService/Describe", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Connect-Protocol-Version": "1",
    Authorization: `Bearer ${process.env.PLIMSOLL_TOKEN}`,
  },
  body: "{}",
});
const body = await res.json();
if (!res.ok) { console.error(`Describe answered HTTP ${res.status}:`, body); process.exit(1); }
console.log(JSON.stringify({
  sandbox: body.sandbox,
  isolation: body.isolation,
  supportsSessions: body.supportsSessions ?? false,
  sessionLanguages: body.sessionEnvironment?.languages ?? [],
  resources: body.resources,
}, null, 2));
'
