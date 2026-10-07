#!/bin/bash
# Development environment setup script
set -e

echo "=== Traffic Management System - Dev Setup ==="

# Check Python version
python_version=$(python3 --version 2>&1 | grep -oP '\d+\.\d+')
echo "Python version: $python_version"

# Create virtual environment
echo ""
echo "1. Creating Python virtual environment..."
python3 -m venv .venv
source .venv/bin/activate

# Install Python packages in development mode
echo ""
echo "2. Installing Python packages..."
pip install --upgrade pip

pip install -e packages/shared
pip install -e packages/sumo-engine
pip install -e packages/adaptive-policy
pip install -e packages/cv-pipeline
pip install -e packages/carla-bridge
pip install -e backend

# Install development tools
echo ""
echo "3. Installing dev tools..."
pip install ruff black mypy pytest pytest-asyncio httpx

# Setup frontend
echo ""
echo "4. Setting up frontend..."
cd frontend
npm install
cd ..

# Copy environment template
echo ""
echo "5. Setting up environment..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from template. Please update with your Supabase credentials."
else
    echo ".env already exists, skipping."
fi

# Generate SUMO network (if SUMO is installed)
echo ""
echo "6. Generating SUMO network..."
if command -v netgenerate &> /dev/null; then
    python scripts/generate_network.py
else
    echo "WARNING: SUMO not found. Install SUMO and set SUMO_HOME, then run:"
    echo "  python scripts/generate_network.py"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "To start developing:"
echo "  source .venv/bin/activate"
echo "  # Terminal 1: Backend"
echo "  python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000"
echo "  # Terminal 2: Frontend"
echo "  cd frontend && npm run dev"
