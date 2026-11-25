# plimsolld for a self-hosted Trigger.dev worker host.
#
# plimsoll publishes no daemon binary or container image, so this builds one from the
# tagged Go module. `go mod download` checks the module against Go's checksum database
# (sum.golang.org), and the build then also compares it with the hash pinned below, so
# a changed tag or a proxy serving other bytes fails the build instead of shipping.
# Every base image is pinned by digest.
#
# Stages:
#   source           the verified module tree
#   sandbox-context  its docker/ directory and the native helper's committed build
#                    (sandbox/internal/nativehelper/program), which setup.sh exports to
#                    build the sandbox images from the same verified bytes
#   build            plimsolld and plimsoll-clients, static, installed from the same
#                    verified module by its version, so plimsolld states that version
#                    (daemon_version) on every answer and run record
#   final            the two binaries, the docker CLI, and plimsoll's audited
#                    seccomp profile (docker/seccomp.json in the module)

# Go 1.26.11 or later: plimsoll's agent guide says to build plimsolld with it, since
# 1.26.10 carries GO-2026-6859 (an HTTP/1 server panic in a path plimsolld's request
# body cap takes) and earlier 1.26 releases carry further advisories in code it runs.
ARG GO_IMAGE=golang:1.26.11-alpine@sha256:ecb67f987aa1a57794c91d19ade7ae0209f2f0f5496aaef9e6ae85ddf92d02ab
ARG DOCKER_CLI_IMAGE=docker:29.1.3-cli@sha256:4fa0ee1f3a7e4354c4ea34558b6d4ee32859baf4973d4c8ccc8e7fe3dd730c04
ARG BASE_IMAGE=alpine:3.24@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6

FROM ${GO_IMAGE} AS source
ARG PLIMSOLL_VERSION=v0.29.0
ARG PLIMSOLL_MODULE_SUM=h1:rUEXuwT4pH/sM26zWba+b42qQJrNAMbiguw0gtjuEN8=
ENV GOTOOLCHAIN=local
RUN set -eu; \
    go mod download -json "github.com/plimsollmark/plimsoll@${PLIMSOLL_VERSION}" > /tmp/mod.json; \
    grep -q "\"Sum\": \"${PLIMSOLL_MODULE_SUM}\"" /tmp/mod.json \
      || { echo "plimsoll ${PLIMSOLL_VERSION} does not match the pinned module hash" >&2; cat /tmp/mod.json >&2; exit 1; }; \
    cp -R "$(go env GOMODCACHE)/github.com/plimsollmark/plimsoll@${PLIMSOLL_VERSION}" /src; \
    chmod -R u+w /src

# The build contexts of plimsoll's sandbox images, exported by setup.sh with
# `docker build --target sandbox-context --output type=local,dest=...`: docker/ is the
# images' context, and nativehelper/ is the named context `nativehelper` their
# Dockerfile copies the project runner from (it checks the binary against its pin).
FROM scratch AS sandbox-context
COPY --from=source /src/docker /docker
COPY --from=source /src/sandbox/internal/nativehelper/program /nativehelper

# From source, whose module cache holds the module just checked, so `go install` builds
# those bytes (its dependencies are checked against the module's go.sum). A build of the
# copied tree in /src would state its version as "(devel)".
FROM source AS build
ARG PLIMSOLL_VERSION=v0.29.0
ENV CGO_ENABLED=0 GOBIN=/out
RUN go install -trimpath \
      "github.com/plimsollmark/plimsoll/cmd/plimsolld@${PLIMSOLL_VERSION}" \
      "github.com/plimsollmark/plimsoll/cmd/plimsoll-clients@${PLIMSOLL_VERSION}"

FROM ${DOCKER_CLI_IMAGE} AS dockercli

FROM ${BASE_IMAGE} AS final
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=build /out/plimsolld /out/plimsoll-clients /usr/local/bin/
COPY --from=source /src/docker/seccomp.json /etc/plimsoll/seccomp.json
ENTRYPOINT ["/usr/local/bin/plimsolld"]
