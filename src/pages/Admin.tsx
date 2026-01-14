import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, Edit, ArrowLeft, Video, Lock, Eye, EyeOff, FileText, Upload, Users, ArrowUp, ArrowDown, Clock, BookOpen } from 'lucide-react';

interface Video {
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
}

export default function Admin() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingVideo, setEditingVideo] = useState<Video | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  // Form states
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newVideoTitle, setNewVideoTitle] = useState('');
  const [newVideoTranscript, setNewVideoTranscript] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editTranscript, setEditTranscript] = useState('');
  const [editAnalysis, setEditAnalysis] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [newVideoAnalysis, setNewVideoAnalysis] = useState('');
  const [newVideoDescription, setNewVideoDescription] = useState('');
  const [newVideoDuration, setNewVideoDuration] = useState('');

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
      setVideos(data.videos || []);
      toast.success('Login realizado com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao fazer login');
    } finally {
      setIsLoading(false);
    }
  };

  const loadVideos = async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-videos', {
        body: { action: 'list', password }
      });

      if (error) throw error;
      setVideos(data.videos || []);
    } catch (err: any) {
      toast.error('Erro ao carregar vídeos');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddVideo = async () => {
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
            transcript: newVideoTranscript.trim() || null,
            analysis: newVideoAnalysis.trim() || null,
            description: newVideoDescription.trim() || null,
            duration_minutes: newVideoDuration ? parseInt(newVideoDuration) : null,
            lesson_order: videos.length + 1,
          }
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success('Vídeo adicionado com sucesso!');
      setIsAddDialogOpen(false);
      setNewVideoUrl('');
      setNewVideoTitle('');
      setNewVideoTranscript('');
      setNewVideoAnalysis('');
      setNewVideoDescription('');
      setNewVideoDuration('');
      loadVideos();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao adicionar vídeo');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditVideo = async () => {
    if (!editingVideo) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-videos', {
        body: {
          action: 'update',
          password,
          video: {
            id: editingVideo.id,
            title: editTitle.trim(),
            transcript: editTranscript.trim() || null,
            analysis: editAnalysis.trim() || null,
            description: editDescription.trim() || null,
            duration_minutes: editDuration ? parseInt(editDuration) : null,
          }
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success('Vídeo atualizado com sucesso!');
      setIsEditDialogOpen(false);
      setEditingVideo(null);
      loadVideos();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar vídeo');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteVideo = async (videoId: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-videos', {
        body: {
          action: 'delete',
          password,
          video: { id: videoId }
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success('Vídeo excluído com sucesso!');
      loadVideos();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir vídeo');
    } finally {
      setIsLoading(false);
    }
  };

  const openEditDialog = (video: Video) => {
    setEditingVideo(video);
    setEditTitle(video.title);
    setEditTranscript(video.transcript || '');
    setEditAnalysis(video.analysis || '');
    setEditDescription(video.description || '');
    setEditDuration(video.duration_minutes?.toString() || '');
    setIsEditDialogOpen(true);
  };

  const handleMoveVideo = async (videoId: string, direction: 'up' | 'down') => {
    const currentIndex = videos.findIndex(v => v.id === videoId);
    if (currentIndex === -1) return;
    
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= videos.length) return;

    const currentVideo = videos[currentIndex];
    const targetVideo = videos[targetIndex];

    setIsLoading(true);
    try {
      // Swap the lesson_order values
      await supabase.functions.invoke('admin-videos', {
        body: {
          action: 'update',
          password,
          video: { id: currentVideo.id, lesson_order: targetVideo.lesson_order }
        }
      });
      await supabase.functions.invoke('admin-videos', {
        body: {
          action: 'update',
          password,
          video: { id: targetVideo.id, lesson_order: currentVideo.lesson_order }
        }
      });
      
      toast.success('Ordem atualizada!');
      loadVideos();
    } catch (err: any) {
      toast.error('Erro ao reordenar');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Lock className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
            <CardTitle>Painel Admin</CardTitle>
            <CardDescription>Digite a senha para acessar</CardDescription>
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
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Video className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Painel Admin - Vídeos</h1>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Vídeo
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Adicionar Novo Vídeo</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>URL do YouTube</Label>
                        <Input
                          placeholder="https://www.youtube.com/watch?v=..."
                          value={newVideoUrl}
                          onChange={(e) => setNewVideoUrl(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Título da Aula</Label>
                        <Input
                          placeholder="Ex: Aula 1 - Introdução ao React"
                          value={newVideoTitle}
                          onChange={(e) => setNewVideoTitle(e.target.value)}
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Descrição breve</Label>
                        <Input
                          placeholder="O que o aluno vai aprender..."
                          value={newVideoDescription}
                          onChange={(e) => setNewVideoDescription(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <Label>Duração (minutos)</Label>
                        </div>
                        <Input
                          type="number"
                          placeholder="Ex: 15"
                          value={newVideoDuration}
                          onChange={(e) => setNewVideoDuration(e.target.value)}
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <Label>Transcrição</Label>
                        <span className="text-xs text-muted-foreground">(Necessária para o professor IA ensinar corretamente)</span>
                      </div>
                      <Textarea
                        placeholder="Cole a transcrição completa do vídeo aqui. Quanto mais detalhada, melhor será o ensino do professor IA..."
                        value={newVideoTranscript}
                        onChange={(e) => setNewVideoTranscript(e.target.value)}
                        rows={6}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        💡 Dica: Use ferramentas como YouTube Transcript ou Whisper para extrair a transcrição do vídeo
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Upload className="h-4 w-4 text-muted-foreground" />
                        <Label>Análise/Resumo</Label>
                        <span className="text-xs text-muted-foreground">(Opcional - pontos principais)</span>
                      </div>
                      <Textarea
                        placeholder="Resumo dos pontos principais do vídeo, conceitos-chave, etc..."
                        value={newVideoAnalysis}
                        onChange={(e) => setNewVideoAnalysis(e.target.value)}
                        rows={3}
                      />
                    </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleAddVideo} disabled={isLoading}>
                    {isLoading ? 'Adicionando...' : 'Adicionar'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button variant="outline" onClick={() => navigate('/aluno')}>
              <Users className="h-4 w-4 mr-2" />
              Área do Aluno
            </Button>
            <Button variant="ghost" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Aulas Configuradas
            </CardTitle>
            <CardDescription>
              Gerencie as aulas disponíveis para os alunos. Arraste para reordenar a sequência.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {videos.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Video className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma aula cadastrada ainda.</p>
                <p className="text-sm">Clique em "Adicionar Aula" para começar.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Ordem</TableHead>
                    <TableHead className="w-16">Thumb</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead className="w-20">Duração</TableHead>
                    <TableHead className="w-28">Transcrição</TableHead>
                    <TableHead className="w-32 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {videos.map((video, index) => (
                    <TableRow key={video.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <div className="flex flex-col">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => handleMoveVideo(video.id, 'up')}
                              disabled={index === 0 || isLoading}
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => handleMoveVideo(video.id, 'down')}
                              disabled={index === videos.length - 1 || isLoading}
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                          </div>
                          <span className="font-bold text-primary">{video.lesson_order}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <img
                          src={video.thumbnail_url || `https://img.youtube.com/vi/${video.youtube_id}/default.jpg`}
                          alt={video.title}
                          className="w-16 h-10 object-cover rounded"
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{video.title}</p>
                          {video.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1">{video.description}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {video.duration_minutes ? (
                          <span className="text-sm flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {video.duration_minutes} min
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {video.transcript ? (
                          <span className="text-green-600 text-sm">✓ Sim</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">Não</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(video)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir vídeo?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir "{video.title}"? Esta ação não pode ser desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteVideo(video.id)}>
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Aula</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Título da Aula</Label>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Label>Duração (minutos)</Label>
                </div>
                <Input
                  type="number"
                  value={editDuration}
                  onChange={(e) => setEditDuration(e.target.value)}
                  placeholder="Ex: 15"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Descrição breve</Label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="O que o aluno vai aprender..."
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <Label>Transcrição</Label>
              </div>
              <Textarea
                value={editTranscript}
                onChange={(e) => setEditTranscript(e.target.value)}
                rows={8}
                className="font-mono text-sm"
                placeholder="Cole a transcrição completa do vídeo aqui..."
              />
              <p className="text-xs text-muted-foreground">
                💡 A transcrição é usada pelo professor IA para ensinar o conteúdo
              </p>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-muted-foreground" />
                <Label>Análise/Resumo</Label>
              </div>
              <Textarea
                value={editAnalysis}
                onChange={(e) => setEditAnalysis(e.target.value)}
                rows={3}
                placeholder="Resumo dos pontos principais..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEditVideo} disabled={isLoading}>
              {isLoading ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
