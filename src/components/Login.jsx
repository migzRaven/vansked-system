import React, { useState } from 'react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import './Login.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/dispatcher');
    } catch (err) {
      setError('Invalid email or password.');
    }
  };

  return (
    <div className="app-container login-container">
      <header className="app-header">
        <h1>Staff Login</h1>
        <p>Dispatcher & Driver Access</p>
      </header>
      
      {error && <div className="error-message">{error}</div>}
      
      <form onSubmit={handleLogin} className="form-group">
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="input-field" />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required className="input-field" />
        <button type="submit" className="btn btn-primary">Log In</button>
      </form>
    </div>
  );
};

export default Login;