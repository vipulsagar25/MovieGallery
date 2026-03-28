import faiss
import numpy as np
db = faiss.read_index('../ML_model/movie_vector_db.faiss')
embs = db.reconstruct_n(0, db.ntotal)
print("Type of embs:", type(embs))
if isinstance(embs, np.ndarray):
    print("Shape:", embs.shape)
elif isinstance(embs, list):
    print("Length of list:", len(embs))
