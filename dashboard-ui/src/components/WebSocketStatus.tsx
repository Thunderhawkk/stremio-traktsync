import React from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

export function WebSocketStatus() {
  const { status } = useWebSocket();

  const getStatusColor = () => {
    if (status.connected) return 'bg-green-500';
    if (status.reconnecting) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getStatusText = () => {
    if (status.connected) return 'Connected';
    if (status.reconnecting) return 'Reconnecting...';
    if (status.error) return status.error;
    return 'Disconnected';
  };

  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <div className={`w-2 h-2 rounded-full ${getStatusColor()} ${status.reconnecting ? 'animate-pulse' : ''}`} />
      <span>{getStatusText()}</span>
    </div>
  );
}

export default WebSocketStatus;