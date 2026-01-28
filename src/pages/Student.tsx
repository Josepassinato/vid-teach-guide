import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { VoiceChat } from '@/components/VoiceChat';
import { X, ChevronLeft, ChevronRight, CheckCircle, Lock, Target, ClipboardCheck, Video, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { TeachingMoment } from '@/hooks/useContentManager';
import { useStudentProgress } from '@/hooks/useStudentProgress';
import { useModuleProgress } from '@/hooks/useModuleProgress';
import { LessonQuiz } from '@/components/LessonQuiz';
import { TeachingMomentsList } from '@/components/TeachingMomentsList';
import { MissionsPanel } from '@/components/MissionsPanel';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';

// New student components
import { StudentHeader } from '@/components/student/StudentHeader';
import { LessonCard } from '@/components/student/LessonCard';
import { ModuleAccordion } from '@/components/student/ModuleAccordion';
import { MobileNavigation, MobileTab } from '@/components/student/MobileNavigation';
import { EmptyState } from '@/components/student/EmptyState';

interface SavedVideo {
  id: string;
  youtube_id: string | null;
  video_url: string | null;
  video_type: string | null;
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
  teacher_intro: string | null;
  module_id: string | null;
}

interface VideoInfo {
  videoId: string | null;
  videoUrl: string | null;
  videoType: string | null;
  dbId: string;
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
  teacherIntro?: string | null;
}

const Student = () => {
  const { user, profile, signOut } = useAuth();
  
  const [savedVideos, setSavedVideos] = useState<SavedVideo[]>([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<VideoInfo | null>(null);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [showQuiz, setShowQuiz] = useState(false);
  const [showMissions, setShowMissions] = useState(false);
  const [generatedMoments, setGeneratedMoments] = useState<TeachingMoment[] | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('video');

  // Use authenticated user ID as student ID
  const studentId = user?.id || '';

  const handleProgressUpdate = useCallback((newStats: { progressPercentage: number }) => {
    if (newStats.progressPercentage === 100) {
      toast.success('🎉 Parabéns! Você completou todas as aulas!');
    }
  }, []);

  const { stats, isLessonCompleted, markLessonComplete, refreshProgress } = useStudentProgress({
    onProgressUpdate: handleProgressUpdate,
    userId: studentId,
  });

  const {
    modules,
    lessonProgress,
    moduleProgress,
    isLessonUnlocked: checkModuleLessonUnlocked,
    isModuleUnlocked,
    refreshProgress: refreshModuleProgress,
  } = useModuleProgress(studentId);

  useEffect(() => {
    const loadSavedVideos = async () => {
      try {
        const videosRes = await supabase
          .from('videos')
          .select('*')
          .order('lesson_order', { ascending: true });

        if (videosRes.error) throw videosRes.error;

        const allVideos = videosRes.data || [];
        setSavedVideos(allVideos);

        if (allVideos.length > 0) {
          selectVideo(allVideos[0], 0);
        }
      } catch (err) {
        console.error('[Student] Error loading saved videos:', err);
      } finally {
        setIsLoadingVideos(false);
      }
    };

    loadSavedVideos();
  }, [studentId]);

  const checkLessonUnlocked = (video: SavedVideo) => {
    if (modules.length > 0 && video.module_id) {
      return checkModuleLessonUnlocked(video.id);
    }
    return video.is_released;
  };

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  const getThumbnail = (video: SavedVideo) => {
    return (
      video.thumbnail_url ||
      (video.youtube_id ? `https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg` : '/placeholder.svg')
    );
  };

  const selectVideo = (video: SavedVideo, index: number) => {
    const moments = Array.isArray(video.teaching_moments) ? (video.teaching_moments as TeachingMoment[]) : null;
    setGeneratedMoments(null);

    setSelectedVideo({
      videoId: video.youtube_id,
      videoUrl: video.video_url,
      videoType: video.video_type,
      dbId: video.id,
      title: video.title,
      author: '',
      thumbnail: getThumbnail(video),
      hasTranscript: !!video.transcript,
      transcript: video.transcript,
      analysis: video.analysis || `Vídeo: ${video.title}`,
      lessonNumber: index + 1,
      description: video.description,
      duration: video.duration_minutes,
      teachingMoments: moments,
      teacherIntro: video.teacher_intro,
    });
    setCurrentLessonIndex(index);
    setSidebarOpen(false);
    setMobileTab('video');
  };

  const goToNextLesson = () => {
    if (currentLessonIndex < savedVideos.length - 1) {
      const nextVideo = savedVideos[currentLessonIndex + 1];
      if (checkLessonUnlocked(nextVideo)) {
        selectVideo(nextVideo, currentLessonIndex + 1);
      } else {
        toast.error('Complete o quiz e a missão desta aula para desbloquear a próxima!');
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

  const handleQuizComplete = async (passed: boolean) => {
    if (passed) {
      await handleMarkComplete();
      refreshModuleProgress();
      toast.success('🎉 Quiz concluído! Complete a missão para desbloquear a próxima aula.');
    }
  };

  const handleMobileTabChange = (tab: MobileTab) => {
    setMobileTab(tab);
    if (tab === 'lessons') {
      setSidebarOpen(true);
    } else {
      setSidebarOpen(false);
    }
    if (tab === 'quiz') {
      setShowQuiz(true);
      setShowMissions(false);
    } else if (tab === 'missions') {
      setShowMissions(true);
      setShowQuiz(false);
    } else {
      setShowQuiz(false);
      setShowMissions(false);
    }
  };

  // Render lessons list (used in sidebar and sheet)
  const renderLessonsList = () => {
    if (isLoadingVideos) {
      return (
        <div className="space-y-3 p-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      );
    }

    if (savedVideos.length === 0) {
      return <EmptyState type="no-lessons" />;
    }

    // Module-based view
    if (modules.length > 0) {
      return (
        <div className="space-y-3 p-4">
          {modules.map((module, moduleIndex) => {
            const modProgress = moduleProgress.get(module.id);
            const isModUnlocked = isModuleUnlocked(module.id);
            const moduleLessons = savedVideos.filter((v) => v.module_id === module.id);

            return (
              <ModuleAccordion
                key={module.id}
                moduleId={module.id}
                moduleTitle={module.title}
                moduleIndex={moduleIndex}
                isUnlocked={isModUnlocked}
                isComplete={modProgress?.isComplete || false}
                isExpanded={expandedModules.has(module.id)}
                completedLessons={modProgress?.completedLessons || 0}
                totalLessons={modProgress?.totalLessons || 0}
                progressPercentage={modProgress?.progressPercentage || 0}
                lessons={moduleLessons.map((video) => {
                  const progress = lessonProgress.get(video.id);
                  return {
                    id: video.id,
                    title: video.title,
                    thumbnail: getThumbnail(video),
                    duration: video.duration_minutes,
                    isCompleted: isLessonCompleted(video.id),
                    isUnlocked: checkLessonUnlocked(video),
                    quizPassed: progress?.quizPassed,
                    missionCompleted: progress?.missionCompleted,
                  };
                })}
                selectedLessonId={selectedVideo?.dbId}
                onToggle={() => toggleModule(module.id)}
                onLessonSelect={(lessonId) => {
                  const video = savedVideos.find((v) => v.id === lessonId);
                  if (video) {
                    const index = savedVideos.findIndex((v) => v.id === lessonId);
                    selectVideo(video, index);
                  }
                }}
              />
            );
          })}

          {/* Unassigned lessons */}
          {savedVideos.filter((v) => !v.module_id).length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-2 px-1">Aulas Avulsas</h3>
              <div className="space-y-2">
                {savedVideos
                  .filter((v) => !v.module_id)
                  .map((video, index) => {
                    const globalIndex = savedVideos.findIndex((v) => v.id === video.id);
                    const progress = lessonProgress.get(video.id);
                    return (
                      <LessonCard
                        key={video.id}
                        title={video.title}
                        thumbnail={getThumbnail(video)}
                        duration={video.duration_minutes}
                        lessonNumber={video.lesson_order}
                        isActive={selectedVideo?.dbId === video.id}
                        isCompleted={isLessonCompleted(video.id)}
                        isUnlocked={video.is_released}
                        quizPassed={progress?.quizPassed}
                        missionCompleted={progress?.missionCompleted}
                        onClick={() => selectVideo(video, globalIndex)}
                      />
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      );
    }

    // Flat list view (no modules)
    return (
      <div className="space-y-2 p-4">
        {savedVideos.map((video, index) => {
          const progress = lessonProgress.get(video.id);
          return (
            <LessonCard
              key={video.id}
              title={video.title}
              thumbnail={getThumbnail(video)}
              duration={video.duration_minutes}
              lessonNumber={video.lesson_order}
              isActive={selectedVideo?.dbId === video.id}
              isCompleted={isLessonCompleted(video.id)}
              isUnlocked={checkLessonUnlocked(video)}
              quizPassed={progress?.quizPassed}
              missionCompleted={progress?.missionCompleted}
              onClick={() => {
                if (checkLessonUnlocked(video)) {
                  selectVideo(video, index);
                } else {
                  toast.error('Complete a aula anterior para desbloquear!');
                }
              }}
            />
          );
        })}
      </div>
    );
  };

  const currentLesson = savedVideos[currentLessonIndex];
  const isCurrentLessonCompleted = currentLesson ? isLessonCompleted(currentLesson.id) : false;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <StudentHeader
        lessonNumber={selectedVideo?.lessonNumber}
        lessonTitle={selectedVideo?.title}
        completedLessons={stats.completedLessons}
        totalLessons={stats.totalLessons}
        progressPercentage={stats.progressPercentage}
        onMenuClick={() => setSidebarOpen(true)}
        showMenuButton={!!selectedVideo}
        userName={profile?.full_name}
        userAvatar={profile?.avatar_url}
        onSignOut={signOut}
      />

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex w-80 xl:w-96 border-r bg-card/50 flex-col overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="font-semibold flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Video className="h-4 w-4 text-primary" />
              </div>
              Suas Aulas
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {renderLessonsList()}

            {/* Teaching Moments */}
            {selectedVideo && (
              <div className="p-4 border-t">
                <TeachingMomentsList moments={generatedMoments || selectedVideo.teachingMoments} />
              </div>
            )}
          </div>
        </aside>

        {/* Mobile Sheet for lessons */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-[85vw] sm:w-[400px] p-0">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <Video className="h-4 w-4 text-primary" />
                </div>
                Suas Aulas
              </h2>
            </div>
            <div className="overflow-y-auto h-[calc(100vh-60px)]">
              {renderLessonsList()}

              {/* Teaching Moments */}
              {selectedVideo && (
                <div className="p-4 border-t">
                  <TeachingMomentsList moments={generatedMoments || selectedVideo.teachingMoments} />
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden pb-16 lg:pb-0">
          {selectedVideo ? (
            <>
              {/* Video Section - Hidden on mobile when viewing quiz/missions */}
              <div
                className={`flex-1 flex flex-col overflow-hidden ${
                  mobileTab !== 'video' && mobileTab !== 'lessons' ? 'hidden lg:flex' : ''
                }`}
              >
                <VoiceChat
                  videoContext={selectedVideo.transcript || selectedVideo.analysis}
                  videoId={selectedVideo.videoId}
                  videoUrl={selectedVideo.videoUrl}
                  videoType={selectedVideo.videoType}
                  videoDbId={selectedVideo.dbId}
                  videoTitle={selectedVideo.title}
                  videoTranscript={selectedVideo.transcript}
                  preConfiguredMoments={selectedVideo.teachingMoments}
                  teacherIntro={selectedVideo.teacherIntro}
                  isStudentMode={true}
                  onContentPlanReady={(moments) => setGeneratedMoments(moments)}
                />
              </div>

              {/* Quiz Section */}
              <AnimatePresence>
                {(showQuiz || mobileTab === 'quiz') && currentLesson && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className={`border-t bg-card/50 backdrop-blur-sm overflow-y-auto ${
                      mobileTab === 'quiz' ? 'flex-1 lg:flex-none' : ''
                    }`}
                  >
                    <div className="p-4 max-w-3xl mx-auto">
                      <LessonQuiz
                        videoId={currentLesson.id}
                        studentId={studentId}
                        onQuizComplete={handleQuizComplete}
                        passingScore={70}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Missions Section */}
              <AnimatePresence>
                {(showMissions || mobileTab === 'missions') && currentLesson && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className={`border-t bg-card/50 backdrop-blur-sm overflow-y-auto ${
                      mobileTab === 'missions' ? 'flex-1 lg:flex-none' : ''
                    }`}
                  >
                    <div className="p-4 max-w-3xl mx-auto">
                      <MissionsPanel videoId={currentLesson.id} studentId={studentId} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Desktop Bottom Action Bar */}
              <div className="hidden lg:flex border-t bg-card/80 backdrop-blur-sm p-3 items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Lesson navigation */}
                  <div className="flex items-center gap-1 bg-muted rounded-full p-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full"
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
                      className="h-8 w-8 rounded-full"
                      onClick={goToNextLesson}
                      disabled={currentLessonIndex === savedVideos.length - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>

                  {isCurrentLessonCompleted ? (
                    <Badge className="bg-accent text-accent-foreground border-0">
                      <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                      Aula concluída
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Aula {selectedVideo.lessonNumber} de {savedVideos.length}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={showMissions ? 'default' : 'outline'}
                    onClick={() => {
                      setShowMissions(!showMissions);
                      if (!showMissions) setShowQuiz(false);
                    }}
                    className="rounded-full"
                  >
                    <Target className="h-4 w-4 mr-1.5" />
                    Missões
                  </Button>

                  {!isCurrentLessonCompleted && !showQuiz && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowQuiz(true);
                        setShowMissions(false);
                      }}
                      className="rounded-full"
                    >
                      <ClipboardCheck className="h-4 w-4 mr-1.5" />
                      Fazer Quiz
                    </Button>
                  )}

                  {currentLessonIndex < savedVideos.length - 1 && (
                    <>
                      {checkLessonUnlocked(savedVideos[currentLessonIndex + 1]) ? (
                        <Button size="sm" onClick={goToNextLesson} className="rounded-full">
                          Próxima Aula
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled className="rounded-full">
                          <Lock className="h-4 w-4 mr-1.5" />
                          Bloqueada
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            <EmptyState type="welcome" onAction={() => setSidebarOpen(true)} />
          )}
        </main>
      </div>

      {/* Mobile Navigation */}
      {selectedVideo && (
        <MobileNavigation
          activeTab={mobileTab}
          onTabChange={handleMobileTabChange}
          hasQuiz={true}
          hasMissions={true}
          lessonCompleted={isCurrentLessonCompleted}
        />
      )}
    </div>
  );
};

export default Student;
