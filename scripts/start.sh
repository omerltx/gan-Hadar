#!/bin/sh
set -eu
PORT="${PORT:-43123}"
exec npx next start -H 0.0.0.0 -p "$PORT"