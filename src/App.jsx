import React, { useState, useEffect, useRef } from 'react';
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

const BusIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-1.1 0-2 .9-2 2v7c0 .6.4 1 1 1h2"></path>
    <circle cx="7" cy="17" r="2"></circle>
    <path d="M9 17h6"></path>
    <circle cx="17" cy="17" r="2"></circle>
  </svg>
);

const DashboardIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="3" y1="9" x2="21" y2="9"></line>
    <line x1="9" y1="21" x2="9" y2="9"></line>
  </svg>
);

// --- FLOATING TOGGLE COMPONENT (Telegram Style) ---
const FloatingToggle = () => {
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  const isDispatcherPage = location.pathname === '/dispatcher';
  const isPassengerPage = location.pathname === '/';
  
  const [position, setPosition] = useState({ x: window.innerWidth - 30, y: window.innerHeight - 150 });
  const [isSnapped, setIsSnapped] = useState(false);
  
  const dragStart = useRef({ x: 0, y: 0 });
  const fabStart = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);
  const idleTimer = useRef(null);

  const FAB_SIZE = 56; // 56px width/height

  const snapToEdge = (currentX) => {
    const screenWidth = window.innerWidth;
    const isLeft = currentX < screenWidth / 2;
    
    // Telegram style: half hidden off the edge
    const targetX = isLeft ? -(FAB_SIZE / 2) + 8 : screenWidth - (FAB_SIZE / 2) - 8;
    
    setPosition(prev => ({ ...prev, x: targetX }));
    setIsSnapped(true);
  };

  const startIdleTimer = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      snapToEdge(position.x);
    }, 3000);
  };

  const handlePointerDown = (e) => {
    e.target.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY };
    fabStart.current = { x: position.x, y: position.y };
    hasMoved.current = false;
    setIsSnapped(false); // Expand it when they touch it
    if (idleTimer.current) clearTimeout(idleTimer.current);
  };

  const handlePointerMove = (e) => {
    if (!e.target.hasPointerCapture(e.pointerId)) return;
    
    const deltaX = e.clientX - dragStart.current.x;
    const deltaY = e.clientY - dragStart.current.y;
    
    // Check if moved more than 5 pixels (drag threshold)
    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
      hasMoved.current = true;
    }

    if (hasMoved.current) {
      let newX = fabStart.current.x + deltaX;
      let newY = fabStart.current.y + deltaY;

      // Keep within screen bounds vertically
      newY = Math.max(70, Math.min(newY, window.innerHeight - 100));
      
      // Allow dragging slightly off-screen horizontally for the snap effect
      newX = Math.max(-(FAB_SIZE/2), Math.min(newX, window.innerWidth - (FAB_SIZE/2)));

      setPosition({ x: newX, y: newY });
    }
  };

  const handlePointerUp = (e) => {
    e.target.releasePointerCapture(e.pointerId);
    
    if (hasMoved.current) {
      // It was a drag, snap to edge
      snapToEdge(position.x);
    } else {
      // It was a tap/click
      if (isSnapped) {
        // If it was snapped and tapped, expand it and start timer
        setIsSnapped(false);
        startIdleTimer();
      } else {
        // If it was expanded and tapped, navigate!
        navigate(isPassengerPage ? '/dispatcher' : '/');
      }
    }
  };

  useEffect(() => {
    startIdleTimer();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  if (!currentUser || (!isDispatcherPage && !isPassengerPage)) return null;

  return (
    <div
      className={`fab-toggle ${isSnapped ? 'snapped' : ''}`}
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="fab-icon">
        {isPassengerPage ? <DashboardIcon /> : <BusIcon />}
      </div>
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