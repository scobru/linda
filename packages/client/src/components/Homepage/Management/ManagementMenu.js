import React, { useState } from "react";
import { toast } from "react-hot-toast";

const ManagementMenu = ({
  type, // "channel" o "group"
  item, // il canale o gruppo da gestire
  isCreator,
  onUpdateAvatar,
  onDelete,
  onUpdateName,
  onUpdateDescription,
  onKickMember,
  onPromoteMember,
  onDemoteMember,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showEditDetails, setShowEditDetails] = useState(false);
  const [newName, setNewName] = useState(item.name);
  const [newDescription, setNewDescription] = useState(item.description || "");

  if (!isCreator) return null;

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("L'immagine non può superare i 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      onUpdateAvatar(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveDetails = () => {
    if (newName !== item.name) {
      onUpdateName(newName);
    }
    if (newDescription !== item.description) {
      onUpdateDescription(newDescription);
    }
    setShowEditDetails(false);
  };

  return (
    <div className="relative">
      {/* Pulsante menu */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-[#4A4F76]"
        title={`Gestisci ${type === "channel" ? "canale" : "gruppo"}`}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
          />
        </svg>
      </button>

      {/* Menu dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-[#2D325A] ring-1 ring-black ring-opacity-5 z-50">
          <div className="py-1">
            {/* Cambia avatar */}
            <button
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "image/*";
                input.onchange = handleAvatarChange;
                input.click();
              }}
              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-[#4A4F76]"
            >
              Cambia avatar
            </button>

            {/* Modifica dettagli */}
            <button
              onClick={() => setShowEditDetails(true)}
              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-[#4A4F76]"
            >
              Modifica dettagli
            </button>

            {/* Elimina */}
            <button
              onClick={() => setShowConfirmDelete(true)}
              className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-[#4A4F76]"
            >
              Elimina {type === "channel" ? "canale" : "gruppo"}
            </button>
          </div>
        </div>
      )}

      {/* Modal conferma eliminazione */}
      {showConfirmDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-[#373B5C] rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold text-white mb-4">
              Conferma eliminazione
            </h3>
            <p className="text-white mb-4">
              Sei sicuro di voler eliminare questo{" "}
              {type === "channel" ? "canale" : "gruppo"}? Questa azione non può
              essere annullata.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowConfirmDelete(false)}
                className="px-4 py-2 rounded-lg bg-gray-600 text-white hover:bg-gray-700"
              >
                Annulla
              </button>
              <button
                onClick={() => {
                  onDelete();
                  setShowConfirmDelete(false);
                  setIsOpen(false);
                }}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal modifica dettagli */}
      {showEditDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-[#373B5C] rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold text-white mb-4">
              Modifica dettagli
            </h3>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome"
              className="w-full bg-[#2D325A] text-white rounded-lg px-4 py-2 mb-4"
            />
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Descrizione"
              className="w-full bg-[#2D325A] text-white rounded-lg px-4 py-2 mb-4 h-24 resize-none"
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowEditDetails(false)}
                className="px-4 py-2 rounded-lg bg-gray-600 text-white hover:bg-gray-700"
              >
                Annulla
              </button>
              <button
                onClick={handleSaveDetails}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagementMenu;
