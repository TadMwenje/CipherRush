import React, { useState, useEffect } from "react";
import "./App.css";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Auth Context
const AuthContext = React.createContext();

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('cipherrush_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const login = (userData) => {
    setUser(userData);
    localStorage.setItem('cipherrush_user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('cipherrush_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

// Welcome Screen Component
function WelcomeScreen({ onLogin, onRegister }) {
  return (
    <div className="welcome-screen">
      <div className="welcome-content">
        <div className="welcome-header">
          <h1 className="game-title">CipherRush</h1>
          <p className="game-subtitle">Unscramble the code, unlock the future</p>
        </div>
        
        <div className="lock-icon">
          <div className="lock-circle">
            <div className="lock-symbol">🔒</div>
          </div>
        </div>
        
        <div className="welcome-buttons">
          <button className="btn-primary" onClick={onLogin}>
            Start Playing
          </button>
          <button className="btn-secondary" onClick={onRegister}>
            How to Play
          </button>
        </div>
        
        <p className="welcome-footer">Join 900K+ cyber defenders</p>
      </div>
    </div>
  );
}

// Login/Register Modal
function AuthModal({ isOpen, onClose, onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const response = await axios.post(`${API}${endpoint}`, formData);
      
      if (isLogin) {
        onLogin(response.data.user);
        onClose();
      } else {
        setIsLogin(true);
        setError('Registration successful! Please login.');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>{isLogin ? 'Login' : 'Register'}</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Username"
            value={formData.username}
            onChange={(e) => setFormData({...formData, username: e.target.value})}
            required
          />
          {!isLogin && (
            <input
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              required
            />
          )}
          <input
            type="password"
            placeholder="Password"
            value={formData.password}
            onChange={(e) => setFormData({...formData, password: e.target.value})}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Loading...' : (isLogin ? 'Login' : 'Register')}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        <p>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button type="button" onClick={() => setIsLogin(!isLogin)}>
            {isLogin ? 'Register' : 'Login'}
          </button>
        </p>
      </div>
    </div>
  );
}

// Dashboard Component
function Dashboard({ user, onGameSelect }) {
  const [dashboardData, setDashboardData] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, [user]);

  const fetchDashboardData = async () => {
    try {
      const response = await axios.get(`${API}/user/${user.id}/dashboard`);
      setDashboardData(response.data);
    } catch (err) {
      console.error('Failed to fetch dashboard data');
    }
  };

  const stats = dashboardData || user;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <div className="user-avatar">CX</div>
      </div>
      
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-number">{stats.level || 42}</div>
          <div className="stat-label">Level</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{(stats.total_score || 2800).toLocaleString()}</div>
          <div className="stat-label">Score</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.puzzles_completed || 156}</div>
          <div className="stat-label">Puzzles</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.badges_count || 12}</div>
          <div className="stat-label">Badges</div>
        </div>
      </div>
      
      <div className="progress-section">
        <div className="level-progress">
          <div className="progress-text">Level {stats.level || 42}</div>
          <div className="progress-percent">65% Complete</div>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{width: '65%'}}></div>
        </div>
        <div className="progress-xp">875 / 1350 XP to next level</div>
      </div>
      
      <div className="game-modes">
        <button className="game-mode-btn cipher" onClick={() => onGameSelect('cipher')}>
          <div className="game-icon">🧩</div>
          <div>Cipher Puzzles</div>
        </button>
        <button className="game-mode-btn quiz" onClick={() => onGameSelect('quiz')}>
          <div className="game-icon">📝</div>
          <div>Security Quiz</div>
        </button>
        <button className="game-mode-btn match3" onClick={() => onGameSelect('match3')}>
          <div className="game-icon">🧱</div>
          <div>Match-3 Security</div>
        </button>
      </div>
      
      <div className="bottom-nav">
        <button className="nav-btn active">
          <span>🏠</span>
          <span>Home</span>
        </button>
        <button className="nav-btn">
          <span>💝</span>
          <span>Battle</span>
        </button>
        <button className="nav-btn">
          <span>🏆</span>
          <span>Leaderboard</span>
        </button>
        <button className="nav-btn">
          <span>👤</span>
          <span>Profile</span>
        </button>
      </div>
    </div>
  );
}

