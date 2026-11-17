import React, { useState, useEffect } from 'react';
import { collection, addDoc, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

// --- SUB-COMPONENT: Manages the trips INSIDE a group ---
const TripManager = ({ groupId }) => {
  const [trips, setTrips] = useState([]);
  const [fleet, setFleet] = useState([]); // NEW: Store registered fleet
  const [isAdding, setIsAdding] = useState(false);
  const [newTrip, setNewTrip] = useState({ departureTime: '', route: '', driver: '', plateNumber: '', fare: '' });
  const [editingTripId, setEditingTripId] = useState(null);
  const [editTripData, setEditTripData] = useState({});

  // Listen to the specific subcollection for THIS group
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "schedule_groups", groupId, "trips"), (snap) => {
      setTrips(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [groupId]);

  // NEW: Listen to the fleet collection
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "fleet"), (snap) => {
      setFleet(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // NEW: Handle selecting a driver from the dropdown
  const handleDriverSelect = (e, isEditMode = false) => {
    const selectedPlate = e.target.value;
    const selectedVan = fleet.find(v => v.plateNumber === selectedPlate);
    
    if (selectedVan) {
      if (isEditMode) {
        setEditTripData({ ...editTripData, driver: selectedVan.driver, plateNumber: selectedVan.plateNumber });
      } else {
        setNewTrip({ ...newTrip, driver: selectedVan.driver, plateNumber: selectedVan.plateNumber,
  phone: selectedVan.phone });
      }
    }
  };

  const handleAddTrip = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "schedule_groups", groupId, "trips"), newTrip);
    setNewTrip({ departureTime: '', route: '', driver: '', plateNumber: '', fare: '' });
    setIsAdding(false);
  };

  const handleDeleteTrip = async (tripId) => {
    if(window.confirm("Delete this trip?")) {
      await deleteDoc(doc(db, "schedule_groups", groupId, "trips", tripId));
    }
  };

  const handleUpdateTrip = async (e) => {
    e.preventDefault();
    await updateDoc(doc(db, "schedule_groups", groupId, "trips", editingTripId), editTripData);
    setEditingTripId(null);
  };

  return (
    <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderTop: '1px solid #ddd' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
        <h5 style={{ margin: 0 }}>Trips in this Group</h5>
        <button onClick={() => setIsAdding(!isAdding)} style={{ padding: '5px 10px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
          {isAdding ? 'Cancel' : '+ Add Trip'}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleAddTrip} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px', padding: '10px', backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '4px' }}>
           <input type="text" placeholder="Time (e.g. 6:00 AM)" value={newTrip.departureTime} onChange={e => setNewTrip({...newTrip, departureTime: e.target.value})} required style={{ padding: '6px' }} />
           <input type="text" placeholder="Route" value={newTrip.route} onChange={e => setNewTrip({...newTrip, route: e.target.value})} required style={{ padding: '6px' }} />
           
           {/* NEW: DROPDOWN FOR DRIVER */}
           <select value={newTrip.plateNumber} onChange={(e) => handleDriverSelect(e, false)} required style={{ padding: '6px' }}>
             <option value="">-- Select Driver & Plate No --</option>
             {fleet.map(van => (
               <option key={van.id} value={van.plateNumber}>{van.driver} ({van.plateNumber})</option>
             ))}
           </select>

           <input type="text" placeholder="Fare" value={newTrip.fare} onChange={e => setNewTrip({...newTrip, fare: e.target.value})} required style={{ padding: '6px' }} />
           <button type="submit" style={{ padding: '8px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>Save Trip</button>
        </form>
      )}

      {trips.length === 0 ? <p style={{ fontSize: '13px', color: '#666' }}>No trips added yet.</p> : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {trips.map(trip => (
            <li key={trip.id} style={{ backgroundColor: '#fff', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}>
              
              {editingTripId === trip.id ? (
                /* EDIT MODE */
                <form onSubmit={handleUpdateTrip} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <input type="text" value={editTripData.departureTime} onChange={e => setEditTripData({...editTripData, departureTime: e.target.value})} required style={{ padding: '4px' }} />
                  <input type="text" value={editTripData.route} onChange={e => setEditTripData({...editTripData, route: e.target.value})} required style={{ padding: '4px' }} />
                  
                  {/* NEW: DROPDOWN FOR DRIVER IN EDIT MODE */}
                  <select value={editTripData.plateNumber} onChange={(e) => handleDriverSelect(e, true)} required style={{ padding: '4px' }}>
                    <option value="">-- Select Driver & Plate No --</option>
                    {fleet.map(van => (
                      <option key={van.id} value={van.plateNumber}>{van.driver} ({van.plateNumber})</option>
                    ))}
                  </select>

                  <input type="text" value={editTripData.fare} onChange={e => setEditTripData({...editTripData, fare: e.target.value})} required style={{ padding: '4px' }} />
                  <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                    <button type="submit" style={{ padding: '4px 8px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}>Save</button>
                    <button type="button" onClick={() => setEditingTripId(null)} style={{ padding: '4px 8px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px' }}>Cancel</button>
                  </div>
                </form>
              ) : (
                /* VIEW MODE */
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '13px' }}>
                    <strong>{trip.departureTime}</strong> - {trip.route} <br/>
                    <span style={{ color: '#666' }}>Driver: {trip.driver} ({trip.plateNumber}) | Fare: {trip.fare}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button onClick={() => { setEditingTripId(trip.id); setEditTripData(trip); }} style={{ padding: '4px 8px', backgroundColor: '#ffc107', color: 'black', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Edit</button>
                    <button onClick={() => handleDeleteTrip(trip.id)} style={{ padding: '4px 8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// --- MAIN COMPONENT ---
const TemplateManager = () => {
  const [groups, setGroups] = useState([]);
  const [newGroup, setNewGroup] = useState({ name: '', days: { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: true, Sun: false } });
  const [expandedGroupId, setExpandedGroupId] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "schedule_groups"), (snapshot) => {
      setGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "schedule_groups"), newGroup);
    setNewGroup({ name: '', days: { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: true, Sun: false } });
  };

  const handleDeleteGroup = async (id) => {
    if (window.confirm("Delete this entire group?")) {
       await deleteDoc(doc(db, "schedule_groups", id));
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Schedule Groups</h1>
        <p>Group multiple trips under one schedule</p>
      </header>

      <form onSubmit={handleCreateGroup} style={{ backgroundColor: '#e9ecef', padding: '15px', borderRadius: '8px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h3>Create New Schedule Group</h3>
        <input type="text" placeholder="Group Name (e.g., Weekday Schedule, Weekend Schedule)" value={newGroup.name} onChange={e => setNewGroup({...newGroup, name: e.target.value})} required style={{ padding: '8px' }} />
        
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '5px' }}>
          <strong>Active Days:</strong>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
            <label key={day} style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={newGroup.days[day]} onChange={() => setNewGroup({...newGroup, days: {...newGroup.days, [day]: !newGroup.days[day]}})} /> {day}
            </label>
          ))}
        </div>
        <button type="submit" style={{ padding: '10px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginTop: '10px' }}>Create Group</button>
      </form>

      <div>
        <h3>Your Schedule Groups</h3>
        {groups.length === 0 && <p style={{color: '#666'}}>No groups created yet.</p>}
        
        {groups.map(group => (
          <div key={group.id} style={{ border: '1px solid #ccc', borderRadius: '8px', marginBottom: '15px', overflow: 'hidden' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', backgroundColor: '#fff', cursor: 'pointer' }} onClick={() => setExpandedGroupId(expandedGroupId === group.id ? null : group.id)}>
              <div>
                <h4 style={{ margin: 0, color: '#0056b3' }}>{group.name}</h4>
                <span style={{ fontSize: '12px', color: '#666' }}>Days: {Object.keys(group.days || {}).filter(d => group.days[d]).join(', ')}</span>
              </div>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                <button onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id); }} style={{ color: 'red', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '12px' }}>Delete Group</button>
                <span>{expandedGroupId === group.id ? '▲' : '▼'}</span>
              </div>
            </div>
            
            {expandedGroupId === group.id && (
              <TripManager groupId={group.id} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TemplateManager;