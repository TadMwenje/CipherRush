from fastapi import FastAPI, APIRouter, HTTPException, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
import hashlib
import random
import string
import secrets

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# --- MODELS ---

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    password_hash: str
    email: str
    level: int = 1
    total_score: int = 0
    puzzles_completed: int = 0
    badges: List[str] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_active: datetime = Field(default_factory=datetime.utcnow)

class UserCreate(BaseModel):
    username: str
    password: str
    email: str

class UserLogin(BaseModel):
    username: str
    password: str

class GameSession(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    game_type: str  # "cipher", "quiz", "match3"
    level: int
    score: int = 0
    completed: bool = False
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None

class CipherPuzzle(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    level: int
    cipher_type: str = "caesar"
    encrypted_text: str
    shift_amount: int
    original_text: str
    hint: str

class QuizQuestion(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    category: str  # "phishing", "social_engineering", "password_security", "malware", "network_security"
    question: str
    options: List[str]
    correct_answer: int
    explanation: str
    difficulty: int

class Achievement(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    badge_name: str
    description: str
    earned_at: datetime = Field(default_factory=datetime.utcnow)

# --- UTILITY FUNCTIONS ---

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def generate_caesar_cipher(text: str, shift: int) -> str:
    result = ""
    for char in text:
        if char.isalpha():
            shift_base = ord('A') if char.isupper() else ord('a')
            result += chr((ord(char) - shift_base + shift) % 26 + shift_base)
        else:
            result += char
    return result

def get_quiz_questions_by_category(category: str, level: int) -> List[Dict]:
    """Generate quiz questions based on category and difficulty level"""
    questions = {
        "phishing": [
            {
                "question": "You receive an email claiming to be from your bank asking you to click a link to verify your account. What should you do?",
                "options": ["Click the link immediately", "Call your bank directly using the official number", "Reply with your account details", "Forward to friends"],
                "correct_answer": 1,
                "explanation": "Always verify suspicious emails by contacting the organization directly through official channels.",
                "difficulty": 1
            },
            {
                "question": "Which of these email signs indicates a potential phishing attempt?",
                "options": ["Generic greeting like 'Dear Customer'", "Urgent language demanding immediate action", "Suspicious sender email address", "All of the above"],
                "correct_answer": 3,
                "explanation": "Phishing emails often combine multiple red flags to pressure victims into quick action.",
                "difficulty": 2
            }
        ],
        "social_engineering": [
            {
                "question": "A stranger calls claiming to be IT support and asks for your password. What should you do?",
                "options": ["Give them the password", "Hang up and verify through official channels", "Ask them to prove their identity", "Change password first then give"],
                "correct_answer": 1,
                "explanation": "Legitimate IT support will never ask for passwords over the phone.",
                "difficulty": 1
            }
        ],
        "password_security": [
            {
                "question": "Which password is most secure?",
                "options": ["password123", "P@ssw0rd!", "MyDog2024!", "Tr0ub4dor&3"],
                "correct_answer": 3,
                "explanation": "Strong passwords use a mix of characters, numbers, symbols and are not based on dictionary words.",
                "difficulty": 1
            }
        ],
        "malware": [
            {
                "question": "You find a USB drive in the parking lot. What should you do?",
                "options": ["Plug it in to see what's on it", "Turn it in to security without using it", "Take it home to check", "Throw it away"],
                "correct_answer": 1,
                "explanation": "Unknown USB drives can contain malware designed to compromise systems.",
                "difficulty": 1
            }
        ],
        "network_security": [
            {
                "question": "When using public WiFi, what's the safest practice?",
                "options": ["Use any open network", "Only access secure websites", "Use a VPN", "Avoid all internet use"],
                "correct_answer": 2,
                "explanation": "VPNs encrypt your connection, protecting data even on unsecured networks.",
                "difficulty": 1
            }
        ]
    }
    
    category_questions = questions.get(category, [])
    # Filter by difficulty level and return appropriate questions
    filtered_questions = [q for q in category_questions if q["difficulty"] <= level]
    return filtered_questions[:3]  # Return up to 3 questions

# --- API ENDPOINTS ---

@api_router.post("/auth/register")
async def register_user(user_data: UserCreate):
    # Check if user exists
    existing_user = await db.users.find_one({"username": user_data.username})
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # Create user
    user = User(
        username=user_data.username,
        password_hash=hash_password(user_data.password),
        email=user_data.email
    )
    
    await db.users.insert_one(user.dict())
    
    return {"message": "User created successfully", "user_id": user.id}

@api_router.post("/auth/login")
async def login_user(login_data: UserLogin):
    user = await db.users.find_one({
        "username": login_data.username,
        "password_hash": hash_password(login_data.password)
    })
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Update last active
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"last_active": datetime.utcnow()}}
    )
    
    return {
        "message": "Login successful",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "level": user["level"],
            "total_score": user["total_score"],
            "puzzles_completed": user["puzzles_completed"],
            "badges": user["badges"]
        }
    }

