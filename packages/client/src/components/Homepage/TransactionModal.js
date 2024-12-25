import React from "react";
import TransactionHistory from "./TransactionHistory";

const TransactionModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[#373B5C] rounded-lg p-6 w-[800px] max-h-[80vh] overflow-y-auto border border-[#4A4F76]">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-white">Transazioni</h3>
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-white hover:bg-[#4A4F76] rounded-full p-2 transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <TransactionHistory />
      </div>
    </div>
  );
};

export default TransactionModal;
