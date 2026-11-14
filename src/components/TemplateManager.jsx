import React, { useState, useEffect } from 'react';
import { collection, addDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const TemplateManager = () => {
  const [templates, setTemplates] = useState([]);
  const [formData, setFormData] = useState({
    departureTime: '', route: '', driver: '', plateNumber: '', fare: '',
    days: { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: true, Sun: false }
  });

  // Fetch templates from Firebase
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "templates"), (snapshot) => {
      setTemplates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  const handleDayToggle = (day) => {
    setFormData({
      ...formData,
      days: { ...formData.days, [day]: !formData.days[day] }
    });
  };

  const handleAddTemplate = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "templates"), formData);
    setFormData({ departureTime: '', route: '', driver: '', plateNumber: '', fare: '', days: { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: true, Sun: false } });
  };

  const handleDeleteTemplate = async (id) => {
    if(window.confirm("Delete this template?")) await deleteDoc(doc(db, "templates", id));
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Recurring Schedule Manager</h1>
        <p>Set up standard daily trips</p>
      </header>

      <form onSubmit={handleAddTemplate} style={{ backgroundColor: '#e9ecef', padding: '15px', borderRadius: '8px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h3>Add New Schedule Template</h3>
        <input type="text" placeholder="Time (e.g., 6:00 AM)" value={formData.departureTime} onChange={e => setFormData({...formData, departureTime: e.target.value})} required style={{ padding: '8px' }} />
        <input type="text" placeholder="Route" value={formData.route} onChange={e => setFormData({...formData, route: e.target.value})} required style={{ padding: '8px' }} />
        <input type="text" placeholder="Driver Name" value={formData.driver} onChange={e => setFormData({...formData, driver: e.target.value})} required style={{ padding: '8px' }} />
        <input type="text" placeholder="Plate Number" value={formData.plateNumber} onChange={e => setFormData({...formData, plateNumber: e.target.value})} required style={{ padding: '8px' }} />
        <input type="text" placeholder="Fare" value={formData.fare} onChange={e => setFormData({...formData, fare: e.target.value})} required style={{ padding: '8px' }} />
        
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '5px' }}>
          <strong>Active Days:</strong>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
            <label key={day} style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={formData.days[day]} onChange={() => handleDayToggle(day)} /> {day}
            </label>
          ))}
        </div>

        <button type="submit" style={{ padding: '10px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginTop: '10px' }}>Save Template</button>
      </form>

      <div>
        <h3>Current Templates</h3>
        {templates.map(t => (
          <div key={t.id} style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '10px', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>{t.departureTime}</strong> - {t.route} ({t.driver})
              <div style={{ fontSize: '12px', color: '#666' }}>
                Days: {Object.keys(t.days).filter(d => t.days[d]).join(', ')}
              </div>
            </div>
            <button onClick={() => handleDeleteTemplate(t.id)} style={{ color: 'red', border: 'none', background: 'transparent', cursor: 'pointer' }}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TemplateManager;