const UserInfo = ({ user }) => {
  // Funzione per troncare la chiave pubblica
  const truncatePubKey = (key) => {
    if (!key) return '';
    return `${key.slice(0, 6)}...${key.slice(-4)}`;
  };

  return (
    <div className="user-info-container">
      <div className="avatar-wrapper">
        {/* Avatar esistente... */}
      </div>
      <div className="user-details">
        <div className="nickname">{user.nickname}</div>
        <div className="username">@{user.username}</div>
        <div className="pubkey">{truncatePubKey(user.publicKey)}</div>
      </div>
    </div>
  );
}; 