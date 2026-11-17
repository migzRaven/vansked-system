import React, { useState, useEffect } from 'react';
import { collection, addDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

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
    setNewVan({ driver: '', plateNumber: '', vanType: '' });
  };

  const handleDeleteVan = async (id) => {
    if(window.confirm("Remove this driver/van from the fleet?")) {
      await deleteDoc(doc(db, "fleet", id));
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Fleet & Driver Registry</h1>
        <p>Register your drivers and vans here once</p>
      </header>

      <form onSubmit={handleAddVan} style={{ backgroundColor: '#e9ecef', padding: '15px', borderRadius: '8px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h3>Add New Driver / Van</h3>
        <input type="text" placeholder="Driver Name (e.g., Juan Dela Cruz)" value={newVan.driver} onChange={e => setNewVan({...newVan, driver: e.target.value})} required style={{ padding: '8px' }} />
        <input type="text" placeholder="Plate Number (e.g., ABC 123)" value={newVan.plateNumber} onChange={e => setNewVan({...newVan, plateNumber: e.target.value})} required style={{ padding: '8px' }} />
        <input type="text" placeholder="Contact Number (e.g., 09123456789)" value={newVan.phone} onChange={e => setNewVan({...newVan, phone: e.target.value})} required style={{ padding: '8px' }} />
        <input type="text" placeholder="Van Description (Optional, e.g., White Hi-Ace)" value={newVan.vanType} onChange={e => setNewVan({...newVan, vanType: e.target.value})} style={{ padding: '8px' }} />
        <button type="submit" style={{ padding: '10px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Register Driver</button>
      </form>

      <div>
        <h3>Registered Fleet</h3>
        {fleet.length === 0 && <p style={{color: '#666'}}>No drivers registered yet.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {fleet.map(van => (
            <div key={van.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '15px', backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '8px' }}>
              <div>
                <strong>{van.driver}</strong> <br/>
                <span style={{ color: '#666', fontSize: '14px' }}>{van.plateNumber} {van.vanType && `(${van.vanType})`}</span>
              </div>
              <button onClick={() => handleDeleteVan(van.id)} style={{ color: 'red', border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 'bold' }}>Remove</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FleetManager;