// src/components/Login.js
import React, { useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "../firebase";
import { getDatabase, ref, get, child } from "firebase/database";
import "../CSS/Login.css";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      // Validate inputs
      if (!email.trim() || !password.trim()) {
        setError("Please fill in all fields");
        setLoading(false);
        return;
      }

      // 1. Sign in
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const uid = user.uid;

      // 2. Fetch user role from Realtime Database
      const db = getDatabase();
      const dbRef = ref(db);
      const snapshot = await get(child(dbRef, `users/${uid}`));

      if (snapshot.exists()) {
        const userData = snapshot.val();

        if (userData.role === "admin" || userData.role === "laboratory_manager") {
          const roleDisplay = userData.role === "admin" ? "Admin" : "Lab In Charge";
          setSuccess(`Logged in as ${roleDisplay}!`);
          // Small delay to show success message
          setTimeout(() => {
            navigate("/dashboard");
          }, 1000);
        } else {
          // ❌ Invalid role - sign out and show error
          await signOut(auth);
          setError("Access denied. Admin or Lab In Charge privileges required.");
        }
      } else {
        await signOut(auth);
        setError("User data not found. Please contact administrator.");
      }
    } catch (err) {
      console.error("Login error:", err);
      
      // Handle specific Firebase errors
      switch (err.code) {
        case 'auth/invalid-email':
          setError("Invalid email address format");
          break;
        case 'auth/user-disabled':
          setError("This account has been disabled");
          break;
        case 'auth/user-not-found':
          setError("No account found with this email");
          break;
        case 'auth/wrong-password':
          setError("Incorrect password");
          break;
        case 'auth/too-many-requests':
          setError("Too many failed attempts. Please try again later");
          break;
        case 'auth/network-request-failed':
          setError("Network error. Please check your connection");
          break;
        default:
          setError(err.message || "Login failed. Please try again");
      }
    }

    setLoading(false);
  };

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };

  return (
    <div className="login-container">
      {/* Background with blur effect */}
      <div 
        className="login-background"
        style={{
          backgroundImage: `url(${process.env.PUBLIC_URL}/ABDnsc.jpg)`
        }}
      />

      {/* Main Login Card - Merged sections */}
      <div className="login-card">
        {/* Left Side - Image Section */}
        <div 
          className="login-left"
          style={{
            backgroundImage: `url(${process.env.PUBLIC_URL}/LabDnsc.jpg)`
          }}
        >
          <div className="login-image-container">
            <div className="login-branding">
              <h1>SMART Laboratory<br />Management System</h1>
            </div>
            
          </div>
        </div>

        {/* Right Side - Form Section */}
        <div className="login-right">
          <div className="login-form">
          <div className="login-form-header">
            <h2>Welcome!</h2>
            <p className="login-subtitle">Please sign in to continue</p>
          </div>
          
          <form onSubmit={handleLogin}>
            {error && (
              <div className="message error">
                <span className="error-icon">⚠️</span>
                {error}
              </div>
            )}
            
            {success && (
              <div className="message success">
                <span className="success-icon">✓</span>
                {success}
              </div>
            )}

            <div className="input-group">
              <input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearMessages();
                }}
                required
                disabled={loading}
              />
            </div>
            
            <div className="input-group">
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearMessages();
                  }}
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex="-1"
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="form-options">
              <label className="remember-me">
                <input type="checkbox" />
                <span>Remember me</span>
              </label>
              
            </div>
            
            <button 
              type="submit" 
              disabled={loading}
              className="login-button"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
            
          </form>
        </div>
      </div>
      </div>
    </div>
  );
}