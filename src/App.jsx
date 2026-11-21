import React, { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Toaster } from 'react-hot-toast';
import { db } from './firebase';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

const PassengerView = lazy(() => import('./components/PassengerView'));
const DispatcherView = lazy(() => import('./components/DispatcherView'));
const TemplateManager = lazy(() => import('./components/TemplateManager'));
const FleetManager = lazy(() => import('./components/FleetManager'));
const AnalyticsView = lazy(() => import('./components/AnalyticsView'));
const QRCodeView = lazy(() => import('./components/QRCodeView'));
const Login = lazy(() => import('./components/Login'));
import './App.css';

// --- ICONS ---
const QrIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
    <rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>
  </svg>
);
const BackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
    <line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>
  </svg>
);
const HamburgerIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line>
  </svg>
);
const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);
const ChevronRight = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
);

const FloatingToggle = () => {
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const handlePressStart = (e) => {
      if (e.target && !e.target.closest('.fab-rectangle')) setIsCollapsed(true);
    };
    const handlePressEnd = () => setIsCollapsed(false);
    window.addEventListener('touchstart', handlePressStart, { passive: true });
    window.addEventListener('touchend', handlePressEnd);
    window.addEventListener('mousedown', handlePressStart);
    window.addEventListener('mouseup', handlePressEnd);
    return () => {
      window.removeEventListener('touchstart', handlePressStart);
      window.removeEventListener('touchend', handlePressEnd);
      window.removeEventListener('mousedown', handlePressStart);
      window.removeEventListener('mouseup', handlePressEnd);
    };
  }, []);

  if (!currentUser || location.pathname === '/login' || location.pathname === '/qr') return null;

  const isPassengerView = location.pathname === '/';
  const isDispatcherView = location.pathname === '/dispatcher';
  
  let buttonText = 'Dashboard';
  let btnClass = 'btn-go-dispatcher';
  let destination = '/dispatcher';

  if (isPassengerView) { buttonText = 'Dispatcher'; destination = '/dispatcher'; }
  else if (isDispatcherView) { buttonText = 'Passenger'; btnClass = 'btn-go-passenger'; destination = '/'; }

  return (
    <button className={`fab-rectangle ${btnClass} ${isCollapsed ? 'collapsed' : ''}`} onClick={() => navigate(destination)} aria-label={`Switch to ${buttonText} view`}>
      <span className="fab-text">{buttonText}</span>
      <span className="fab-arrow"><ChevronRight /></span>
    </button>
  );
};

const Navigation = () => {
  const { currentUser, logout } = useAuth();
  const location = useLocation();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const isQrPage = location.pathname === '/qr';
  const isLoginPage = location.pathname === '/login';

  useEffect(() => { setIsDrawerOpen(false); }, [location.pathname]);
  
  return (
    <>
      <nav className="nav-bar">
        <div className="nav-left">
          {currentUser ? (
             <span style={{ color: 'white', fontWeight: 'bold' }}>VanSked Admin</span>
          ) : (
            isQrPage ? (
              <Link to="/" className="nav-icon-link"><BackIcon /> Back</Link>
            ) : (
              <Link to="/qr" className="nav-icon-link"><QrIcon /> Share</Link>
            )
          )}
        </div>
        <div className="nav-right">
          {currentUser ? (
            <>
              <div className="desktop-links">
                <Link to="/analytics" className="nav-link">Analytics</Link>
                <Link to="/templates" className="nav-link">Templates</Link>
                <Link to="/fleet" className="nav-link">Fleet</Link>
                <button onClick={logout} className="nav-btn-logout">Logout</button>
              </div>
              <button className="hamburger-btn" onClick={() => setIsDrawerOpen(true)}>
                <HamburgerIcon />
              </button>
            </>
          ) : (
            isLoginPage ? (
              <Link to="/" className="nav-icon-link" style={{ backgroundColor: 'transparent', padding: 0 }}>
                <BackIcon /> Back
              </Link>
            ) : (
              <Link to="/login" className="nav-link-login">Staff Login</Link>
            )
          )}
        </div>
      </nav>

      {currentUser && (
        <>
          <div className={`drawer-overlay ${isDrawerOpen ? 'open' : ''}`} onClick={() => setIsDrawerOpen(false)}></div>
          <div className={`side-drawer ${isDrawerOpen ? 'open' : ''}`}>
            <div className="drawer-header">
              <h3 style={{ color: 'white', margin: 0 }}>Staff Menu</h3>
              <button onClick={() => setIsDrawerOpen(false)} className="close-btn"><CloseIcon /></button>
            </div>
            <div className="drawer-links">
              <Link to="/analytics" className="drawer-link">Analytics</Link>
              <Link to="/templates" className="drawer-link">Templates</Link>
              <Link to="/fleet" className="drawer-link">Fleet</Link>
            </div>
            <div className="drawer-footer">
              <button onClick={logout} className="drawer-logout">Logout</button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

const AppContent = () => {
  const [schedules, setSchedules] = useState([]);
  const [fleet, setFleet] = useState([]);
  const [fares, setFares] = useState({});
  
  // NEW: Track network status and last updated time
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const [todayStr, setTodayStr] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));

  // Network listeners
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Midnight Rollover
  useEffect(() => {
    const interval = setInterval(() => {
      const currentDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      setTodayStr(prev => prev !== currentDate ? currentDate : prev);
    }, 60000); 
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsubFleet = onSnapshot(collection(db, "fleet"), (snap) => setFleet(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubFares = onSnapshot(collection(db, "fares"), (snap) => {
      const fareData = {}; snap.docs.forEach(d => { fareData[d.id] = d.data().amount; });
      setFares(fareData);
    });
    return () => { unsubFleet(); unsubFares(); };
  }, []);

  useEffect(() => {
    const q = query(collection(db, "trips"), where("date", "==", todayStr));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tripsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      tripsData.sort((a, b) => {
        if (!a.departureAt || !b.departureAt) return 0;
        return a.departureAt.toMillis() - b.departureAt.toMillis();
      });
      setSchedules(tripsData);
      setLastUpdated(new Date()); // Update sync time
    }, (error) => {
      console.error("Firestore error: ", error);
    });
    return () => unsubscribe();
  }, [todayStr]);

  return (
    <BrowserRouter>
      <Toaster position="top-center" />
      <Navigation />
      <FloatingToggle />
      
      <Suspense fallback={<div className="loading-screen">Loading VanSked...</div>}>
        <Routes>
          {/* Pass the new network props to PassengerView */}
          <Route path="/" element={<PassengerView schedules={schedules} isOnline={isOnline} lastUpdated={lastUpdated} />} />
          <Route path="/qr" element={<QRCodeView />} />
          <Route path="/login" element={<Login />} />
          
          <Route path="/dispatcher" element={<ProtectedRoute><DispatcherView schedules={schedules} fleet={fleet} fares={fares} /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><AnalyticsView /></ProtectedRoute>} />
          <Route path="/templates" element={<ProtectedRoute><TemplateManager fleet={fleet} fares={fares} /></ProtectedRoute>} />
          <Route path="/fleet" element={<ProtectedRoute><FleetManager /></ProtectedRoute>} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;