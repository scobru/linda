import React, { useState, useEffect } from "react";
import { boardsV2 } from "linda-protocol";

const BoardList = () => {
  const [boardList, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadBoards();
  }, []);

  const loadBoards = async () => {
    try {
      await boardsV2.list((response) => {
        if (response.success) {
          setBoards(response.boards);
        } else {
          setError(response.error);
        }
        setLoading(false);
      });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (loading) return <div className="p-4">Caricamento boards...</div>;
  if (error) return <div className="p-4 text-red-500">Errore: {error}</div>;

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Boards Disponibili</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {boardList.map((board) => (
          <div
            key={board.id}
            className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <h3 className="font-semibold text-lg">{board.name}</h3>
            <p className="text-sm text-gray-600 mt-2">{board.description}</p>
            <div className="mt-3">
              <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                {board.category}
              </span>
            </div>
            <div className="mt-4 flex justify-between items-center">
              <span className="text-xs text-gray-500">
                Creato il: {new Date(board.created).toLocaleDateString()}
              </span>
              <button
                onClick={() => boardsV2.join(board.id)}
                className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm"
              >
                Unisciti
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BoardList;
