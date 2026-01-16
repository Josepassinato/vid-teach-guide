import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { VoiceChat } from '@/components/VoiceChat';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GraduationCap, Video, ChevronLeft, ChevronRight, Clock, CheckCircle, Trophy, Award, ClipboardCheck, BarChart3, Sparkles, Play, LogOut, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TeachingMoment } from '@/hooks/useContentManager';
import { useStudentProgress } from '@/hooks/useStudentProgress';
import { LessonQuiz } from '@/components/LessonQuiz';
import { TeachingMomentsList } from '@/components/TeachingMomentsList';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface SavedVideo {
  id: string;
  youtube_id: string;
  title: string;
  transcript: string | null;
  analysis: string | null;
  thumbnail_url: string | null;
  lesson_order: number;
  description: string | null;
  duration_minutes: number | null;
  teaching_moments: unknown;
  is_configured: boolean;
  is_released: boolean;
}

interface QuizResult {
  video_id: string;
  passed: boolean;
}

interface VideoInfo {
  videoId: string;
  dbId: string; // UUID for database queries
  title: string;
  author: string;
  thumbnail: string;
  hasTranscript?: boolean;
  transcript?: string | null;
  analysis: string;
  lessonNumber: number;
  description?: string | null;
  duration?: number | null;
  teachingMoments?: TeachingMoment[] | null;
}

