#!/bin/sh
# Prepares plimsolld beside a self-hosted Trigger.dev worker. Run it from anywhere on
# the worker host, as a user who can run docker; README.md in this directory says
# what each step is for. Safe to re-run: it rebuilds the images and rewrites .env,
# and keeps an existing caller registry, token file and TLS certificate.
#
#   PLIMSOLL_RUNTIME=runc ./setup.sh   force runc even where gVisor is installed
set -eu
umask 077
cd "$(dirname "$0")"
here=$(pwd)
state="$here/state"

# The plimsoll release and the snippet image, both pinned. The module hash is the one
# sum.golang.org records for this version; plimsolld.Dockerfile checks it too.
version=v0.19.0
node_image=node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402

say() { printf '%s\n' "$*" >&2; }
die() { say "setup: $*"; exit 1; }

[ "$(uname -s)" = Linux ] || die "plimsoll's docker provider needs a Linux docker host (gVisor is Linux-only)"
command -v docker >/dev/null || die "docker is not installed"
docker compose version >/dev/null 2>&1 || die "the docker compose plugin is not installed"
command -v openssl >/dev/null || die "openssl is needed to make the daemon's TLS certificate"
[ -S /var/run/docker.sock ] || die "no docker socket at /var/run/docker.sock (plimsolld reaches the local daemon there)"

# A locally built image can be pinned by digest only in the containerd image store,
# where its ID is the digest of its index. The classic store has no such digest.
docker info --format '{{json .DriverStatus}}' | grep -q 'io.containerd.snapshotter' \
  || die "docker is not using the containerd image store, so the sandbox images built here cannot be pinned by digest; enable it (https://docs.docker.com/engine/storage/containerd/) and re-run"

# gVisor when docker has runsc registered, runc otherwise, unless PLIMSOLL_RUNTIME says.
runtime=${PLIMSOLL_RUNTIME:-}
if [ -z "$runtime" ]; then
  if docker info --format '{{json .Runtimes}}' | grep -q '"runsc"'; then runtime=runsc; else runtime=runc; fi
fi
case "$runtime" in
  runsc)
    docker info --format '{{json .Runtimes}}' | grep -q '"runsc"' || die "PLIMSOLL_RUNTIME=runsc but docker has no runsc runtime registered"
    docker info --format '{{json .Runtimes}}' | grep -q 'host-uds=open' \
      || die "runsc is registered without --host-uds=open, so a sandbox could not reach plimsolld's per-run socket; register it as plimsoll's docker/install-gvisor.sh does"
    ;;
  runc) ;;
  *) die "PLIMSOLL_RUNTIME must be runc or runsc, not $runtime" ;;
esac