// Cipher Game Component
function CipherGame({ user, onBack }) {
  const [puzzle, setPuzzle] = useState(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [timeLeft, setTimeLeft] = useState(120);
  const [isActive, setIsActive] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [currentLevel, setCurrentLevel] = useState(user.level || 1);

  useEffect(() => {
    generateNewPuzzle();
  }, [currentLevel]);

  useEffect(() => {
    let interval = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(time => time - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      submitAnswer();
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft]);

  const generateNewPuzzle = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/game/cipher/generate/${currentLevel}`);
      setPuzzle(response.data);
      setTimeLeft(120);
      setIsActive(true);
      setResult(null);
      setUserAnswer('');
    } catch (err) {
      console.error('Failed to generate puzzle');
    } finally {
      setLoading(false);
    }
  };

  const submitAnswer = async () => {
    if (!puzzle) return;
    
    setIsActive(false);
    setLoading(true);
    
    try {
      const response = await axios.post(`${API}/game/cipher/submit`, {
        user_id: user.id,
        answer: userAnswer,
        original_text: puzzle.original_text,
        level: currentLevel,
        time_taken: 120 - timeLeft
      });
      
      setResult(response.data);
    } catch (err) {
      console.error('Failed to submit answer');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading && !puzzle) return <div className="loading">Loading puzzle...</div>;

  return (
    <div className="cipher-game">
      <div className="game-header">
        <button className="back-btn" onClick={onBack}>←</button>
        <h1>Cipher Challenge</h1>
        <div className="timer">{formatTime(timeLeft)}</div>
      </div>
      
      <div className="game-info">
        <div className="level-badge">Level {currentLevel}</div>
        <div className="game-type">Caesar Cipher Challenge</div>
      </div>
      
      {puzzle && (
        <div className="puzzle-content">
          <div className="encrypted-text">{puzzle.encrypted_text}</div>
          
          <div className="hint-section">
            <div className="hint-icon">💡</div>
            <div className="hint-text">{puzzle.hint}</div>
          </div>
          
          <div className="answer-section">
            <input
              type="text"
              placeholder="Enter your decoded message"
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value.toUpperCase())}
              disabled={!isActive || loading}
            />
            <button 
              className="submit-btn"
              onClick={submitAnswer}
              disabled={!isActive || loading || !userAnswer.trim()}
            >
              Submit Answer
            </button>
          </div>
          
          {result && (
            <div className={`result ${result.correct ? 'correct' : 'wrong'}`}>
              <div className="result-status">
                {result.correct ? '✅ Correct!' : '❌ Incorrect'}
              </div>
              <div className="result-score">Score: {result.score}</div>
              <div className="result-explanation">{result.explanation}</div>
              <button className="next-btn" onClick={generateNewPuzzle}>
                Next Puzzle
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Quiz Game Component
function QuizGame({ user, onBack }) {
  const [currentCategory, setCurrentCategory] = useState('phishing');
  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [userAnswers, setUserAnswers] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const categories = {
    phishing: 'Phishing',
    social_engineering: 'Social Engineering',
    password_security: 'Password Security',
    malware: 'Malware Recognition',
    network_security: 'Network Security'
  };

  useEffect(() => {
    loadQuestions();
  }, [currentCategory]);

  const loadQuestions = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/game/quiz/${currentCategory}/${user.level || 1}`);
      setQuestions(response.data.questions);
      setCurrentQuestion(0);
      setUserAnswers([]);
      setResult(null);
    } catch (err) {
      console.error('Failed to load questions');
    } finally {
      setLoading(false);
    }
  };

  const selectAnswer = (answerIndex) => {
    const newAnswers = [...userAnswers];
    newAnswers[currentQuestion] = answerIndex;
    setUserAnswers(newAnswers);
  };

  const nextQuestion = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      submitQuiz();
    }
  };

  const submitQuiz = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${API}/game/quiz/submit`, {
        user_id: user.id,
        answers: userAnswers,
        original_questions: questions
      });
      setResult(response.data);
    } catch (err) {
      console.error('Failed to submit quiz');
    } finally {
      setLoading(false);
    }
  };

  if (loading && questions.length === 0) return <div className="loading">Loading quiz...</div>;

  return (
    <div className="quiz-game">
      <div className="game-header">
        <button className="back-btn" onClick={onBack}>←</button>
        <h1>Security Quiz</h1>
      </div>
      
      <div className="category-selector">
        {Object.entries(categories).map(([key, label]) => (
          <button
            key={key}
            className={`category-btn ${currentCategory === key ? 'active' : ''}`}
            onClick={() => setCurrentCategory(key)}
          >
            {label}
          </button>
        ))}
      </div>
      
      {questions.length > 0 && !result && (
        <div className="question-content">
          <div className="question-header">
            <div className="question-number">
              Question {currentQuestion + 1} of {questions.length}
            </div>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{width: `${((currentQuestion + 1) / questions.length) * 100}%`}}
              ></div>
            </div>
          </div>
          
          <div className="question-text">
            {questions[currentQuestion]?.question}
          </div>
          
          <div className="options">
            {questions[currentQuestion]?.options.map((option, index) => (
              <button
                key={index}
                className={`option-btn ${userAnswers[currentQuestion] === index ? 'selected' : ''}`}
                onClick={() => selectAnswer(index)}
              >
                {option}
              </button>
            ))}
          </div>
          
          <button
            className="next-btn"
            onClick={nextQuestion}
            disabled={userAnswers[currentQuestion] === undefined}
          >
            {currentQuestion < questions.length - 1 ? 'Next Question' : 'Submit Quiz'}
          </button>
        </div>
      )}
      
      {result && (
        <div className="quiz-result">
          <div className="result-header">
            <div className="result-score">
              Score: {Math.round(result.score)}%
            </div>
            <div className="result-stats">
              {result.correct_count} / {result.total_questions} correct
            </div>
          </div>
          <div className="bonus-points">
            +{result.bonus_points} bonus points earned!
          </div>
          <button className="retry-btn" onClick={loadQuestions}>
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}

// Match-3 Game Component
function Match3Game({ user, onBack }) {
  const [board, setBoard] = useState([]);
  const [level, setLevel] = useState(user.level || 1);
  const [score, setScore] = useState(0);
  const [movesLeft, setMovesLeft] = useState(20);
  const [selectedCell, setSelectedCell] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    generateNewBoard();
  }, [level]);

  const generateNewBoard = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/game/match3/board/${level}`);
      setBoard(response.data.board);
      setMovesLeft(response.data.moves_allowed);
      setScore(0);
      setGameOver(false);
      setSelectedCell(null);
    } catch (err) {
      console.error('Failed to generate board');
    } finally {
      setLoading(false);
    }
  };

  const selectCell = (row, col) => {
    if (gameOver || movesLeft <= 0) return;

    if (!selectedCell) {
      setSelectedCell({row, col});
    } else {
      if (selectedCell.row === row && selectedCell.col === col) {
        setSelectedCell(null);
        return;
      }

      // Check if cells are adjacent
      const isAdjacent = 
        (Math.abs(selectedCell.row - row) === 1 && Math.abs(selectedCell.col - col) === 0) ||
        (Math.abs(selectedCell.row - row) === 0 && Math.abs(selectedCell.col - col) === 1);

      if (isAdjacent) {
        // Swap cells
        const newBoard = [...board];
        const temp = newBoard[selectedCell.row][selectedCell.col];
        newBoard[selectedCell.row][selectedCell.col] = newBoard[row][col];
        newBoard[row][col] = temp;
        
        setBoard(newBoard);
        setMovesLeft(movesLeft - 1);
        setScore(score + 50); // Simple scoring
        setSelectedCell(null);

        if (movesLeft <= 1) {
          endGame();
        }
      } else {
        setSelectedCell({row, col});
      }
    }
  };

  const endGame = async () => {
    setGameOver(true);
    try {
      await axios.post(`${API}/game/match3/submit`, {
        user_id: user.id,
        score: score,
        level: level,
        moves_used: 20 - movesLeft
      });
    } catch (err) {
      console.error('Failed to submit score');
    }
  };

  if (loading) return <div className="loading">Loading game...</div>;

  return (
    <div className="match3-game">
      <div className="game-header">
        <button className="back-btn" onClick={onBack}>←</button>
        <h1>Match-3 Security</h1>
      </div>
      
      <div className="game-stats">
        <div className="stat">Score: {score}</div>
        <div className="stat">Moves: {movesLeft}</div>
        <div className="stat">Level: {level}</div>
      </div>
      
      <div className="match3-board">
        {board.map((row, rowIndex) => (
          <div key={rowIndex} className="board-row">
            {row.map((cell, colIndex) => (
              <button
                key={`${rowIndex}-${colIndex}`}
                className={`board-cell ${
                  selectedCell?.row === rowIndex && selectedCell?.col === colIndex 
                    ? 'selected' 
                    : ''
                }`}
                onClick={() => selectCell(rowIndex, colIndex)}
                disabled={gameOver}
              >
                {cell}
              </button>
            ))}
          </div>
        ))}
      </div>
      
      {gameOver && (
        <div className="game-over">
          <h2>Game Over!</h2>
          <div className="final-score">Final Score: {score}</div>
          <button className="restart-btn" onClick={generateNewBoard}>
            Play Again
          </button>
        </div>
      )}
    </div>
  );
}

