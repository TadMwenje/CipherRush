import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import AuthModal from "../components/AuthModal";
import CipherMark from "../brand/CipherMark";
import HowToPlayModal from "../components/HowToPlayModal";
import { LegalLinks } from "../components/LegalLinks";
import { useAuth } from "../AuthContext";
import { useOnline } from "../mobile/hooks";
import { useT } from "../i18n";

function Welcome() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const online = useOnline();
  const t = useT();

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
          <p className="game-subtitle">{t("welcome.subtitle")}</p>
        </div>

        <div className="lock-icon brand-hero">
          <CipherMark size={120} animated />
        </div>

        <div className="welcome-buttons">
          <button className="btn-primary" onClick={() => setShowAuthModal(true)}>
            {t("welcome.play")}
          </button>
          <button className="btn-secondary" onClick={() => setShowHowTo(true)}>
            {t("dash.howItWorks")}
          </button>
          <button className="practice-link" onClick={() => navigate("/practice")}>
            {online ? t("welcome.practice") : t("welcome.practiceOffline")}
          </button>
        </div>

        <p className="welcome-footer">{t("welcome.footer")}</p>
        <LegalLinks className="welcome-legal" />
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
