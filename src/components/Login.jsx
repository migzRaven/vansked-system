import React, { useState } from 'react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/dispatcher'); // Redirect after successful login
    } catch (err) {
      setError('Invalid email or password.');
    }
  };

  return (
    <div className="app-container" style={{ maxWidth: '400px', marginTop: '50px' }}>
      <header className="app-header">
        <h1>Staff Login</h1>
        <p>Dispatcher & Driver Access</p>
      </header>
      
      {error && <div style={{ backgroundColor: '#f8d7da', color: '#721c24', padding: '10px', borderRadius: '4px', marginBottom: '15px', textAlign: 'center' }}>{error}</div>}
      
      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <input 
          type="email" 
          placeholder="Email" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
          required 
          style={{ padding: '12px', borderRadius: '4px', border: '1px solid #ccc' }} 
        />
        <input 
          type="password" 
          placeholder="Password" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)} 
          required 
          style={{ padding: '12px', borderRadius: '4px', border: '1px solid #ccc' }} 
        />
        <button type="submit" style={{ padding: '12px', backgroundColor: '#0056b3', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
          Log In
        </button>
      </form>
    </div>
  );
};

export default Login;