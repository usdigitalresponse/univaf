#!/usr/bin/env bash
set -eo pipefail

if [ ! -d .venv ]; then
  python -m venv .venv
fi

source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