const Student = () => {
  const [savedVideos, setSavedVideos] = useState<SavedVideo[]>([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<VideoInfo | null>(null);
  const [showVideoList, setShowVideoList] = useState(true);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [showQuiz, setShowQuiz] = useState(false);
  const [generatedMoments, setGeneratedMoments] = useState<TeachingMoment[] | null>(null);
  const [quizResults, setQuizResults] = useState<QuizResult[]>([]);
  
  const [studentId] = useState(() => {
    const stored = localStorage.getItem('studentId');
    if (stored) return stored;
    const newId = `student_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('studentId', newId);
    return newId;
  });

  const handleProgressUpdate = useCallback((newStats: { progressPercentage: number }) => {
    if (newStats.progressPercentage === 100) {
      toast.success('🎉 Parabéns! Você completou todas as aulas!');
    }
  }, []);

  const {
    stats,
    isLessonCompleted,
    markLessonComplete,
    refreshProgress,
  } = useStudentProgress({
    onProgressUpdate: handleProgressUpdate
  });

  useEffect(() => {
    const loadSavedVideos = async () => {
      try {
        // Load videos and quiz results in parallel
        const [videosRes, quizRes] = await Promise.all([
          supabase
            .from('videos')
            .select('*')
            .order('lesson_order', { ascending: true }),
          supabase
            .from('student_quiz_results')
            .select('video_id, passed')
            .eq('student_id', studentId)
            .eq('passed', true)
        ]);

        if (videosRes.error) throw videosRes.error;
        
        const allVideos = videosRes.data || [];
        const passedQuizzes = quizRes.data || [];
        
        setQuizResults(passedQuizzes);
        setSavedVideos(allVideos);
        
        // Select first available video
        if (allVideos.length > 0) {
          const firstUnlocked = allVideos.find((v, i) => isLessonUnlocked(v, i, allVideos, passedQuizzes));
          if (firstUnlocked) {
            const idx = allVideos.indexOf(firstUnlocked);
            selectVideo(firstUnlocked, idx);
          } else if (allVideos[0]) {
            selectVideo(allVideos[0], 0);
          }
        }
      } catch (err) {
        console.error('[Student] Error loading saved videos:', err);
      } finally {
        setIsLoadingVideos(false);
      }
    };

    loadSavedVideos();
  }, [studentId]);

  // Check if a lesson is unlocked based on progression rules
  const isLessonUnlocked = (video: SavedVideo, index: number, videos: SavedVideo[], passedQuizResults: QuizResult[]) => {
    // First lesson is always unlocked if released
    if (index === 0) return video.is_released;
    
    // Not released = not available
    if (!video.is_released) return false;
    
    // Check if previous lesson was completed with passing quiz
    const previousVideo = videos[index - 1];
    if (!previousVideo) return false;
    
    const previousQuizPassed = passedQuizResults.some(q => q.video_id === previousVideo.id && q.passed);
    return previousQuizPassed;
  };

  // Helper to check unlock status with current state
  const checkLessonUnlocked = (video: SavedVideo, index: number) => {
    return isLessonUnlocked(video, index, savedVideos, quizResults);
  };

  const selectVideo = (video: SavedVideo, index: number) => {
    const moments = Array.isArray(video.teaching_moments) 
      ? video.teaching_moments as TeachingMoment[]
      : null;
    
    // Clear generated moments when switching videos
    setGeneratedMoments(null);
    
    setSelectedVideo({
      videoId: video.youtube_id,
      dbId: video.id, // UUID for database queries
      title: video.title,
      author: '',
      thumbnail: video.thumbnail_url || `https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg`,
      hasTranscript: !!video.transcript,
      transcript: video.transcript,
      analysis: video.analysis || `Vídeo: ${video.title}`,
      lessonNumber: video.lesson_order,
      description: video.description,
      duration: video.duration_minutes,
      teachingMoments: moments,
    });
    setCurrentLessonIndex(index);
    if (window.innerWidth < 1024) {
      setShowVideoList(false);
    }
  };

  const goToNextLesson = () => {
    if (currentLessonIndex < savedVideos.length - 1) {
      const nextVideo = savedVideos[currentLessonIndex + 1];
      if (checkLessonUnlocked(nextVideo, currentLessonIndex + 1)) {
        selectVideo(nextVideo, currentLessonIndex + 1);
      } else {
        toast.error('Complete o quiz desta aula para desbloquear a próxima!');
      }
    }
  };

  const goToPreviousLesson = () => {
    if (currentLessonIndex > 0) {
      selectVideo(savedVideos[currentLessonIndex - 1], currentLessonIndex - 1);
    }
  };

  const handleMarkComplete = async () => {
    const currentVideo = savedVideos[currentLessonIndex];
    if (currentVideo) {
      await markLessonComplete(currentVideo.id);
      toast.success('✅ Aula marcada como concluída!');
      refreshProgress();
      setShowQuiz(false);
    }
  };

  const handleOpenQuiz = () => setShowQuiz(true);

  const handleQuizComplete = async (passed: boolean) => {
    if (passed) {
      await handleMarkComplete();
      // Update quiz results to unlock next lesson
      setQuizResults(prev => [...prev, { video_id: savedVideos[currentLessonIndex].id, passed: true }]);
      toast.success('🎉 Próxima aula desbloqueada!');
    }
  };

  // Google colors for decorative elements
  const googleColors = ['bg-google-blue', 'bg-google-red', 'bg-google-yellow', 'bg-google-green'];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Modern Header with Google-style gradient accent */}
      <header className="border-b bg-card/80 backdrop-blur-lg sticky top-0 z-10">
        {/* Colorful top bar */}
        <div className="h-1 flex">
          <div className="flex-1 bg-google-blue" />
          <div className="flex-1 bg-google-red" />
          <div className="flex-1 bg-google-yellow" />
          <div className="flex-1 bg-google-green" />
        </div>
        
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Logo with gradient */}
            <motion.div 
              className="p-2.5 rounded-2xl bg-primary shadow-medium"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <GraduationCap className="h-6 w-6 text-white" />
            </motion.div>
            
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                  Vibe Class
                </h1>
                {selectedVideo && (
                  <Badge className="bg-primary/10 text-primary border-0 font-medium">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Aula {selectedVideo.lessonNumber}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {selectedVideo?.title || 'Aprenda programação com IA'}
              </p>
            </div>
            
            {/* Navigation Pills */}
            {selectedVideo && (
              <div className="flex items-center gap-1 bg-muted rounded-full p-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full hover:bg-background"
                  onClick={goToPreviousLesson}
                  disabled={currentLessonIndex === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs font-medium px-2">
                  {currentLessonIndex + 1}/{savedVideos.length}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full hover:bg-background"
                  onClick={goToNextLesson}
                  disabled={currentLessonIndex === savedVideos.length - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            <Button 
              variant="ghost" 
              size="icon" 
              className="h-9 w-9 rounded-full" 
              asChild
            >
              <Link to="/aluno/dashboard">
                <BarChart3 className="h-4 w-4" />
              </Link>
            </Button>
            
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs gap-1 text-muted-foreground hover:text-foreground" 
              asChild
            >
              <Link to="/admin">
                <LogOut className="h-3 w-3" />
                Admin
              </Link>
            </Button>
            
            <ThemeToggle />
          </div>
          
          {/* Progress Bar with Google colors */}
          {stats.totalLessons > 0 && (
            <div className="mt-3 space-y-2">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <motion.div 
                  className="h-full gradient-cool rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.progressPercentage}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {stats.completedLessons} de {stats.totalLessons} aulas concluídas
                </span>
                <Badge 
                  variant="secondary" 
                  className={`${stats.progressPercentage === 100 ? 'bg-accent text-white' : ''}`}
                >
                  {stats.progressPercentage === 100 ? (
                    <><Trophy className="h-3 w-3 mr-1" /> Completo!</>
                  ) : (
                    <><Award className="h-3 w-3 mr-1" /> {stats.progressPercentage}%</>
                  )}
                </Badge>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Sidebar - Video List */}
        <AnimatePresence>
          {showVideoList && (
            <motion.div 
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="w-full lg:w-72 xl:w-80 border-r bg-card/50 backdrop-blur-sm flex-shrink-0 overflow-hidden"
            >
              <div className="p-4 h-full overflow-y-auto space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <Video className="h-4 w-4 text-primary" />
                    </div>
                    Suas Aulas
                  </h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 lg:hidden rounded-full"
                    onClick={() => setShowVideoList(false)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>

                {isLoadingVideos ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-24 bg-muted animate-pulse rounded-2xl" />
                    ))}
                  </div>
                ) : savedVideos.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="p-4 rounded-full bg-muted inline-block mb-4">
                      <Video className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground">Nenhuma aula disponível</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {savedVideos.map((video, index) => {
                      const completed = isLessonCompleted(video.id);
                      const isActive = selectedVideo?.videoId === video.youtube_id;
                      const isUnlocked = checkLessonUnlocked(video, index);
                      const colorIndex = index % 4;
                      
                      return (
                        <motion.div
                          key={video.id}
                          whileHover={isUnlocked ? { scale: 1.02 } : {}}
                          whileTap={isUnlocked ? { scale: 0.98 } : {}}
                        >
                          <Card
                            className={`transition-all overflow-hidden ${
                              !isUnlocked 
                                ? 'opacity-60 cursor-not-allowed' 
                                : 'cursor-pointer'
                            } ${
                              isActive 
                                ? 'ring-2 ring-primary shadow-medium' 
                                : isUnlocked ? 'hover:shadow-soft' : ''
                            } ${completed ? 'bg-accent/5' : ''}`}
                            onClick={() => {
                              if (isUnlocked) {
                                selectVideo(video, index);
                              } else {
                                toast.error('Complete a aula anterior com aprovação no quiz para desbloquear!');
                              }
                            }}
                          >
                            <CardContent className="p-0">
                              <div className="flex gap-3 p-3">
                                {/* Thumbnail with overlay */}
                                <div className="relative w-20 h-14 rounded-xl overflow-hidden flex-shrink-0">
                                  <img
                                    src={video.thumbnail_url || `https://img.youtube.com/vi/${video.youtube_id}/default.jpg`}
                                    alt={video.title}
                                    className={`w-full h-full object-cover ${!isUnlocked ? 'grayscale' : ''}`}
                                  />
                                  {!isUnlocked && (
                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                      <Lock className="h-5 w-5 text-white" />
                                    </div>
                                  )}
                                  {isUnlocked && completed && (
                                    <div className="absolute inset-0 bg-accent/80 flex items-center justify-center">
                                      <CheckCircle className="h-6 w-6 text-white" />
                                    </div>
                                  )}
                                  {isUnlocked && !completed && isActive && (
                                    <div className="absolute inset-0 bg-primary/80 flex items-center justify-center">
                                      <Play className="h-5 w-5 text-white fill-white" />
                                    </div>
                                  )}
                                </div>
                                
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${isUnlocked ? googleColors[colorIndex] : 'bg-muted-foreground'}`}>
                                      {isUnlocked ? video.lesson_order : <Lock className="h-2.5 w-2.5" />}
                                    </div>
                                  </div>
                                  <p className={`text-sm font-medium line-clamp-1 ${!isUnlocked ? 'text-muted-foreground' : ''}`}>
                                    {video.title}
                                  </p>
                                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
                                    {!isUnlocked && (
                                      <Badge variant="outline" className="text-[10px] border-orange-500 text-orange-600">
                                        <Lock className="h-2.5 w-2.5 mr-0.5" />
                                        Bloqueada
                                      </Badge>
                                    )}
                                    {isUnlocked && video.duration_minutes && (
                                      <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {video.duration_minutes} min
                                      </span>
                                    )}
                                    {isUnlocked && completed && (
                                      <Badge variant="secondary" className="text-[10px] bg-accent/10 text-accent border-0">
                                        Concluída
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {/* Teaching Moments - show generated moments if available, otherwise pre-configured */}
                {selectedVideo && (
                  <div className="pt-4 border-t">
                    <TeachingMomentsList 
                      moments={generatedMoments || selectedVideo.teachingMoments} 
                    />
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toggle Sidebar Button */}
        {!showVideoList && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <Button
              variant="secondary"
              size="icon"
              className="fixed left-0 top-1/2 -translate-y-1/2 z-20 h-12 w-8 rounded-l-none rounded-r-2xl shadow-medium"
              onClick={() => setShowVideoList(true)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </motion.div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedVideo ? (
            <>
              <VoiceChat
                videoContext={selectedVideo.transcript || selectedVideo.analysis}
                videoId={selectedVideo.videoId}
                videoDbId={selectedVideo.dbId}
                videoTitle={selectedVideo.title}
                videoTranscript={selectedVideo.transcript}
                preConfiguredMoments={selectedVideo.teachingMoments}
                isStudentMode={true}
                onContentPlanReady={(moments) => setGeneratedMoments(moments)}
              />
              
              {/* Quiz Section */}
              <AnimatePresence>
                {showQuiz && savedVideos[currentLessonIndex] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t bg-card/50 backdrop-blur-sm p-4"
                  >
                    <LessonQuiz
                      videoId={savedVideos[currentLessonIndex].id}
                      studentId={studentId}
                      onQuizComplete={handleQuizComplete}
                      passingScore={70}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Bottom Action Bar */}
              <div className="border-t bg-card/80 backdrop-blur-sm p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    {isLessonCompleted(savedVideos[currentLessonIndex]?.id) ? (
                      <Badge className="bg-accent text-white border-0">
                        <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                        Aula concluída
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">
                        Aula {selectedVideo.lessonNumber} de {savedVideos.length}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {!isLessonCompleted(savedVideos[currentLessonIndex]?.id) && !showQuiz && (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={handleOpenQuiz}
                        className="rounded-full"
                      >
                        <ClipboardCheck className="h-4 w-4 mr-1.5" />
                        Fazer Quiz
                      </Button>
                    )}
                    {currentLessonIndex < savedVideos.length - 1 && (
                      <>
                        {checkLessonUnlocked(savedVideos[currentLessonIndex + 1], currentLessonIndex + 1) ? (
                          <Button 
                            size="sm" 
                            onClick={goToNextLesson}
                            className="rounded-full bg-primary hover:bg-primary/90"
                          >
                            Próxima Aula
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        ) : (
                          <Button 
                            size="sm" 
                            variant="outline"
                            disabled
                            className="rounded-full"
                          >
                            <Lock className="h-4 w-4 mr-1.5" />
                            Próxima Bloqueada
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-muted/20">
              <motion.div 
                className="text-center p-8 max-w-md"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="relative inline-block mb-6">
                  <div className="p-6 rounded-3xl bg-gradient-to-br from-primary/20 via-accent/20 to-secondary/20">
                    <GraduationCap className="h-16 w-16 text-primary" />
                  </div>
                  {/* Decorative dots */}
                  <div className="absolute -top-2 -right-2 w-4 h-4 bg-google-blue rounded-full" />
                  <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-google-red rounded-full" />
                  <div className="absolute top-1/2 -right-4 w-2 h-2 bg-google-yellow rounded-full" />
                </div>
                
                <h2 className="text-2xl font-bold mb-2">
                  Bem-vindo ao <span className="text-primary">Vibe Class</span>
                </h2>
                <p className="text-muted-foreground mb-6">
                  Aprenda programação de um jeito diferente, com IA conversacional e vibe coding
                </p>
                <Button 
                  onClick={() => setShowVideoList(true)}
                  size="lg"
                  className="rounded-full px-6"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Começar a Aprender
                </Button>
              </motion.div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Student;