// Main App Component
function App() {
  const [currentScreen, setCurrentScreen] = useState('welcome');
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <AuthProvider>
      <div className="App">
        <AppContent 
          currentScreen={currentScreen}
          setCurrentScreen={setCurrentScreen}
          showAuthModal={showAuthModal}
          setShowAuthModal={setShowAuthModal}
        />
      </div>
    </AuthProvider>
  );
}

function AppContent({ currentScreen, setCurrentScreen, showAuthModal, setShowAuthModal }) {
  const { user, login, logout, loading } = React.useContext(AuthContext);

  useEffect(() => {
    if (user) {
      setCurrentScreen('dashboard');
    } else {
      setCurrentScreen('welcome');
    }
  }, [user]);

  const handleLogin = () => {
    setShowAuthModal(true);
  };

  const handleGameSelect = (gameType) => {
    setCurrentScreen(gameType);
  };

  const handleBack = () => {
    setCurrentScreen('dashboard');
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <>
      {currentScreen === 'welcome' && (
        <WelcomeScreen 
          onLogin={handleLogin}
          onRegister={handleLogin}
        />
      )}
      
      {currentScreen === 'dashboard' && user && (
        <Dashboard 
          user={user}
          onGameSelect={handleGameSelect}
        />
      )}
      
      {currentScreen === 'cipher' && user && (
        <CipherGame 
          user={user}
          onBack={handleBack}
        />
      )}
      
      {currentScreen === 'quiz' && user && (
        <QuizGame 
          user={user}
          onBack={handleBack}
        />
      )}
      
      {currentScreen === 'match3' && user && (
        <Match3Game 
          user={user}
          onBack={handleBack}
        />
      )}
      
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onLogin={login}
      />
    </>
  );
}

export default App;