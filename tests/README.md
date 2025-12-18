# Playwright smoke tests

## Setup
```
cd tests
npm install
```

## Run
- Serve the app (e.g., `python -m http.server 8000` from project root).
- In another shell:
```
cd tests
BASE_URL=http://localhost:8000 npm test
```

Adjust `BASE_URL` to your server address.
