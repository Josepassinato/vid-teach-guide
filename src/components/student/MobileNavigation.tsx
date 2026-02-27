import { Video, Play, Target, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MobileTab = 'lessons' | 'video' | 'missions' | 'quiz';

interface MobileNavigationProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  hasQuiz?: boolean;
  hasMissions?: boolean;
  lessonCompleted?: boolean;
}

export function MobileNavigation({
  activeTab,
  onTabChange,
  hasQuiz = true,
  hasMissions = true,
  lessonCompleted = false,
}: MobileNavigationProps) {
  const tabs = [
    { id: 'lessons' as const, icon: Video, label: 'Aulas', show: true },
    { id: 'video' as const, icon: Play, label: 'Vídeo', show: true },
    { id: 'missions' as const, icon: Target, label: 'Missões', show: hasMissions },
    { id: 'quiz' as const, icon: ClipboardCheck, label: 'Quiz', show: hasQuiz && !lessonCompleted },
  ].filter((tab) => tab.show);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t lg:hidden safe-area-bottom">
      <div className="flex items-center justify-around px-2 py-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center justify-center py-1.5 px-4 min-w-[56px] rounded-lg transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground'
              )}
            >
              <Icon className={cn('h-5 w-5', isActive && 'text-primary')} />
              <span className="text-[10px] font-medium mt-0.5">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
