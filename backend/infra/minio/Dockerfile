ARG MINIO_VERSION=RELEASE.2025-10-15T17-29-55Z
FROM golang:1.24-alpine AS build
ARG MINIO_VERSION
# Retry transient proxy/checksum service failures, preserving downloaded modules and checksum verification.
RUN set -eu; \
    for attempt in 1 2 3; do \
        if CGO_ENABLED=0 go install github.com/minio/minio@${MINIO_VERSION}; then exit 0; fi; \
        if [ "$attempt" -eq 3 ]; then exit 1; fi; \
        echo "MinIO build failed; retrying ($attempt/3) in 5 seconds." >&2; \
        sleep 5; \
    done

FROM alpine:3.22
RUN apk add --no-cache ca-certificates wget su-exec && adduser -D -u 10001 minio && mkdir /data
COPY --from=build /go/bin/minio /usr/local/bin/minio
COPY --chmod=0755 entrypoint.sh /usr/local/bin/entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh
EXPOSE 9000 9001
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
