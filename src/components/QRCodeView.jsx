import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

const QRCodeView = () => {
  // For the demo, the QR code links to the local Passenger View.
  // When you deploy this to the internet later, you just change this URL to your live domain.
  //const passengerUrl = window.location.origin;
  const passengerUrl = "http://10.0.10.180:5173/";

  return (
    <div className="app-container" style={{ textAlign: 'center', marginTop: '50px' }}>
      <h1 style={{ color: '#0056b3' }}>Scan to View Live Schedule</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>St. Bernard Terminal</p>
      
      <div style={{ 
        backgroundColor: 'white', 
        padding: '30px', 
        display: 'inline-block', 
        borderRadius: '16px', 
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)' 
      }}>
        <QRCodeSVG value={passengerUrl} size={256} />
      </div>
      
      <h2 style={{ marginTop: '30px' }}>Point your camera here</h2>
      <p>No app download required.</p>
    </div>
  );
};

export default QRCodeView;