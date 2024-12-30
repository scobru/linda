import React from "react";
import Messages from "../Messages/Messages";

const BoardView = ({ board, onBack, isMobileView }) => {
  return (
    <div
      className={`flex flex-col h-full bg-[#1E2142] ${
        isMobileView ? "fixed inset-0 z-50" : ""
      }`}
    >
      <Messages isMobileView={isMobileView} onBack={onBack} />
    </div>
  );
};

export default BoardView;
