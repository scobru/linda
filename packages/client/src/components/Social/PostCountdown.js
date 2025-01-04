import React, { useState, useEffect } from "react";

const PostCountdown = ({ expiresAt }) => {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = Date.now();
      const diff = expiresAt - now;

      if (diff <= 0) {
        return "Scaduto";
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      return `${hours}h ${minutes}m ${seconds}s`;
    };

    setTimeLeft(calculateTimeLeft());
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresAt]);

  return (
    <div
      className="post-countdown"
      style={{ fontSize: "0.8rem", color: "#666" }}
    >
      Scade in: {timeLeft}
    </div>
  );
};

export default PostCountdown;