@api_router.get("/user/{user_id}/dashboard")
async def get_user_dashboard(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Calculate additional stats
    total_sessions = await db.game_sessions.count_documents({"user_id": user_id})
    achievements = await db.achievements.find({"user_id": user_id}).to_list(100)
    
    return {
        "level": user["level"],
        "total_score": user["total_score"],
        "puzzles_completed": user["puzzles_completed"],
        "badges_count": len(user["badges"]),
        "total_sessions": total_sessions,
        "recent_achievements": achievements[-3:] if achievements else []
    }

@api_router.get("/game/cipher/generate/{level}")
async def generate_cipher_puzzle(level: int):
    """Generate a Caesar cipher puzzle based on level"""
    
    # Difficulty increases with level
    base_texts = [
        "HELLO WORLD",
        "CYBERSECURITY IS IMPORTANT",
        "PROTECT YOUR PASSWORDS ALWAYS",
        "BEWARE OF PHISHING ATTACKS TODAY",
        "ENCRYPTION KEEPS DATA SAFE FROM HACKERS"
    ]
    
    text_index = min(level - 1, len(base_texts) - 1)
    original_text = base_texts[text_index]
    
    # Shift amount varies by level
    shift_amount = (level * 3) % 26 + 1
    encrypted_text = generate_caesar_cipher(original_text, shift_amount)
    
    hints = [
        "Try shifting each letter by a small number",
        "Caesar used this cipher. Think about the Roman emperor!",
        "Each letter is shifted by the same amount",
        "The shift amount is between 1 and 25",
        "Look for common words like THE, AND, IS"
    ]
    
    puzzle = CipherPuzzle(
        level=level,
        encrypted_text=encrypted_text,
        shift_amount=shift_amount,
        original_text=original_text,
        hint=hints[min(level - 1, len(hints) - 1)]
    )
    
    return puzzle.dict()

@api_router.post("/game/cipher/submit")
async def submit_cipher_answer(data: dict):
    user_id = data.get("user_id")
    user_answer = data.get("answer", "").strip().upper()
    original_text = data.get("original_text", "").strip().upper()
    level = data.get("level", 1)
    
    is_correct = user_answer == original_text
    base_score = level * 100
    time_bonus = max(0, 300 - data.get("time_taken", 0))  # Bonus for speed
    
    total_score = base_score + time_bonus if is_correct else 0
    
    # Update user stats if correct
    if is_correct and user_id:
        await db.users.update_one(
            {"id": user_id},
            {
                "$inc": {"total_score": total_score, "puzzles_completed": 1},
                "$set": {"last_active": datetime.utcnow()}
            }
        )
        
        # Check for level up (every 5 puzzles)
        user = await db.users.find_one({"id": user_id})
        if user and user["puzzles_completed"] % 5 == 0:
            new_level = user["level"] + 1
            await db.users.update_one(
                {"id": user_id},
                {"$set": {"level": new_level}}
            )
    
    return {
        "correct": is_correct,
        "score": total_score,
        "explanation": f"The correct answer was: {original_text}" if not is_correct else "Excellent work!"
    }

@api_router.get("/game/quiz/{category}/{level}")
async def get_quiz_questions(category: str, level: int):
    """Get quiz questions for specific category and level"""
    questions = get_quiz_questions_by_category(category, level)
    
    if not questions:
        raise HTTPException(status_code=404, detail="No questions found for this category/level")
    
    # Remove correct answers from response
    safe_questions = []
    for q in questions:
        safe_q = q.copy()
        safe_q.pop("correct_answer", None)
        safe_questions.append(safe_q)
    
    return {"questions": safe_questions, "original_data": questions}

@api_router.post("/game/quiz/submit")
async def submit_quiz_answers(data: dict):
    user_id = data.get("user_id")
    answers = data.get("answers", [])  # List of user's answer indices
    original_questions = data.get("original_questions", [])
    
    correct_count = 0
    total_questions = len(original_questions)
    
    results = []
    for i, (user_answer, question) in enumerate(zip(answers, original_questions)):
        is_correct = user_answer == question.get("correct_answer")
        if is_correct:
            correct_count += 1
        
        results.append({
            "question_index": i,
            "correct": is_correct,
            "explanation": question.get("explanation", "")
        })
    
    # Calculate score
    score = (correct_count / total_questions) * 100 if total_questions > 0 else 0
    bonus_score = int(score * 2)  # Bonus points for quiz completion
    
    # Update user stats
    if user_id:
        await db.users.update_one(
            {"id": user_id},
            {
                "$inc": {"total_score": bonus_score},
                "$set": {"last_active": datetime.utcnow()}
            }
        )
    
    return {
        "score": score,
        "correct_count": correct_count,
        "total_questions": total_questions,
        "bonus_points": bonus_score,
        "results": results
    }

@api_router.get("/game/match3/board/{level}")
async def generate_match3_board(level: int):
    """Generate a Match-3 board with cybersecurity elements"""
    
    # Security symbols for the game
    security_symbols = [
        "🔒", "🛡️", "🔑", "🚨", "💻", "🔐", "⚠️", "🔍"
    ]
    
    board_size = min(6 + (level // 3), 10)  # Board grows with level
    num_symbols = min(4 + (level // 2), len(security_symbols))  # More symbol types as level increases
    
    # Generate random board
    board = []
    available_symbols = security_symbols[:num_symbols]
    
    for row in range(board_size):
        board_row = []
        for col in range(board_size):
            symbol = random.choice(available_symbols)
            board_row.append(symbol)
        board.append(board_row)
    
    return {
        "board": board,
        "level": level,
        "board_size": board_size,
        "target_score": level * 500,
        "moves_allowed": 20 + (level * 2)
    }

@api_router.post("/game/match3/submit")
async def submit_match3_score(data: dict):
    user_id = data.get("user_id")
    score = data.get("score", 0)
    level = data.get("level", 1)
    moves_used = data.get("moves_used", 0)
    
    # Calculate bonus for efficiency
    efficiency_bonus = max(0, (30 - moves_used) * 10) if moves_used < 30 else 0
    total_score = score + efficiency_bonus
    
    # Update user stats
    if user_id:
        await db.users.update_one(
            {"id": user_id},
            {
                "$inc": {"total_score": total_score},
                "$set": {"last_active": datetime.utcnow()}
            }
        )
    
    return {
        "final_score": total_score,
        "efficiency_bonus": efficiency_bonus,
        "message": "Great matching skills!" if score > level * 300 else "Keep practicing!"
    }

@api_router.get("/leaderboard")
async def get_leaderboard():
    """Get top players leaderboard"""
    top_users = await db.users.find().sort("total_score", -1).limit(10).to_list(10)
    
    leaderboard = []
    for i, user in enumerate(top_users):
        leaderboard.append({
            "rank": i + 1,
            "username": user["username"],
            "level": user["level"],
            "score": user["total_score"],
            "puzzles_completed": user["puzzles_completed"]
        })
    
    return {"leaderboard": leaderboard}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()