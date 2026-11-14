import React from 'react';

const ScheduleCard = ({ schedule }) => {
  // Determine color based on status
  const getStatusColor = (status) => {
    if (status === 'Boarding') return 'green';
    if (status === 'Full') return 'red';
    if (status === 'Departed') return 'gray';
    return 'orange'; // Waiting
  };

  // Calculate how many seats are left
  let seatsLeft = 0;
  let totalSeats = 0;
  
  if (schedule.seats) {
    seatsLeft = schedule.seats.filter(seat => seat === 'empty').length;
    totalSeats = schedule.seats.length;
  }

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
        
        {/* Display Seats Available if the data exists */}
        {schedule.seats && (
          <div style={{ marginTop: '10px', padding: '8px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
            <p style={{ 
              margin: 0, 
              fontWeight: 'bold', 
              color: seatsLeft === 0 ? 'red' : (seatsLeft <= 3 ? 'orange' : 'green') 
            }}>
              Seats Available: {seatsLeft} / {totalSeats}
            </p>
            {seatsLeft === 0 && (
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'red' }}>
                This van is full. Waiting for next trip.
              </p>
            )}
          </div>
        )}
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