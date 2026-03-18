#!/bin/zsh

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
export PATH="$ROOT_DIR/.local/node/bin:$PATH"

exec "$@"
