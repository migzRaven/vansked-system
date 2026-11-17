import React, { useState, useEffect } from 'react';
import { doc, updateDoc, addDoc, deleteDoc, collection, getDocs, onSnapshot, writeBatch, Timestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import './DispatcherView.css';

// Convert "14:30" to "2:30 PM"
const formatTimeDisplay = (time24) => {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':');
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
};

// Convert "14:30" to Firebase Timestamp for TODAY (Manila time)
const getTimestampForToday = (time24) => {
  if (!time24) return null;
  const now = new Date();
  const manilaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const isoString = `${manilaDate}T${time24}:00+08:00`;
  return Timestamp.fromDate(new Date(isoString));
};

const DESTINATIONS = ['Tacloban', 'Sogod', 'Bato'];

const DispatcherTripCard = ({ schedule, handleDelete }) => {
  const [isDeparting, setIsDeparting] = useState(false);
  const [isFull, setIsFull] = useState(true);
  const [vacantSeats, setVacantSeats] = useState(0);

  const confirmDeparture = async () => {
    try {
      await updateDoc(doc(db, "trips", schedule.id), { 
        status: 'Departed', 
        vacantSeats: isFull ? 0 : parseInt(vacantSeats) || 0 
      });
      setIsDeparting(false);
    } catch (error) {
      alert("Error updating status: " + error.message);
    }
  };

  return (
    <div className="trip-card">
      <div className="trip-header">
        <h3>{schedule.departureTime} - {schedule.route}</h3>
        <button onClick={() => handleDelete(schedule.id)} className="btn-outline">Delete ✕</button>
      </div>
      
      <p>Status: <strong className={schedule.status === 'Full' ? 'text-danger' : 'text-success'}>{schedule.status}</strong></p>
      <p style={{ fontSize: '13px', color: '#555' }}>Driver: {schedule.driver} ({schedule.plateNumber})</p>
      
      {schedule.status === 'Departed' && (
        <p style={{ fontSize: '14px', color: '#666' }}>Vacant Seats: {schedule.vacantSeats || 0}</p>
      )}
      
      <div className="trip-actions">
        {schedule.status !== 'Departed' && (
          <>
            <button onClick={() => setIsDeparting(!isDeparting)} className="btn btn-secondary">Mark Departed</button>
            <button onClick={() => updateDoc(doc(db, "trips", schedule.id), { status: 'Full' })} className="btn btn-danger">Mark Full</button>
            <button onClick={() => updateDoc(doc(db, "trips", schedule.id), { status: 'Boarding' })} className="btn btn-success">Mark Boarding</button>
          </>
        )}
      </div>

      {isDeparting && (
        <div className="departure-dialog">
          <h4 style={{ marginBottom: '10px' }}>Departure Details</h4>
          <div className="dialog-options">
            <label><input type="radio" checked={isFull} onChange={() => setIsFull(true)} /> Full</label>
            <label><input type="radio" checked={!isFull} onChange={() => setIsFull(false)} /> Has Vacant Seats</label>
          </div>
          {!isFull && <input type="number" min="1" placeholder="Vacant seats" value={vacantSeats} onChange={(e) => setVacantSeats(e.target.value)} className="input-field" style={{ marginBottom: '10px' }} />}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={confirmDeparture} className="btn btn-success">Confirm</button>
            <button onClick={() => setIsDeparting(false)} className="btn btn-danger">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

const DispatcherView = ({ schedules }) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [fleet, setFleet] = useState([]);
  const [fares, setFares] = useState({});
  
  const [newTrip, setNewTrip] = useState({ 
    time24: '', 
    destination: 'Tacloban', 
    driver: '', 
    plateNumber: '', 
    phone: '', 
    fare: '', 
    status: 'Waiting' 
  });

  // Fetch Fleet and Fares
  useEffect(() => {
    const unsubFleet = onSnapshot(collection(db, "fleet"), (snap) => {
      setFleet(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubFares = onSnapshot(collection(db, "fares"), (snap) => {
      const fareData = {};
      snap.docs.forEach(d => { fareData[d.id] = d.data().amount; });
      setFares(fareData);
    });
    return () => { unsubFleet(); unsubFares(); };
  }, []);

  // Update fare when destination changes
  useEffect(() => {
    if (fares[newTrip.destination]) {
      setNewTrip(prev => ({ ...prev, fare: fares[newTrip.destination] }));
    }
  }, [newTrip.destination, fares]);

  const handleDriverSelect = (e) => {
    const selectedVan = fleet.find(v => v.plateNumber === e.target.value);
    if (selectedVan) setNewTrip({ ...newTrip, driver: selectedVan.driver, plateNumber: selectedVan.plateNumber, phone: selectedVan.phone || '' });
    else setNewTrip({ ...newTrip, driver: '', plateNumber: '', phone: '' });
  };

  const handleSaveDefaultFare = async () => {
    try {
      await setDoc(doc(db, "fares", newTrip.destination), { amount: newTrip.fare });
      alert(`Default fare for ${newTrip.destination} updated to ₱${newTrip.fare}`);
    } catch (error) {
      alert("Error saving fare: " + error.message);
    }
  };

  const handleGenerateBoard = async () => {
    if (!window.confirm("Generate today's trips from templates?")) return;
    setIsGenerating(true);
    
    try {
      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const todayDay = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', weekday: 'short' }).format(new Date());
      
      const groupsSnapshot = await getDocs(collection(db, "schedule_groups"));
      const batch = writeBatch(db); 
      let addedCount = 0;

      for (const groupDoc of groupsSnapshot.docs) {
        if (groupDoc.data().days?.[todayDay]) {
          const tripsSnapshot = await getDocs(collection(db, "schedule_groups", groupDoc.id, "trips"));
          
          for (const tripDoc of tripsSnapshot.docs) {
            const trip = tripDoc.data();
            const newTripRef = doc(db, "trips", `${todayStr}_${tripDoc.id}`);
            
            if (!schedules.some(s => s.id === newTripRef.id)) {
              batch.set(newTripRef, {
                date: todayStr,
                departureAt: getTimestampForToday(trip.time24),
                departureTime: trip.departureTime, // Display string
                route: trip.route,
                driver: trip.driver,
                plateNumber: trip.plateNumber,
                phone: trip.phone || '',
                fare: trip.fare,
                capacity: 14,
                seatsTaken: 0,
                status: 'Waiting',
                vacantSeats: 0
              });
              addedCount++;
            }
          }
        }
      }
      
      await batch.commit();
      alert(`Added ${addedCount} new trips.`);
    } catch (error) { 
      console.error(error); 
      alert("Error generating board: " + error.message);
    }
    setIsGenerating(false);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Delete this trip?")) await deleteDoc(doc(db, "trips", id));
  };

  const handleAddTrip = async (e) => {
    e.preventDefault();
    
    try {
      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      
      const finalRoute = `St. Bernard to ${newTrip.destination}`;
      const displayTime = formatTimeDisplay(newTrip.time24);

      await addDoc(collection(db, "trips"), {
        date: todayStr,
        departureAt: getTimestampForToday(newTrip.time24),
        departureTime: displayTime,
        route: finalRoute,
        driver: newTrip.driver,
        plateNumber: newTrip.plateNumber,
        phone: newTrip.phone,
        fare: newTrip.fare,
        capacity: 14,
        seatsTaken: 0,
        status: 'Waiting',
        vacantSeats: 0
      });
      
      setNewTrip({ time24: '', destination: 'Tacloban', driver: '', plateNumber: '', phone: '', fare: '', status: 'Waiting' });
      setIsFormOpen(false);
    } catch (error) {
      console.error(error);
      alert("Error saving trip: " + error.message);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header"><h1>Dispatcher Dashboard</h1></header>

      <div className="action-bar">
        <button onClick={handleGenerateBoard} disabled={isGenerating} className="btn btn-warning">{isGenerating ? 'Generating...' : '⚡ Generate Board'}</button>
        <button onClick={() => setIsFormOpen(!isFormOpen)} className="btn btn-success">{isFormOpen ? 'Cancel' : '+ Add Trip'}</button>
      </div>

      {isFormOpen && (
        <div className="form-container">
          <form onSubmit={handleAddTrip} className="form-group">
            
            {/* Timepicker */}
            <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Departure Time</label>
            <input 
              type="time" 
              value={newTrip.time24} 
              onChange={e => setNewTrip({...newTrip, time24: e.target.value})} 
              required 
              className="input-field" 
            />

            {/* Destination Dropdowns */}
            <label style={{ fontSize: '12px', fontWeight: 'bold', marginTop: '5px' }}>Route</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input type="text" value="St. Bernard" readOnly className="input-field" style={{ flex: 1, backgroundColor: '#e9ecef' }} />
              <span style={{ alignSelf: 'center' }}>to</span>
              <select 
                value={newTrip.destination} 
                onChange={e => setNewTrip({...newTrip, destination: e.target.value})} 
                className="input-field" 
                style={{ flex: 1 }}
              >
                {DESTINATIONS.map(dest => <option key={dest} value={dest}>{dest}</option>)}
              </select>
            </div>

            {/* Driver Dropdown */}
            <label style={{ fontSize: '12px', fontWeight: 'bold', marginTop: '5px' }}>Driver & Van</label>
            <select value={newTrip.plateNumber} onChange={handleDriverSelect} required className="input-field">
              <option value="">-- Select Driver --</option>
              {fleet.map(van => <option key={van.id} value={van.plateNumber}>{van.driver} ({van.plateNumber})</option>)}
            </select>

            {/* Fare Input & Save Default Button */}
            <label style={{ fontSize: '12px', fontWeight: 'bold', marginTop: '5px' }}>Fare</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input 
                type="text" 
                placeholder="Fare" 
                value={newTrip.fare} 
                onChange={e => setNewTrip({...newTrip, fare: e.target.value})} 
                required 
                className="input-field" 
                style={{ flex: 1 }}
              />
              <button type="button" onClick={handleSaveDefaultFare} className="btn btn-secondary" style={{ fontSize: '12px' }}>
                Save as Default
              </button>
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '10px' }}>Save Trip</button>
          </form>
        </div>
      )}
      
      <main>
        {schedules.map((schedule) => <DispatcherTripCard key={schedule.id} schedule={schedule} handleDelete={handleDelete} />)}
      </main>
    </div>
  );
};

export default DispatcherView;