# Movie Gallery 🍿

Production-grade collaborative filtering recommendation system.

## Architecture
- **Backend:** FastAPI, Python, Uvicorn
- **Machine Learning:** FAISS (Vector Database), Implicit (ALS Model)
- **Database:** Supabase (Postgres)
- **Caching & Queues:** Redis, Upstash
- **Frontend:** React + Vite

## Local Development
To run the full stack locally:
```bash
docker-compose up --build
```

You must duplicate `.env.example` to `.env` and fill out your local secrets, as the `.env` file is excluded from Docker images for security.

## Background Worker
The ML model is served asynchronously. The API enqueues a user task to Redis, and the background worker (`api/worker.py`) executes the highly intensive FAISS computations, pushing the results back into Redis for the API to retrieve.