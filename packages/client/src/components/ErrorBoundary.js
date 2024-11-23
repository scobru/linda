import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-container">
          <h2>Qualcosa è andato storto</h2>
          <p>Si prega di ricaricare la pagina o effettuare nuovamente l'accesso.</p>
          <button onClick={() => window.location.reload()}>
            Ricarica pagina
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 