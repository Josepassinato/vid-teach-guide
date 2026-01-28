import { motion } from 'framer-motion';
import { FolderOpen, Lock, CheckCircle, ChevronDown, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface ModuleLesson {
  id: string;
  title: string;
  thumbnail: string;
  duration?: number | null;
  isCompleted: boolean;
  isUnlocked: boolean;
  quizPassed?: boolean;
  missionCompleted?: boolean;
}

interface ModuleAccordionProps {
  moduleId: string;
  moduleTitle: string;
  moduleIndex: number;
  isUnlocked: boolean;
  isComplete: boolean;
  isExpanded: boolean;
  completedLessons: number;
  totalLessons: number;
  progressPercentage: number;
  lessons: ModuleLesson[];
  selectedLessonId?: string;
  onToggle: () => void;
  onLessonSelect: (lessonId: string) => void;
}

export function ModuleAccordion({
  moduleTitle,
  moduleIndex,
  isUnlocked,
  isComplete,
  isExpanded,
  completedLessons,
  totalLessons,
  progressPercentage,
  lessons,
  selectedLessonId,
  onToggle,
  onLessonSelect,
}: ModuleAccordionProps) {
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <Card className={`overflow-hidden ${!isUnlocked ? 'opacity-60' : ''}`}>
        <CollapsibleTrigger asChild>
          <div
            className={`p-3 sm:p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/50 transition-colors ${
              !isUnlocked ? 'cursor-not-allowed' : ''
            }`}
          >
            {/* Module icon */}
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isUnlocked ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}
            >
              {isUnlocked ? <FolderOpen className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
            </div>

            {/* Module info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-xs">
                  Módulo {moduleIndex + 1}
                </Badge>
                {isComplete && (
                  <Badge className="bg-accent text-accent-foreground text-xs">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Completo
                  </Badge>
                )}
              </div>
              <p className="text-sm font-medium truncate mt-1">{moduleTitle}</p>
              {isUnlocked && (
                <div className="flex items-center gap-2 mt-2">
                  <Progress value={progressPercentage} className="h-1.5 flex-1" />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {completedLessons}/{totalLessons}
                  </span>
                </div>
              )}
            </div>

            {/* Chevron */}
            <ChevronDown
              className={`h-5 w-5 text-muted-foreground transition-transform flex-shrink-0 ${
                isExpanded ? 'rotate-180' : ''
              }`}
            />
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t bg-muted/30 px-2 sm:px-3 py-2 space-y-1.5">
            {lessons.map((lesson, index) => (
              <motion.div
                key={lesson.id}
                whileHover={lesson.isUnlocked ? { scale: 1.01 } : {}}
                whileTap={lesson.isUnlocked ? { scale: 0.99 } : {}}
              >
                <div
                  className={`flex items-center gap-3 p-2 sm:p-2.5 rounded-lg transition-colors ${
                    !lesson.isUnlocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-background'
                  } ${selectedLessonId === lesson.id ? 'bg-primary/10 ring-1 ring-primary' : ''}`}
                  onClick={() => lesson.isUnlocked && onLessonSelect(lesson.id)}
                >
                  {/* Thumbnail */}
                  <div className="relative w-14 h-10 sm:w-16 sm:h-11 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                    <img
                      src={lesson.thumbnail}
                      alt={lesson.title}
                      className={`w-full h-full object-cover ${!lesson.isUnlocked ? 'grayscale' : ''}`}
                    />
                    {!lesson.isUnlocked && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <Lock className="h-3 w-3 text-white" />
                      </div>
                    )}
                    {lesson.isCompleted && (
                      <div className="absolute inset-0 bg-accent/90 flex items-center justify-center">
                        <CheckCircle className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Lesson info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium truncate">{lesson.title}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {lesson.quizPassed && (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1 py-0 h-4 bg-accent/10 text-accent border-accent/30"
                        >
                          Quiz ✓
                        </Badge>
                      )}
                      {lesson.missionCompleted && (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1 py-0 h-4 bg-primary/10 text-primary border-primary/30"
                        >
                          Missão ✓
                        </Badge>
                      )}
                      {lesson.duration && !lesson.isCompleted && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          {lesson.duration}min
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
