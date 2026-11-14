import React, { useState } from 'react';
import { doc, updateDoc, addDoc, deleteDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';
import SeatMap from './SeatMap';

const DispatcherView = ({ schedules }) => {
  const [newTrip, setNewTrip] = useState({
    departureTime: '',
    route: '',
    driver: '',
    plateNumber: '',
    fare: '',
    status: 'Waiting'
  });

  // Logic when a dispatcher clicks a seat
  const handleSeatClick = async (tripId, seatIndex, currentStatus, currentSeats) => {
    // 1. Cycle the seat status: Empty -> Reserved -> Taken -> Empty
    let nextStatus = 'empty';
    if (currentStatus === 'empty') nextStatus = 'reserved';
    else if (currentStatus === 'reserved') nextStatus = 'taken';
    
    // 2. Update the array
    const updatedSeats = [...currentSeats];
    updatedSeats[seatIndex] = nextStatus;

    // 3. Check if the van is now full
    const occupiedSeats = updatedSeats.filter(s => s === 'taken' || s === 'reserved').length;
    let newVanStatus = 'Boarding';
    
    if (occupiedSeats === updatedSeats.length) {
      newVanStatus = 'Full'; // Auto-trigger Full!
    } else if (occupiedSeats === 0) {
      newVanStatus = 'Waiting';
    }

    // 4. Save to Firebase
    try {
      const tripRef = doc(db, "trips", tripId);
      await updateDoc(tripRef, {
        seats: updatedSeats,
        status: newVanStatus
      });
    } catch (error) {
      console.error("Error updating seats: ", error);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Delete this trip?")) {
      await deleteDoc(doc(db, "trips", id));
    }
  };

  const handleAddTrip = async (e) => {
    e.preventDefault();
    try {
      // Create 15 empty seats by default
      const initialSeats = Array(15).fill('empty');
      await addDoc(collection(db, "trips"), { ...newTrip, seats: initialSeats });
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
        <p>Manage Statuses & Seats</p>
      </header>

      <div style={{ backgroundColor: '#e9ecef', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        <h3>Add New Trip</h3>
        <form onSubmit={handleAddTrip} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input type="text" name="departureTime" placeholder="Time (e.g., 4:00 PM)" value={newTrip.departureTime} onChange={handleInputChange} required style={{ padding: '8px' }} />
          <input type="text" name="route" placeholder="Route" value={newTrip.route} onChange={handleInputChange} required style={{ padding: '8px' }} />
          <input type="text" name="driver" placeholder="Driver Name" value={newTrip.driver} onChange={handleInputChange} required style={{ padding: '8px' }} />
          <input type="text" name="plateNumber" placeholder="Plate Number" value={newTrip.plateNumber} onChange={handleInputChange} required style={{ padding: '8px' }} />
          <input type="text" name="fare" placeholder="Fare" value={newTrip.fare} onChange={handleInputChange} required style={{ padding: '8px' }} />
          <button type="submit" style={{ padding: '10px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Add Trip to Board</button>
        </form>
      </div>
      
      <main>
        {schedules.map((schedule) => (
          <div key={schedule.id} style={{ border: '1px solid #ccc', padding: '15px', marginBottom: '15px', borderRadius: '8px', backgroundColor: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <h3>{schedule.departureTime} - {schedule.route}</h3>
              <button onClick={() => handleDelete(schedule.id)} style={{ color: 'red', border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 'bold' }}>Delete ✕</button>
            </div>
            
            <p>Status: <strong style={{ color: schedule.status === 'Full' ? 'red' : 'green' }}>{schedule.status}</strong></p>
            
            {/* Legend for the Dispatcher */}
            <div style={{ fontSize: '12px', marginBottom: '10px', display: 'flex', gap: '10px' }}>
               <span>🟢 Empty</span>
               <span>🟡 Reserved (Call)</span>
               <span>🔴 Taken (Walk-in)</span>
            </div>

            {/* Render Seat Map ONLY if seats array exists */}
            {schedule.seats ? (
               <SeatMap 
                 seats={schedule.seats} 
                 onSeatClick={(index, status) => handleSeatClick(schedule.id, index, status, schedule.seats)} 
               />
            ) : (
              <p style={{fontSize: '12px', color: 'red'}}>⚠️ Old trip format. Delete and re-add this trip.</p>
            )}
            
            <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
              <button onClick={() => updateDoc(doc(db, "trips", schedule.id), {status: 'Departed'})} style={{ padding: '8px 12px', cursor: 'pointer', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px' }}>Force Depart</button>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
};

export default DispatcherView;