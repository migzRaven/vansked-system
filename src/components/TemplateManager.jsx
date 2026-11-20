import React, { useState, useEffect } from 'react';
import { collection, addDoc, deleteDoc, doc, onSnapshot, updateDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import toast from 'react-hot-toast';

const formatTimeDisplay = (time24) => {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':');
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
};

const DESTINATIONS = ['Tacloban', 'Sogod', 'Bato'];

const TripManager = ({ groupId, fleet, fares }) => {
  const [trips, setTrips] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newTrip, setNewTrip] = useState({ time24: '', destination: 'Tacloban', driver: '', plateNumber: '', phone: '', fare: '' });
  const [editingTripId, setEditingTripId] = useState(null);
  const [editTripData, setEditTripData] = useState({});

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "schedule_groups", groupId, "trips"), (snap) => {
      setTrips(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [groupId]);

  const handleDriverSelect = (e, isEditMode = false) => {
    const selectedVan = fleet.find(v => v.plateNumber === e.target.value);
    if (selectedVan) {
      if (isEditMode) setEditTripData({ ...editTripData, driver: selectedVan.driver, plateNumber: selectedVan.plateNumber, phone: selectedVan.phone || '' });
      else setNewTrip({ ...newTrip, driver: selectedVan.driver, plateNumber: selectedVan.plateNumber, phone: selectedVan.phone || '' });
    } else {
      if (isEditMode) setEditTripData({ ...editTripData, driver: '', plateNumber: '', phone: '' });
      else setNewTrip({ ...newTrip, driver: '', plateNumber: '', phone: '' });
    }
  };

  const handleEditDestinationChange = (e) => {
    const newDest = e.target.value;
    setEditTripData({
      ...editTripData,
      destination: newDest,
      fare: fares[newDest] || editTripData.fare 
    });
  };

  const handleAddTrip = async (e) => {
    e.preventDefault();
    try {
      const finalRoute = `St. Bernard to ${newTrip.destination}`;
      const displayTime = formatTimeDisplay(newTrip.time24);
      await addDoc(collection(db, "schedule_groups", groupId, "trips"), {
        time24: newTrip.time24,
        departureTime: displayTime,
        destination: newTrip.destination,
        route: finalRoute,
        driver: newTrip.driver,
        plateNumber: newTrip.plateNumber,
        phone: newTrip.phone,
        fare: newTrip.fare
      });
      setNewTrip({ time24: '', destination: 'Tacloban', driver: '', plateNumber: '', phone: '', fare: fares['Tacloban'] || '' });
      setIsAdding(false);
    } catch (error) { toast.error("Failed to add trip."); }
  };

  const handleDeleteTrip = async (tripId) => {
    if(window.confirm("Delete this trip?")) await deleteDoc(doc(db, "schedule_groups", groupId, "trips", tripId));
  };

  const handleUpdateTrip = async (e) => {
    e.preventDefault();
    try {
      const finalRoute = `St. Bernard to ${editTripData.destination}`;
      const displayTime = formatTimeDisplay(editTripData.time24);
      await updateDoc(doc(db, "schedule_groups", groupId, "trips", editingTripId), {
        ...editTripData,
        route: finalRoute,
        departureTime: displayTime
      });
      setEditingTripId(null);
    } catch (error) { toast.error("Failed to update trip."); }
  };

  return (
    <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderTop: '1px solid #ddd' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
        <h5 style={{ margin: 0, fontSize: '1rem' }}>Trips in this Group</h5>
        <button onClick={() => setIsAdding(!isAdding)} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }}>
          {isAdding ? 'Cancel' : '+ Add Trip'}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleAddTrip} className="form-group" style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '8px' }}>
           <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Departure Time</label>
           <input type="time" value={newTrip.time24} onChange={e => setNewTrip({...newTrip, time24: e.target.value})} required className="input-field" />
           
           <label style={{ fontSize: '12px', fontWeight: 'bold', marginTop: '5px' }}>Route</label>
           <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
             <input type="text" value="St. Bernard" readOnly className="input-field" style={{ backgroundColor: 'var(--bg)', color: 'var(--muted)', textAlign: 'center' }} />
             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
               <span style={{ fontSize: '14px', fontWeight: 'bold' }}>to</span>
               <select value={newTrip.destination} onChange={e => setNewTrip({...newTrip, destination: e.target.value})} className="input-field" style={{ flex: 1 }}>
                 {DESTINATIONS.map(dest => <option key={dest} value={dest}>{dest}</option>)}
               </select>
             </div>
           </div>

           <label style={{ fontSize: '12px', fontWeight: 'bold', marginTop: '5px' }}>Driver & Van</label>
           <select value={newTrip.plateNumber} onChange={(e) => handleDriverSelect(e, false)} required className="input-field">
             <option value="">-- Select Driver --</option>
             {fleet.map(van => <option key={van.id} value={van.plateNumber}>{van.driver} ({van.plateNumber})</option>)}
           </select>

           <label style={{ fontSize: '12px', fontWeight: 'bold', marginTop: '5px' }}>Fare</label>
           <input type="text" placeholder="Fare" value={newTrip.fare} onChange={e => setNewTrip({...newTrip, fare: e.target.value})} required className="input-field" />

           <button type="submit" className="btn btn-success" style={{ marginTop: '15px' }}>Save Trip</button>
        </form>
      )}

      {trips.length === 0 ? <p style={{ fontSize: '13px', color: '#666' }}>No trips added yet.</p> : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {trips.map(trip => (
            <li key={trip.id} style={{ backgroundColor: '#fff', padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }}>
              {editingTripId === trip.id ? (
                <form onSubmit={handleUpdateTrip} className="form-group">
                  <input type="time" value={editTripData.time24} onChange={e => setEditTripData({...editTripData, time24: e.target.value})} required className="input-field" />
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '8px 0' }}>
                    <input type="text" value="St. Bernard" readOnly className="input-field" style={{ backgroundColor: 'var(--bg)', color: 'var(--muted)', textAlign: 'center' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 'bold' }}>to</span>
                      <select value={editTripData.destination} onChange={handleEditDestinationChange} className="input-field" style={{ flex: 1 }}>
                        {DESTINATIONS.map(dest => <option key={dest} value={dest}>{dest}</option>)}
                      </select>
                    </div>
                  </div>

                  <select value={editTripData.plateNumber} onChange={(e) => handleDriverSelect(e, true)} required className="input-field">
                    <option value="">-- Select Driver --</option>
                    {fleet.map(van => <option key={van.id} value={van.plateNumber}>{van.driver} ({van.plateNumber})</option>)}
                  </select>
                  <input type="text" value={editTripData.fare} onChange={e => setEditTripData({...editTripData, fare: e.target.value})} required className="input-field" style={{ marginTop: '8px' }} />
                  
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <button type="submit" className="btn btn-success" style={{ flex: 1 }}>Save</button>
                    <button type="button" onClick={() => setEditingTripId(null)} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
                  </div>
                </form>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '14px' }}>
                    <strong>{trip.departureTime}</strong> - {trip.route} <br/>
                    <span style={{ color: '#666' }}>Driver: {trip.driver} | Fare: ₱{trip.fare}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => { setEditingTripId(trip.id); setEditTripData(trip); }} className="btn btn-warning" style={{ flex: 1, padding: '6px' }}>Edit</button>
                    <button onClick={() => handleDeleteTrip(trip.id)} className="btn btn-danger" style={{ flex: 1, padding: '6px' }}>Delete</button>
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

const TemplateManager = ({ fleet, fares }) => {
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

  // Phase 2: Cascade Delete Logic
  const handleDeleteGroup = async (id) => {
    if (window.confirm("Delete this entire group and all its trips?")) {
      try {
        const batch = writeBatch(db);
        
        // 1. Get all trips in this group
        const tripsSnapshot = await getDocs(collection(db, "schedule_groups", id, "trips"));
        
        // 2. Add them to the batch for deletion
        tripsSnapshot.forEach((doc) => {
          batch.delete(doc.ref);
        });
        
        // 3. Add the parent group to the batch for deletion
        batch.delete(doc(db, "schedule_groups", id));
        
        // 4. Execute the atomic batch
        await batch.commit();
      } catch (error) {
        toast.error("Failed to delete group.");
      }
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Schedule Groups</h1>
        <p>Group multiple trips under one schedule</p>
      </header>

      <form onSubmit={handleCreateGroup} className="form-container form-group">
        <h3>Create New Schedule Group</h3>
        <input type="text" placeholder="Group Name (e.g., Weekday Schedule)" value={newGroup.name} onChange={e => setNewGroup({...newGroup, name: e.target.value})} required className="input-field" />
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '5px' }}>
          <strong>Active Days:</strong>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
            <label key={day} style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={newGroup.days[day]} onChange={() => setNewGroup({...newGroup, days: {...newGroup.days, [day]: !newGroup.days[day]}})} /> {day}
            </label>
          ))}
        </div>
        <button type="submit" className="btn btn-success" style={{ marginTop: '10px' }}>Create Group</button>
      </form>

      <div>
        <h3>Your Schedule Groups</h3>
        {groups.map(group => (
          <div key={group.id} style={{ border: '1px solid #ccc', borderRadius: '8px', marginBottom: '15px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', backgroundColor: '#fff', cursor: 'pointer' }} onClick={() => setExpandedGroupId(expandedGroupId === group.id ? null : group.id)}>
              <div>
                <h4 style={{ margin: 0, color: '#0056b3' }}>{group.name}</h4>
                <span style={{ fontSize: '12px', color: '#666' }}>Days: {Object.keys(group.days || {}).filter(d => group.days[d]).join(', ')}</span>
              </div>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                <button onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id); }} className="btn-outline" style={{ fontSize: '12px' }}>Delete</button>
                <span>{expandedGroupId === group.id ? '▲' : '▼'}</span>
              </div>
            </div>
            {expandedGroupId === group.id && <TripManager groupId={group.id} fleet={fleet} fares={fares} />}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TemplateManager;