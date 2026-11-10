#!/usr/bin/env bash
# Start Thẻ Học locally (saves to data/sets/*.json). Needs only python3.
cd "$(dirname "$0")" && exec python3 server.py "$@"
