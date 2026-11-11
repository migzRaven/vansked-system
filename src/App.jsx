import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore'; // Import Firestore functions
import { db } from './firebase'; // Import our database connection
import PassengerView from './components/PassengerView';
import DispatcherView from './components/DispatcherView';
import './App.css';
import QRCodeView from './components/QRCodeView';

function App() {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  // This useEffect runs once when the app loads
  useEffect(() => {
    // We listen to a collection called "trips"
    const unsubscribe = onSnapshot(collection(db, "trips"), (snapshot) => {
      // Every time the database changes, this runs!
      const scheduleData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSchedules(scheduleData);
      setLoading(false);
    });

    // Cleanup listener when component unmounts
    return () => unsubscribe();
  }, []);

  if (loading) return <div style={{textAlign: 'center', marginTop: '50px'}}>Loading live schedule...</div>;

  return (
    <BrowserRouter>
      <nav style={{ textAlign: 'center', padding: '15px', backgroundColor: '#333' }}>
        <Link to="/" style={{ color: 'white', marginRight: '20px', textDecoration: 'none' }}>Passenger View</Link>
        <Link to="/dispatcher" style={{ color: 'white', textDecoration: 'none' }}>Dispatcher Console</Link>
        <Link to="/qr" style={{ color: 'white', textDecoration: 'none' }}>Terminal QR Code</Link>
      </nav>

      <Routes>
        {/* We only pass schedules now, no more updateScheduleStatus */}
        <Route path="/" element={<PassengerView schedules={schedules} />} />
        <Route path="/dispatcher" element={<DispatcherView schedules={schedules} />} />
        <Route path="/qr" element={<QRCodeView />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;