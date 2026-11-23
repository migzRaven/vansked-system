
import { QRCodeSVG } from 'qrcode.react';
import './QRCodeView.css';

const QRCodeView = () => {
  const passengerUrl = window.location.origin;

  return (
    <div className="app-container qr-container">
      <h1 className="qr-title">Scan to View Live Schedule</h1>
      <p className="qr-subtitle">St. Bernard Terminal</p>

      <div className="qr-box">
        <QRCodeSVG value={passengerUrl} size={256} />
      </div>

      <h2 className="qr-instruction">Point your camera here</h2>
      <p>No app download required.</p>
    </div>
  );
};

export default QRCodeView;
