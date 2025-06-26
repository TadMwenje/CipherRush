import requests
import json
import random
import string
import time
import unittest

# Get the backend URL from the frontend .env file
BACKEND_URL = "https://dd4e330c-b01e-4cdf-b409-e90c0b2b804d.preview.emergentagent.com"
API_URL = f"{BACKEND_URL}/api"

class CipherRushBackendTest(unittest.TestCase):
    """Test suite for CipherRush backend API endpoints"""
    
    def setUp(self):
        """Set up test data and create a test user"""
        self.test_username = f"testuser_{self.random_string(6)}"
        self.test_password = f"TestPass123!_{self.random_string(6)}"
        self.test_email = f"test_{self.random_string(6)}@example.com"
        self.user_id = None
        
        # Create a test user for the tests
        self.register_test_user()
        
    def random_string(self, length=6):
        """Generate a random string for unique test data"""
        return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))
    
    def register_test_user(self):
        """Register a test user and store the user_id"""
        register_data = {
            "username": self.test_username,
            "password": self.test_password,
            "email": self.test_email
        }
        
        response = requests.post(f"{API_URL}/auth/register", json=register_data)
        if response.status_code == 200:
            self.user_id = response.json().get("user_id")
            print(f"Created test user: {self.test_username} with ID: {self.user_id}")
        else:
            print(f"Failed to create test user: {response.text}")
    
    def test_01_user_registration(self):
        """Test user registration with valid and invalid data"""
        print("\n=== Testing User Registration ===")
        
        # Test valid registration (already done in setUp)
        self.assertIsNotNone(self.user_id, "User registration failed in setup")
        
        # Test duplicate username
        register_data = {
            "username": self.test_username,
            "password": "AnotherPassword123!",
            "email": f"another_{self.random_string(6)}@example.com"
        }
        
        response = requests.post(f"{API_URL}/auth/register", json=register_data)
        self.assertEqual(response.status_code, 400, "Should reject duplicate username")
        print("✅ Registration correctly rejects duplicate username")
    
    def test_02_user_login(self):
        """Test user login with valid and invalid credentials"""
        print("\n=== Testing User Login ===")
        
        # Test valid login
        login_data = {
            "username": self.test_username,
            "password": self.test_password
        }
        
        response = requests.post(f"{API_URL}/auth/login", json=login_data)
        self.assertEqual(response.status_code, 200, "Valid login should succeed")
        user_data = response.json().get("user")
        self.assertEqual(user_data.get("username"), self.test_username)
        print("✅ Login successful with valid credentials")
        
        # Test invalid password
        login_data["password"] = "WrongPassword123!"
        response = requests.post(f"{API_URL}/auth/login", json=login_data)
        self.assertEqual(response.status_code, 401, "Invalid login should fail")
        print("✅ Login correctly rejects invalid credentials")
    
    def test_03_cipher_puzzle_generation(self):
        """Test cipher puzzle generation for different levels"""
        print("\n=== Testing Cipher Puzzle Generation ===")
        
        # Test multiple levels
        for level in range(1, 4):
            response = requests.get(f"{API_URL}/game/cipher/generate/{level}")
            self.assertEqual(response.status_code, 200, f"Failed to generate level {level} cipher")
            
            puzzle = response.json()
            self.assertEqual(puzzle["level"], level)
            self.assertIn("encrypted_text", puzzle)
            self.assertIn("original_text", puzzle)
            self.assertIn("hint", puzzle)
            
            print(f"✅ Level {level} cipher generated successfully")
            
            # Verify the cipher is correctly encrypted
            shift = puzzle["shift_amount"]
            original = puzzle["original_text"]
            encrypted = puzzle["encrypted_text"]
            
            # Basic validation that the texts are different
            self.assertNotEqual(original, encrypted, "Original and encrypted text should differ")
    
    def test_04_cipher_answer_submission(self):
        """Test cipher answer submission with correct and incorrect answers"""
        print("\n=== Testing Cipher Answer Submission ===")
        
        # Get a cipher puzzle
        level = 1
        response = requests.get(f"{API_URL}/game/cipher/generate/{level}")
        puzzle = response.json()
        
        # Test correct answer submission
        submit_data = {
            "user_id": self.user_id,
            "answer": puzzle["original_text"],
            "original_text": puzzle["original_text"],
            "level": level,
            "time_taken": 120
        }
        
        response = requests.post(f"{API_URL}/game/cipher/submit", json=submit_data)
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertTrue(result["correct"])
        self.assertGreater(result["score"], 0)
        print("✅ Correct cipher answer submission works")
        
        # Test incorrect answer submission
        submit_data["answer"] = "WRONG ANSWER"
        response = requests.post(f"{API_URL}/game/cipher/submit", json=submit_data)
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertFalse(result["correct"])
        self.assertEqual(result["score"], 0)
        print("✅ Incorrect cipher answer submission works")
    
    def test_05_quiz_questions_retrieval(self):
        """Test quiz question retrieval for all categories"""
        print("\n=== Testing Quiz Questions Retrieval ===")
        
        categories = ["phishing", "social_engineering", "password_security", "malware", "network_security"]
        level = 1
        
        for category in categories:
            response = requests.get(f"{API_URL}/game/quiz/{category}/{level}")
            self.assertEqual(response.status_code, 200, f"Failed to get {category} questions")
            
            data = response.json()
            self.assertIn("questions", data)
            self.assertIn("original_data", data)
            
            # Verify questions don't contain answers
            for question in data["questions"]:
                self.assertNotIn("correct_answer", question)
            
            # Verify original data contains answers
            for question in data["original_data"]:
                self.assertIn("correct_answer", question)
            
            print(f"✅ {category.capitalize()} quiz questions retrieved successfully")
    
    def test_06_quiz_answer_submission(self):
        """Test quiz answer submission"""
        print("\n=== Testing Quiz Answer Submission ===")
        
        # Get quiz questions
        category = "phishing"
        level = 1
        response = requests.get(f"{API_URL}/game/quiz/{category}/{level}")
        quiz_data = response.json()
        
        # Prepare submission with correct answers
        original_questions = quiz_data["original_data"]
        correct_answers = [q["correct_answer"] for q in original_questions]
        
        submit_data = {
            "user_id": self.user_id,
            "answers": correct_answers,
            "original_questions": original_questions
        }
        
        # Test submission with all correct answers
        response = requests.post(f"{API_URL}/game/quiz/submit", json=submit_data)
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result["correct_count"], len(original_questions))
        self.assertEqual(result["score"], 100.0)
        print("✅ Quiz submission with correct answers works")
        
        # Test submission with some incorrect answers
        if len(correct_answers) > 0:
            wrong_answers = [(a + 1) % 4 for a in correct_answers]  # Make answers wrong
            submit_data["answers"] = wrong_answers
            
            response = requests.post(f"{API_URL}/game/quiz/submit", json=submit_data)
            self.assertEqual(response.status_code, 200)
            result = response.json()
            self.assertEqual(result["correct_count"], 0)
            print("✅ Quiz submission with incorrect answers works")
    
    def test_07_match3_board_generation(self):
        """Test match-3 board generation for different levels"""
        print("\n=== Testing Match-3 Board Generation ===")
        
        for level in range(1, 4):
            response = requests.get(f"{API_URL}/game/match3/board/{level}")
            self.assertEqual(response.status_code, 200)
            
            board_data = response.json()
            self.assertIn("board", board_data)
            self.assertIn("level", board_data)
            self.assertIn("board_size", board_data)
            self.assertIn("target_score", board_data)
            self.assertIn("moves_allowed", board_data)
            
            # Verify board structure
            board = board_data["board"]
            self.assertEqual(len(board), board_data["board_size"])
            for row in board:
                self.assertEqual(len(row), board_data["board_size"])
            
            print(f"✅ Level {level} match-3 board generated successfully")
    
    def test_08_match3_score_submission(self):
        """Test match-3 score submission"""
        print("\n=== Testing Match-3 Score Submission ===")
        
        # Test score submission
        level = 1
        submit_data = {
            "user_id": self.user_id,
            "score": 750,
            "level": level,
            "moves_used": 15
        }
        
        response = requests.post(f"{API_URL}/game/match3/submit", json=submit_data)
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertIn("final_score", result)
        self.assertIn("efficiency_bonus", result)
        self.assertGreater(result["final_score"], submit_data["score"])
        print("✅ Match-3 score submission works")
    
    def test_09_user_dashboard(self):
        """Test user dashboard data retrieval"""
        print("\n=== Testing User Dashboard ===")
        
        response = requests.get(f"{API_URL}/user/{self.user_id}/dashboard")
        self.assertEqual(response.status_code, 200)
        
        dashboard = response.json()
        self.assertIn("level", dashboard)
        self.assertIn("total_score", dashboard)
        self.assertIn("puzzles_completed", dashboard)
        self.assertIn("badges_count", dashboard)
        self.assertIn("total_sessions", dashboard)
        
        print("✅ User dashboard retrieval works")
        
        # Test invalid user ID
        invalid_id = "invalid_user_id"
        response = requests.get(f"{API_URL}/user/{invalid_id}/dashboard")
        self.assertEqual(response.status_code, 404)
        print("✅ Dashboard correctly handles invalid user ID")
    
    def test_10_leaderboard(self):
        """Test leaderboard functionality"""
        print("\n=== Testing Leaderboard ===")
        
        response = requests.get(f"{API_URL}/leaderboard")
        self.assertEqual(response.status_code, 200)
        
        leaderboard_data = response.json()
        self.assertIn("leaderboard", leaderboard_data)
        
        # Leaderboard might be empty in a fresh test environment, so just check structure
        if leaderboard_data["leaderboard"]:
            entry = leaderboard_data["leaderboard"][0]
            self.assertIn("rank", entry)
            self.assertIn("username", entry)
            self.assertIn("level", entry)
            self.assertIn("score", entry)
        
        print("✅ Leaderboard retrieval works")

if __name__ == "__main__":
    # Run the tests
    print(f"Testing CipherRush backend API at: {API_URL}")
    unittest.main(argv=['first-arg-is-ignored'], exit=False)