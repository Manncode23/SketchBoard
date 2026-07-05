"use client";

import Link from "next/link";
import { motion, Variants } from "framer-motion";
import { PenTool, ArrowRight } from "lucide-react";
interface BoardCardProps {
  publicId: string;
  title: string;
  createdAt: string;
}

const cardVariants: Variants = {
  initial: {
    scale: 1,
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
  },
  hover: {
    scale: 1.03,
    boxShadow: "0 20px 25px -5px hsl(var(--primary) / 0.2), 0 8px 10px -6px hsl(var(--primary) / 0.2)",
  },
};

const openTextVariants: Variants = {
  initial: { opacity: 0, x: -10 },
  hover: { opacity: 1, x: 0 },
};

export const BoardCard = ({ publicId, title, createdAt }: BoardCardProps) => {
  return (
    <Link href={`/canvas/${publicId}`} className="block">
      <motion.div
        initial="initial"
        whileHover="hover"
        variants={cardVariants}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="group relative aspect-[4/3] rounded-xl border border-border bg-surface p-6"
      >
        <div 
          className="absolute inset-0 z-0 opacity-30 dark:opacity-10" 
          style={{ backgroundImage: 'radial-gradient(hsl(var(--border)) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        ></div>
        
        <div className="relative h-full flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <PenTool className="w-8 h-8 text-muted-foreground transition-colors duration-300 group-hover:text-primary" />
            <motion.div
              variants={openTextVariants}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="flex items-center gap-1 text-sm text-muted-foreground"
            >
              Open <ArrowRight className="w-4 h-4" />
            </motion.div>
          </div>
          <div>
            <h3 className="text-xl font-semibold font-sans text-foreground truncate">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground font-sans">
              {new Date(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>
        <motion.div 
          variants={{ hover: { opacity: 1 }, initial: { opacity: 0 } }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="absolute -inset-px rounded-xl border-2 border-primary/70"
        ></motion.div>
      </motion.div>
    </Link>
  );
};