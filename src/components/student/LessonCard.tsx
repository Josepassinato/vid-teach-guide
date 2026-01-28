import { motion } from 'framer-motion';
import { Clock, CheckCircle, Lock, Play } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface LessonCardProps {
  title: string;
  thumbnail: string;
  duration?: number | null;
  lessonNumber: number;
  isActive: boolean;
  isCompleted: boolean;
  isUnlocked: boolean;
  quizPassed?: boolean;
  missionCompleted?: boolean;
  onClick: () => void;
}

const googleColors = ['bg-google-blue', 'bg-google-red', 'bg-google-yellow', 'bg-google-green'];

export function LessonCard({
  title,
  thumbnail,
  duration,
  lessonNumber,
  isActive,
  isCompleted,
  isUnlocked,
  quizPassed,
  missionCompleted,
  onClick,
}: LessonCardProps) {
  const colorIndex = (lessonNumber - 1) % 4;

  return (
    <motion.div
      whileHover={isUnlocked ? { scale: 1.02 } : {}}
      whileTap={isUnlocked ? { scale: 0.98 } : {}}
    >
      <Card
        className={`transition-all overflow-hidden ${
          !isUnlocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
        } ${
          isActive
            ? 'ring-2 ring-primary shadow-lg'
            : isUnlocked
            ? 'hover:shadow-md'
            : ''
        } ${isCompleted ? 'bg-accent/5' : ''}`}
        onClick={onClick}
      >
        <CardContent className="p-0">
          <div className="flex gap-3 p-3">
            {/* Thumbnail */}
            <div className="relative w-20 h-14 sm:w-24 sm:h-16 rounded-xl overflow-hidden flex-shrink-0 bg-muted">
              <img
                src={thumbnail}
                alt={title}
                className={`w-full h-full object-cover ${!isUnlocked ? 'grayscale' : ''}`}
              />
              {/* Overlay states */}
              {!isUnlocked && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <Lock className="h-5 w-5 text-white" />
                </div>
              )}
              {isUnlocked && isCompleted && (
                <div className="absolute inset-0 bg-accent/90 flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-white" />
                </div>
              )}
              {isUnlocked && !isCompleted && isActive && (
                <div className="absolute inset-0 bg-primary/90 flex items-center justify-center">
                  <Play className="h-5 w-5 text-white fill-white" />
                </div>
              )}
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1 flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-1">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                    isUnlocked ? googleColors[colorIndex] : 'bg-muted-foreground'
                  }`}
                >
                  {isUnlocked ? lessonNumber : <Lock className="h-3 w-3" />}
                </div>
                {isCompleted && (
                  <Badge variant="secondary" className="text-[10px] bg-accent/10 text-accent border-0">
                    Concluída
                  </Badge>
                )}
              </div>
              <p
                className={`text-sm font-medium line-clamp-2 ${
                  !isUnlocked ? 'text-muted-foreground' : ''
                }`}
              >
                {title}
              </p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {quizPassed && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 h-5 bg-accent/10 text-accent border-accent/30"
                  >
                    Quiz ✓
                  </Badge>
                )}
                {missionCompleted && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 h-5 bg-primary/10 text-primary border-primary/30"
                  >
                    Missão ✓
                  </Badge>
                )}
                {isUnlocked && duration && !isCompleted && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {duration} min
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
