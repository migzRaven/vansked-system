
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  onAuthStateChanged,
  signOut,
} from "firebase/auth";

import {
  doc,
  onSnapshot,
} from "firebase/firestore";

import { auth, db } from "../firebase";

import { AuthContext } from "./auth-context";

// --------------------------------------------------
// STAFF ROLES
// --------------------------------------------------

const STAFF_ROLES = Object.freeze({
  ADMIN: "admin",
  DISPATCHER: "dispatcher",
});

const VALID_ROLES = Object.values(STAFF_ROLES);

// --------------------------------------------------
// STAFF PROFILE VALIDATION
// --------------------------------------------------

const getStaffProfileStatus = (profile) => {
  if (!profile || typeof profile !== "object") {
    return "invalid-role";
  }

  if (profile.active !== true) {
    return "inactive";
  }

  if (!VALID_ROLES.includes(profile.role)) {
    return "invalid-role";
  }

  return "active";
};

const AuthLoadingScreen = () => (
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
      Initializing VanSked and verifying your account...
    </p>
  </main>
);

// --------------------------------------------------
// AUTHENTICATION PROVIDER
// --------------------------------------------------

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);

  const [staffProfile, setStaffProfile] = useState(null);

  // Initial Firebase authentication state.
  const [loading, setLoading] = useState(true);

  // Staff profile verification state.
  const [profileLoading, setProfileLoading] = useState(false);

  // Possible states:
  // loading
  // not-authenticated
  // active
  // missing
  // inactive
  // invalid-role
  // error

  const [profileStatus, setProfileStatus] = useState("loading");

  const [profileError, setProfileError] = useState(null);

  // ------------------------------------------------
  // AUTHENTICATION STATE LISTENER
  // ------------------------------------------------

  useEffect(() => {
    let isMounted = true;

    let initialAuthResolved = false;

    let profileRequestId = 0;

    let unsubscribeStaff = null;

    const finishInitialLoading = () => {
      if (!initialAuthResolved) {
        initialAuthResolved = true;
        setLoading(false);
      }
    };

    const unsubscribeAuth = onAuthStateChanged(
      auth,

      (user) => {
        if (!isMounted) return;

        // Invalidate previous profile callbacks.
        const currentRequestId = ++profileRequestId;

        // Remove previous staff listener.
        if (unsubscribeStaff) {
          unsubscribeStaff();
          unsubscribeStaff = null;
        }

        setCurrentUser(user);
        setStaffProfile(null);
        setProfileError(null);

        // ------------------------------------------
        // NO AUTHENTICATED USER
        // ------------------------------------------

        if (!user) {
          setProfileStatus("not-authenticated");
          setProfileLoading(false);

          finishInitialLoading();
          return;
        }

        // ------------------------------------------
        // AUTHENTICATED USER
        // ------------------------------------------

        setProfileStatus("loading");
        setProfileLoading(true);

        const staffDocument = doc(
          db,
          "staff",
          user.uid
        );

        // Listen for staff profile changes.
        // Role changes and account deactivation will
        // be detected while the user remains signed in.
        unsubscribeStaff = onSnapshot(
          staffDocument,

          (snapshot) => {
            if (
              !isMounted ||
              currentRequestId !== profileRequestId
            ) {
              return;
            }

            // --------------------------------------
            // STAFF DOCUMENT NOT FOUND
            // --------------------------------------

            if (!snapshot.exists()) {
              setStaffProfile(null);
              setProfileStatus("missing");
              setProfileError(null);
              setProfileLoading(false);

              finishInitialLoading();
              return;
            }

            // --------------------------------------
            // VALIDATE STAFF PROFILE
            // --------------------------------------

            const data = snapshot.data();

            const profile = {
              ...data,
              uid: user.uid,
            };

            const status = getStaffProfileStatus(data);

            setStaffProfile(profile);
            setProfileStatus(status);
            setProfileError(null);
            setProfileLoading(false);

            finishInitialLoading();
          },

          (error) => {
            if (
              !isMounted ||
              currentRequestId !== profileRequestId
            ) {
              return;
            }

            console.error(
              "Staff profile verification failed:",
              error
            );

            setStaffProfile(null);
            setProfileStatus("error");

            setProfileError(
              error.message ||
              "Unable to verify staff permissions."
            );

            setProfileLoading(false);

            finishInitialLoading();
          }
        );
      },

      (error) => {
        if (!isMounted) return;

        console.error(
          "Firebase authentication error:",
          error
        );

        profileRequestId += 1;

        if (unsubscribeStaff) {
          unsubscribeStaff();
          unsubscribeStaff = null;
        }

        setCurrentUser(null);
        setStaffProfile(null);
        setProfileStatus("error");

        setProfileError(
          error.message ||
          "Authentication verification failed."
        );

        setProfileLoading(false);

        finishInitialLoading();
      }
    );

    // ----------------------------------------------
    // CLEANUP
    // ----------------------------------------------

    return () => {
      isMounted = false;

      profileRequestId += 1;

      if (unsubscribeStaff) {
        unsubscribeStaff();
      }

      unsubscribeAuth();
    };
  }, []);

  // ------------------------------------------------
  // LOGOUT
  // ------------------------------------------------

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  // ------------------------------------------------
  // ROLE CHECKS
  // ------------------------------------------------

  const role = staffProfile?.role ?? null;

  const isStaff =
    profileStatus === "active" &&
    currentUser !== null;

  const isAdmin =
    isStaff &&
    role === STAFF_ROLES.ADMIN;

  const isDispatcher =
    isStaff &&
    role === STAFF_ROLES.DISPATCHER;

  // ------------------------------------------------
  // CONTEXT VALUE
  // ------------------------------------------------

  const value = useMemo(
    () => ({
      currentUser,
      staffProfile,

      role,

      isStaff,
      isAdmin,
      isDispatcher,

      loading,
      profileLoading,
      profileStatus,
      profileError,

      logout,
    }),

    [
      currentUser,
      staffProfile,
      role,
      isStaff,
      isAdmin,
      isDispatcher,
      loading,
      profileLoading,
      profileStatus,
      profileError,
      logout,
    ]
  );

  // ------------------------------------------------
  // PROVIDER
  // ------------------------------------------------

  return (
  <AuthContext.Provider value={value}>
    {loading ? <AuthLoadingScreen /> : children}
  </AuthContext.Provider>
);
};
