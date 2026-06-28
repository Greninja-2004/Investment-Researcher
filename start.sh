#!/bin/bash
# Exit on any command failure
set -e

echo "=========================================================="
echo "🚀 Starting Investment Research Agent (100% Local Pipeline) 🚀"
echo "=========================================================="

# 1. Start Python local FastAPI model server on port 8000
echo "--> Starting local PyTorch model server (FastAPI)..."
./.venv/bin/python -m investment_model.inference.server &
PYTHON_PID=$!

# Ensure python backend terminates on script exit
cleanup() {
  echo "--> Stopping local PyTorch model server..."
  kill $PYTHON_PID 2>/dev/null || true
  exit 0
}
trap cleanup EXIT INT TERM

# Wait a moment for FastAPI server to start
sleep 3

# Check if model server is running
if ! ps -p $PYTHON_PID > /dev/null; then
  echo "❌ Error: PyTorch model server failed to start. Check your Python environment."
  exit 1
fi

echo "✅ PyTorch model server running on http://localhost:8000"

# 2. Start Next.js App
echo "--> Starting Next.js Dev Server..."
npm run dev
