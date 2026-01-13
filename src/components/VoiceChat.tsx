import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGeminiLive } from '@/hooks/useGeminiLive';
import { VoiceIndicator } from './VoiceIndicator';
import { Mic, MicOff, Phone, PhoneOff, Send, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Message {
  id: string;
  text: string;
  role: 'user' | 'assistant';
  timestamp: Date;
}

interface VoiceChatProps {
  videoContext?: string;
}

export function VoiceChat({ videoContext }: VoiceChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [textInput, setTextInput] = useState('');
  
  const systemInstruction = videoContext 
    ? `Você é um professor amigável e didático. Você está ajudando o aluno a entender o conteúdo de um vídeo-aula com os seguintes pontos principais:\n\n${videoContext}\n\nExplique os conceitos de forma clara, use exemplos práticos e responda às dúvidas do aluno. Fale em português brasileiro.`
    : "Você é um professor amigável e didático. Seu objetivo é ensinar de forma clara e envolvente. Use exemplos práticos e linguagem acessível. Fale em português brasileiro.";
  
  const {
    status,
    isListening,
    isSpeaking,
    connect,
    disconnect,
    startListening,
    stopListening,
    sendText
  } = useGeminiLive({
    systemInstruction,
    onTranscript: (text, role) => {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text,
        role,
        timestamp: new Date()
      }]);
    },
    onError: (error) => {
      toast.error(error);
    }
  });

  const handleSendText = () => {
    if (!textInput.trim()) return;
    sendText(textInput);
    setTextInput('');
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-muted';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'connected': return 'Conectado';
      case 'connecting': return 'Conectando...';
      case 'error': return 'Erro de conexão';
      default: return 'Desconectado';
    }
  };

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
            Professor IA
          </CardTitle>
          <span className="text-xs text-muted-foreground">{getStatusText()}</span>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          {messages.length === 0 && status === 'disconnected' && (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground p-4">
              <AlertCircle className="h-10 w-10 mb-3 opacity-50" />
              <p className="text-sm">Clique em "Iniciar Aula" para começar a conversar com o professor IA</p>
            </div>
          )}
          
          {messages.map((msg) => (
            <div 
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === 'user' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
        </div>
        
        {/* Voice indicators */}
        {status === 'connected' && (
          <div className="flex justify-center gap-8 py-2">
            {isListening && (
              <div className="text-center">
                <VoiceIndicator isActive={isListening} type="listening" />
                <p className="text-xs text-muted-foreground mt-1">Ouvindo...</p>
              </div>
            )}
            {isSpeaking && (
              <div className="text-center">
                <VoiceIndicator isActive={isSpeaking} type="speaking" />
                <p className="text-xs text-muted-foreground mt-1">Falando...</p>
              </div>
            )}
          </div>
        )}
        
        {/* Controls */}
        <div className="space-y-3 pt-2 border-t">
          <div className="flex gap-2">
            {status === 'disconnected' || status === 'error' ? (
              <Button onClick={connect} className="flex-1" size="lg">
                <Phone className="h-4 w-4 mr-2" />
                Iniciar Aula
              </Button>
            ) : status === 'connecting' ? (
              <Button disabled className="flex-1" size="lg">
                Conectando...
              </Button>
            ) : (
              <>
                <Button 
                  onClick={toggleListening}
                  variant={isListening ? 'destructive' : 'default'}
                  className="flex-1"
                  size="lg"
                >
                  {isListening ? (
                    <>
                      <MicOff className="h-4 w-4 mr-2" />
                      Parar
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4 mr-2" />
                      Falar
                    </>
                  )}
                </Button>
                <Button onClick={disconnect} variant="outline" size="lg">
                  <PhoneOff className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
          
          {status === 'connected' && (
            <div className="flex gap-2">
              <Input
                placeholder="Ou digite sua pergunta..."
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
              />
              <Button onClick={handleSendText} size="icon" variant="secondary">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
