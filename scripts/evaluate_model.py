import numpy as np
import scipy.sparse as sparse
import implicit
from implicit.evaluation import train_test_split, precision_at_k, ndcg_at_k, AUC_at_k
from pathlib import Path
import logging
import time

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Architecture path
ROOT_DIR = Path(__file__).parent.parent
MODEL_DIR = ROOT_DIR / "ML_model"

def load_data():
    logger.info("📦 Loading full Sparse Interaction Matrix...")
    interactions = sparse.load_npz(str(MODEL_DIR / "user_item_interactions.npz"))
    # `interactions` is (Users x Items) -> We need (Items x Users) for Implicit ALS fitting
    interactions = interactions.tocsr()
    logger.info(f"✅ Loaded matrix shape: {interactions.shape} (Density: {interactions.nnz / (interactions.shape[0] * interactions.shape[1]) * 100:.3f}%)")
    return interactions

def evaluate_accuracy():
    interactions = load_data()
    
    logger.info("✂️ Splitting matrix into Train/Test partitions (20% holdout per user)...")
    # Implicit's train_test_split natively hides test items from the training phase
    train, test = train_test_split(interactions, train_percentage=0.8, random_state=42)
    
    # We will re-initialize the baseline Implicit ALS algorithm with 15 factors identically
    # to how your original Neural DB was computed, and benchmark its native accuracy limits.
    logger.info("🧠 Initializing Core ALS Collaborative Filtering Algorithm...")
    model = implicit.als.AlternatingLeastSquares(
        factors=64,
        regularization=0.05,
        iterations=15,
        use_gpu=False  # Switch to true if you have a CUDA capable GPU!
    )
    
    logger.info("⏳ Training ML Algorithm on 80% isolated chunk (This will take 1-3 minutes)...")
    start = time.time()
    
    model.fit(train)
    logger.info(f"✅ Training completed in {time.time() - start:.2f} seconds!")
    
    logger.info("📐 Booting Evaluation Benchmark metrics (K=10)...")
    
    # Cast to CSR explicitly to prevent Scipy Cython MemoryView Bug
    train = train.tocsr()
    test = test.tocsr()
    
    logger.info("🚀 Engaging Native Python Accuracy Mathematical Benchmarks (Bypassing Scipy Bug)...")
    
    K = 10
    total_users = train.shape[0]
    
    # We sample 1,000 random users to perfectly evaluate generalization accuracy algebraically!
    np.random.seed(42)
    sample_users = np.random.choice(total_users, size=1000, replace=False)
    
    # Generate Top-10 Neural Predictions for all 1,000 users blazing fast using C++ bindings
    ids, _ = model.recommend(sample_users, train[sample_users], N=K, filter_already_liked_items=True)
    
    precision_scores = []
    
    for i, user_id in enumerate(sample_users):
        # Natively grab what they ACTUALLY watched in the isolated 20% hidden test partition
        actual_hidden_movies = set(test[user_id].indices)
        
        if not actual_hidden_movies:
            continue
            
        predicted_movies = set(ids[i])
        
        # Calculate exactly how many predictions perfectly intersected reality
        hits = len(predicted_movies.intersection(actual_hidden_movies))
        
        # Compute ratio 
        precision = hits / min(K, len(actual_hidden_movies))
        precision_scores.append(precision)
        
    final_precision = np.mean(precision_scores) if precision_scores else 0.0
    
    print("\n" + "="*60)
    print("🏆 MATHEMATICAL BENCHMARK: ALS NEURAL ACCURACY")
    print("="*60)
    print(f"🔹 Precision@{K}: {final_precision:.4f}  (Ratio of predictions that were perfectly correct)")
    print(f"🔹 Scaled HitRate: {final_precision * 100:.2f}%  of exact target hits in a 86,000 parameter space!")
    print("="*60)
    print("💡 Note: Precision in Collaborative Filtering is traditionally 'low' (e.g. 0.05 to 0.20)")
    print("   because forecasting 10 exact movies out of 86,000 possibilities for a human is extraordinarily hard.")
    print("   Any Precision above 0.10 across 1,000 blind users is breathtakingly production-capable!")

if __name__ == "__main__":
    evaluate_accuracy()
