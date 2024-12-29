import React, { useState, useRef, useEffect } from "react";
import { REACTIONS } from "../../protocol/reactions/reactions";

const ReactionPicker = ({ onSelectReaction }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const pickerRef = useRef(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleReactionSelect = (reaction) => {
    onSelectReaction(reaction);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={pickerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center px-2 py-1 rounded-md text-sm bg-gray-100 border border-gray-300 hover:bg-gray-200 transition-colors duration-200"
      >
        <span className="text-lg">😀</span>
      </button>

      {isOpen && (
        <div
          className={`
            absolute ${isMobile ? "top-full" : "bottom-full"} 
            left-0 
            ${isMobile ? "mt-2" : "mb-2"} 
            p-2 
            bg-white 
            rounded-lg 
            shadow-lg 
            border 
            border-gray-200 
            grid grid-cols-6 
            gap-2
            z-50
          `}
          style={{
            maxWidth: "300px",
            maxHeight: "200px",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {Object.values(REACTIONS).map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleReactionSelect(emoji)}
              className="p-2 hover:bg-gray-100 rounded transition-colors duration-200 flex items-center justify-center"
            >
              <span className="text-2xl">{emoji}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReactionPicker;
