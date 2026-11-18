import React from 'react';
import './ScheduleCard.css';

const STATUS = {
  Waiting:   { cls: 'waiting',   label: 'Waiting' },
  Boarding:  { cls: 'boarding',  label: 'Now Boarding' },
  Full:      { cls: 'full',      label: 'Full' },
  Departed:  { cls: 'departed',  label: 'Departed' },
  Scheduled: { cls: 'scheduled', label: 'Scheduled' }
};

export default function ScheduleCard({ schedule: s }) {
  // TIME CHECKER: Has it been more than 30 mins since departure?
  let isPastTime = false;
  if (s.departureAt) {
    const depTimeMs = s.departureAt.toDate().getTime();
    const nowMs = new Date().getTime();
    if (nowMs > depTimeMs + 1800000) { // 30 minutes
      isPastTime = true;
    }
  }

  // If time passed and dispatcher hasn't updated, show "Scheduled" to passenger
  let displayStatus = s.status;
  if (isPastTime && (s.status === 'Waiting' || s.status === 'Boarding' || s.status === 'Overdue')) {
    displayStatus = 'Scheduled';
  }

  const st = STATUS[displayStatus] ?? STATUS.Waiting;

  return (
    <article className={`trip ${st.cls}`}>
      <div className="trip__time mono">{s.departureTime}</div>
      
      <div className="trip__main">
        <h3>{s.route}</h3>
        <p>₱{s.fare} · {s.plateNumber}</p>
      </div>
      
      <span className={`pill pill--${st.cls}`}>{st.label}</span>

      {s.status === 'Departed' && (
        <p className="trip__note">
          {s.vacantSeats > 0
            ? `Left with ${s.vacantSeats} empty seat(s). You can flag it down on the highway.`
            : 'Left full.'}
        </p>
      )}

      {/* Only show call button if it's actively waiting or boarding */}
      {displayStatus !== 'Departed' && displayStatus !== 'Full' && displayStatus !== 'Scheduled' && s.phone && (
        <a className="btn-call" href={`tel:${s.phone}`}>
          📞 Call {s.driver.split(' ')[0]}
        </a>
      )}
    </article>
  );
}