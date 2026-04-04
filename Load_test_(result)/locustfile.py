import random
import uuid
from locust import FastHttpUser, task

class MovieAIUser(FastHttpUser):
    # No wait_time: users will slam the server continuously at maximum speed
    
    
    def on_start(self):
        """Simulate a new user logging in when their Locust session starts"""
        self.supabase_uid = str(uuid.uuid4())
        
        # Register them via API (hits Auth Route & Redis)
        with self.client.post("/auth/profile", json={
            "supabase_uid": self.supabase_uid,
            "email": f"tester_{self.supabase_uid[:8]}@test.com"
        }, catch_response=True) as response:
            if response.status_code == 200:
                self.internal_user_id = response.json().get("internal_user_id", 1)
            else:
                self.internal_user_id = random.randint(1, 330000)

    @task(4)
    def fetch_popular(self):
        """High frequency: Users check the homepage (Hits high-speed cache)"""
        self.client.get("/recommend/popular")

    @task(2)
    def fetch_personalized(self):
        """Medium frequency: Triggers heavy FAISS Matrix Math (Requires massive CPU)"""
        self.client.get(f"/recommend/{self.internal_user_id}")
