import React from 'react';

const SeatMap = ({ seats, onSeatClick }) => {
  const getSeatColor = (status) => {
    if (status === 'taken') return '#dc3545'; // Red (Walk-in)
    if (status === 'reserved') return '#ffc107'; // Yellow (Caller)
    return '#28a745'; // Green (Empty)
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexWrap: 'wrap', 
      gap: '8px', 
      maxWidth: '180px', // Fits 3 seats per row (like a van)
      marginTop: '15px',
      padding: '10px',
      backgroundColor: '#f8f9fa',
      borderRadius: '8px',
      border: '1px solid #ddd'
    }}>
      {seats.map((status, index) => (
        <div 
          key={index}
          onClick={() => onSeatClick(index, status)}
          title={`Seat ${index + 1}: ${status.toUpperCase()}`}
          style={{
            width: '45px',
            height: '45px',
            backgroundColor: getSeatColor(status),
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '14px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            userSelect: 'none'
          }}
        >
          {index + 1}
        </div>
      ))}
    </div>
  );
};

export default SeatMap;