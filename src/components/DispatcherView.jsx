import React, { useState, useEffect } from 'react';
import { doc, updateDoc, addDoc, deleteDoc, collection, getDocs, onSnapshot, writeBatch, Timestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import './DispatcherView.css';

const formatTimeDisplay = (time24) => {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':');
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
};

const getTimestampForToday = (time24) => {
  if (!time24) return null;
  const now = new Date();
  const manilaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const isoString = `${manilaDate}T${time24}:00+08:00`;
  return Timestamp.fromDate(new Date(isoString));
};

const DESTINATIONS = ['Tacloban', 'Sogod', 'Bato'];

const DispatcherTripCard = ({ schedule, handleDelete, handleStatusChange }) => {
  const [isDeparting, setIsDeparting] = useState(false);
  const [isFull, setIsFull] = useState(true);
  const [vacantSeats, setVacantSeats] = useState(0);
  
  // Silent Timer States
  const [isAuto, setIsAuto] = useState(true);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds

  useEffect(() => {
    let timer;
    if (schedule.status === 'Full' && isAuto && timeLeft > 0 && !isDeparting) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (schedule.status === 'Full' && isAuto && timeLeft === 0 && !isDeparting) {
      // Time's up! Auto-trigger departure silently
      confirmDeparture(true);
    }
    return () => clearInterval(timer);
  }, [schedule.status, isAuto, timeLeft, isDeparting]);

  useEffect(() => {
    if (schedule.status !== 'Full') {
      setTimeLeft(300);
      setIsAuto(true);
      setIsDeparting(false);
    }
  }, [schedule.status]);

  const handleToggleAuto = () => {
    if (!isAuto) {
      setTimeLeft(300); // Reset to 5 mins if turning back to auto
    }
    setIsAuto(!isAuto);
  };

  const confirmDeparture = async (auto = false) => {
    try {
      const finalVacant = auto ? 0 : (isFull ? 0 : parseInt(vacantSeats) || 0);
      
      await updateDoc(doc(db, "trips", schedule.id), { status: 'Departed', vacantSeats: finalVacant });

      await addDoc(collection(db, "trip_events"), {
        tripId: schedule.id, route: schedule.route, driver: schedule.driver,
        action: auto ? `Auto-Departed (5 min timer)` : `Departed (${finalVacant} vacant)`, 
        timestamp: Timestamp.now()
      });
      setIsDeparting(false);
    } catch (error) { alert("Error updating status: " + error.message); }
  };

  return (
    <div className="trip-card">
      <div className="trip-header">
        <div>
          <h3>{schedule.departureTime} - {schedule.route}</h3>
          <p>{schedule.driver} ({schedule.plateNumber}) · ₱{schedule.fare}</p>
        </div>
        <button onClick={() => handleDelete(schedule.id)} className="btn-outline">✕</button>
      </div>
      
      {/* AUTO-DEPART TOGGLE (Only visible when Full) */}
      {schedule.status === 'Full' && (
        <div className="toggle-container">
          <div className={`toggle-switch ${isAuto ? 'auto' : 'manual'}`} onClick={handleToggleAuto}>
            <span className="toggle-switch-text">{isAuto ? 'AUTO' : 'MANUAL'}</span>
            <div className="toggle-knob"></div>
          </div>
        </div>
      )}

      <div className="segmented-control">
        <button className={schedule.status === 'Waiting' ? 'active-waiting' : ''} onClick={() => handleStatusChange(schedule.id, 'Waiting')}>Waiting</button>
        <button className={schedule.status === 'Boarding' ? 'active-boarding' : ''} onClick={() => handleStatusChange(schedule.id, 'Boarding')}>Boarding</button>
        <button className={schedule.status === 'Full' ? 'active-full' : ''} onClick={() => handleStatusChange(schedule.id, 'Full')}>Full</button>
        <button className={schedule.status === 'Departed' ? 'active-departed' : ''} onClick={() => setIsDeparting(true)}>Depart</button>
        <button className={schedule.status === 'Overdue' ? 'active-overdue' : ''} onClick={() => handleStatusChange(schedule.id, 'Overdue')}>Overdue</button>
      </div>

      {schedule.status === 'Departed' && (
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '8px' }}>Departed with {schedule.vacantSeats || 0} vacant seat(s).</p>
      )}

      {isDeparting && (
        <div className="departure-dialog">
          <h4 style={{ marginBottom: '8px' }}>Confirm Departure</h4>
          <div className="dialog-options">
            <label><input type="radio" checked={isFull} onChange={() => setIsFull(true)} /> Full</label>
            <label><input type="radio" checked={!isFull} onChange={() => setIsFull(false)} /> Has Vacancy</label>
          </div>
          {!isFull && <input type="number" min="1" placeholder="Vacant seats" value={vacantSeats} onChange={(e) => setVacantSeats(e.target.value)} className="input-field" style={{ marginBottom: '10px' }} />}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => confirmDeparture(false)} className="btn btn-success" style={{ flex: 1 }}>Confirm</button>
            <button onClick={() => setIsDeparting(false)} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

const DispatcherView = ({ schedules }) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [availableTemplates, setAvailableTemplates] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [fleet, setFleet] = useState([]);
  const [fares, setFares] = useState({});
  
  const [newTrip, setNewTrip] = useState({ 
    time24: '', destination: 'Tacloban', driver: '', plateNumber: '', phone: '', fare: '', status: 'Waiting' 
  });

  const waitingCount = schedules.filter(s => s.status === 'Waiting' || s.status === 'Overdue').length;
  const boardingCount = schedules.filter(s => s.status === 'Boarding' || s.status === 'Full').length;
  const departedCount = schedules.filter(s => s.status === 'Departed').length;

  useEffect(() => {
    const unsubFleet = onSnapshot(collection(db, "fleet"), (snap) => {
      setFleet(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubFares = onSnapshot(collection(db, "fares"), (snap) => {
      const fareData = {}; snap.docs.forEach(d => { fareData[d.id] = d.data().amount; });
      setFares(fareData);
    });
    return () => { unsubFleet(); unsubFares(); };
  }, []);

  useEffect(() => {
    if (fares[newTrip.destination]) {
      setNewTrip(prev => ({ ...prev, fare: fares[newTrip.destination] }));
    }
  }, [newTrip.destination, fares]);

  const openTemplateModal = async () => {
    try {
      const todayDay = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', weekday: 'short' }).format(new Date());
      const groupsSnapshot = await getDocs(collection(db, "schedule_groups"));
      
      const activeGroups = groupsSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(group => group.days && group.days[todayDay]);

      setAvailableTemplates(activeGroups);
      setIsModalOpen(true);
    } catch (error) { alert("Error fetching templates: " + error.message); }
  };

  const generateSpecificTemplate = async (groupId) => {
    setIsGenerating(true);
    try {
      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const tripsSnapshot = await getDocs(collection(db, "schedule_groups", groupId, "trips"));
      
      const batch = writeBatch(db);
      let addedCount = 0;

      for (const tripDoc of tripsSnapshot.docs) {
        const trip = tripDoc.data();
        const newTripRef = doc(db, "trips", `${todayStr}_${tripDoc.id}`);
        
        if (!schedules.some(s => s.id === newTripRef.id)) {
          const depTimestamp = getTimestampForToday(trip.time24);
          const depTimeMs = depTimestamp.toDate().getTime();
          
          let initialStatus = 'Waiting';
          if (new Date().getTime() > depTimeMs + 1800000) {
            initialStatus = 'Overdue'; 
          }

          batch.set(newTripRef, {
            date: todayStr,
            departureAt: depTimestamp,
            departureTime: trip.departureTime,
            route: trip.route,
            driver: trip.driver,
            plateNumber: trip.plateNumber,
            phone: trip.phone || '',
            fare: trip.fare,
            capacity: 14,
            seatsTaken: 0,
            status: initialStatus,
            vacantSeats: 0
          });
          addedCount++;
        }
      }
      
      await batch.commit();
      alert(`Successfully generated ${addedCount} new trips.`);
      setIsModalOpen(false);
    } catch (error) { alert("Error generating board: " + error.message); }
    setIsGenerating(false);
  };

  const handleDriverSelect = (e) => {
    const selectedVan = fleet.find(v => v.plateNumber === e.target.value);
    if (selectedVan) setNewTrip({ ...newTrip, driver: selectedVan.driver, plateNumber: selectedVan.plateNumber, phone: selectedVan.phone || '' });
    else setNewTrip({ ...newTrip, driver: '', plateNumber: '', phone: '' });
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      const schedule = schedules.find(s => s.id === id);
      const updateData = { status: newStatus };
      if (newStatus !== 'Departed') updateData.vacantSeats = 0;
      
      await updateDoc(doc(db, "trips", id), updateData);

      await addDoc(collection(db, "trip_events"), {
        tripId: id, route: schedule.route, driver: schedule.driver,
        action: `Status changed to ${newStatus}`, timestamp: Timestamp.now()
      });
    } catch (error) { alert("Error: " + error.message); }
  };

  const handleSaveDefaultFare = async () => {
    try {
      await setDoc(doc(db, "fares", newTrip.destination), { amount: newTrip.fare });
      alert(`Default fare for ${newTrip.destination} updated to ₱${newTrip.fare}`);
    } catch (error) { alert("Error saving fare: " + error.message); }
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

      const depTimestamp = getTimestampForToday(newTrip.time24);
      const depTimeMs = depTimestamp.toDate().getTime();
      
      let initialStatus = 'Waiting';
      if (new Date().getTime() > depTimeMs + 1800000) {
        initialStatus = 'Overdue'; 
      }

      await addDoc(collection(db, "trips"), {
        date: todayStr, departureAt: depTimestamp,
        departureTime: displayTime, route: finalRoute, driver: newTrip.driver,
        plateNumber: newTrip.plateNumber, phone: newTrip.phone, fare: newTrip.fare,
        capacity: 14, seatsTaken: 0, status: initialStatus, vacantSeats: 0
      });
      
      setNewTrip({ time24: '', destination: 'Tacloban', driver: '', plateNumber: '', phone: '', fare: '', status: 'Waiting' });
      setIsFormOpen(false);
    } catch (error) { alert("Error saving trip: " + error.message); }
  };

  const sortedSchedules = [...schedules].sort((a, b) => {
    const now = new Date().getTime();
    if (a.status === 'Departed' && b.status !== 'Departed') return 1;
    if (a.status !== 'Departed' && b.status === 'Departed') return -1;

    const aTime = a.departureAt ? a.departureAt.toMillis() : 0;
    const bTime = b.departureAt ? b.departureAt.toMillis() : 0;
    
    const aIsPast = (now > aTime + 1800000) || a.status === 'Overdue';
    const bIsPast = (now > bTime + 1800000) || b.status === 'Overdue';

    if (aIsPast && !bIsPast) return 1;
    if (!aIsPast && bIsPast) return -1;

    return aTime - bTime;
  });

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Dispatcher Dashboard</h1>
        <p>St. Bernard Terminal</p>
      </header>

      <div className="kpi-strip">
        <div className="kpi-card"><h4>Waiting</h4><div className="kpi-value">{waitingCount}</div></div>
        <div className="kpi-card"><h4>Boarding</h4><div className="kpi-value">{boardingCount}</div></div>
        <div className="kpi-card"><h4>Departed</h4><div className="kpi-value">{departedCount}</div></div>
      </div>

      <div className="action-bar">
        <button onClick={openTemplateModal} className="btn btn-warning">⚡ Generate Board</button>
        <button onClick={() => setIsFormOpen(!isFormOpen)} className="btn btn-success">
          {isFormOpen ? 'Cancel' : '+ Add Trip'}
        </button>
      </div>

      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', width: '100%', maxWidth: '400px', maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: '15px' }}>Select Template to Generate</h3>
            
            {availableTemplates.length === 0 ? (
              <p style={{ color: 'red' }}>No templates are scheduled for today.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {availableTemplates.map(template => (
                  <div key={template.id} style={{ border: '1px solid #ccc', padding: '12px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{template.name}</strong>
                    </div>
                    <button 
                      onClick={() => generateSpecificTemplate(template.id)} 
                      disabled={isGenerating}
                      className="btn btn-primary" 
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      {isGenerating ? '...' : 'Generate'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => setIsModalOpen(false)} className="btn btn-secondary" style={{ width: '100%', marginTop: '20px' }}>
              Close
            </button>
          </div>
        </div>
      )}

      {isFormOpen && (
        <div className="form-container">
          <form onSubmit={handleAddTrip} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label>Departure Time</label>
            <input type="time" value={newTrip.time24} onChange={e => setNewTrip({...newTrip, time24: e.target.value})} required className="input-field" />

            <label>Route</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input type="text" value="St. Bernard" readOnly className="input-field" style={{ backgroundColor: 'var(--bg)', color: 'var(--muted)', textAlign: 'center' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontWeight: 'bold' }}>to</span>
                <select value={newTrip.destination} onChange={e => setNewTrip({...newTrip, destination: e.target.value})} className="input-field" style={{ flex: 1 }}>
                  {DESTINATIONS.map(dest => <option key={dest} value={dest}>{dest}</option>)}
                </select>
              </div>
            </div>

            <label>Driver & Van</label>
            <select value={newTrip.plateNumber} onChange={handleDriverSelect} required className="input-field">
              <option value="">-- Select Driver --</option>
              {fleet.map(van => <option key={van.id} value={van.plateNumber}>{van.driver} ({van.plateNumber})</option>)}
            </select>

            <label>Fare</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input type="text" placeholder="Fare" value={newTrip.fare} onChange={e => setNewTrip({...newTrip, fare: e.target.value})} required className="input-field" style={{ flex: 1 }} />
              <button type="button" onClick={handleSaveDefaultFare} className="btn btn-secondary" style={{ fontSize: '12px' }}>Save Default</button>
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '10px' }}>Save Trip</button>
          </form>
        </div>
      )}
      
      <main>
        {sortedSchedules.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 20px' }}>
            <h3>No trips on the board today.</h3>
            <p>Click "Generate Board" to load a template or add a trip manually.</p>
          </div>
        ) : (
          sortedSchedules.map((schedule) => (
            <DispatcherTripCard key={schedule.id} schedule={schedule} handleDelete={handleDelete} handleStatusChange={handleStatusChange} />
          ))
        )}
      </main>
    </div>
  );
};

export default DispatcherView;