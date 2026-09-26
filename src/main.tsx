import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Reployty Centralized Design System
import './styles/tokens.css';
import './styles/base.css';
import './styles/themes.css';
import './styles/layout.css';
import './styles/components.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find root element');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
