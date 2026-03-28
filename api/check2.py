import faiss
import numpy as np
import scipy.sparse as sparse

model_dir = "../ML_model"

wrong_faiss_db = faiss.read_index(f"{model_dir}/movie_vector_db.faiss")
embs = wrong_faiss_db.reconstruct_n(0, wrong_faiss_db.ntotal)
print("user_embeddings shape:", embs.shape)

wrong_interactions = sparse.load_npz(f"{model_dir}/user_item_interactions.npz")
interactions = wrong_interactions.T.tocsr()
print("interactions shape:", interactions.shape)
