import React from "react";

export const Avatar = ({ seed, size = 40 }) => {
  return (
    <img
      className="rounded-full"
      src={`https://api.dicebear.com/7.x/bottts/svg?seed=${seed}&backgroundColor=b6e3f4`}
      alt="Avatar utente"
      style={{ width: size, height: size }}
    />
  );
};

export default Avatar;
