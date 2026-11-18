import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore'; // Removed orderBy
import { db } from './firebase';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

import PassengerView from './components/PassengerView';
import DispatcherView from './components/DispatcherView';
import TemplateManager from './components/TemplateManager';
import FleetManager from './components/FleetManager';
import QRCodeView from './components/QRCodeView';
import Login from './components/Login';
import './App.css';
import AnalyticsView from './components/AnalyticsView';

const Navigation = () => {
  const { currentUser, logout } = useAuth();
  
  return (
    <nav className="nav-bar">
      <Link to="/" className="nav-link">Passenger Board</Link>
      <Link to="/qr" className="nav-link">QR Code</Link>
      
      {currentUser ? (
        <>
          <Link to="/dispatcher" className="nav-link">Dispatcher</Link>
           <Link to="/analytics" className="nav-link">Analytics</Link>
          <Link to="/templates" className="nav-link">Templates</Link>
          <Link to="/fleet" className="nav-link">Fleet</Link>
          <button onClick={logout} className="nav-btn-logout">Logout</button>
        </>
      ) : (
        <Link to="/login" className="nav-link" style={{ color: '#ffc107' }}>Staff Login</Link>
      )}
    </nav>
  );
};

const AppContent = () => {
  const [schedules, setSchedules] = useState([]);

  useEffect(() => {
    // Get today's date in YYYY-MM-DD format specifically for Manila timezone
    const todayStr = new Intl.DateTimeFormat('en-CA', { 
      timeZone: 'Asia/Manila', 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    }).format(new Date());

    // 1. Fetch only today's trips (removed orderBy to avoid Composite Index requirement)
    const q = query(
      collection(db, "trips"), 
      where("date", "==", todayStr)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tripsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // 2. Sort locally by departureAt timestamp
      tripsData.sort((a, b) => {
        if (!a.departureAt || !b.departureAt) return 0;
        return a.departureAt.toMillis() - b.departureAt.toMillis();
      });

      setSchedules(tripsData);
    }, (error) => {
      // 3. Added an error handler so we can see if Firebase blocks the read
      console.error("Firestore error: ", error);
      alert("Failed to load schedule: " + error.message);
    });

    return () => unsubscribe();
  }, []);

  return (
    <BrowserRouter>
      <Navigation />
      <Routes>
        <Route path="/" element={<PassengerView schedules={schedules} />} />
        <Route path="/qr" element={<QRCodeView />} />
        <Route path="/login" element={<Login />} />
        
        <Route path="/dispatcher" element={<ProtectedRoute><DispatcherView schedules={schedules} /></ProtectedRoute>} />
        <Route path="/templates" element={<ProtectedRoute><TemplateManager /></ProtectedRoute>} />
        <Route path="/fleet" element={<ProtectedRoute><FleetManager /></ProtectedRoute>} />
        <Route path="/analytics" element={<ProtectedRoute><AnalyticsView /></ProtectedRoute>} />
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