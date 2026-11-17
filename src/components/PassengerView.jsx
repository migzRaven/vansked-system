import React from 'react';
import ScheduleCard from './ScheduleCard';
import './PassengerView.css';

const PassengerView = ({ schedules }) => {
  // Find the next trip that hasn't departed
  const activeTrips = schedules.filter(s => s.status !== 'Departed');
  const departedTrips = schedules.filter(s => s.status === 'Departed');

  return (
    <div className="passenger-layout">
      {/* Sticky Header */}
      <header className="passenger-header">
        <h1>St. Bernard Terminal</h1>
        <div className="live-indicator">
          <span className="pulse-dot"></span>
          Live Updates
        </div>
      </header>

      <main className="passenger-list">
        {schedules.length === 0 ? (
          <div className="empty-state">
            <h3>No trips scheduled yet.</h3>
            <p>Please wait for the dispatcher to post today's schedule.</p>
          </div>
        ) : (
          <>
            {/* Upcoming Trips */}
            {activeTrips.map((schedule) => (
              <ScheduleCard key={schedule.id} schedule={schedule} />
            ))}

            {/* Departed Trips (Collapsed visually) */}
            {departedTrips.length > 0 && (
              <div style={{ marginTop: '30px' }}>
                <h3 style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '15px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Earlier Today
                </h3>
                {departedTrips.map((schedule) => (
                  <ScheduleCard key={schedule.id} schedule={schedule} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default PassengerView;