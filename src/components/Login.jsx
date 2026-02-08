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
        <div className="login-form">
          <h2>Admin Login</h2>
          <p className="login-subtitle">Sign in to access the admin panel</p>
          
          <form onSubmit={handleLogin}>
            <div className="input-group">
              <input
                type="email"
                placeholder="Email"
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
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearMessages();
                }}
                required
                disabled={loading}
              />
            </div>
            
            <button 
              type="submit" 
              disabled={loading}
              className={`login-button ${loading ? 'loading' : ''}`}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
            
            {error && (
              <div className="message error">
                <span className="error-icon">⚠️</span>
                {error}
              </div>
            )}
            
            {success && (
              <div className="message success">
                <span className="success-icon"></span>
                {success}
              </div>
            )}
          </form>
          
          <div className="login-footer">
            <p>Laboratory Equipment Management System</p>
          </div>
        </div>
      </div>
    );
  }