import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

import PassengerView from './components/PassengerView';
import DispatcherView from './components/DispatcherView';
import TemplateManager from './components/TemplateManager';
import FleetManager from './components/FleetManager';
import AnalyticsView from './components/AnalyticsView';
import QRCodeView from './components/QRCodeView';
import Login from './components/Login';
import './App.css';

// --- ICONS ---
const QrIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
    <rect x="3" y="3" width="7" height="7"></rect>
    <rect x="14" y="3" width="7" height="7"></rect>
    <rect x="14" y="14" width="7" height="7"></rect>
    <rect x="3" y="14" width="7" height="7"></rect>
  </svg>
);

const BackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
    <line x1="19" y1="12" x2="5" y2="12"></line>
    <polyline points="12 19 5 12 12 5"></polyline>
  </svg>
);

const HamburgerIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="12" x2="21" y2="12"></line>
    <line x1="3" y1="6" x2="21" y2="6"></line>
    <line x1="3" y1="18" x2="21" y2="18"></line>
  </svg>
);

const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

// Formal SVG Chevron
const ChevronRight = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
);

// --- FLOATING TOGGLE COMPONENT (Smart Rectangle) ---
const FloatingToggle = () => {
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  const isDispatcherPage = location.pathname === '/dispatcher';
  const isPassengerPage = location.pathname === '/';
  
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    // Use touch and mouse events to avoid scroll-cancellation bugs
    const handlePressStart = (e) => {
      // If the touch/click is NOT on the button itself, collapse it
      if (e.target && !e.target.closest('.fab-rectangle')) {
        setIsCollapsed(true);
      }
    };

    const handlePressEnd = () => {
      // When finger/mouse lifts, expand it
      setIsCollapsed(false);
    };

    // Mobile Events
    window.addEventListener('touchstart', handlePressStart, { passive: true });
    window.addEventListener('touchend', handlePressEnd);
    
    // Desktop Events
    window.addEventListener('mousedown', handlePressStart);
    window.addEventListener('mouseup', handlePressEnd);

    return () => {
      window.removeEventListener('touchstart', handlePressStart);
      window.removeEventListener('touchend', handlePressEnd);
      window.removeEventListener('mousedown', handlePressStart);
      window.removeEventListener('mouseup', handlePressEnd);
    };
  }, []);

  if (!currentUser || (!isDispatcherPage && !isPassengerPage)) return null;

  const isPassengerView = isPassengerPage;
  const buttonText = isPassengerView ? 'Dispatcher' : 'Passenger';
  
  // SPOTC Green for Dispatcher, Blue for Passenger
  const btnClass = isPassengerView ? 'btn-go-dispatcher' : 'btn-go-passenger';
  const destination = isPassengerView ? '/dispatcher' : '/';

  return (
    <div 
      className={`fab-rectangle ${btnClass} ${isCollapsed ? 'collapsed' : ''}`}
      onClick={() => navigate(destination)}
    >
      <span className="fab-text">{buttonText}</span>
      <span className="fab-arrow"><ChevronRight /></span>
    </div>
  );
};

// --- NAVIGATION COMPONENT ---
const Navigation = () => {
  const { currentUser, logout } = useAuth();
  const location = useLocation();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  const isQrPage = location.pathname === '/qr';
  const isLoginPage = location.pathname === '/login';

  useEffect(() => {
    setIsDrawerOpen(false);
  }, [location.pathname]);
  
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
            <button onClick={logout} className="drawer-logout">Logout</button>
          </div>
        </>
      )}
    </>
  );
};

const AppContent = () => {
  const [schedules, setSchedules] = useState([]);

  useEffect(() => {
    const todayStr = new Intl.DateTimeFormat('en-CA', { 
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' 
    }).format(new Date());

    const q = query(collection(db, "trips"), where("date", "==", todayStr));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tripsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      tripsData.sort((a, b) => {
        if (!a.departureAt || !b.departureAt) return 0;
        return a.departureAt.toMillis() - b.departureAt.toMillis();
      });
      setSchedules(tripsData);
    }, (error) => {
      console.error("Firestore error: ", error);
    });

    return () => unsubscribe();
  }, []);

  return (
    <BrowserRouter>
      <Navigation />
      <FloatingToggle />

      <Routes>
        <Route path="/" element={<PassengerView schedules={schedules} />} />
        <Route path="/qr" element={<QRCodeView />} />
        <Route path="/login" element={<Login />} />
        
        <Route path="/dispatcher" element={<ProtectedRoute><DispatcherView schedules={schedules} /></ProtectedRoute>} />
        <Route path="/analytics" element={<ProtectedRoute><AnalyticsView /></ProtectedRoute>} />
        <Route path="/templates" element={<ProtectedRoute><TemplateManager /></ProtectedRoute>} />
        <Route path="/fleet" element={<ProtectedRoute><FleetManager /></ProtectedRoute>} />
      </Routes>
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