# plimsolld makes a Unix socket per run in this directory, and the host's docker daemon
# mounts it into the sandbox by the same path, so the path is identical inside and
# outside plimsolld's container. A socket path is at most 107 bytes and plimsoll adds
# up to 45 to this directory's, hence the 60-character limit.
run_dir=${PLIMSOLL_RUN_DIR:-$state/run}
case "$run_dir" in /*) ;; *) die "PLIMSOLL_RUN_DIR must be an absolute path" ;; esac
[ "${#run_dir}" -le 60 ] || die "$run_dir is ${#run_dir} characters, over the 60 a Unix socket path leaves; set PLIMSOLL_RUN_DIR to a shorter directory this user owns, for example: sudo install -d -m 700 -o \"\$(id -u)\" -g \"\$(id -g)\" /var/lib/plimsoll-run && PLIMSOLL_RUN_DIR=/var/lib/plimsoll-run ./setup.sh"
mkdir -p "$run_dir" "$state/tls" "$state/src"
[ -d "$run_dir" ] && [ ! -L "$run_dir" ] && [ "$(stat -c %u "$run_dir")" = "$(id -u)" ] || die "$run_dir must be a directory this user owns, not a link"
chmod 700 "$run_dir"

say "1/5 building plimsolld $version from the Go module (checked against sum.golang.org and a pinned hash)"
docker build -q -f plimsolld.Dockerfile -t "plimsoll-selfhost/plimsolld:$version" . >/dev/null
rm -rf "$state/src/docker"
docker build -q -f plimsolld.Dockerfile --target sandbox-context --output "type=local,dest=$state/src/docker" . >/dev/null

say "2/5 building the sandbox images from the same module, on the pinned node:22-alpine"
docker pull -q "$node_image" >/dev/null
docker build -q --build-context "node:22-alpine=docker-image://$node_image" \
  -t "plimsoll-selfhost/sandbox:$version" "$state/src/docker" >/dev/null
# python.Dockerfile builds FROM plimsoll/sandbox:latest. Point that line at the base
# just built instead of retagging it (a local plimsoll/sandbox:latest may be someone
# else's build). It names the local tag: BuildKit looks a digest reference up in a
# registry, and this image is in none. Nothing else in the file changes.
base="plimsoll-selfhost/sandbox:$version"
sed "s|^FROM plimsoll/sandbox:latest\$|FROM $base|" "$state/src/docker/python.Dockerfile" >"$state/src/python.Dockerfile"
grep -q "^FROM $base\$" "$state/src/python.Dockerfile" || die "python.Dockerfile no longer starts FROM plimsoll/sandbox:latest"
docker build -q -f "$state/src/python.Dockerfile" -t "plimsoll-selfhost/sandbox-python:$version" "$state/src/docker" >/dev/null

digest() { docker image inspect --format '{{index .RepoDigests 0}}' "$1"; }
plimsolld_image=$(digest "plimsoll-selfhost/plimsolld:$version")
project_image=$(digest "plimsoll-selfhost/sandbox-python:$version")
case "$plimsolld_image$project_image" in
  *@sha256:*@sha256:*) ;;
  *) die "could not read the digests of the images just built" ;;
esac

say "3/5 caller registry"
if [ -f "$state/clients.json" ]; then
  say "    keeping $state/clients.json"
else
  docker run --rm --network none --user "$(id -u):$(id -g)" -v "$state:/state" \
    --entrypoint plimsoll-clients "$plimsolld_image" \
    create -file /state/clients.json -id trigger-worker -token-stdout >"$state/caller-token"
  say "    created caller trigger-worker; its token is in $state/caller-token (mode 600)"
fi

say "4/5 TLS certificate for https://plimsolld:8746"
if [ -f "$state/tls/cert.pem" ]; then
  say "    keeping $state/tls/cert.pem"
else
  # Self-signed for the one name the task runs use. 365 days, so it is replaced yearly:
  # delete state/tls, re-run, restart plimsolld and redeploy the tasks.
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -days 365 \
    -subj /CN=plimsolld -addext subjectAltName=DNS:plimsolld \
    -keyout "$state/tls/key.pem" -out "$state/tls/cert.pem" 2>/dev/null
  chmod 644 "$state/tls/cert.pem"
fi

say "5/5 writing .env"
if [ "$runtime" = runsc ]; then
  compose_file=compose.yaml:compose.runsc.yaml hardened=1 floor=kernel
else
  compose_file=compose.yaml hardened=0 floor=container
fi
cat >.env <<EOF
# Written by setup.sh; re-run it rather than editing these lines.
COMPOSE_PROJECT_NAME=plimsoll-selfhost
COMPOSE_FILE=$compose_file
PLIMSOLLD_IMAGE=$plimsolld_image
SANDBOX_DOCKER_IMAGE=$node_image
SANDBOX_DOCKER_PROJECT_IMAGE=$project_image
SANDBOX_DOCKER_RUNTIME=$( [ "$runtime" = runsc ] && echo runsc )
PLIMSOLL_HARDENED=$hardened
SANDBOX_MIN_ISOLATION=$floor
PLIMSOLL_STATE_DIR=$state
PLIMSOLL_RUN_DIR=$run_dir
PLIMSOLL_UID=$(id -u)
PLIMSOLL_GID=$(id -g)
DOCKER_GID=$(stat -c %g /var/run/docker.sock)
EOF

if [ "$runtime" = runsc ]; then
  say "runtime: runsc (gVisor). plimsolld starts in hardened mode and refuses to serve below the kernel tier."
else
  say "runtime: runc. Runs get the container tier: guest code shares this host's kernel. Hardened mode is off"
  say "because it requires kernel or vm. Install gVisor and re-run setup.sh before running code you do not trust."
fi
say "next: docker compose up -d   (in $here)"
