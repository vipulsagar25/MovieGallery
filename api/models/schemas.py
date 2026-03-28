from pydantic import BaseModel
from typing import List, Optional, Any

class RecommendationResponse(BaseModel):
    user_id: int
    recommendations: List[Any]  # Accepting Dicts to render real Movie Titles and Metadata
    history: List[Any] = []     # Also accepting Dicts for user watch history
    cached: bool = False
    message: Optional[str] = None