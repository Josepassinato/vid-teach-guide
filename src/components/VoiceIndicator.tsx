import { motion } from 'framer-motion';

interface VoiceIndicatorProps {
  isActive: boolean;
  type: 'listening' | 'speaking';
}

export function VoiceIndicator({ isActive, type }: VoiceIndicatorProps) {
  const barCount = 5;
  
  return (
    <div className="flex items-center justify-center gap-1 h-8">
      {Array.from({ length: barCount }).map((_, i) => (
        <motion.div
          key={i}
          className={`w-1 rounded-full ${
            type === 'listening' 
              ? 'bg-primary' 
              : 'bg-accent'
          }`}
          animate={isActive ? {
            height: [8, 24, 12, 28, 8],
            transition: {
              duration: 0.8,
              repeat: Infinity,
              delay: i * 0.1,
              ease: "easeInOut"
            }
          } : {
            height: 8
          }}
        />
      ))}
    </div>
  );
}
