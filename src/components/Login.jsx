
import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useNavigate } from "react-router-dom";

import { auth } from "../firebase";

import "./Login.css";

const getLoginErrorMessage = (errorCode) => {
  switch (errorCode) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Invalid email or password.";

    case "auth/invalid-email":
      return "Please enter a valid email address.";

    case "auth/user-disabled":
      return "This account has been disabled. Please contact your administrator.";

    case "auth/too-many-requests":
      return "Too many unsuccessful login attempts. Please try again later.";

    case "auth/network-request-failed":
      return "Unable to connect to the authentication server. Check your internet connection.";

    case "auth/operation-not-allowed":
      return "Email and password sign-in is not enabled. Please contact the system administrator.";

    default:
      return "Unable to sign in. Please try again.";
  }
};

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();

  // ------------------------------------------------
  // HANDLE STAFF LOGIN
  // ------------------------------------------------

  const handleLogin = async (event) => {
    event.preventDefault();

    if (isSubmitting) return;

    setError("");

    const normalizedEmail = email.trim();

    if (!normalizedEmail || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setIsSubmitting(true);

    try {
      await signInWithEmailAndPassword(
        auth,
        normalizedEmail,
        password
      );

      // ProtectedRoute will wait for AuthContext
      // to finish verifying the staff profile.
      navigate("/dispatcher", {
        replace: true,
      });

    } catch (error) {
      console.error("Staff login failed:", {
        code: error.code,
        message: error.message,
      });

      setError(
        getLoginErrorMessage(error.code)
      );

    } finally {
      setIsSubmitting(false);
    }
  };

  // ------------------------------------------------
  // LOGIN INTERFACE
  // ------------------------------------------------

  return (
    <div className="app-container login-container">

      <header className="app-header">
        <h1>Staff Login</h1>

        <p>
          Dispatcher & Driver Access
        </p>
      </header>

      {error && (
        <div
          className="error-message"
          role="alert"
          aria-live="polite"
        >
          {error}
        </div>
      )}

      <form
        onSubmit={handleLogin}
        className="form-group"
      >
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError("");
          }}
          required
          autoComplete="username"
          aria-label="Staff email address"
          className="input-field"
          disabled={isSubmitting}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError("");
          }}
          required
          autoComplete="current-password"
          aria-label="Staff password"
          className="input-field"
          disabled={isSubmitting}
        />

        <button
          type="submit"
          className="btn btn-primary"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Signing in..." : "Log In"}
        </button>

      </form>

    </div>
  );
};

export default Login;
