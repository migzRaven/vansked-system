
import { useEffect, useState, Suspense, lazy } from "react";

import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import { Toaster, toast } from "react-hot-toast";

import { db } from "./firebase";
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./context/useAuth";

import ProtectedRoute from "./components/ProtectedRoute";

import "./App.css";

// --------------------------------------------------
// LAZY-LOADED PAGES
// --------------------------------------------------

const PassengerView = lazy(
  () => import("./components/PassengerView")
);

const DispatcherView = lazy(
  () => import("./components/DispatcherView")
);

const TemplateManager = lazy(
  () => import("./components/TemplateManager")
);

const FleetManager = lazy(
  () => import("./components/FleetManager")
);

const AnalyticsView = lazy(
  () => import("./components/AnalyticsView")
);

const QRCodeView = lazy(
  () => import("./components/QRCodeView")
);

const PublicTripMigration = lazy(
  () => import("./components/PublicTripMigration")
);

const DataQualityAudit = lazy(
  () => import("./components/DataQualityAudit")
);

const Login = lazy(
  () => import("./components/Login")
);

// --------------------------------------------------
// DATE UTILITIES
// --------------------------------------------------

const getManilaDate = () => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
};

const getTimestamp = (value) => {
  if (value && typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  const timestamp = Number(value);

  return Number.isFinite(timestamp) ? timestamp : 0;
};

const sortTripsByDeparture = (trips) => {
  return [...trips].sort((a, b) => {
    return (
      getTimestamp(a.departureAt) -
      getTimestamp(b.departureAt)
    );
  });
};

// --------------------------------------------------
// ICONS
// --------------------------------------------------

const QrIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ marginRight: "6px" }}
    aria-hidden="true"
  >
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
);

const BackIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ marginRight: "6px" }}
    aria-hidden="true"
  >
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const HamburgerIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="white"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

const CloseIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="white"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ChevronRight = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// --------------------------------------------------
// FLOATING PASSENGER / DISPATCHER TOGGLE
// --------------------------------------------------

const FloatingToggle = () => {
  const { isStaff } = useAuth();

  const location = useLocation();
  const navigate = useNavigate();

  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const handlePressStart = (event) => {
      if (
        event.target &&
        !event.target.closest(".fab-rectangle")
      ) {
        setIsCollapsed(true);
      }
    };

    const handlePressEnd = () => {
      setIsCollapsed(false);
    };

    window.addEventListener(
      "touchstart",
      handlePressStart,
      { passive: true }
    );

    window.addEventListener(
      "touchend",
      handlePressEnd
    );

    window.addEventListener(
      "mousedown",
      handlePressStart
    );

    window.addEventListener(
      "mouseup",
      handlePressEnd
    );

    return () => {
      window.removeEventListener(
        "touchstart",
        handlePressStart
      );

      window.removeEventListener(
        "touchend",
        handlePressEnd
      );

      window.removeEventListener(
        "mousedown",
        handlePressStart
      );

      window.removeEventListener(
        "mouseup",
        handlePressEnd
      );
    };
  }, []);

  if (
    !isStaff ||
    location.pathname === "/login" ||
    location.pathname === "/qr"
  ) {
    return null;
  }

  const isPassengerView = location.pathname === "/";
  const isDispatcherView =
    location.pathname === "/dispatcher";

  let buttonText = "Dashboard";
  let buttonClass = "btn-go-dispatcher";
  let destination = "/dispatcher";

  if (isPassengerView) {
    buttonText = "Dispatcher";
    destination = "/dispatcher";
  } else if (isDispatcherView) {
    buttonText = "Passenger";
    buttonClass = "btn-go-passenger";
    destination = "/";
  }

  return (
    <button
      type="button"
      className={`fab-rectangle ${buttonClass} ${
        isCollapsed ? "collapsed" : ""
      }`}
      onClick={() => navigate(destination)}
      aria-label={`Switch to ${buttonText} view`}
    >
      <span className="fab-text">
        {buttonText}
      </span>

      <span className="fab-arrow">
        <ChevronRight />
      </span>
    </button>
  );
};

