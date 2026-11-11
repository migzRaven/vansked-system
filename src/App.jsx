import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import PassengerView from './components/PassengerView';
import DispatcherView from './components/DispatcherView';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      {/* Simple navigation to switch between views for testing */}
      <nav style={{ textAlign: 'center', padding: '10px', backgroundColor: '#333' }}>
        <Link to="/" style={{ color: 'white', marginRight: '20px' }}>Passenger View</Link>
        <Link to="/dispatcher" style={{ color: 'white' }}>Dispatcher View</Link>
      </nav>

      <Routes>
        <Route path="/" element={<PassengerView />} />
        <Route path="/dispatcher" element={<DispatcherView />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;