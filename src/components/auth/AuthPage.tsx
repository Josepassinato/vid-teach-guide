import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GraduationCap, Sparkles, FlaskConical } from 'lucide-react';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const navigate = useNavigate();

  const handleTestBypass = () => {
    navigate('/aluno?bypass=test');
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

          {/* Tab Switcher */}
          <div className="flex bg-muted rounded-lg p-1 mb-6 max-w-xs mx-auto">
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

          {/* Auth Forms */}
          <div className="w-full">
            {isLogin ? (
              <LoginForm />
            ) : (
              <SignupForm onSuccess={() => setIsLogin(true)} />
            )}
          </div>

          {/* Test Bypass */}
          <div className="mt-6 pt-4 border-t border-dashed border-muted-foreground/30">
            <button
              onClick={handleTestBypass}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium text-muted-foreground bg-muted/50 hover:bg-muted hover:text-foreground transition-all border border-dashed border-muted-foreground/30"
            >
              <FlaskConical className="h-4 w-4" />
              Entrar como Teste (bypass)
            </button>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-muted-foreground mt-6">
            Ao continuar, você concorda com nossos termos de uso e política de privacidade.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
