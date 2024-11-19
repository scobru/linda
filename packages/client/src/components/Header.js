import { ConnectButton } from '@rainbow-me/rainbowkit';

function Header() {
  return (
    <header style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: '60px',
      backgroundColor: '',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      zIndex: 1000
    }}>
      <div style={{ color: '#000' }}>Linda Messenger</div>
      <ConnectButton />
    </header>
  );
}

export default Header;