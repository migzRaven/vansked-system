import React, { useState, useEffect } from 'react';
import { doc, updateDoc, addDoc, deleteDoc, collection, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// --- SUB-COMPONENT: Dispatcher Trip Card ---
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
      console.error("Error departing: ", error);
    }
  };

  return (
    <div style={{ border: '1px solid #ccc', padding: '15px', marginBottom: '15px', borderRadius: '8px', backgroundColor: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h3>{schedule.departureTime} - {schedule.route}</h3>
        <button onClick={() => handleDelete(schedule.id)} style={{ color: 'red', border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 'bold' }}>Delete ✕</button>
      </div>
      
      <p>Status: <strong style={{ color: schedule.status === 'Full' ? 'red' : (schedule.status === 'Departed' ? 'gray' : 'green') }}>{schedule.status}</strong></p>
      <p style={{ fontSize: '13px', color: '#555' }}>Driver: {schedule.driver} ({schedule.plateNumber})</p>
      
      {schedule.status === 'Departed' && (
        <p style={{ fontSize: '14px', color: '#666' }}>Vacant Seats upon departure: {schedule.vacantSeats || 0}</p>
      )}
      
      <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
        {schedule.status !== 'Departed' && (
          <>
            <button onClick={() => setIsDeparting(!isDeparting)} style={{ padding: '8px 12px', cursor: 'pointer', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px' }}>Mark Departed</button>
            <button onClick={() => updateDoc(doc(db, "trips", schedule.id), { status: 'Full' })} style={{ padding: '8px 12px', cursor: 'pointer', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px' }}>Mark Full</button>
            <button onClick={() => updateDoc(doc(db, "trips", schedule.id), { status: 'Boarding' })} style={{ padding: '8px 12px', cursor: 'pointer', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}>Mark Boarding</button>
          </>
        )}
      </div>

      {/* DEPARTURE DIALOG */}
      {isDeparting && (
        <div style={{ marginTop: '15px', padding: '15px', backgroundColor: '#fff3cd', borderRadius: '8px', border: '1px solid #ffeeba' }}>
          <h4 style={{ margin: '0 0 10px 0' }}>Departure Details</h4>
          <div style={{ display: 'flex', gap: '15px', marginBottom: '10px' }}>
            <label><input type="radio" checked={isFull} onChange={() => setIsFull(true)} /> Full</label>
            <label><input type="radio" checked={!isFull} onChange={() => setIsFull(false)} /> Has Vacant Seats</label>
          </div>
          {!isFull && <input type="number" min="1" placeholder="Number of vacant seats" value={vacantSeats} onChange={(e) => setVacantSeats(e.target.value)} style={{ padding: '8px', marginBottom: '10px', width: '100%' }} />}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={confirmDeparture} style={{ padding: '8px 12px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}>Confirm</button>
            <button onClick={() => setIsDeparting(false)} style={{ padding: '8px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- MAIN COMPONENT ---
const DispatcherView = ({ schedules }) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [fleet, setFleet] = useState([]); // NEW: State for fleet
  
  const [newTrip, setNewTrip] = useState({
    departureTime: '', route: '', driver: '', plateNumber: '', fare: '', status: 'Waiting'
  });

  // NEW: Fetch the Fleet list for the dropdown
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "fleet"), (snap) => {
      setFleet(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // NEW: Handle driver selection from dropdown
  const handleDriverSelect = (e) => {
    const selectedPlate = e.target.value;
    const selectedVan = fleet.find(v => v.plateNumber === selectedPlate);
    
    if (selectedVan) {
      setNewTrip({ ...newTrip, driver: selectedVan.driver, plateNumber: selectedVan.plateNumber });
    } else {
      setNewTrip({ ...newTrip, driver: '', plateNumber: '' });
    }
  };

  const handleGenerateBoard = async () => {
    if (!window.confirm("Generate today's trips from templates?")) return;
    setIsGenerating(true);
    
    try {
      const today = new Date().toLocaleDateString('en-US', { weekday: 'short' });
      const groupsSnapshot = await getDocs(collection(db, "schedule_groups"));
      
      let addedCount = 0;

      for (const groupDoc of groupsSnapshot.docs) {
        const group = groupDoc.data();
        if (group.days && group.days[today]) {
          
          const tripsSnapshot = await getDocs(collection(db, "schedule_groups", groupDoc.id, "trips"));
          
          for (const tripDoc of tripsSnapshot.docs) {
            const trip = tripDoc.data();
            const exists = schedules.some(s => s.departureTime === trip.departureTime && s.route === trip.route && s.driver === trip.driver);
            
            if (!exists) {
              await addDoc(collection(db, "trips"), {
                departureTime: trip.departureTime,
                route: trip.route,
                driver: trip.driver,
                plateNumber: trip.plateNumber,
                fare: trip.fare,
                status: 'Waiting'
              });
              addedCount++;
            }
          }
        }
      }
      alert(`Board generated successfully! Added ${addedCount} new trips.`);
    } catch (error) {
      console.error("Error generating:", error);
    }
    setIsGenerating(false);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Delete this trip?")) await deleteDoc(doc(db, "trips", id));
  };

  const handleAddTrip = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "trips"), newTrip);
    setNewTrip({ departureTime: '', route: '', driver: '', plateNumber: '', fare: '', status: 'Waiting' });
    setIsFormOpen(false);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Dispatcher Dashboard</h1>
      </header>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button onClick={handleGenerateBoard} disabled={isGenerating} style={{ flex: 1, padding: '12px', backgroundColor: '#ffc107', color: 'black', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
          {isGenerating ? 'Generating...' : '⚡ Generate Today\'s Board'}
        </button>
        <button onClick={() => setIsFormOpen(!isFormOpen)} style={{ flex: 1, padding: '12px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
          {isFormOpen ? 'Cancel' : '+ Add Single Trip'}
        </button>
      </div>

      {isFormOpen && (
        <div style={{ backgroundColor: '#e9ecef', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
          <form onSubmit={handleAddTrip} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input type="text" placeholder="Time (e.g. 4:00 PM)" value={newTrip.departureTime} onChange={e => setNewTrip({...newTrip, departureTime: e.target.value})} required style={{ padding: '8px' }} />
            <input type="text" placeholder="Route" value={newTrip.route} onChange={e => setNewTrip({...newTrip, route: e.target.value})} required style={{ padding: '8px' }} />
            
            {/* NEW: DROPDOWN FOR DRIVER */}
            <select value={newTrip.plateNumber} onChange={handleDriverSelect} required style={{ padding: '8px' }}>
              <option value="">-- Select Driver & Plate No --</option>
              {fleet.map(van => (
                <option key={van.id} value={van.plateNumber}>{van.driver} ({van.plateNumber})</option>
              ))}
            </select>

            <input type="text" placeholder="Fare" value={newTrip.fare} onChange={e => setNewTrip({...newTrip, fare: e.target.value})} required style={{ padding: '8px' }} />
            <button type="submit" style={{ padding: '10px', backgroundColor: '#0056b3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save Trip</button>
          </form>
        </div>
      )}
      
      <main>
        {schedules.map((schedule) => (
          <DispatcherTripCard key={schedule.id} schedule={schedule} handleDelete={handleDelete} />
        ))}
      </main>
    </div>
  );
};

export default DispatcherView;