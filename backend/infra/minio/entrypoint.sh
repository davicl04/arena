#!/bin/sh
set -eu
chown minio:minio /data
exec su-exec minio /usr/local/bin/minio "$@"
