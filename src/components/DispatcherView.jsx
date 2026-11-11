import React from 'react';
import { vanSchedules } from '../mockData';

const DispatcherView = () => {
  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Dispatcher Dashboard</h1>
        <p>Manage Van Statuses</p>
      </header>
      
      <main>
        {vanSchedules.map((schedule) => (
          <div key={schedule.id} style={{ border: '1px solid #ccc', padding: '15px', marginBottom: '15px', borderRadius: '8px', backgroundColor: '#fff' }}>
            <h3>{schedule.departureTime} - {schedule.route}</h3>
            <p>Current Status: <strong>{schedule.status}</strong></p>
            
            {/* These buttons will trigger events later! */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button style={{ padding: '8px 12px', cursor: 'pointer' }}>Mark Boarding</button>
              <button style={{ padding: '8px 12px', cursor: 'pointer', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px' }}>Mark Full</button>
              <button style={{ padding: '8px 12px', cursor: 'pointer' }}>Mark Departed</button>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
};

export default DispatcherView;