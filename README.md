# Route Optimizer

Turns a list of delivery addresses into an optimized driving route — paste them, type them, or snap a photo.

## Status

v1 in development

## Setup

See [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md). In short:

```bash
# install
pip install -r requirements.txt

# run
uvicorn main:app --reload
```

Then open http://localhost:8000

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Claude-facing guidance is in
[CLAUDE.md](CLAUDE.md).

## Environment

Copy `.env.example` to `.env` and fill in the values. Never commit `.env`.
