
# Plano de Melhorias de Design - Vibe Class

## Resumo das Melhorias

Este plano aborda cinco melhorias de design solicitadas:

1. **Timeline no Player de Vídeo** - Barra de progresso interativa com marcadores
2. **Touch Targets Mobile** - Aumentar áreas clicáveis para 44px+
3. **Gráficos de Progresso no Dashboard** - Visualizações com Recharts
4. **Badges Consistentes** - Sistema unificado de cores por significado
5. **Estado de Processamento no VoiceChat** - Indicador visual claro

---

## 1. Timeline no Player de Vídeo

### Situação Atual
O `VideoPlayer.tsx` exibe apenas o tempo atual (`currentTime`) em formato texto, sem uma barra de progresso visual ou marcadores de momentos de pausa.

### Implementação

**Arquivo: `src/components/VideoPlayer.tsx`**

- Adicionar estado para duração total do vídeo (`duration`)
- Criar barra de progresso clicável usando o componente `Slider`
- Implementar marcadores visuais para teaching moments e quizzes
- Permitir seek ao clicar na timeline

```text
+------------------------------------------------------------------+
|  [Slider de Progresso - 0% a 100%]                              |
|     ●          ●              ●                    ● Marcadores |
|   Quiz 1   Momento 1      Quiz 2                Momento 2       |
+------------------------------------------------------------------+
```

**Novas Props:**
- `teachingMoments?: { timestamp_seconds: number }[]`
- `quizTimestamps?: number[]`

**Mudanças no Código:**
1. Adicionar hook para capturar duração: `playerRef.current.getDuration()`
2. Criar `ProgressTimeline` subcomponente
3. Renderizar markers como pontos coloridos na timeline
4. Exibir tooltip ao hover nos markers

---

## 2. Touch Targets Mobile (44px+)

### Situação Atual
Vários botões têm dimensões menores que 44px:
- `h-8 w-8` (32px) em botões de controle do player
- `h-9 w-9` (36px) em alguns botões

### Implementação

**Arquivos a Modificar:**
- `src/components/VideoPlayer.tsx`
- `src/pages/Student.tsx`
- `src/components/VoiceChat.tsx`

**Mudanças:**

| Componente | Atual | Novo (Mobile) |
|------------|-------|---------------|
| Play/Pause buttons | `h-8 w-8 sm:h-9 sm:w-9` | `h-11 w-11 sm:h-9 sm:w-9` |
| Navigation arrows | `h-8 w-8` | `h-11 w-11 sm:h-8 sm:w-8` |
| Volume button | `h-8 w-8` | `h-11 w-11 sm:h-9 sm:w-9` |
| Voice control buttons | `h-10 sm:h-11` | `h-12 sm:h-11` |

**Estratégia:**
- Mobile-first: tamanho maior por padrão
- Desktop: usar `sm:` para reduzir se necessário
- Padding interno adequado para ícones

---

## 3. Gráficos de Progresso no Dashboard

### Situação Atual
O `StudentDashboard.tsx` mostra estatísticas em cards estáticos, sem visualizações gráficas de evolução temporal.

### Implementação

**Arquivo: `src/pages/StudentDashboard.tsx`**

**Novos Gráficos:**

1. **Gráfico de Linha - Progresso ao Longo do Tempo**
   - Eixo X: Datas
   - Eixo Y: % de aulas concluídas
   - Mostrar evolução do curso

2. **Gráfico de Barras - Notas dos Quizzes**
   - Eixo X: Aulas (ordenadas)
   - Eixo Y: Nota (%)
   - Cores: verde (aprovado) / vermelho (reprovado)

3. **Gráfico de Pizza - Taxa de Aprovação**
   - Aprovados vs Reprovados
   - Cores consistentes com o sistema de badges

**Componentes a Usar:**
```typescript
import { 
  ChartContainer, 
  ChartTooltip, 
  ChartTooltipContent 
} from '@/components/ui/chart';
import { 
  LineChart, Line, 
  BarChart, Bar, 
  PieChart, Pie, 
  ResponsiveContainer 
} from 'recharts';
```

**Dados Necessários:**
- Histórico de quiz results com datas
- Timestamps de conclusão de aulas

---

## 4. Sistema Unificado de Badges

### Situação Atual
Badges usam cores inconsistentes:
- Alguns usam `variant="default"` (primary)
- Alguns usam `variant="destructive"` (red)
- Alguns usam classes customizadas

