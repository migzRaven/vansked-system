import React, { useState } from 'react';
import { doc, updateDoc, addDoc, deleteDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';

const DispatcherView = ({ schedules }) => {
  // State for the "Add Trip" form
  const [newTrip, setNewTrip] = useState({
    departureTime: '',
    route: '',
    driver: '',
    plateNumber: '',
    fare: '',
    status: 'Waiting' // Default status
  });

  const handleStatusChange = async (id, newStatus) => {
    try {
      const tripRef = doc(db, "trips", id);
      await updateDoc(tripRef, { status: newStatus });
    } catch (error) {
      console.error("Error updating document: ", error);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this trip?")) {
      try {
        await deleteDoc(doc(db, "trips", id));
      } catch (error) {
        console.error("Error deleting document: ", error);
      }
    }
  };

  const handleAddTrip = async (e) => {
    e.preventDefault(); // Prevent page reload
    try {
      await addDoc(collection(db, "trips"), newTrip);
      // Clear the form after adding
      setNewTrip({ departureTime: '', route: '', driver: '', plateNumber: '', fare: '', status: 'Waiting' });
    } catch (error) {
      console.error("Error adding document: ", error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewTrip({ ...newTrip, [name]: value });
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Dispatcher Dashboard</h1>
        <p>Manage Van Statuses</p>
      </header>

      {/* ADD TRIP FORM */}
      <div style={{ backgroundColor: '#e9ecef', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        <h3>Add New Trip</h3>
        <form onSubmit={handleAddTrip} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input type="text" name="departureTime" placeholder="Time (e.g., 4:00 PM)" value={newTrip.departureTime} onChange={handleInputChange} required style={{ padding: '8px' }} />
          <input type="text" name="route" placeholder="Route (e.g., St. Bernard to Tacloban Airport)" value={newTrip.route} onChange={handleInputChange} required style={{ padding: '8px' }} />
          <input type="text" name="driver" placeholder="Driver Name" value={newTrip.driver} onChange={handleInputChange} required style={{ padding: '8px' }} />
          <input type="text" name="plateNumber" placeholder="Plate Number" value={newTrip.plateNumber} onChange={handleInputChange} required style={{ padding: '8px' }} />
          <input type="text" name="fare" placeholder="Fare (e.g., ₱150.00)" value={newTrip.fare} onChange={handleInputChange} required style={{ padding: '8px' }} />
          <button type="submit" style={{ padding: '10px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Add Trip to Board</button>
        </form>
      </div>
      
      <main>
        {schedules.map((schedule) => (
          <div key={schedule.id} style={{ border: '1px solid #ccc', padding: '15px', marginBottom: '15px', borderRadius: '8px', backgroundColor: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <h3>{schedule.departureTime} - {schedule.route}</h3>
              <button onClick={() => handleDelete(schedule.id)} style={{ backgroundColor: 'transparent', color: 'red', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Delete ✕</button>
            </div>
            
            <p>Current Status: <strong style={{ color: schedule.status === 'Full' ? 'red' : 'green' }}>{schedule.status}</strong></p>
            
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button onClick={() => handleStatusChange(schedule.id, 'Boarding')} style={{ padding: '8px 12px', cursor: 'pointer' }}>Mark Boarding</button>
              <button onClick={() => handleStatusChange(schedule.id, 'Full')} style={{ padding: '8px 12px', cursor: 'pointer', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px' }}>Mark Full</button>
              <button onClick={() => handleStatusChange(schedule.id, 'Departed')} style={{ padding: '8px 12px', cursor: 'pointer', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px' }}>Mark Departed</button>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
};

export default DispatcherView;