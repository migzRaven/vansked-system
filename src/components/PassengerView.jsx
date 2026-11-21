import React from 'react';
import ScheduleCard from './ScheduleCard';
import './PassengerView.css';

const PassengerView = ({ schedules }) => {
  const now = new Date().getTime();
  const gracePeriod = 30 * 60 * 1000; 

  const upcomingTrips = [];
  const pastTrips = [];

  schedules.forEach(trip => {
    const depTime = trip.departureAt ? trip.departureAt.toDate().getTime() : 0;
    if (trip.status === 'Departed' || (now > depTime + gracePeriod) || trip.status === 'Overdue') {
      pastTrips.push(trip);
    } else {
      upcomingTrips.push(trip);
    }
  });

  upcomingTrips.sort((a, b) => (a.departureAt?.toMillis() || 0) - (b.departureAt?.toMillis() || 0));
  pastTrips.sort((a, b) => (b.departureAt?.toMillis() || 0) - (a.departureAt?.toMillis() || 0));

  const nextDeparture = upcomingTrips.length > 0 ? upcomingTrips[0] : null;
  const otherUpcoming = upcomingTrips.slice(1); 

  return (
    <div className="passenger-layout">
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
            {nextDeparture && (
              <div className="next-departure-section">
                <h3 className="next-departure-title">⚡ Next Departure</h3>
                <div className="next-departure-card-wrapper">
                  <ScheduleCard schedule={nextDeparture} />
                </div>
              </div>
            )}

            {otherUpcoming.length > 0 && (
              <div className="later-today-section">
                <h3 className="section-title">Later Today</h3>
                {otherUpcoming.map((schedule) => (
                  <ScheduleCard key={schedule.id} schedule={schedule} />
                ))}
              </div>
            )}

            {pastTrips.length > 0 && (
              <div className="earlier-today-section">
                <h3 className="section-title">Earlier Today</h3>
                {pastTrips.map((schedule) => (
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