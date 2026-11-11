import React from 'react';
import ScheduleCard from './ScheduleCard';
import { vanSchedules } from '../mockData';

const PassengerView = () => {
  return (
    <div className="app-container">
      <header className="app-header">
        <h1>VanSked Terminal Board</h1>
        <p>St. Bernard Terminal - Live Updates</p>
      </header>
      <main className="schedule-list">
        {vanSchedules.map((schedule) => (
          <ScheduleCard key={schedule.id} schedule={schedule} />
        ))}
      </main>
    </div>
  );
};

export default PassengerView;