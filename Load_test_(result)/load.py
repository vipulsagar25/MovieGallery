from locust import HttpUser, task, between
import random

class RecUser(HttpUser):
    wait_time = between(0.01, 0.1)

    def on_start(self):
        # Only hitting 8000 because others are turned off
        self.backend_ports = [8000]

    @task
    def get_recommendation(self):
        user_id = 1
        port = random.choice(self.backend_ports)
        
        # Override the base URL to randomly hit one of our 4 running workers
        self.client.get(f"http://127.0.0.1:{port}/recommend/{user_id}", name="/recommend/{user_id}")