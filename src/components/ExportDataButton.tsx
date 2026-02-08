import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ExportDataButtonProps {
  password: string;
}

export function ExportDataButton({ password }: ExportDataButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const exportData = async () => {
    setIsExporting(true);
    try {
      // Fetch all main tables in parallel
      const [
        videosRes,
        modulesRes,
        quizzesRes,
        missionsRes,
        progressRes,
        quizResultsRes,
        achievementsRes,
        certificatesRes,
        squadsRes,
        squadMembersRes,
        submissionsRes,
      ] = await Promise.all([
        supabase.from('videos').select('*').order('lesson_order', { ascending: true }),
        supabase.from('modules').select('*').order('module_order', { ascending: true }),
        supabase.from('video_quizzes').select('*').order('video_id').order('question_order', { ascending: true }),
        supabase.from('missions').select('*').order('mission_order', { ascending: true }),
        supabase.from('student_lesson_progress').select('*').order('created_at', { ascending: false }),
        supabase.from('student_quiz_results').select('*').order('completed_at', { ascending: false }),
        supabase.from('student_achievements').select('*').order('updated_at', { ascending: false }),
        supabase.from('certificates').select('*').order('created_at', { ascending: false }),
        supabase.from('squads').select('*').order('created_at', { ascending: true }),
        supabase.from('squad_members').select('*'),
        supabase.from('student_mission_submissions').select('*').order('submitted_at', { ascending: false }),
      ]);

      const exportPayload = {
        exported_at: new Date().toISOString(),
        tables: {
          modules: modulesRes.data || [],
          videos: videosRes.data || [],
          video_quizzes: quizzesRes.data || [],
          missions: missionsRes.data || [],
          student_lesson_progress: progressRes.data || [],
          student_quiz_results: quizResultsRes.data || [],
          student_achievements: achievementsRes.data || [],
          student_mission_submissions: submissionsRes.data || [],
          certificates: certificatesRes.data || [],
          squads: squadsRes.data || [],
          squad_members: squadMembersRes.data || [],
        },
        summary: {
          modules: (modulesRes.data || []).length,
          videos: (videosRes.data || []).length,
          quizzes: (quizzesRes.data || []).length,
          missions: (missionsRes.data || []).length,
          student_progress: (progressRes.data || []).length,
          quiz_results: (quizResultsRes.data || []).length,
          achievements: (achievementsRes.data || []).length,
          submissions: (submissionsRes.data || []).length,
          certificates: (certificatesRes.data || []).length,
          squads: (squadsRes.data || []).length,
          squad_members: (squadMembersRes.data || []).length,
        },
      };

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `export-12brain-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const totalRecords = Object.values(exportPayload.summary).reduce((a, b) => a + b, 0);
      toast.success(`Exportação concluída! ${totalRecords} registros em ${Object.keys(exportPayload.tables).length} tabelas.`);
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Erro ao exportar dados');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button variant="outline" onClick={exportData} disabled={isExporting}>
      {isExporting ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Download className="h-4 w-4 mr-2" />
      )}
      {isExporting ? 'Exportando...' : 'Exportar Dados'}
    </Button>
  );
}
