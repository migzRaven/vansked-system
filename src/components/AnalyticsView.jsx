import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './AnalyticsView.css';

const AnalyticsView = () => {
  const [events, setEvents] = useState([]);
  const [todaysTrips, setTodaysTrips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const todayStr = new Intl.DateTimeFormat('en-CA', { 
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' 
    }).format(new Date());

    // 1. Listen to today's trips
    const qTrips = query(collection(db, "trips"), where("date", "==", todayStr));
    const unsubTrips = onSnapshot(qTrips, (snap) => {
      setTodaysTrips(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 2. Listen to the last 50 events
    const qEvents = query(collection(db, "trip_events"), orderBy("timestamp", "desc"), limit(50));
    const unsubEvents = onSnapshot(qEvents, (snap) => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
      
    });

    return () => { unsubTrips(); unsubEvents(); };
  }, []);

  // --- CALCULATE METRICS ---
  const totalTrips = todaysTrips.length;
  const departedTrips = todaysTrips.filter(t => t.status === 'Departed');
  const totalVacantSeatsLeft = departedTrips.reduce((sum, t) => sum + (t.vacantSeats || 0), 0);
  
  // Calculate how many trips went to Tacloban vs Sogod vs Bato
  const destinationCounts = todaysTrips.reduce((acc, trip) => {
    const dest = trip.route.split('to ')[1] || 'Unknown';
    acc[dest] = (acc[dest] || 0) + 1;
    return acc;
  }, {});

  const chartData = Object.keys(destinationCounts).map(key => ({
    name: key,
    trips: destinationCounts[key]
  }));

  if (loading) return <div style={{textAlign: 'center', marginTop: '50px'}}>Loading analytics...</div>;

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Terminal Analytics & Event Log</h1>
        <p>Live Operations Overview</p>
      </header>

      {/* KPI Cards */}
      <div className="analytics-kpi-strip">
        <div className="analytics-kpi">
          <h4>Total Trips Today</h4>
          <p>{totalTrips}</p>
        </div>
        <div className="analytics-kpi">
          <h4>Trips Departed</h4>
          <p>{departedTrips.length}</p>
        </div>
        <div className="analytics-kpi">
          <h4>Total Vacant Seats</h4>
          <p>{totalVacantSeatsLeft}</p>
        </div>
      </div>

      {/* Chart */}
      <div className="chart-container">
        <h3>Trips by Destination</h3>
        <div style={{ width: '100%', height: 300, marginTop: '20px' }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{fontSize: 12}} />
              <YAxis allowDecimals={false} tick={{fontSize: 12}} />
              <Tooltip />
              <Bar dataKey="trips" fill="var(--navy-700)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Event Log Table */}
      <div className="event-log-container">
        <h3>Live Event Log</h3>
        <p style={{fontSize: '13px', color: 'var(--muted)', marginBottom: '15px'}}>
          Record of every action taken by the dispatcher.
        </p>
        <div className="table-wrapper">
          <table className="event-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Route</th>
                <th>Driver</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {events.map(event => (
                <tr key={event.id}>
                  <td className="mono">{event.timestamp ? event.timestamp.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '...'}</td>
                  <td>{event.route}</td>
                  <td>{event.driver}</td>
                  <td><span className="event-badge">{event.action}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsView;