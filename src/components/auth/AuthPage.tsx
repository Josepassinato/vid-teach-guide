import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { GraduationCap, Sparkles, TestTube, Settings } from 'lucide-react';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';
import { Button } from '@/components/ui/button';

// DEV MODE - Set to false in production
const DEV_BYPASS_AUTH = false;

export function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const navigate = useNavigate();

  const handleDevBypass = () => {
    // Store a fake student ID for testing
    localStorage.setItem('dev_student_id', 'dev-test-student-001');
    localStorage.setItem('dev_bypass_auth', 'true');
    navigate('/aluno');
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

      <div className="flex-1 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          {/* Logo & Header */}
          <div className="text-center mb-8">
            <motion.div
              className="inline-flex p-4 rounded-2xl bg-primary shadow-lg mb-4"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <GraduationCap className="h-10 w-10 text-primary-foreground" />
            </motion.div>
            
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              Vibe Class
            </h1>
            <p className="text-muted-foreground mt-2 flex items-center justify-center gap-2">
              <Sparkles className="h-4 w-4" />
              Aprenda programação com IA
            </p>
          </div>

          {/* Auth Card */}
          <motion.div
            className="bg-card rounded-2xl shadow-xl border p-6 sm:p-8"
            layout
          >
            {/* Tab Switcher */}
            <div className="flex bg-muted rounded-lg p-1 mb-6">
              <button
                onClick={() => setIsLogin(true)}
                className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
                  isLogin
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Entrar
              </button>
              <button
                onClick={() => setIsLogin(false)}
                className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
                  !isLogin
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Criar conta
              </button>
            </div>

            {/* Forms */}
            <AnimatePresence mode="wait">
              {isLogin ? (
                <motion.div
                  key="login"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                >
                  <LoginForm />
                </motion.div>
              ) : (
                <motion.div
                  key="signup"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <SignupForm onSuccess={() => setIsLogin(true)} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Footer */}
          <p className="text-center text-xs text-muted-foreground mt-6">
            Ao continuar, você concorda com nossos termos de uso e política de privacidade.
          </p>

          {/* Dev Bypass - Remove in production */}
          {DEV_BYPASS_AUTH && (
            <div className="mt-6 pt-6 border-t border-dashed border-muted-foreground/30">
              <p className="text-center text-xs text-amber-600 mb-3 font-medium">
                🧪 Modo de Teste
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
                  onClick={handleDevBypass}
                >
                  <TestTube className="h-4 w-4 mr-2" />
                  Entrar como Aluno (Teste)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-muted-foreground/50"
                  onClick={() => navigate('/admin')}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
