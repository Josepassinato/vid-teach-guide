import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2, Database } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ExportDataButtonProps {
  password: string;
}

export function ExportDataButton({ password }: ExportDataButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingSQL, setIsExportingSQL] = useState(false);

  const exportData = async () => {
    setIsExporting(true);
    try {
      const [
        videosRes, modulesRes, quizzesRes, missionsRes,
        progressRes, quizResultsRes, achievementsRes,
        certificatesRes, squadsRes, squadMembersRes, submissionsRes,
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

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
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

  const exportSQL = async () => {
    setIsExportingSQL(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/export-sql?password=${encodeURIComponent(password)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const sql = await res.text();
      const blob = new Blob([sql], { type: 'application/sql' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `vibe-class-complete-${new Date().toISOString().slice(0, 10)}.sql`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Script SQL unificado exportado com sucesso!');
    } catch (err) {
      console.error('SQL Export error:', err);
      toast.error('Erro ao exportar SQL');
    } finally {
      setIsExportingSQL(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" onClick={exportData} disabled={isExporting}>
        {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
        {isExporting ? 'Exportando...' : 'Exportar JSON'}
      </Button>
      <Button variant="outline" onClick={exportSQL} disabled={isExportingSQL}>
        {isExportingSQL ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Database className="h-4 w-4 mr-2" />}
        {isExportingSQL ? 'Gerando SQL...' : 'Exportar SQL Completo'}
      </Button>
    </div>
  );
}
