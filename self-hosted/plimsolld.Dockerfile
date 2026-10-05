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
#   sandbox-context  its docker/ directory, which setup.sh exports to build the
#                    sandbox images from the same verified bytes
#   build            plimsolld and plimsoll-clients, static
#   final            the two binaries, the docker CLI, and plimsoll's audited
#                    seccomp profile (docker/seccomp.json in the module)

ARG GO_IMAGE=golang:1.26.6-alpine@sha256:3889b425f035be855a72fb4755265311293b6d414521f0a519d819df32222d83
ARG DOCKER_CLI_IMAGE=docker:29.1.3-cli@sha256:4fa0ee1f3a7e4354c4ea34558b6d4ee32859baf4973d4c8ccc8e7fe3dd730c04
ARG BASE_IMAGE=alpine:3.24@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6

FROM ${GO_IMAGE} AS source
ARG PLIMSOLL_VERSION=v0.19.0
ARG PLIMSOLL_MODULE_SUM=h1:EsrWBfNOstYBoeDJC+V9Iz/f4YGFuw4aC8hjgVE6tAc=
ENV GOTOOLCHAIN=local
RUN set -eu; \
    go mod download -json "github.com/plimsollmark/plimsoll@${PLIMSOLL_VERSION}" > /tmp/mod.json; \
    grep -q "\"Sum\": \"${PLIMSOLL_MODULE_SUM}\"" /tmp/mod.json \
      || { echo "plimsoll ${PLIMSOLL_VERSION} does not match the pinned module hash" >&2; cat /tmp/mod.json >&2; exit 1; }; \
    cp -R "$(go env GOMODCACHE)/github.com/plimsollmark/plimsoll@${PLIMSOLL_VERSION}" /src; \
    chmod -R u+w /src

# The build context of plimsoll's sandbox images, exported by setup.sh with
# `docker build --target sandbox-context --output type=local,dest=...`.
FROM scratch AS sandbox-context
COPY --from=source /src/docker /

FROM ${GO_IMAGE} AS build
ENV GOTOOLCHAIN=local CGO_ENABLED=0
COPY --from=source /src /src
WORKDIR /src
RUN go build -trimpath -o /out/plimsolld ./cmd/plimsolld \
 && go build -trimpath -o /out/plimsoll-clients ./cmd/plimsoll-clients

FROM ${DOCKER_CLI_IMAGE} AS dockercli

FROM ${BASE_IMAGE} AS final
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=build /out/plimsolld /out/plimsoll-clients /usr/local/bin/
COPY --from=source /src/docker/seccomp.json /etc/plimsoll/seccomp.json
ENTRYPOINT ["/usr/local/bin/plimsolld"]
