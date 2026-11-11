import React from 'react';
import { doc, updateDoc } from 'firebase/firestore'; // Import Firestore functions
import { db } from '../firebase'; // Import database connection

const DispatcherView = ({ schedules }) => {
  
  // This function now updates the FIRESTORE database directly
  const handleStatusChange = async (id, newStatus) => {
    try {
      const tripRef = doc(db, "trips", id);
      await updateDoc(tripRef, {
        status: newStatus
      });
      console.log("Successfully updated to:", newStatus);
    } catch (error) {
      console.error("Error updating document: ", error);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Dispatcher Dashboard</h1>
        <p>Manage Van Statuses</p>
      </header>
      
      <main>
        {schedules.map((schedule) => (
          <div key={schedule.id} style={{ border: '1px solid #ccc', padding: '15px', marginBottom: '15px', borderRadius: '8px', backgroundColor: '#fff' }}>
            <h3>{schedule.departureTime} - {schedule.route}</h3>
            <p>Current Status: <strong style={{ color: schedule.status === 'Full' ? 'red' : 'green' }}>{schedule.status}</strong></p>
            
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button 
                onClick={() => handleStatusChange(schedule.id, 'Boarding')}
                style={{ padding: '8px 12px', cursor: 'pointer' }}>
                Mark Boarding
              </button>
              
              <button 
                onClick={() => handleStatusChange(schedule.id, 'Full')}
                style={{ padding: '8px 12px', cursor: 'pointer', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px' }}>
                Mark Full
              </button>
              
              <button 
                onClick={() => handleStatusChange(schedule.id, 'Departed')}
                style={{ padding: '8px 12px', cursor: 'pointer', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px' }}>
                Mark Departed
              </button>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
};

export default DispatcherView;