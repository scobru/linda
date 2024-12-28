import React, { useState } from "react";
import { toast } from "react-hot-toast";
import { channelsV2 } from "linda-protocol";

export default function CreateChannel({ onChannelCreated }) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("public");

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Il nome del canale è obbligatorio");
      return;
    }

    try {
      await channelsV2.create(
        {
          name: name.trim(),
          description: description.trim(),
          type,
        },
        (response) => {
          if (response.success) {
            toast.success("Canale creato con successo");
            setIsOpen(false);
            setName("");
            setDescription("");
            setType("public");
            if (onChannelCreated) onChannelCreated();
          } else {
            throw new Error(response.error);
          }
        }
      );
    } catch (error) {
      console.error("Errore creazione canale:", error);
      toast.error(error.message || "Errore durante la creazione del canale");
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
      >
        Nuovo Canale
      </button>
    );
  }

  return (
    <div className="bg-[#2D325A] rounded-lg p-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-white mb-1">Nome del canale</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="es. Generale"
            className="w-full px-3 py-2 bg-[#373B5C] text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            maxLength={50}
          />
        </div>

        <div>
          <label className="block text-white mb-1">
            Descrizione (opzionale)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descrivi il canale..."
            className="w-full px-3 py-2 bg-[#373B5C] text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
            maxLength={200}
          />
        </div>

        <div>
          <label className="block text-white mb-1">Tipo di canale</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full px-3 py-2 bg-[#373B5C] text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="public">Pubblico</option>
            <option value="private">Privato</option>
          </select>
        </div>

        <div className="flex justify-end space-x-2">
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              setName("");
              setDescription("");
              setType("public");
            }}
            className="px-4 py-2 text-white rounded hover:bg-[#4A4F76] transition-colors"
          >
            Annulla
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            Crea Canale
          </button>
        </div>
      </form>
    </div>
  );
}
