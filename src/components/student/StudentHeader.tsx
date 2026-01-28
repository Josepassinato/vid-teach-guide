import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GraduationCap, BarChart3, LogOut, Sparkles, Trophy, Award, Menu, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface StudentHeaderProps {
  lessonNumber?: number;
  lessonTitle?: string;
  completedLessons: number;
  totalLessons: number;
  progressPercentage: number;
  onMenuClick?: () => void;
  showMenuButton?: boolean;
  userName?: string | null;
  userAvatar?: string | null;
  onSignOut?: () => void;
}

export function StudentHeader({
  lessonNumber,
  lessonTitle,
  completedLessons,
  totalLessons,
  progressPercentage,
  onMenuClick,
  showMenuButton,
  userName,
  userAvatar,
  onSignOut,
}: StudentHeaderProps) {
  const initials = userName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'AL';
  return (
    <header className="border-b bg-card/95 backdrop-blur-lg sticky top-0 z-50">
      {/* Colorful top accent */}
      <div className="h-1 flex">
        <div className="flex-1 bg-google-blue" />
        <div className="flex-1 bg-google-red" />
        <div className="flex-1 bg-google-yellow" />
        <div className="flex-1 bg-google-green" />
      </div>

      <div className="px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Menu button - mobile only */}
          {showMenuButton && (
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 lg:hidden flex-shrink-0"
              onClick={onMenuClick}
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}

          {/* Logo */}
          <motion.div
            className="p-2 rounded-xl bg-primary shadow-md flex-shrink-0"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6 text-primary-foreground" />
          </motion.div>

          {/* Title area */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                Vibe Class
              </h1>
              {lessonNumber && (
                <Badge className="bg-primary/10 text-primary border-0 font-medium hidden sm:flex">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Aula {lessonNumber}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate hidden sm:block">
              {lessonTitle || 'Aprenda programação com IA'}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 sm:h-10 sm:w-10 rounded-full"
              asChild
            >
              <Link to="/aluno/dashboard">
                <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
              </Link>
            </Button>

            <ThemeToggle />

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-10 sm:w-10 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={userAvatar || undefined} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{userName || 'Aluno'}</p>
                  <p className="text-xs text-muted-foreground">Estudante</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/aluno/dashboard" className="cursor-pointer">
                    <BarChart3 className="mr-2 h-4 w-4" />
                    Dashboard
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/admin" className="cursor-pointer">
                    <User className="mr-2 h-4 w-4" />
                    Admin
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onSignOut} className="cursor-pointer text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Progress bar - always visible if lessons exist */}
        {totalLessons > 0 && (
          <div className="mt-3 space-y-1.5">
            <Progress value={progressPercentage} className="h-2" />
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {completedLessons}/{totalLessons} aulas
              </span>
              <Badge
                variant="secondary"
                className={progressPercentage === 100 ? 'bg-accent text-accent-foreground' : ''}
              >
                {progressPercentage === 100 ? (
                  <>
                    <Trophy className="h-3 w-3 mr-1" /> Completo!
                  </>
                ) : (
                  <>
                    <Award className="h-3 w-3 mr-1" /> {progressPercentage}%
                  </>
                )}
              </Badge>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
