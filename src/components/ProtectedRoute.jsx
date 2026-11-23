
import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../context/useAuth";

// --------------------------------------------------
// PROFILE ERROR MESSAGES
// --------------------------------------------------

const PROFILE_ERROR_MESSAGES = {
  missing: {
    title: "Staff Account Not Found",
    message:
      "Your account is authenticated, but no staff profile is registered. Please contact your administrator.",
  },

  inactive: {
    title: "Account Deactivated",
    message:
      "Your staff account has been deactivated. Please contact your administrator.",
  },

  "invalid-role": {
    title: "Invalid Staff Role",
    message:
      "Your account has an unrecognized staff role. Please contact your administrator.",
  },

  error: {
    title: "Permission Verification Failed",
    message:
      "VanSked could not verify your staff permissions. Check your internet connection and try again. If the problem continues, contact your administrator.",
  },
};

const DEFAULT_PROFILE_ERROR = {
  title: "Unable to Verify Account",
  message:
    "Your staff permissions could not be confirmed. Please sign in again or contact your administrator.",
};

// --------------------------------------------------
// ACCESS DENIED COMPONENT
// --------------------------------------------------

const AccessDenied = ({
  title,
  message,
  onLogout,
  loggingOut,
  logoutError,
}) => {
  return (
    <main
      role="alert"
      aria-labelledby="access-denied-title"
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "24px",
        background: "var(--color-background, #F3F6FA)",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "440px",
          padding: "32px",
          background: "#FFFFFF",
          borderRadius: "16px",
          textAlign: "center",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        }}
      >
        <div
          style={{
            fontSize: "42px",
            marginBottom: "16px",
          }}
          aria-hidden="true"
        >
          🔒
        </div>

        <h2 id="access-denied-title">
          {title}
        </h2>

        <p
          style={{
            color: "#64748B",
            lineHeight: 1.6,
            marginBottom: "24px",
          }}
        >
          {message}
        </p>

        {logoutError && (
          <p
            role="alert"
            style={{
              color: "#DC2626",
              fontSize: "14px",
              marginBottom: "16px",
            }}
          >
            {logoutError}
          </p>
        )}

        <button
          type="button"
          onClick={onLogout}
          disabled={loggingOut}
          style={{
            width: "100%",
            padding: "12px 20px",
            border: "none",
            borderRadius: "8px",
            background: "#0B1B2B",
            color: "#FFFFFF",
            fontWeight: 600,
            cursor: loggingOut ? "not-allowed" : "pointer",
            opacity: loggingOut ? 0.7 : 1,
          }}
        >
          {loggingOut ? "Signing out..." : "Sign Out"}
        </button>
      </section>
    </main>
  );
};

// --------------------------------------------------
// LOADING COMPONENT
// --------------------------------------------------

const RouteLoading = () => {
  return (
    <main
      role="status"
      aria-live="polite"
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "var(--color-background, #F3F6FA)",
      }}
    >
      <p style={{ color: "#64748B" }}>
        Verifying your account permissions...
      </p>
    </main>
  );
};

// --------------------------------------------------
// PROTECTED ROUTE
// --------------------------------------------------

const ProtectedRoute = ({
  children,

  // Both roles are permitted by default.
  // Individual routes can specify stricter permissions.
  allowedRoles = ["admin", "dispatcher"],
}) => {
  const location = useLocation();

  const {
    currentUser,
    role,
    loading,
    profileLoading,
    profileStatus,
    logout,
  } = useAuth();

  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(null);

  // ------------------------------------------------
  // LOGOUT HANDLER
  // ------------------------------------------------

  const handleLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);
    setLogoutError(null);

    try {
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);

      setLogoutError(
        "Unable to sign out. Please try again."
      );

      setLoggingOut(false);
    }
  };

  // ------------------------------------------------
  // 1. WAIT FOR AUTHENTICATION AND STAFF PROFILE
  // ------------------------------------------------

  if (
    loading ||
    profileLoading ||
    profileStatus === "loading"
  ) {
    return <RouteLoading />;
  }

  // ------------------------------------------------
  // 2. CHECK AUTHENTICATION
  // ------------------------------------------------

  if (!currentUser) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location,
        }}
      />
    );
  }

  // ------------------------------------------------
  // 3. VERIFY STAFF PROFILE
  // ------------------------------------------------

  if (profileStatus !== "active") {
    const errorDetails =
      PROFILE_ERROR_MESSAGES[profileStatus] ||
      DEFAULT_PROFILE_ERROR;

    return (
      <AccessDenied
        title={errorDetails.title}
        message={errorDetails.message}
        onLogout={handleLogout}
        loggingOut={loggingOut}
        logoutError={logoutError}
      />
    );
  }

  // ------------------------------------------------
  // 4. VERIFY AUTHORIZED ROLE
  // ------------------------------------------------

  const hasPermission =
    Array.isArray(allowedRoles) &&
    allowedRoles.includes(role);

  if (!hasPermission) {
    return (
      <AccessDenied
        title="Insufficient Permissions"
        message="You are signed in, but your staff role does not have permission to access this page."
        onLogout={handleLogout}
        loggingOut={loggingOut}
        logoutError={logoutError}
      />
    );
  }

  // ------------------------------------------------
  // 5. AUTHORIZED
  // ------------------------------------------------

  return children;
};

export default ProtectedRoute;
