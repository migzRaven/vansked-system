import './ScheduleCard.css';
import { getTelephoneHref } from '../utils/phoneNumber';

const STATUS = {
  Waiting: { cls: 'waiting', label: 'Waiting' },
  Boarding: { cls: 'boarding', label: 'Now Boarding' },
  Full: { cls: 'full', label: 'Full' },
  Departed: { cls: 'departed', label: 'Departed' },
  Overdue: { cls: 'overdue', label: 'Overdue' },
  Scheduled: { cls: 'scheduled', label: 'Scheduled' },
};

const CALLABLE_STATUSES = ['Waiting', 'Boarding', 'Full', 'Overdue'];

export default function ScheduleCard({ schedule: s }) {
  let isPastTime = false;

  if (s.departureAt) {
    let depTimeMs = 0;
    if (typeof s.departureAt.toDate === 'function') {
      depTimeMs = s.departureAt.toDate().getTime();
    } else if (s.departureAt instanceof Date) {
      depTimeMs = s.departureAt.getTime();
    }

    const currentTime = new Date().getTime();
    if (Number.isFinite(depTimeMs) && depTimeMs > 0 && currentTime > depTimeMs + 1800000) {
      isPastTime = true;
    }
  }

  let displayStatus = s.status;
  if (isPastTime && (s.status === 'Waiting' || s.status === 'Boarding' || s.status === 'Overdue')) {
    displayStatus = 'Scheduled';
  }

  const st = STATUS[displayStatus] ?? STATUS.Waiting;
  const telephoneHref = getTelephoneHref(s.phone);
  const canCallDriver = CALLABLE_STATUSES.includes(s.status);

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

      {/* MINIMALIST CALL BUTTON */}
      {canCallDriver && (
        telephoneHref ? (
          <a className="btn-call" href={telephoneHref}>
                Call Driver
          </a>
        ) : (
          <button type="button" className="btn-call" disabled>
                Contact Unavailable
          </button>
        )
      )}
    </article>
  );
}