import React, { useState, useCallback, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import "./App.css";
import { AuthProvider, useAuth } from "./AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import SplashScreen from "./components/SplashScreen";
import CipherBackground from "./components/CipherBackground";
import ConnectionBanner from "./components/ConnectionBanner";
import ScreenBoundary from "./components/ScreenBoundary";
import { NOTIFICATION_ROUTE_EVENT, takePendingRoute } from "./notifications";
import Welcome from "./pages/Welcome";
import Dashboard from "./pages/Dashboard";
import Battle from "./pages/Battle";
import Leaderboard from "./pages/Leaderboard";
import Profile from "./pages/Profile";
import CipherGame from "./games/CipherGame";
import QuizGame from "./games/QuizGame";
import Match3Game from "./games/Match3Game";
import MemoryGame from "./games/MemoryGame";
import TrueFalseGame from "./games/TrueFalseGame";
import BinHexGame from "./games/BinHexGame";
import RushGame from "./games/RushGame";
import DailyGame from "./games/DailyGame";
import PracticeGame from "./games/PracticeGame";

const SPLASH_KEY = "cipherrush_splash_seen";

function splashAlreadySeen() {
  try {
    return sessionStorage.getItem(SPLASH_KEY) === "1";
  } catch (e) {
    return false;
  }
}

const GAME_ROUTES = [
  ["/game/cipher", CipherGame],
  ["/game/rush", RushGame],
  ["/game/daily", DailyGame],
  ["/game/binhex", BinHexGame],
  ["/game/quiz", QuizGame],
  ["/game/truefalse", TrueFalseGame],
  ["/game/match3", Match3Game],
  ["/game/memory", MemoryGame],
];

function Backdrop() {
  // Full-motion on the welcome screen; calmer behind dashboards and games.
  const { pathname } = useLocation();
  return <CipherBackground calm={pathname !== "/"} />;
}

// Tapping a reminder opens the screen it's about.
function NotificationRouter() {
  const navigate = useNavigate();
  useEffect(() => {
    const go = () => {
      const route = takePendingRoute();
      if (route) navigate(route);
    };
    go();
    window.addEventListener(NOTIFICATION_ROUTE_EVENT, go);
    return () => window.removeEventListener(NOTIFICATION_ROUTE_EVENT, go);
  }, [navigate]);
  return null;
}

// A crash in one screen shows a recoverable error there instead of blanking the
// app. Keyed by path, so switching tabs always mounts a fresh boundary.
function Screen({ children, title }) {
  const { pathname } = useLocation();
  return (
    <ScreenBoundary key={pathname} title={title}>
      {children}
    </ScreenBoundary>
  );
}

function AppRoutes() {
  const { loading } = useAuth();
  if (loading) return <div className="loading" aria-busy="true" />;
  return (
    <Routes>
      <Route path="/" element={<Screen><Welcome /></Screen>} />
      {/* No account or connection needed: unscored, generated on the phone. */}
      <Route path="/practice" element={<Screen><PracticeGame /></Screen>} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Screen><Dashboard /></Screen>} />
        <Route path="/battle" element={<Screen title="Versus didn't load"><Battle /></Screen>} />
        <Route path="/leaderboard" element={<Screen title="Ranks didn't load"><Leaderboard /></Screen>} />
        <Route path="/profile" element={<Screen title="Profile didn't load"><Profile /></Screen>} />
      </Route>
      {GAME_ROUTES.map(([path, Game]) => (
        <Route
          key={path}
          path={path}
          element={
            <ProtectedRoute>
              <Screen>
                <Game />
              </Screen>
            </ProtectedRoute>
          }
        />
      ))}
      <Route path="/game/binary" element={<Navigate to="/game/truefalse" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(() => !splashAlreadySeen());

  const finishSplash = useCallback(() => {
    try {
      sessionStorage.setItem(SPLASH_KEY, "1");
    } catch (e) {
      // storage unavailable - splash just shows again next load
    }
    setShowSplash(false);
  }, []);

  return (
    <AuthProvider>
      <div className="App">
        {showSplash && <SplashScreen onFinish={finishSplash} />}
        <ConnectionBanner />
        <BrowserRouter>
          <Backdrop />
          <NotificationRouter />
          {/* Routes mount only after the splash, so no game clock starts underneath it. */}
          {!showSplash && <AppRoutes />}
        </BrowserRouter>
      </div>
    </AuthProvider>
  );
}

export default App;