### Implementação

**Arquivo Novo: `src/lib/badge-variants.ts`**

**Sistema de Cores por Significado:**

| Significado | Cor | CSS Variable | Uso |
|-------------|-----|--------------|-----|
| Sucesso | Verde | `--google-green` | Quiz aprovado, aula completa |
| Erro | Vermelho | `--google-red` | Quiz reprovado, erro |
| Alerta | Amarelo | `--google-yellow` | Em progresso, atenção |
| Info | Azul | `--google-blue` | Neutro, timestamps |
| Neutro | Cinza | `--muted` | Secundário |

**Novas Variantes para Badge:**
```typescript
const semanticBadgeVariants = {
  success: "bg-google-green text-white border-transparent",
  error: "bg-google-red text-white border-transparent", 
  warning: "bg-google-yellow text-black border-transparent",
  info: "bg-google-blue text-white border-transparent",
  neutral: "bg-muted text-muted-foreground border-transparent"
}
```

**Arquivos a Atualizar:**
- `src/components/ui/badge.tsx` - Adicionar novas variantes
- `src/pages/StudentDashboard.tsx` - Usar variantes semânticas
- `src/pages/Student.tsx` - Padronizar uso
- `src/components/LessonQuiz.tsx` - Padronizar feedback

---

## 5. Estado de Processamento no VoiceChat

### Situação Atual
O `VoiceChat` mostra apenas dois estados visuais:
- "Ouvindo..." (listening)
- "Falando..." (speaking)

Não há indicador visual quando o agente está processando/pensando após receber input.

### Implementação

**Arquivo: `src/hooks/useGeminiLive.ts`**
- Adicionar estado `isProcessing: boolean`
- Detectar quando mensagem foi enviada mas resposta ainda não chegou

**Arquivo: `src/components/VoiceChat.tsx`**
- Exibir indicador de processamento entre listening e speaking

**Arquivo Novo: `src/components/ProcessingIndicator.tsx`**

```typescript
// Animação de "pensando" com três pontos
export function ProcessingIndicator() {
  return (
    <div className="flex items-center gap-1.5">
      <motion.div 
        className="w-2 h-2 rounded-full bg-primary"
        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1, repeat: Infinity, delay: 0 }}
      />
      <motion.div 
        className="w-2 h-2 rounded-full bg-primary"
        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
      />
      <motion.div 
        className="w-2 h-2 rounded-full bg-primary"
        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
      />
    </div>
  );
}
```

**Lógica de Detecção:**
1. Quando voz do usuário é detectada → `isProcessing = false`
2. Quando transcrição do usuário é enviada → `isProcessing = true`
3. Quando primeira resposta do assistente chega → `isProcessing = false`

**UI no VoiceChat:**
```text
Estado conectado:
+---------------------+
| [Ouvindo...] |||    |  ← Microfone ativo
+---------------------+

Estado processando:
+---------------------+
| [Pensando...] ● ● ● |  ← Após usuário falar
+---------------------+

Estado falando:
+---------------------+
| [Falando...] |||    |  ← Resposta em áudio
+---------------------+
```

---

## Ordem de Implementação Recomendada

1. **Sistema de Badges** (base para outras melhorias)
2. **Touch Targets** (mudanças simples e impactantes)
3. **Estado de Processamento** (melhora UX imediata)
4. **Timeline no Player** (feature visual importante)
5. **Gráficos no Dashboard** (enriquecimento de dados)

---

## Seção Técnica

### Arquivos Criados
- `src/lib/badge-variants.ts`
- `src/components/ProcessingIndicator.tsx`
- `src/components/VideoTimeline.tsx`

### Arquivos Modificados
- `src/components/ui/badge.tsx`
- `src/components/VideoPlayer.tsx`
- `src/components/VoiceChat.tsx`
- `src/components/VoiceIndicator.tsx`
- `src/hooks/useGeminiLive.ts`
- `src/pages/Student.tsx`
- `src/pages/StudentDashboard.tsx`

### Dependências
Nenhuma nova dependência necessária - Recharts já está instalado.

### Considerações de Acessibilidade
- Touch targets de 44px seguem WCAG 2.1 guidelines
- Cores de badges terão contraste adequado
- Timeline terá labels acessíveis via aria-labels
