import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import AuthModal from "../components/AuthModal";
import CipherMark from "../brand/CipherMark";
import HowToPlayModal from "../components/HowToPlayModal";
import { useAuth } from "../AuthContext";

function Welcome() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();

  const handleLogin = (userData) => {
    login(userData);
    navigate("/dashboard");
  };

  if (loading) {
    return <div className="loading" aria-busy="true" />;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="welcome-screen">
      <div className="welcome-content">
        <div className="welcome-header">
          <h1 className="game-title">CipherRush</h1>
          <p className="game-subtitle">Crack codes. Beat the clock. Don't click the link.</p>
        </div>

        <div className="lock-icon brand-hero">
          <CipherMark size={120} animated />
        </div>

        <div className="welcome-buttons">
          <button className="btn-primary" onClick={() => setShowAuthModal(true)}>
            Play
          </button>
          <button className="btn-secondary" onClick={() => setShowHowTo(true)}>
            How it works
          </button>
        </div>

        <p className="welcome-footer">Built for people who read the whole URL.</p>
      </div>

      {showHowTo && <HowToPlayModal onClose={() => setShowHowTo(false)} />}

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onLogin={handleLogin}
      />
    </div>
  );
}

export default Welcome;
