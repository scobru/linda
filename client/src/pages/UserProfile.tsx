import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DataBase } from "shogun-core";

interface UserProfileProps {
  db: DataBase;
  username: string;
  currentNick: string;
  currentUniqueUsername: string;
  currentAvatar: string | null;
  handleLogout: () => void;
  showNotification: (msg: string, type?: "info" | "error") => void;
}

export const UserProfile: React.FC<UserProfileProps> = ({
  db,
  username,
  currentNick,
  currentUniqueUsername,
  currentAvatar,
  handleLogout,
  showNotification,
}) => {
  const navigate = useNavigate();
  const [nick, setNick] = useState(currentNick);
  const [uniqueName, setUniqueName] = useState(currentUniqueUsername);
  const [keys, setKeys] = useState("");
  const [showKeys, setShowKeys] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    const pair = (db.getCurrentUser()?.user as any)?._?.sea;
    if (pair) {
      setKeys(JSON.stringify(pair, null, 2));
    }
  }, [db]);

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const MAX_WIDTH = 200;
        const MAX_HEIGHT = 200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        db.userPut("profile/avatar", dataUrl)
          .then(() => showNotification("Avatar updated!", "info"))
          .catch(() => showNotification("Failed to save avatar", "error"));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleCopyKeys = () => {
    if (!keys) return;
    navigator.clipboard.writeText(keys).then(() => {
      setCopyStatus("Copied!");
      setTimeout(() => setCopyStatus(""), 2000);
    });
  };

  const handleSaveNick = async () => {
    if (!nick || nick === currentNick) return;
    const pub = db.getUserPub();
    if (!pub) return;
    try {
      let takenPub: any = undefined;
      try {
        takenPub = await db.Get(`signal_global_nicknames/${nick}`);
      } catch (e) {}
      if (takenPub && takenPub !== pub) {
        showNotification("Nickname already taken", "error");
      } else {
        await db.Put(`signal_global_nicknames/${nick}`, pub);
        await db.userPut("profile/nickname", nick);
        showNotification("Nickname updated", "info");
      }
    } catch (e) {
      showNotification("Failed to save nickname", "error");
    }
  };

  const handleSaveUniqueUsername = async () => {
    if (!uniqueName || uniqueName === currentUniqueUsername) return;
    const pub = db.getUserPub();
    if (!pub) return;
    let normalized = uniqueName.trim();
    if (!normalized.startsWith("@")) normalized = `@${normalized}`;
    if (!/^@[a-zA-Z0-9]+$/.test(normalized)) {
      showNotification("Username must be @name1234 format", "error");
      return;
    }
    try {
      let takenPub: any = undefined;
      try {
        takenPub = await db.Get(`signal_unique_usernames/${normalized}`);
      } catch (e) {}
      if (takenPub && takenPub !== pub) {
        showNotification("Unique username already taken", "error");
      } else {
        await db.Put(`signal_unique_usernames/${normalized}`, pub);
        await db.userPut("profile/uniqueUsername", normalized);
        showNotification("Unique username updated", "info");
      }
    } catch (e) {
      showNotification("Failed to save unique username", "error");
    }
  };

  return (
    <div className="page-container glass-effect">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <span className="icon">←</span>
        </button>
        <h1>User Profile</h1>
      </div>

      <div className="page-content">
        <div className="profile-hero">
          <div className="avatar-large-wrap">
            <div className="avatar-large">
              {currentAvatar ? (
                <img src={currentAvatar} alt="Avatar" />
              ) : (
                <div className="avatar-placeholder">{username.charAt(0).toUpperCase()}</div>
              )}
            </div>
            <label className="avatar-upload-label">
              <span className="icon">✎</span>
              <input type="file" accept="image/*" onChange={handleAvatarSelect} hidden />
            </label>
          </div>
          <div className="hero-info">
            <h2>{currentNick || username}</h2>
            <p className="subtitle">{currentUniqueUsername}</p>
          </div>
        </div>

        <div className="settings-section">
          <h3>Display Name</h3>
          <div className="input-with-button">
            <input
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              placeholder="Nickname"
            />
            <button onClick={handleSaveNick} className="primary-btn">
              Update
            </button>
          </div>
        </div>

        <div className="settings-section">
          <h3>Unique Username</h3>
          <div className="input-with-button">
            <input
              value={uniqueName}
              onChange={(e) => setUniqueName(e.target.value)}
              placeholder="@username1234"
            />
            <button onClick={handleSaveUniqueUsername} className="primary-btn">
              Update
            </button>
          </div>
        </div>

        <div className="settings-section danger-zone">
          <h3>Privacy & Backup</h3>
          <div className="action-row">
            <span>Export Encryption Keys</span>
            <div className="button-group">
              <button 
                className="secondary-btn" 
                onClick={() => setShowKeys(!showKeys)}
              >
                {showKeys ? "Hide" : "Show"}
              </button>
              <button className="secondary-btn" onClick={handleCopyKeys}>
                {copyStatus || "Copy"}
              </button>
            </div>
          </div>
          {showKeys && (
            <textarea
              readOnly
              value={keys}
              className="key-textarea glass-input"
            />
          )}
        </div>

        <div className="settings-section">
          <h3>Account</h3>
          <div className="action-row">
            <span>Logout from this device</span>
            <button 
              className="secondary-btn" 
              style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }} 
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
