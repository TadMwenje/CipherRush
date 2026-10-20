# CipherRush

A mobile-first cybersecurity puzzle game: Caesar, Atbash and Vigenère ciphers, Speed Cipher Rush, binary/hex decoding, a security quiz, true-or-false, Match-3, Memory Lock and a Daily Cipher. Every score is calculated on the server.

```
backend/    FastAPI + PostgreSQL. Auth, game rounds, scoring economy, content banks
frontend/   React app (the whole UI - web, iOS and Android all run this)
mobile/     Capacitor iOS + Android shells that wrap frontend/  -> see mobile/README.md
tests/      Backend regression suite (pytest)
```

## Run it locally

**Database:** PostgreSQL 14+ (or `docker compose up db`).

**Backend**

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env        # set DATABASE_URL and a long random JWT_SECRET
.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

Tables and migrations apply on startup.

**Frontend**

```bash
cd frontend
cp .env.example .env        # REACT_APP_BACKEND_URL=http://localhost:8000
yarn install && yarn start  # http://localhost:3000
```

**Phones:** see [`mobile/README.md`](mobile/README.md).

## Tests

```bash
backend/.venv/bin/python -m pytest tests -q     # backend: anti-cheat, economy, content, auth, daily
cd frontend && CI=true yarn test --watchAll=false  # frontend: layout, gestures, keyboard, mobile CSS contract
```

With the dev server running, `http://localhost:3000/device-lab.html` shows the app on six phone sizes (portrait and landscape) and audits touch targets, covered buttons and sideways overflow.

## Where things live

- Scoring numbers: `backend/economy.py`
- Questions, phrases, word lists: `backend/content/`
- Mobile helpers (keyboard, clock, haptics, layout): `frontend/src/mobile/`
- Icon set: `frontend/src/glyphs/`. Brand mark: `frontend/src/brand/CipherMark.js`
