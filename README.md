# BudgetBeacon (MVP Start)

First implementation of the BudgetBeacon backend API.

## What this includes

- Transaction import and manual transaction creation
- Basic auto-categorization from merchant/description keywords
- Savings goal tracking
- Dashboard summary (income, expenses, net, savings rate, top categories)
- Rule-based "AI-style" financial insights
- Disk persistence for all transactions/goals (`backend/data/store.json`)

## Run

```bash
node backend/backend.js
```

Server runs at `http://localhost:4000`.
Data is automatically persisted to `backend/data/store.json` and restored on restart.

## Quick test flow

### 1) Import transactions

```bash
curl -X POST http://localhost:4000/transactions/import ^
  -H "Content-Type: application/json" ^
  -d "{\"source\":\"bank-csv\",\"transactions\":[{\"date\":\"2026-03-01\",\"description\":\"Payroll ACME\",\"amount\":3200},{\"date\":\"2026-03-02\",\"description\":\"Whole Foods\",\"amount\":-86.45},{\"date\":\"2026-03-02\",\"description\":\"Uber Trip\",\"amount\":-24.9},{\"date\":\"2026-03-03\",\"description\":\"Netflix\",\"amount\":-15.99}]}"
```

### 2) Add a savings goal

```bash
curl -X POST http://localhost:4000/goals ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"Emergency Fund\",\"targetAmount\":5000,\"currentAmount\":1200,\"deadline\":\"2026-12-31\"}"
```

### 3) View dashboard

```bash
curl http://localhost:4000/dashboard
```

### 4) View insights

```bash
curl http://localhost:4000/insights
```

## Endpoints

- `GET /health`
- `GET /transactions`
- `POST /transactions`
- `POST /transactions/import`
- `GET /goals`
- `POST /goals`
- `GET /dashboard`
- `GET /insights`
