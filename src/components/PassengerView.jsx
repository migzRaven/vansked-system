import { useState } from 'react';
import ScheduleCard from './ScheduleCard';
import { getTelephoneHref } from '../utils/phoneNumber';
import './PassengerView.css';

const DISPATCHER_HOTLINE = '09066549947';

const PassengerView = ({ schedules, isOnline, lastUpdated }) => {
  const [isEarlierOpen, setIsEarlierOpen] = useState(false);

  const dispatcherTelephoneHref = getTelephoneHref(DISPATCHER_HOTLINE);

  const now = new Date().getTime();
  const gracePeriod = 30 * 60 * 1000;

  const upcomingTrips = [];
  const pastTrips = [];

  schedules.forEach((trip) => {
    const depTime = trip.departureAt ? trip.departureAt.toDate().getTime() : 0;

    if (trip.status === 'Departed' || now > depTime + gracePeriod || trip.status === 'Overdue') {
      pastTrips.push(trip);
    } else {
      upcomingTrips.push(trip);
    }
  });

  upcomingTrips.sort((a, b) => (a.departureAt?.toMillis() || 0) - (b.departureAt?.toMillis() || 0));
  pastTrips.sort((a, b) => (b.departureAt?.toMillis() || 0) - (a.departureAt?.toMillis() || 0));

  const nextDeparture = upcomingTrips.length > 0 ? upcomingTrips[0] : null;
  const otherUpcoming = upcomingTrips.slice(1);

  const currentDate = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date());

  const syncTime = lastUpdated.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="passenger-layout">
      <header className="passenger-header">
        <div>
          <h1>St. Bernard Terminal</h1>
          <p style={{ color: '#a0aec0', fontSize: '0.85rem', marginTop: '4px' }}>
            {currentDate}
          </p>
        </div>

        <div className={`live-indicator ${!isOnline ? 'offline' : ''}`}>
          <span className="pulse-dot"></span>
          {!isOnline ? 'Offline - Cached Data' : `Live · ${syncTime}`}
        </div>
      </header>

      <main className="passenger-list">

        {/* MINIMALIST DISPATCHER BANNER */}
        <div className="dispatcher-banner">
          <span>Need assistance?</span>
          {dispatcherTelephoneHref ? (
            <a className="btn-dispatcher-call" href={dispatcherTelephoneHref}>
              📞 Call Dispatcher
            </a>
          ) : (
            <button type="button" className="btn-dispatcher-call" disabled>
              Unavailable
            </button>
          )}
        </div>

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
                <button
                  type="button"
                  className="collapsible-header"
                  onClick={() => setIsEarlierOpen(!isEarlierOpen)}
                  aria-expanded={isEarlierOpen}
                >
                  <h3 className="section-title" style={{ margin: 0 }}>
                    Earlier Today ({pastTrips.length})
                  </h3>
                  <span aria-hidden="true">{isEarlierOpen ? '▲' : '▼'}</span>
                </button>

                {isEarlierOpen && (
                  <div style={{ marginTop: '15px' }}>
                    {pastTrips.map((schedule) => (
                      <ScheduleCard key={schedule.id} schedule={schedule} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <footer className="passenger-footer">
        <p>Departure information is updated in real-time by terminal dispatchers.</p>
        <p>Please confirm schedules at the terminal counter.</p>
      </footer>
    </div>
  );
};

export default PassengerView;