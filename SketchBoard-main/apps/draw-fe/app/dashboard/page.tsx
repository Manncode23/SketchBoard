"use client";

import { useEffect, useState } from "react";
import { Button } from "@repo/ui/button";
import { HTTP_BACKEND } from "@/config";
import { Plus, Sparkles } from "lucide-react";
import { CreateRoomModal } from "@/components/Board/CreateRoomModal";
import { BoardCard } from "@/components/Board/BoardCard"; 
import { BoardCardSkeleton } from "@/components/Board/BoardCardSkeleton";

type Room = {
  id: number;
  publicId: string;
  slug: string;
  createdAt: string;
};

const EmptyState = ({ onOpenModal }: { onOpenModal: () => void }) => (
  <div className="mt-16 flex flex-col items-center justify-center text-center border-2 border-dashed border-border rounded-xl p-12">
    <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center mx-auto mb-4 border-2 border-dashed border-border">
      <Sparkles className="w-8 h-8 text-primary" />
    </div>
    <h2 className="text-3xl font-bold font-handwriting">Your Canvas is Empty</h2>
    <p className="max-w-sm mx-auto mt-2 text-muted-foreground">
      Get started by creating your first collaborative board.
    </p>
    <Button className="mt-6" onClick={onOpenModal}>
      <Plus className="w-5 h-5" />
      Create First Board
    </Button>
  </div>
);

// --- Main Dashboard Page ---
export default function DashboardPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetch(`${HTTP_BACKEND}/api/user/rooms`, { credentials: "include" })
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch your boards.");
        return res.json();
      })
      .then((data: Room[]) => setRooms(data))
      .catch(err => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  const handleRoomCreated = (newRoom: Room) => {
    setRooms(prevRooms => [newRoom, ...prevRooms]);
  };
  
  return (
    <>
      <CreateRoomModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onRoomCreated={handleRoomCreated}
      />
      <div className="container mx-auto px-6 py-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold font-handwriting">Dashboard</h1>
            <p className="mt-2 text-base text-muted-foreground">
              Welcome back! Here are your collaborative spaces.
            </p>
          </div>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="w-5 h-5" />
             <span></span>Create New Board <span></span>
          </Button>
        </div>
        {isLoading ? (
         <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
           {[...Array(8)].map((_, i) => <BoardCardSkeleton key={i} />)}
         </div>
        ) : error ? (
          <p className="text-red-500">{error}</p>
        ) : rooms.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rooms.map(room => (
             <BoardCard 
        key={room.id}
     publicId={room.publicId}
     title={room.slug}
      createdAt={room.createdAt}
    />
            ))}
          </div>
        ) : (
          <EmptyState onOpenModal={() => setIsModalOpen(true)} />
        )}
      </div>
    </>
  );
}