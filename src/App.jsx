import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore'; // Added query, where, orderBy
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

const Navigation = () => {
  const { currentUser, logout } = useAuth();
  
  return (
    <nav className="nav-bar">
      <Link to="/" className="nav-link">Passenger Board</Link>
      <Link to="/qr" className="nav-link">QR Code</Link>
      
      {currentUser ? (
        <>
          <Link to="/dispatcher" className="nav-link">Dispatcher</Link>
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

    // Query only today's trips, sorted by the sortable departureAt timestamp
    const q = query(
      collection(db, "trips"), 
      where("date", "==", todayStr),
      orderBy("departureAt", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSchedules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
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