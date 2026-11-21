import React from 'react';
import './ScheduleCard.css';

const STATUS = {
  Waiting:   { cls: 'waiting',   label: 'Waiting' },
  Boarding:  { cls: 'boarding',  label: 'Now Boarding' },
  Full:      { cls: 'full',      label: 'Full' },
  Departed:  { cls: 'departed',  label: 'Departed' },
  Overdue:   { cls: 'overdue',   label: 'Overdue' },
  Scheduled: { cls: 'scheduled', label: 'Scheduled' }
};

export default function ScheduleCard({ schedule: s }) {
  let isPastTime = false;
  if (s.departureAt) {
    const depTimeMs = s.departureAt.toDate().getTime();
    const nowMs = new Date().getTime();
    if (nowMs > depTimeMs + 1800000) { // 30 minutes
      isPastTime = true;
    }
  }

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

      {displayStatus !== 'Departed' && displayStatus !== 'Full' && displayStatus !== 'Scheduled' && displayStatus !== 'Overdue' && s.phone && (
        <a className="btn-call" href={`tel:${s.phone}`}>
          📞 Call {s.driver.split(' ')[0]}
        </a>
      )}
    </article>
  );
}