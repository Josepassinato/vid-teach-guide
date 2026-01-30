import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Download, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Certificate {
  id: string;
  student_id: string;
  module_id: string | null;
  certificate_type: 'module' | 'course';
  student_name: string;
  module_title: string | null;
  certificate_code: string;
}

interface CertificateViewerProps {
  certificate: Certificate;
  onClose: () => void;
  onDownload: () => void;
}

export function CertificateViewer({ certificate, onClose, onDownload }: CertificateViewerProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSvg = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('generate-certificate', {
          body: {
            studentId: certificate.student_id,
            studentName: certificate.student_name,
            moduleId: certificate.module_id,
            moduleTitle: certificate.module_title,
            certificateType: certificate.certificate_type,
          },
        });

        if (error) throw error;
        setSvg(data.svg);
      } catch (error) {
        console.error('Error fetching certificate SVG:', error);
        toast.error('Erro ao carregar certificado');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSvg();
  }, [certificate]);

  const handleShare = async () => {
    const shareText = `🎓 Certificado Vibe Class\n\nCódigo: ${certificate.certificate_code}\nAluno: ${certificate.student_name}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Meu Certificado Vibe Class',
          text: shareText,
        });
      } catch (err) {
        // User cancelled or share failed
        console.log('Share cancelled');
      }
    } else {
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(shareText);
      toast.success('Link copiado para a área de transferência!');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-card rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">Visualizar Certificado</h2>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleShare}>
              <Share2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onDownload}>
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Certificate Preview */}
        <div className="p-4 bg-muted/50 flex items-center justify-center min-h-[400px]">
          {isLoading ? (
            <div className="animate-pulse bg-muted rounded-lg w-full max-w-2xl aspect-[4/3]" />
          ) : svg ? (
            <div 
              className="w-full max-w-2xl rounded-lg overflow-hidden shadow-lg"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <p className="text-muted-foreground">Erro ao carregar certificado</p>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            <span className="font-mono bg-muted px-2 py-1 rounded">
              {certificate.certificate_code}
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Fechar
            </Button>
            <Button onClick={onDownload}>
              <Download className="h-4 w-4 mr-2" />
              Baixar PNG
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
