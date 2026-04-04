import pandas as pd
import numpy as np
import scipy.sparse as sparse
import implicit
import faiss
import pickle
import os
import time

RATINGS_FILE = r"c:\Users\91733\Desktop\Recomm~~10k\Data\ratings.csv" 
MODEL_DIR = r"."

def train_als_parallel_optimized():
    start_time = time.time()
    
    # ---------------------------------------------------------
    # 1. BATCH PROCESSING: Memory Inefficiency Fixed
    # Instead of pd.concat(), we accumulate raw pure python lists
    # This prevents the massive pandas DataFrame RAM spike!
    # ---------------------------------------------------------
    print("1. Loading Data in Batches (Optimized Lists)...")
    
    users_list = []
    items_list = []
    ratings_list = []
    
    chunk_size = 5_000_000
    for i, chunk in enumerate(pd.read_csv(RATINGS_FILE, chunksize=chunk_size, usecols=['userId', 'movieId', 'rating'])):
        print(f"   -> Processing Batch {i+1}...")
        users_list.extend(chunk['userId'].tolist())
        items_list.extend(chunk['movieId'].tolist())
        ratings_list.extend(chunk['rating'].tolist())

    print(f"   Total rows loaded: {len(ratings_list):,}")

    # ---------------------------------------------------------
    # 2. MAPPING IDs
    # ---------------------------------------------------------
    print("\n2. Mapping Real IDs to Internal Sparse Index...")
    # Convert to pandas series just for fast categorical encoding
    users_series = pd.Series(users_list, dtype="category")
    items_series = pd.Series(items_list, dtype="category")

    user_idx_codes = users_series.cat.codes.values
    item_idx_codes = items_series.cat.codes.values
    ratings_arr = np.array(ratings_list, dtype=np.float32)

    user_mapping = dict(enumerate(users_series.cat.categories))
    item_mapping = dict(enumerate(items_series.cat.categories))
    
    with open(os.path.join(MODEL_DIR, "id_mappings.pkl"), "wb") as f:
        pickle.dump({"users": user_mapping, "items": item_mapping}, f)

    # Free up huge chunks of RAM instantly
    del users_list, items_list, ratings_list, users_series, items_series

    # ---------------------------------------------------------
    # 3. SPARSITY & CONFIDENCE SCALING (Hu, Koren & Volinsky)
    # ---------------------------------------------------------
    print("\n3. Building User-Item Sparse Matrix...")
    user_item_data = sparse.csr_matrix((ratings_arr, (user_idx_codes, item_idx_codes)))
    
    print("   Applying Explicit -> Implicit Confidence Scaling (alpha=40)...")
    alpha = 40
    confidence = (user_item_data * alpha).astype('double')
    
    # Save the raw user_item_data so the Worker can filter "Seen Items"!
    sparse.save_npz(os.path.join(MODEL_DIR, "user_item_interactions.npz"), user_item_data)

    # ---------------------------------------------------------
    # 4. TRAINING: Explicit Item-User & Multi-Threaded CPU
    # ---------------------------------------------------------
    print("\n4. Training ALS Model...")
    os.environ['OPENBLAS_NUM_THREADS'] = '4'
    os.environ['OMP_NUM_THREADS'] = '4'
    
    model = implicit.als.AlternatingLeastSquares(
        factors=64, 
        regularization=0.1, 
        iterations=20, 
        num_threads=4,
        use_gpu=False      
    )
    
    # FIX: Transpose exactly as requested for strict implicit compatibility
    item_user_matrix = confidence.T
    model.fit(item_user_matrix)

    # ---------------------------------------------------------
    # 5. MODEL PERSISTENCE
    # ---------------------------------------------------------
    print("\n5. Extracting Embeddings & Saving Model...")
    with open(os.path.join(MODEL_DIR, "als_model.pkl"), "wb") as f:
        pickle.dump(model, f)

    # We must explicitly copy these to avoid modifying the algorithm's internal pointers
    item_embeddings = np.copy(model.item_factors)
    user_embeddings = np.copy(model.user_factors)
    
    # ---------------------------------------------------------
    # 6. FAISS L2 NORMALIZATION
    # ---------------------------------------------------------
    print("\n6. Building L2-Normalized FAISS Vector Index...")
    # Normalize to force IndexFlatIP into a pure Cosine Similarity search
    faiss.normalize_L2(item_embeddings)
    faiss.normalize_L2(user_embeddings)

    dimension = item_embeddings.shape[1]
    index = faiss.IndexFlatIP(dimension)  
    index.add(item_embeddings)
    
    faiss.write_index(index, os.path.join(MODEL_DIR, "movie_vector_db.faiss"))
    np.save(os.path.join(MODEL_DIR, "user_embeddings.npy"), user_embeddings)
    
    total_time = time.time() - start_time
    print(f"\n✅ Production Pipeline Complete! Processed {len(ratings_arr):,} ratings in {total_time:.1f} seconds.")

if __name__ == "__main__":
    if os.path.exists(RATINGS_FILE):
        train_als_parallel_optimized()
    else:
        print(f"❌ Error: Cannot find {RATINGS_FILE}. Please update RATINGS_FILE path in the script!")
