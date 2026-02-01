#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

# Ensure dependencies are present and SDK is built.
npm install
npm run build --workspace @openclab.org/sdk

# Publish from the SDK package directory.
cd packages/sdk
npm publish --access public
