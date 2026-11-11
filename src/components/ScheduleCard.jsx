import React from 'react';

const ScheduleCard = ({ schedule }) => {
  // Determine color based on status
  const getStatusColor = (status) => {
    if (status === 'Boarding') return 'green';
    if (status === 'Full') return 'red';
    if (status === 'Departed') return 'gray';
    return 'orange'; // Waiting
  };

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <h2 style={styles.time}>{schedule.departureTime}</h2>
        <span style={{ ...styles.status, backgroundColor: getStatusColor(schedule.status) }}>
          {schedule.status}
        </span>
      </div>
      
      <h3 style={styles.route}>{schedule.route}</h3>
      
      <div style={styles.details}>
        <p><strong>Driver:</strong> {schedule.driver}</p>
        <p><strong>Plate No:</strong> {schedule.plateNumber}</p>
        <p><strong>Fare:</strong> {schedule.fare}</p>
      </div>
    </div>
  );
};

// Basic inline styles for tonight to make it look decent
const styles = {
  card: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    borderLeft: '5px solid #007bff',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  },
  time: {
    margin: 0,
    fontSize: '24px',
    color: '#333',
  },
  status: {
    padding: '4px 12px',
    borderRadius: '20px',
    color: 'white',
    fontWeight: 'bold',
    fontSize: '14px',
  },
  route: {
    margin: '0 0 12px 0',
    color: '#555',
  },
  details: {
    fontSize: '14px',
    color: '#666',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  }
};

export default ScheduleCard;