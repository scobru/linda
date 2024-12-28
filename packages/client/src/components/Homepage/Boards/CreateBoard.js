import React, { useState } from "react";
import { boardsV2 } from "linda-protocol";

const CreateBoard = ({ onBoardCreated }) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("public");
  const [category, setCategory] = useState("general");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const categories = [
    "general",
    "tech",
    "arte",
    "musica",
    "sport",
    "gaming",
    "altro",
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await boardsV2.create(
        {
          name,
          description,
          type,
          category,
        },
        (response) => {
          if (response.success) {
            setName("");
            setDescription("");
            setType("public");
            setCategory("general");
            if (onBoardCreated) onBoardCreated(response.board);
          } else {
            setError(response.error);
          }
          setLoading(false);
        }
      );
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <h2 className="text-xl font-bold mb-4">Crea Nuova Board</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Nome
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Descrizione
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            rows="3"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Tipo
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="public">Pubblica</option>
            <option value="private">Privata</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Categoria
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {error && <div className="text-red-500 text-sm">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className={`w-full px-4 py-2 text-white rounded-md ${
            loading
              ? "bg-blue-400 cursor-not-allowed"
              : "bg-blue-500 hover:bg-blue-600"
          }`}
        >
          {loading ? "Creazione in corso..." : "Crea Board"}
        </button>
      </form>
    </div>
  );
};

export default CreateBoard;
