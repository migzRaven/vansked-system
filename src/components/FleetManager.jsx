import React, { useState, useEffect } from 'react';
import { collection, addDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import './FleetManager.css';

const FleetManager = () => {
  const [fleet, setFleet] = useState([]);
  const [newVan, setNewVan] = useState({ driver: '', plateNumber: '', vanType: '', phone: '' });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "fleet"), (snap) => {
      setFleet(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const handleAddVan = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "fleet"), newVan);
    setNewVan({ driver: '', plateNumber: '', vanType: '', phone: '' });
  };

  const handleDeleteVan = async (id) => {
    if(window.confirm("Remove this driver/van?")) await deleteDoc(doc(db, "fleet", id));
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Fleet Registry</h1>
        <p>Register drivers and vans here</p>
      </header>

      <form onSubmit={handleAddVan} className="form-container form-group">
        <h3>Add New Driver / Van</h3>
        <input type="text" placeholder="Driver Name" value={newVan.driver} onChange={e => setNewVan({...newVan, driver: e.target.value})} required className="input-field" />
        <input type="text" placeholder="Plate Number" value={newVan.plateNumber} onChange={e => setNewVan({...newVan, plateNumber: e.target.value})} required className="input-field" />
        <input type="text" placeholder="Contact Number (e.g., 09123456789)" value={newVan.phone} onChange={e => setNewVan({...newVan, phone: e.target.value})} required className="input-field" />
        <input type="text" placeholder="Van Description (Optional)" value={newVan.vanType} onChange={e => setNewVan({...newVan, vanType: e.target.value})} className="input-field" />
        <button type="submit" className="btn btn-success">Register Driver</button>
      </form>

      <div>
        <h3>Registered Fleet</h3>
        <div style={{ marginTop: '10px' }}>
          {fleet.map(van => (
            <div key={van.id} className="fleet-card">
              <div>
                <strong>{van.driver}</strong> <br/>
                <span style={{ color: '#666', fontSize: '14px' }}>{van.plateNumber} | 📞 {van.phone}</span>
              </div>
              <button onClick={() => handleDeleteVan(van.id)} className="btn-outline">Remove</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FleetManager;