// --------------------------------------------------
// NAVIGATION
// --------------------------------------------------

const Navigation = ({ pathname }) => {
  const {
    currentUser,
    isStaff,
    isAdmin,
    role,
    logout,
  } = useAuth();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const isQrPage = pathname === "/qr";
  const isLoginPage = pathname === "/login";

  const closeDrawer = () => {
    setIsDrawerOpen(false);
  };

  const handleLogout = async () => {
    try {
      closeDrawer();
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);

      toast.error(
        "Unable to sign out. Please try again."
      );
    }
  };

  return (
    <>
      <nav className="nav-bar">
        <div className="nav-left">
          {isStaff ? (
            <span
              style={{
                color: "white",
                fontWeight: "bold",
              }}
            >
              VanSked {isAdmin ? "Admin" : "Dispatcher"}
            </span>
          ) : currentUser ? (
            <span style={{ color: "white" }}>
              Verifying staff access...
            </span>
          ) : isQrPage ? (
            <Link
              to="/"
              className="nav-icon-link"
              onClick={closeDrawer}
            >
              <BackIcon />
              Back
            </Link>
          ) : (
            <Link
              to="/qr"
              className="nav-icon-link"
              onClick={closeDrawer}
            >
              <QrIcon />
              Share
            </Link>
          )}
        </div>

        <div className="nav-right">
          {isStaff ? (
            <>
              <div className="desktop-links">
                <Link
                  to="/analytics"
                  className="nav-link"
                >
                  Analytics
                </Link>

                <Link
                  to="/templates"
                  className="nav-link"
                >
                  Templates
                </Link>

                {isAdmin && (
                  <>
                    <Link
                      to="/fleet"
                      className="nav-link"
                    >
                      Fleet
                    </Link>

                    <Link
                      to="/migration"
                      className="nav-link"
                    >
                      Public Migration
                    </Link>

                    <Link
                      to="/audit"
                      className="nav-link"
                    >
                      Data Quality Audit
                    </Link>
                  </>
                )}

                <button
                  type="button"
                  onClick={handleLogout}
                  className="nav-btn-logout"
                >
                  Logout
                </button>
              </div>

              <button
                type="button"
                className="hamburger-btn"
                onClick={() =>
                  setIsDrawerOpen(true)
                }
                aria-label="Open staff menu"
                aria-expanded={isDrawerOpen}
                aria-controls="staff-navigation-drawer"
              >
                <HamburgerIcon />
              </button>
            </>
          ) : !currentUser ? (
            isLoginPage ? (
              <Link
                to="/"
                className="nav-icon-link"
                style={{
                  backgroundColor: "transparent",
                  padding: 0,
                }}
              >
                <BackIcon />
                Back
              </Link>
            ) : (
              <Link
                to="/login"
                className="nav-link-login"
              >
                Staff Login
              </Link>
            )
          ) : null}
        </div>
      </nav>

      {isStaff && (
        <>
          {isDrawerOpen && (
            <div
              className="drawer-overlay open"
              onClick={closeDrawer}
              role="presentation"
            />
          )}

          <div
            id="staff-navigation-drawer"
            className={`side-drawer ${
              isDrawerOpen ? "open" : ""
            }`}
            aria-hidden={!isDrawerOpen}
          >
            <div className="drawer-header">
              <div>
                <h3
                  style={{
                    color: "white",
                    margin: 0,
                  }}
                >
                  Staff Menu
                </h3>

                <small
                  style={{
                    color: "#CBD5E1",
                  }}
                >
                  {role === "admin"
                    ? "Administrator"
                    : "Dispatcher"}
                </small>
              </div>

              <button
                type="button"
                onClick={closeDrawer}
                className="close-btn"
                aria-label="Close staff menu"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="drawer-links">
              <Link
                to="/analytics"
                className="drawer-link"
                onClick={closeDrawer}
              >
                Analytics
              </Link>

              <Link
                to="/templates"
                className="drawer-link"
                onClick={closeDrawer}
              >
                Templates
              </Link>

              {isAdmin && (
                <>
                  <Link
                    to="/fleet"
                    className="drawer-link"
                    onClick={closeDrawer}
                  >
                    Fleet Management
                  </Link>

                  <Link
                    to="/migration"
                    className="drawer-link"
                    onClick={closeDrawer}
                  >
                    Public Trip Migration
                  </Link>

                  <Link
                    to="/audit"
                    className="drawer-link"
                    onClick={closeDrawer}
                  >
                    Data Quality Audit
                  </Link>
                </>
              )}
            </div>

            <div className="drawer-footer">
              <button
                type="button"
                onClick={handleLogout}
                className="drawer-logout"
              >
                Logout
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

// --------------------------------------------------
// MAIN APPLICATION CONTENT
// --------------------------------------------------

const AppContent = () => {
  const location = useLocation();

  const { isStaff } = useAuth();

  const isPassengerRoute =
    location.pathname === "/";

  const isDispatcherRoute =
    location.pathname === "/dispatcher";

  const needsStaffReferenceData =
    isStaff &&
    ["/dispatcher", "/templates"].includes(
      location.pathname
    );

  // ------------------------------------------------
  // APPLICATION STATE
  // ------------------------------------------------

  const [passengerSchedules, setPassengerSchedules] =
    useState([]);

  const [staffSchedules, setStaffSchedules] =
    useState([]);

  const [fleet, setFleet] = useState([]);

  const [fares, setFares] = useState({});

  const [isOnline, setIsOnline] = useState(
    () => navigator.onLine
  );

  const [lastUpdated, setLastUpdated] = useState(
    () => new Date()
  );

  const [todayStr, setTodayStr] = useState(
    () => getManilaDate()
  );

  // ------------------------------------------------
  // NETWORK STATUS
  // ------------------------------------------------

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener(
      "online",
      handleOnline
    );

    window.addEventListener(
      "offline",
      handleOffline
    );

    return () => {
      window.removeEventListener(
        "online",
        handleOnline
      );

      window.removeEventListener(
        "offline",
        handleOffline
      );
    };
  }, []);

  // ------------------------------------------------
  // MANILA MIDNIGHT ROLLOVER
  // ------------------------------------------------

  useEffect(() => {
    const interval = window.setInterval(() => {
      const currentDate = getManilaDate();

      setTodayStr((previousDate) => {
        return previousDate !== currentDate
          ? currentDate
          : previousDate;
      });
    }, 60000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  // ------------------------------------------------
  // PUBLIC PASSENGER SCHEDULE SUBSCRIPTION
  // ------------------------------------------------

  useEffect(() => {
    if (!isPassengerRoute) {
      return undefined;
    }

    const publicTripsQuery = query(
      collection(db, "public_trips"),
      where("date", "==", todayStr)
    );

    const unsubscribe = onSnapshot(
      publicTripsQuery,

      (snapshot) => {
        const tripsData = snapshot.docs.map(
          (tripDocument) => ({
            ...tripDocument.data(),
            id: tripDocument.id,
          })
        );

        setPassengerSchedules(
          sortTripsByDeparture(tripsData)
        );

        setLastUpdated(new Date());
      },

      (error) => {
        console.error(
          "Passenger schedule subscription failed:",
          error
        );
      }
    );

    return () => unsubscribe();
  }, [isPassengerRoute, todayStr]);

  // ------------------------------------------------
  // PRIVATE DISPATCH SCHEDULE SUBSCRIPTION
  // ------------------------------------------------

  useEffect(() => {
    if (!isStaff || !isDispatcherRoute) {
      return undefined;
    }

    const privateTripsQuery = query(
      collection(db, "trips"),
      where("date", "==", todayStr)
    );

    const unsubscribe = onSnapshot(
      privateTripsQuery,

      (snapshot) => {
        const tripsData = snapshot.docs.map(
          (tripDocument) => ({
            ...tripDocument.data(),
            id: tripDocument.id,
          })
        );

        setStaffSchedules(
          sortTripsByDeparture(tripsData)
        );
      },

      (error) => {
        console.error(
          "Dispatcher schedule subscription failed:",
          error
        );
      }
    );

    return () => unsubscribe();
  }, [
    isStaff,
    isDispatcherRoute,
    todayStr,
  ]);

  // ------------------------------------------------
  // STAFF REFERENCE DATA
  // ------------------------------------------------

  useEffect(() => {
    if (!needsStaffReferenceData) {
      return undefined;
    }

    const unsubscribeFleet = onSnapshot(
      collection(db, "fleet"),

      (snapshot) => {
        const fleetData = snapshot.docs.map(
          (fleetDocument) => ({
            ...fleetDocument.data(),
            id: fleetDocument.id,
          })
        );

        setFleet(fleetData);
      },

      (error) => {
        console.error(
          "Fleet subscription failed:",
          error
        );
      }
    );

    const unsubscribeFares = onSnapshot(
      collection(db, "fares"),

      (snapshot) => {
        const fareData = {};

        snapshot.docs.forEach((fareDocument) => {
          fareData[fareDocument.id] =
            fareDocument.data().amount;
        });

        setFares(fareData);
      },

      (error) => {
        console.error(
          "Fare subscription failed:",
          error
        );
      }
    );

    return () => {
      unsubscribeFleet();
      unsubscribeFares();
    };
  }, [needsStaffReferenceData]);

  // ------------------------------------------------
  // RENDER APPLICATION
  // ------------------------------------------------

  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3500,
        }}
      />

      <Navigation
        key={location.pathname}
        pathname={location.pathname}
      />

      <FloatingToggle />

      <Suspense
        fallback={
          <div className="loading-screen">
            Loading VanSked...
          </div>
        }
      >
        <Routes>
          <Route
            path="/"
            element={
              <PassengerView
                schedules={passengerSchedules}
                isOnline={isOnline}
                lastUpdated={lastUpdated}
              />
            }
          />

          <Route
            path="/qr"
            element={<QRCodeView />}
          />

          <Route
            path="/login"
            element={<Login />}
          />

          <Route
            path="/dispatcher"
            element={
              <ProtectedRoute
                allowedRoles={[
                  "admin",
                  "dispatcher",
                ]}
              >
                <DispatcherView
                  schedules={staffSchedules}
                  fleet={fleet}
                  fares={fares}
                  isOnline={isOnline}
                />
              </ProtectedRoute>
            }
          />

          <Route
            path="/analytics"
            element={
              <ProtectedRoute
                allowedRoles={[
                  "admin",
                  "dispatcher",
                ]}
              >
                <AnalyticsView />
              </ProtectedRoute>
            }
          />

          <Route
            path="/audit"
            element={
              <ProtectedRoute
                allowedRoles={["admin"]}
              >
                <DataQualityAudit />
              </ProtectedRoute>
            }
          />

          <Route
            path="/templates"
            element={
              <ProtectedRoute
                allowedRoles={[
                  "admin",
                  "dispatcher",
                ]}
              >
                <TemplateManager
                  fleet={fleet}
                  fares={fares}
                />
              </ProtectedRoute>
            }
          />

          <Route
            path="/fleet"
            element={
              <ProtectedRoute
                allowedRoles={["admin"]}
              >
                <FleetManager />
              </ProtectedRoute>
            }
          />

          <Route
            path="/migration"
            element={
              <ProtectedRoute
                allowedRoles={["admin"]}
              >
                <PublicTripMigration />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Suspense>
    </>
  );
};

// --------------------------------------------------
// ROOT APPLICATION
// --------------------------------------------------

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;