# Setup Guide — <Project Name>

## Prerequisites

- <e.g. Python 3.11+, Node 20+, Docker>

## 1. Clone & configure

```bash
git clone <repo-url>
cd <project>
cp .env.example .env   # fill in real values
```

## 2. Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate   |   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
<run command, e.g. uvicorn main:app --reload --port 8000>
```

## 3. Frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

## 4. Verify

- <How to confirm it works end-to-end: hit a route, load the page, run a smoke test.>

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| <symptom> | <cause> | <fix> |
