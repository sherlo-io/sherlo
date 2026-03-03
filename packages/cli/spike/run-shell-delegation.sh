#!/bin/bash
# Quick runner for the shell delegation spike
# Usage: ./spike/run-shell-delegation.sh

cd "$(dirname "$0")/.." || exit 1
npx tsx spike/shell-delegation.ts
