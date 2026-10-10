ARG MINIO_VERSION=RELEASE.2025-10-15T17-29-55Z
FROM golang:1.24-alpine AS build
ARG MINIO_VERSION
RUN CGO_ENABLED=0 go install github.com/minio/minio@${MINIO_VERSION}

FROM alpine:3.22
RUN apk add --no-cache ca-certificates wget su-exec && adduser -D -u 10001 minio && mkdir /data
COPY --from=build /go/bin/minio /usr/local/bin/minio
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
EXPOSE 9000 9001
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
