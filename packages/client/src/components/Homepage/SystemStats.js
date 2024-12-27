import React from "react";
import { useSystemMetrics } from "../../hooks/useSystemMetrics";

export const SystemStats = () => {
  const { metrics, loading } = useSystemMetrics([
    "totalChannelsCreated",
    "totalChannels",
    "totalBoardsCreated",
    "activeBoardMembers",
    "totalChannelJoins",
  ]);

  if (loading) {
    return <div>Caricamento statistiche...</div>;
  }

  return (
    <div>
      <h3>Statistiche del Sistema</h3>
      <ul>
        <li>Canali Creati: {metrics.totalChannelsCreated || 0}</li>
        <li>Canali Totali: {metrics.totalChannels || 0}</li>
        <li>Bacheche Create: {metrics.totalBoardsCreated || 0}</li>
        <li>Membri Attivi: {metrics.activeBoardMembers || 0}</li>
        <li>Partecipazioni ai Canali: {metrics.totalChannelJoins || 0}</li>
      </ul>
    </div>
  );
};
