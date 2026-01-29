import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  GraduationCap, 
  Video, 
  MessageCircle, 
  Target, 
  Trophy,
  ChevronRight,
  ChevronLeft,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface OnboardingCarouselProps {
  onComplete: () => void;
  userName?: string;
}

const steps = [
  {
    id: 'welcome',
    icon: GraduationCap,
    color: 'primary',
    title: 'Bem-vindo ao Vibe Class!',
    subtitle: 'Sua jornada de aprendizado começa agora',
    description: 'Aprenda programação de um jeito diferente, com um professor de IA que te acompanha em tempo real.',
    image: '🎓',
  },
  {
    id: 'lessons',
    icon: Video,
    color: 'google-blue',
    title: 'Aulas em Vídeo',
    subtitle: 'Aprenda no seu ritmo',
    description: 'Assista aulas em vídeo com conteúdo de alta qualidade. O sistema acompanha seu progresso automaticamente.',
    image: '📺',
  },
  {
    id: 'ai-tutor',
    icon: MessageCircle,
    color: 'google-green',
    title: 'Professor de IA',
    subtitle: 'Converse e tire dúvidas',
    description: 'Um tutor de IA está sempre disponível para explicar conceitos, responder perguntas e te ajudar a entender o conteúdo.',
    image: '🤖',
  },
  {
    id: 'quizzes',
    icon: Target,
    color: 'google-yellow',
    title: 'Quizzes Interativos',
    subtitle: 'Teste seu conhecimento',
    description: 'Após cada aula, faça quizzes para verificar se você entendeu o conteúdo. Feedback instantâneo!',
    image: '✅',
  },
  {
    id: 'missions',
    icon: Trophy,
    color: 'google-red',
    title: 'Missões Práticas',
    subtitle: 'Aplique o que aprendeu',
    description: 'Complete missões práticas para ganhar pontos e subir de nível. Aprenda fazendo!',
    image: '🚀',
  },
];

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0,
  }),
};

export function OnboardingCarousel({ onComplete, userName }: OnboardingCarouselProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(0);

  const step = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;
  const isLastStep = currentStep === steps.length - 1;

  const goNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setDirection(1);
      setCurrentStep((prev) => prev + 1);
    }
  };

  const goPrev = () => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep((prev) => prev - 1);
    }
  };

  const goToStep = (index: number) => {
    setDirection(index > currentStep ? 1 : -1);
    setCurrentStep(index);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      {/* Colorful top accent */}
      <div className="h-1 flex">
        <div className="flex-1 bg-google-blue" />
        <div className="flex-1 bg-google-red" />
        <div className="flex-1 bg-google-yellow" />
        <div className="flex-1 bg-google-green" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
        {/* Progress bar */}
        <div className="w-full max-w-md mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">
              {currentStep + 1} de {steps.length}
            </span>
            <span className="text-xs text-muted-foreground">
              {Math.round(progress)}%
            </span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>

        {/* Main content card */}
        <motion.div 
          className="w-full max-w-md bg-card rounded-3xl shadow-xl border overflow-hidden"
          layout
        >
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step.id}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="p-6 sm:p-8"
            >
              {/* Emoji/Icon */}
              <div className="text-center mb-6">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.1 }}
                  className="text-6xl sm:text-7xl mb-4"
                >
                  {step.image}
                </motion.div>

                {/* Title */}
                <motion.h1
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="text-2xl sm:text-3xl font-bold mb-2"
                >
                  {currentStep === 0 && userName
                    ? `Olá, ${userName}!`
                    : step.title}
                </motion.h1>

                {/* Subtitle */}
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-primary font-medium flex items-center justify-center gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  {step.subtitle}
                </motion.p>
              </div>

              {/* Description */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25 }}
                className="text-muted-foreground text-center text-sm sm:text-base leading-relaxed mb-8"
              >
                {step.description}
              </motion.p>

              {/* Step indicators */}
              <div className="flex justify-center gap-2 mb-6">
                {steps.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => goToStep(index)}
                    className={cn(
                      'h-2 rounded-full transition-all',
                      index === currentStep
                        ? 'w-8 bg-primary'
                        : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
                    )}
                    aria-label={`Ir para passo ${index + 1}`}
                  />
                ))}
              </div>

              {/* Navigation buttons */}
              <div className="flex gap-3">
                {currentStep > 0 && (
                  <Button
                    variant="outline"
                    onClick={goPrev}
                    className="flex-1"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Voltar
                  </Button>
                )}
                <Button
                  onClick={goNext}
                  className={cn(
                    'flex-1',
                    isLastStep && 'gradient-primary text-white'
                  )}
                >
                  {isLastStep ? (
                    <>
                      Começar a Aprender
                      <Sparkles className="h-4 w-4 ml-2" />
                    </>
                  ) : (
                    <>
                      Próximo
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* Skip button */}
        {!isLastStep && (
          <button
            onClick={onComplete}
            className="mt-6 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Pular introdução
          </button>
        )}
      </div>
    </div>
  );
}
