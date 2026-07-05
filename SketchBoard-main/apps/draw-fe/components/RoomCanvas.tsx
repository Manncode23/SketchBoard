"use client"

import { WS_SERVER, HTTP_BACKEND } from "@/config"; 
import { useEffect, useState } from "react";
import { Canvas } from "./Canvas";
import { ChatPanel } from "./ChatPanel";

export function RoomCanvas({ roomId: publicId }: { roomId: string }) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [resolvedRoomId, setResolvedRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Step 1: resolve the unguessable publicId from the URL into the real
  // internal numeric room id. Everything downstream (chat history,
  // messages, websocket join) keeps using that numeric id exactly as before.
  useEffect(() => {
    let cancelled = false;

    fetch(`${HTTP_BACKEND}/rooms/${publicId}`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("Room not found or you don't have access.");
        return res.json();
      })
      .then((data: { room: { id: number } }) => {
        if (!cancelled) setResolvedRoomId(String(data.room.id));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [publicId]);

  // Step 2: once we have the real room id, connect the WebSocket exactly
  // as before.
  useEffect(() => {
    if (!resolvedRoomId) return;

    const connect = async () => {
      try {
        const response = await fetch(`${HTTP_BACKEND}/ws/token`, {
          method: 'POST',
          credentials: 'include', 
        });

        if (!response.ok) {
          throw new Error("Failed to authenticate for WebSocket");
        }

        const { wsToken } = await response.json();

        const ws = new WebSocket(`${WS_SERVER}?token=${wsToken}`);

        ws.onopen = () => {
          setSocket(ws);
          ws.send(JSON.stringify({
            type: "join_room",
            roomId: resolvedRoomId
          }));
        };

      } catch (error) {
        console.error("WebSocket connection failed:", error);
      }
    };

    connect();

  }, [resolvedRoomId]);

  if (error) {
    return <div>{error}</div>;
  }

  if (!resolvedRoomId || !socket) {
    return <div>Connecting to whiteboard...</div>;
  }

  return (
    <>
      <Canvas roomId={resolvedRoomId} socket={socket} />
      <ChatPanel roomId={resolvedRoomId} socket={socket} />
    </>
  );
}