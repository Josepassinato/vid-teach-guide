import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, Edit, ArrowLeft, Video, Lock, Eye, EyeOff, FileText, Users, Clock, BookOpen, CheckCircle, Settings, Play, Pause, Target, Lightbulb, Loader2, Sparkles, HelpCircle } from 'lucide-react';
import { QuizEditor } from '@/components/QuizEditor';

interface TeachingMoment {
  timestamp_seconds: number;
  topic: string;
  key_insight: string;
  questions_to_ask: string[];
  discussion_points: string[];
}

interface VideoLesson {
  id: string;
  youtube_id: string;
  title: string;
  transcript: string | null;
  analysis: string | null;
  thumbnail_url: string | null;
  created_at: string;
  lesson_order: number;
  description: string | null;
  duration_minutes: number | null;
  teaching_moments: TeachingMoment[] | null;
  is_configured: boolean;
}

export default function Admin() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [lessons, setLessons] = useState<VideoLesson[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<VideoLesson | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isGeneratingMoments, setIsGeneratingMoments] = useState(false);
  const [activeTab, setActiveTab] = useState('info');
  
  // Form states for new lesson
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newVideoTitle, setNewVideoTitle] = useState('');
  const [newVideoDescription, setNewVideoDescription] = useState('');
  const [newVideoDuration, setNewVideoDuration] = useState('');
  const [newVideoTranscript, setNewVideoTranscript] = useState('');
  
  // Form states for editing
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [editTranscript, setEditTranscript] = useState('');
  const [editAnalysis, setEditAnalysis] = useState('');
  const [editMoments, setEditMoments] = useState<TeachingMoment[]>([]);

  const extractYoutubeId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-videos', {
        body: { action: 'list', password }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setIsAuthenticated(true);
      setLessons(data.videos || []);
      toast.success('Login realizado com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao fazer login');
    } finally {
      setIsLoading(false);
    }
  };

  const loadLessons = async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-videos', {
        body: { action: 'list', password }
      });

      if (error) throw error;
      setLessons(data.videos || []);
    } catch (err: any) {
      toast.error('Erro ao carregar aulas');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddLesson = async () => {
    const youtubeId = extractYoutubeId(newVideoUrl);
    if (!youtubeId) {
      toast.error('URL do YouTube inválida');
      return;
    }

    if (!newVideoTitle.trim()) {
      toast.error('Título é obrigatório');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-videos', {
        body: {
          action: 'add',
          password,
          video: {
            youtube_id: youtubeId,
            title: newVideoTitle.trim(),
            description: newVideoDescription.trim() || null,
            duration_minutes: newVideoDuration ? parseInt(newVideoDuration) : null,
            transcript: newVideoTranscript.trim() || null,
            lesson_order: lessons.length + 1,
            is_configured: false,
          }
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success('Aula adicionada! Configure a transcrição e os momentos de ensino.');
      setIsAddDialogOpen(false);
      resetNewForm();
      loadLessons();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao adicionar aula');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateLesson = async () => {
    if (!selectedLesson) return;

    setIsLoading(true);
    try {
      const isFullyConfigured = !!(editTranscript.trim() && editMoments.length > 0);
      
      const { data, error } = await supabase.functions.invoke('admin-videos', {
        body: {
          action: 'update',
          password,
          video: {
            id: selectedLesson.id,
            title: editTitle.trim(),
            description: editDescription.trim() || null,
            duration_minutes: editDuration ? parseInt(editDuration) : null,
            transcript: editTranscript.trim() || null,
            analysis: editAnalysis.trim() || null,
            teaching_moments: editMoments,
            is_configured: isFullyConfigured,
          }
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success('Aula atualizada com sucesso!');
      setIsEditDialogOpen(false);
      setSelectedLesson(null);
      loadLessons();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar aula');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-videos', {
        body: {
          action: 'delete',
          password,
          video: { id: lessonId }
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success('Aula excluída com sucesso!');
      loadLessons();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir aula');
    } finally {
      setIsLoading(false);
    }
  };

  const generateTeachingMoments = async () => {
    if (!editTranscript.trim()) {
      toast.error('Adicione a transcrição primeiro para gerar os momentos de ensino');
      return;
    }

    setIsGeneratingMoments(true);
    try {
      const { data, error } = await supabase.functions.invoke('content-manager', {
        body: {
          transcript: editTranscript,
          videoTitle: editTitle,
          analysis: editAnalysis,
        }
      });

      if (error) throw error;
      if (data.teaching_moments) {
        setEditMoments(data.teaching_moments);
        toast.success(`${data.teaching_moments.length} momentos de ensino gerados!`);
      }
    } catch (err: any) {
      toast.error('Erro ao gerar momentos de ensino');
      console.error(err);
    } finally {
      setIsGeneratingMoments(false);
    }
  };

  const openEditDialog = (lesson: VideoLesson) => {
    setSelectedLesson(lesson);
    setEditTitle(lesson.title);
    setEditDescription(lesson.description || '');
    setEditDuration(lesson.duration_minutes?.toString() || '');
    setEditTranscript(lesson.transcript || '');
    setEditAnalysis(lesson.analysis || '');
    setEditMoments(lesson.teaching_moments || []);
    setActiveTab('info');
    setIsEditDialogOpen(true);
  };

  const resetNewForm = () => {
    setNewVideoUrl('');
    setNewVideoTitle('');
    setNewVideoDescription('');
    setNewVideoDuration('');
    setNewVideoTranscript('');
  };

  const addEmptyMoment = () => {
    setEditMoments([...editMoments, {
      timestamp_seconds: 0,
      topic: '',
      key_insight: '',
      questions_to_ask: [''],
      discussion_points: [''],
    }]);
  };

  const updateMoment = (index: number, field: keyof TeachingMoment, value: any) => {
    const updated = [...editMoments];
    updated[index] = { ...updated[index], [field]: value };
    setEditMoments(updated);
  };

  const removeMoment = (index: number) => {
    setEditMoments(editMoments.filter((_, i) => i !== index));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Lock className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
            <CardTitle>Painel do Administrador</CardTitle>
            <CardDescription>Gerencie as aulas do curso</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Senha de administrador"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <Button onClick={handleLogin} className="w-full" disabled={isLoading}>
              {isLoading ? 'Entrando...' : 'Entrar'}
            </Button>
            <Button variant="ghost" onClick={() => navigate('/')} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar ao início
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg gradient-primary">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Gerenciador de Aulas</h1>
              <p className="text-xs text-muted-foreground">{lessons.length} aulas cadastradas</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Aula
            </Button>
            <Button variant="outline" onClick={() => navigate('/aluno')}>
              <Users className="h-4 w-4 mr-2" />
              Painel do Aluno
            </Button>
            <Button variant="ghost" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content - Lesson Gallery */}
      <main className="container mx-auto px-4 py-6">
        {lessons.length === 0 ? (
          <Card className="p-12 text-center">
            <Video className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold mb-2">Nenhuma aula cadastrada</h2>
            <p className="text-muted-foreground mb-4">Comece adicionando sua primeira aula ao curso</p>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Primeira Aula
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {lessons.map((lesson) => (
              <Card 
                key={lesson.id} 
                className={`overflow-hidden cursor-pointer transition-all hover:ring-2 hover:ring-primary/50 ${
                  lesson.is_configured ? 'border-green-500/30' : 'border-yellow-500/30'
                }`}
                onClick={() => openEditDialog(lesson)}
              >
                <div className="relative">
                  <img
                    src={lesson.thumbnail_url || `https://img.youtube.com/vi/${lesson.youtube_id}/mqdefault.jpg`}
                    alt={lesson.title}
                    className="w-full aspect-video object-cover"
                  />
                  <div className="absolute top-2 left-2">
                    <Badge variant="secondary" className="font-bold">
                      Aula {lesson.lesson_order}
                    </Badge>
                  </div>
                  <div className="absolute top-2 right-2">
                    {lesson.is_configured ? (
                      <Badge className="bg-green-500">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Configurada
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-yellow-500/20 border-yellow-500">
                        <Settings className="h-3 w-3 mr-1" />
                        Pendente
                      </Badge>
                    )}
                  </div>
                  {lesson.duration_minutes && (
                    <div className="absolute bottom-2 right-2">
                      <Badge variant="secondary" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        {lesson.duration_minutes} min
                      </Badge>
                    </div>
                  )}
                </div>
                <CardContent className="p-3">
                  <h3 className="font-semibold line-clamp-2 mb-1">{lesson.title}</h3>
                  {lesson.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{lesson.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1 text-[10px]">
                    {lesson.transcript ? (
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        <FileText className="h-2.5 w-2.5 mr-0.5" />
                        Transcrição
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        <FileText className="h-2.5 w-2.5 mr-0.5" />
                        Sem transcrição
                      </Badge>
                    )}
                    {lesson.teaching_moments && lesson.teaching_moments.length > 0 ? (
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        <Target className="h-2.5 w-2.5 mr-0.5" />
                        {lesson.teaching_moments.length} momentos
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        <Target className="h-2.5 w-2.5 mr-0.5" />
                        Sem momentos
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Add Lesson Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Adicionar Nova Aula
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>URL do YouTube *</Label>
              <Input
                placeholder="https://www.youtube.com/watch?v=..."
                value={newVideoUrl}
                onChange={(e) => setNewVideoUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Título da Aula *</Label>
              <Input
                placeholder="Ex: Introdução ao React Hooks"
                value={newVideoTitle}
                onChange={(e) => setNewVideoTitle(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input
                  placeholder="O que será ensinado"
                  value={newVideoDescription}
                  onChange={(e) => setNewVideoDescription(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Duração (min)</Label>
                <Input
                  type="number"
                  placeholder="15"
                  value={newVideoDuration}
                  onChange={(e) => setNewVideoDuration(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Transcrição (pode adicionar depois)</Label>
              <Textarea
                placeholder="Cole a transcrição do vídeo aqui..."
                value={newVideoTranscript}
                onChange={(e) => setNewVideoTranscript(e.target.value)}
                rows={4}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddLesson} disabled={isLoading}>
              {isLoading ? 'Adicionando...' : 'Adicionar Aula'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Lesson Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Edit className="h-5 w-5" />
                Configurar Aula {selectedLesson?.lesson_order}
              </span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir aula?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação não pode ser desfeita. A aula será permanentemente removida.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => selectedLesson && handleDeleteLesson(selectedLesson.id)}>
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DialogTitle>
          </DialogHeader>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="info" className="flex items-center gap-1">
                <Video className="h-3.5 w-3.5" />
                Informações
              </TabsTrigger>
              <TabsTrigger value="transcript" className="flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />
                Transcrição
              </TabsTrigger>
              <TabsTrigger value="moments" className="flex items-center gap-1">
                <Target className="h-3.5 w-3.5" />
                Momentos ({editMoments.length})
              </TabsTrigger>
            </TabsList>
            
            <ScrollArea className="flex-1 mt-4">
              <TabsContent value="info" className="m-0 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Título da Aula</Label>
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Duração (minutos)</Label>
                    <Input
                      type="number"
                      value={editDuration}
                      onChange={(e) => setEditDuration(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="O que o aluno vai aprender nesta aula"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Resumo/Análise (opcional)</Label>
                  <Textarea
                    value={editAnalysis}
                    onChange={(e) => setEditAnalysis(e.target.value)}
                    placeholder="Pontos principais da aula..."
                    rows={4}
                  />
                </div>
                
                {/* Preview */}
                {selectedLesson && (
                  <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                    <h4 className="text-sm font-medium mb-2">Pré-visualização</h4>
                    <div className="aspect-video bg-black rounded overflow-hidden">
                      <iframe
                        src={`https://www.youtube.com/embed/${selectedLesson.youtube_id}`}
                        className="w-full h-full"
                        allowFullScreen
                      />
                    </div>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="transcript" className="m-0 space-y-4">
                <div className="bg-muted/30 p-4 rounded-lg">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Transcrição do Vídeo
                  </h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    A transcrição é essencial para que o Professor IA entenda o conteúdo e ensine corretamente.
                    Use ferramentas como YouTube Transcript ou Whisper para extrair o texto.
                  </p>
                  <Textarea
                    value={editTranscript}
                    onChange={(e) => setEditTranscript(e.target.value)}
                    placeholder="Cole a transcrição completa do vídeo aqui..."
                    rows={15}
                    className="font-mono text-sm"
                  />
                </div>
              </TabsContent>
              
              <TabsContent value="moments" className="m-0 space-y-4">
                <div className="bg-muted/30 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-medium flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Momentos de Ensino
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Configure os momentos em que o professor deve pausar o vídeo para interagir com o aluno
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={generateTeachingMoments}
                        disabled={isGeneratingMoments || !editTranscript.trim()}
                      >
                        {isGeneratingMoments ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            Gerando...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                            Gerar com IA
                          </>
                        )}
                      </Button>
                      <Button variant="outline" size="sm" onClick={addEmptyMoment}>
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Adicionar
                      </Button>
                    </div>
                  </div>
                  
                  {editMoments.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Lightbulb className="h-10 w-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Nenhum momento de ensino configurado</p>
                      <p className="text-xs">Use o botão "Gerar com IA" ou adicione manualmente</p>
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                      {editMoments.map((moment, index) => (
                        <Card key={index} className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <Badge variant="secondary">
                              {formatTime(moment.timestamp_seconds)}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive"
                              onClick={() => removeMoment(index)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs">Tempo (segundos)</Label>
                                <Input
                                  type="number"
                                  value={moment.timestamp_seconds}
                                  onChange={(e) => updateMoment(index, 'timestamp_seconds', parseInt(e.target.value) || 0)}
                                  className="h-8"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Tópico</Label>
                                <Input
                                  value={moment.topic}
                                  onChange={(e) => updateMoment(index, 'topic', e.target.value)}
                                  placeholder="Nome do conceito"
                                  className="h-8"
                                />
                              </div>
                            </div>
                            
                            <div className="space-y-1">
                              <Label className="text-xs">Insight Principal</Label>
                              <Input
                                value={moment.key_insight}
                                onChange={(e) => updateMoment(index, 'key_insight', e.target.value)}
                                placeholder="O que o aluno deve entender"
                              />
                            </div>
                            
                            <div className="space-y-1">
                              <Label className="text-xs">Perguntas para o aluno</Label>
                              <Textarea
                                value={moment.questions_to_ask.join('\n')}
                                onChange={(e) => updateMoment(index, 'questions_to_ask', e.target.value.split('\n').filter(q => q.trim()))}
                                placeholder="Uma pergunta por linha"
                                rows={2}
                                className="text-sm"
                              />
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>
          
          <DialogFooter className="mt-4">
            <div className="flex items-center gap-2 mr-auto text-xs text-muted-foreground">
              {editTranscript && editMoments.length > 0 ? (
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Aula pronta para os alunos
                </span>
              ) : (
                <span className="flex items-center gap-1 text-yellow-600">
                  <Settings className="h-3.5 w-3.5" />
                  Complete a transcrição e momentos
                </span>
              )}
            </div>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateLesson} disabled={isLoading}>
              {isLoading ? 'Salvando...' : 'Salvar Aula'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
