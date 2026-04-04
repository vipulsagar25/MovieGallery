# Scripts Directory

This directory contains standalone execution scripts used for ML pipeline validation and database seeding.

## Contents
1. `evaluate_model.py`: Runs collaborative filtering benchmarks (Precision@K, NDCG, AUC) to measure the predictive accuracy of the generated FAISS model against testing data.
2. `tmdb_fetcher.py`: A utility script originally used to hydrate movie IDs with rich metadata (titles, posters, summaries) from the external TMDB API.

## Usage in Production
These scripts **should not be run as part of the production service**. They are intended to be executed manually in a secure administrative environment or CI/CD pipeline when upgrading search algorithms or regenerating metadata.
