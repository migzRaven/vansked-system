import React from 'react';
import ScheduleCard from './ScheduleCard';

// Notice we are now accepting "schedules" as a prop!
const PassengerView = ({ schedules }) => {
  return (
    <div className="app-container">
      <header className="app-header">
        <h1>VanSked Terminal Board</h1>
        <p>St. Bernard Terminal - Live Updates</p>
      </header>
      <main className="schedule-list">
        {schedules.map((schedule) => (
          <ScheduleCard key={schedule.id} schedule={schedule} />
        ))}
      </main>
    </div>
  );
};

export default PassengerView;