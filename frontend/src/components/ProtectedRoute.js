import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading" aria-busy="true" />;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default ProtectedRoute;
