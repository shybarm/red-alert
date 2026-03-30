import { useEffect, useState } from 'react';
import { Client, Room } from 'colyseus.js';
import { BattlefieldGame } from './game/BattlefieldGame';

export function App() {
  const [status, setStatus] = useState('Connecting to server...');
  const [room, setRoom] = useState<Room | null>(null);

  useEffect(() => {
    const client = new Client('ws://localhost:2567');
    let activeRoom: Room | null = null;

    client
      .joinOrCreate('battlefield')
      .then((joinedRoom) => {
        activeRoom = joinedRoom;
        setRoom(joinedRoom);
        setStatus(`Connected to co-op room: ${joinedRoom.id}`);
      })
      .catch((error: unknown) => {
        setStatus(`Server unavailable (scene still loads): ${String(error)}`);
      });

    return () => {
      activeRoom?.leave();
    };
  }, []);

  return (
    <main>
      <h1>Red Alert - Foundation Prototype</h1>
      <p>{status}</p>
      <BattlefieldGame room={room} />
    </main>
  );
}
