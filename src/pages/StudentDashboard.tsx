import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  GraduationCap, 
  Trophy, 
  Target, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  XCircle,
  BarChart3,
  BookOpen,
  Award,
  ArrowLeft,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuizResult {
  id: string;
  video_id: string;
  passed: boolean;
  score_percentage: number;
  total_questions: number;
  correct_answers: number;
  completed_at: string;
}

interface LessonProgress {
  id: string;
  video_id: string;
  is_completed: boolean;
  watch_time_seconds: number;
  completed_at: string | null;
}

interface VideoInfo {
  id: string;
  title: string;
  lesson_order: number;
  duration_minutes: number | null;
}

interface DashboardStats {
  totalLessons: number;
  completedLessons: number;
  totalQuizzes: number;
  passedQuizzes: number;
  averageScore: number;
  totalStudyTime: number;
  bestScore: number;
  worstScore: number;
}

const StudentDashboard = () => {
  const [quizResults, setQuizResults] = useState<QuizResult[]>([]);
  const [lessonProgress, setLessonProgress] = useState<LessonProgress[]>([]);
  const [videos, setVideos] = useState<VideoInfo[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalLessons: 0,
    completedLessons: 0,
    totalQuizzes: 0,
    passedQuizzes: 0,
    averageScore: 0,
    totalStudyTime: 0,
    bestScore: 0,
    worstScore: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  const studentId = localStorage.getItem('studentId') || '';

  useEffect(() => {
    const loadDashboardData = async () => {
      if (!studentId) {
        setIsLoading(false);
        return;
      }

      try {
        // Load all data in parallel
        const [videosRes, quizRes, progressRes] = await Promise.all([
          supabase.from('videos').select('id, title, lesson_order, duration_minutes').order('lesson_order'),
          supabase.from('student_quiz_results').select('*').eq('student_id', studentId).order('completed_at', { ascending: false }),
          supabase.from('student_lesson_progress').select('*').eq('student_id', studentId),
        ]);

        const videosData = videosRes.data || [];
        const quizData = quizRes.data || [];
        const progressData = progressRes.data || [];

        setVideos(videosData);
        setQuizResults(quizData);
        setLessonProgress(progressData);

        // Calculate stats
        const completedLessons = progressData.filter(p => p.is_completed).length;
        const passedQuizzes = quizData.filter(q => q.passed).length;
        const scores = quizData.map(q => q.score_percentage);
        const averageScore = scores.length > 0 
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) 
          : 0;
        const totalStudyTime = progressData.reduce((acc, p) => acc + (p.watch_time_seconds || 0), 0);

        setStats({
          totalLessons: videosData.length,
          completedLessons,
          totalQuizzes: quizData.length,
          passedQuizzes,
          averageScore,
          totalStudyTime,
          bestScore: scores.length > 0 ? Math.max(...scores) : 0,
          worstScore: scores.length > 0 ? Math.min(...scores) : 0,
        });
      } catch (err) {
        console.error('Error loading dashboard:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboardData();
  }, [studentId]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    }
    return `${minutes}min`;
  };

  const getVideoTitle = (videoId: string) => {
    const video = videos.find(v => v.id === videoId);
    return video?.title || 'Aula desconhecida';
  };

  const getVideoOrder = (videoId: string) => {
    const video = videos.find(v => v.id === videoId);
    return video?.lesson_order || 0;
  };

  const progressPercentage = stats.totalLessons > 0 
    ? Math.round((stats.completedLessons / stats.totalLessons) * 100) 
    : 0;

  const quizPassRate = stats.totalQuizzes > 0
    ? Math.round((stats.passedQuizzes / stats.totalQuizzes) * 100)
    : 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary mb-4" />
          <p className="text-muted-foreground">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  if (!studentId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="py-8 text-center">
            <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-2">Nenhum progresso encontrado</h2>
            <p className="text-muted-foreground mb-4">
              Comece a assistir as aulas para ver suas estatísticas aqui.
            </p>
            <Button asChild>
              <Link to="/aluno">Ir para Sala de Aula</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" asChild>
                <Link to="/aluno">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
              <div className="p-2 rounded-xl gradient-primary">
                <BarChart3 className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Meu Desempenho</h1>
                <p className="text-xs text-muted-foreground">
                  Acompanhe seu progresso e estatísticas
                </p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Progress Card */}
          <Card className="col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                Progresso do Curso
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between mb-2">
                <span className="text-3xl font-bold">{progressPercentage}%</span>
                <span className="text-sm text-muted-foreground">
                  {stats.completedLessons}/{stats.totalLessons} aulas
                </span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
            </CardContent>
          </Card>

          {/* Average Score */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4 text-orange-500" />
                Média dos Quizzes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className={cn(
                "text-3xl font-bold",
                stats.averageScore >= 70 ? "text-green-600" : "text-red-500"
              )}>
                {stats.averageScore}%
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.totalQuizzes} quiz{stats.totalQuizzes !== 1 ? 'zes' : ''} feito{stats.totalQuizzes !== 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>

          {/* Study Time */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-500" />
                Tempo de Estudo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-3xl font-bold">
                {formatTime(stats.totalStudyTime)}
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                Total acumulado
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Performance Summary */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Quiz Performance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                Desempenho nos Quizzes
              </CardTitle>
              <CardDescription>
                Taxa de aprovação e melhores resultados
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="text-sm">Taxa de Aprovação</span>
                <Badge variant={quizPassRate >= 70 ? "default" : "destructive"}>
                  {quizPassRate}%
                </Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-green-500/10 rounded-lg text-center">
                  <CheckCircle className="h-6 w-6 text-green-600 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-green-600">{stats.passedQuizzes}</p>
                  <p className="text-xs text-muted-foreground">Aprovados</p>
                </div>
                <div className="p-3 bg-red-500/10 rounded-lg text-center">
                  <XCircle className="h-6 w-6 text-red-500 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-red-500">
                    {stats.totalQuizzes - stats.passedQuizzes}
                  </p>
                  <p className="text-xs text-muted-foreground">Reprovados</p>
                </div>
              </div>

              {stats.totalQuizzes > 0 && (
                <div className="flex justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                    <span>Melhor: <strong>{stats.bestScore}%</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>Pior: <strong>{stats.worstScore}%</strong></span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Lesson Progress */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5 text-purple-500" />
                Progresso por Aula
              </CardTitle>
              <CardDescription>
                Status de cada aula do curso
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[280px] overflow-y-auto">
                {videos.map(video => {
                  const progress = lessonProgress.find(p => p.video_id === video.id);
                  const quiz = quizResults.find(q => q.video_id === video.id);
                  const isCompleted = progress?.is_completed;

                  return (
                    <div 
                      key={video.id}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-lg border",
                        isCompleted ? "bg-green-500/5 border-green-500/30" : "bg-muted/30"
                      )}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                        isCompleted ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
                      )}>
                        {isCompleted ? <CheckCircle className="h-4 w-4" /> : video.lesson_order}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{video.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {quiz && (
                            <Badge 
                              variant={quiz.passed ? "default" : "destructive"} 
                              className="text-[10px] h-4"
                            >
                              Quiz: {quiz.score_percentage}%
                            </Badge>
                          )}
                          {progress?.watch_time_seconds && progress.watch_time_seconds > 0 && (
                            <span>{formatTime(progress.watch_time_seconds)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {videos.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    Nenhuma aula disponível
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Quiz Results */}
        {quizResults.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Histórico de Quizzes
              </CardTitle>
              <CardDescription>
                Seus resultados mais recentes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {quizResults.slice(0, 5).map(result => (
                  <div 
                    key={result.id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border",
                      result.passed ? "bg-green-500/5 border-green-500/30" : "bg-red-500/5 border-red-500/30"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center",
                        result.passed ? "bg-green-500/20" : "bg-red-500/20"
                      )}>
                        {result.passed ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-500" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          Aula {getVideoOrder(result.video_id)}: {getVideoTitle(result.video_id)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {result.correct_answers}/{result.total_questions} respostas corretas
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn(
                        "text-lg font-bold",
                        result.passed ? "text-green-600" : "text-red-500"
                      )}>
                        {result.score_percentage}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(result.completed_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Back to Classroom */}
        <div className="text-center pt-4">
          <Button asChild size="lg">
            <Link to="/aluno">
              <GraduationCap className="h-5 w-5 mr-2" />
              Voltar para Sala de Aula
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
};

export default StudentDashboard;
