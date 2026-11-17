import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

// Import Components
import PassengerView from './components/PassengerView';
import DispatcherView from './components/DispatcherView';
import TemplateManager from './components/TemplateManager';
import FleetManager from './components/FleetManager';
import QRCodeView from './components/QRCodeView';
import Login from './components/Login';
import './App.css';

// Navigation Component to handle Logout
const Navigation = () => {
  const { currentUser, logout } = useAuth();
  
  return (
    <nav style={{ textAlign: 'center', padding: '15px', backgroundColor: '#333' }}>
      <Link to="/" style={{ color: 'white', marginRight: '15px', textDecoration: 'none' }}>Passenger Board</Link>
      <Link to="/qr" style={{ color: 'white', marginRight: '15px', textDecoration: 'none' }}>QR Code</Link>
      
      {/* Only show admin links if logged in */}
      {currentUser ? (
        <>
          <Link to="/dispatcher" style={{ color: 'white', marginRight: '15px', textDecoration: 'none' }}>Dispatcher</Link>
          <Link to="/templates" style={{ color: 'white', marginRight: '15px', textDecoration: 'none' }}>Templates</Link>
          <Link to="/fleet" style={{ color: 'white', marginRight: '15px', textDecoration: 'none' }}>Fleet</Link>
          <button onClick={logout} style={{ color: '#ffc107', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Logout</button>
        </>
      ) : (
        <Link to="/login" style={{ color: '#ffc107', textDecoration: 'none' }}>Staff Login</Link>
      )}
    </nav>
  );
};

const AppContent = () => {
  const [schedules, setSchedules] = useState([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "trips"), (snapshot) => {
      setSchedules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  return (
    <BrowserRouter>
      <Navigation />
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<PassengerView schedules={schedules} />} />
        <Route path="/qr" element={<QRCodeView />} />
        <Route path="/login" element={<Login />} />
        
        {/* Protected Admin Routes */}
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