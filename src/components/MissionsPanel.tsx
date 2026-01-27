import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Target, CheckCircle2, Clock } from 'lucide-react';
import { MissionCard } from './MissionCard';
import { AchievementsPanel } from './AchievementsPanel';
import { useMissions } from '@/hooks/useMissions';

interface MissionsPanelProps {
  videoId?: string;
  studentId: string;
}

export function MissionsPanel({ videoId, studentId }: MissionsPanelProps) {
  const {
    missions,
    submissions,
    achievements,
    isLoading,
    isEvaluating,
    loadMissions,
    loadSubmissions,
    loadAchievements,
    submitEvidence,
    getMissionStatus
  } = useMissions(studentId);

  useEffect(() => {
    loadMissions(videoId);
    loadSubmissions();
    loadAchievements();
  }, [videoId, loadMissions, loadSubmissions, loadAchievements]);

  const pendingMissions = missions.filter(m => {
    const status = getMissionStatus(m.id);
    return status === 'not_started' || status === 'needs_revision' || status === 'rejected';
  });

  const completedMissions = missions.filter(m => getMissionStatus(m.id) === 'approved');

  const getSubmissionsForMission = (missionId: string) => {
    return submissions.filter(s => s.mission_id === missionId);
  };

  const handleSubmit = async (mission: typeof missions[0], evidenceText?: string, evidenceUrl?: string) => {
    await submitEvidence(mission, evidenceText, evidenceUrl);
  };

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Missões
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-muted rounded" />
            <div className="h-32 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <AchievementsPanel achievements={achievements} />

      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="w-5 h-5 text-primary" />
            Missões Práticas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs defaultValue="pending" className="w-full">
            <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-4">
              <TabsTrigger value="pending" className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                Pendentes ({pendingMissions.length})
              </TabsTrigger>
              <TabsTrigger value="completed" className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Concluídas ({completedMissions.length})
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[400px]">
              <TabsContent value="pending" className="p-4 space-y-4 mt-0">
                {pendingMissions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Nenhuma missão pendente!</p>
                    <p className="text-sm">Todas as missões foram completadas 🎉</p>
                  </div>
                ) : (
                  pendingMissions.map((mission) => (
                    <MissionCard
                      key={mission.id}
                      mission={mission}
                      submissions={getSubmissionsForMission(mission.id)}
                      onSubmit={(text, url) => handleSubmit(mission, text, url)}
                      isEvaluating={isEvaluating}
                    />
                  ))
                )}
              </TabsContent>

              <TabsContent value="completed" className="p-4 space-y-4 mt-0">
                {completedMissions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Nenhuma missão concluída ainda</p>
                    <p className="text-sm">Complete as missões pendentes!</p>
                  </div>
                ) : (
                  completedMissions.map((mission) => (
                    <MissionCard
                      key={mission.id}
                      mission={mission}
                      submissions={getSubmissionsForMission(mission.id)}
                      onSubmit={(text, url) => handleSubmit(mission, text, url)}
                      isEvaluating={isEvaluating}
                    />
                  ))
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
