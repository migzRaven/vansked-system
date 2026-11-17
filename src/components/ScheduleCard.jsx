import React from 'react';
import './ScheduleCard.css';

const STATUS = {
  Waiting:  { cls: 'waiting',  label: 'Waiting' },
  Boarding: { cls: 'boarding', label: 'Now Boarding' },
  Full:     { cls: 'full',     label: 'Full' },
  Departed: { cls: 'departed', label: 'Departed' },
};

export default function ScheduleCard({ schedule: s }) {
  const st = STATUS[s.status] ?? STATUS.Waiting;

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

      {/* Only show call button if not departed or full */}
      {s.status !== 'Departed' && s.status !== 'Full' && s.phone && (
        <a className="btn-call" href={`tel:${s.phone}`}>
          📞 Call {s.driver.split(' ')[0]}
        </a>
      )}
    </article>
  );
}