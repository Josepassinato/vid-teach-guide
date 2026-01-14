import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import { LessonQuiz } from './LessonQuiz';
import { mockQuizQuestions } from '@/test/mocks/videos';

const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}));

describe('LessonQuiz Component', () => {
  const defaultProps = {
    videoId: 'video-1',
    studentId: 'student-1',
    onQuizComplete: vi.fn(),
    passingScore: 70,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockFrom.mockImplementation((table: string) => {
      if (table === 'video_quizzes') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: mockQuizQuestions, error: null })),
            })),
          })),
        };
      }
      if (table === 'student_quiz_results') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
                })),
              })),
            })),
          })),
          insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
        };
      }
      if (table === 'student_quiz_attempts') {
        return {
          insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
        };
      }
      return {
        select: vi.fn(() => Promise.resolve({ data: [], error: null })),
      };
    });
  });

  it('shows loading state initially', () => {
    render(<LessonQuiz {...defaultProps} />);
    
    // Should show loading indicator
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders quiz questions after loading', async () => {
    render(<LessonQuiz {...defaultProps} />);
    
    await waitFor(() => {
      expect(screen.getByText('Qual é o principal conceito da aula?')).toBeInTheDocument();
    });
  });

  it('displays quiz progress indicator', async () => {
    render(<LessonQuiz {...defaultProps} />);
    
    await waitFor(() => {
      expect(screen.getByText(/Questão 1 de 2/i)).toBeInTheDocument();
    });
  });

  it('allows selecting an answer', async () => {
    const user = userEvent.setup();
    render(<LessonQuiz {...defaultProps} />);
    
    await waitFor(() => {
      expect(screen.getByText('Opção A')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Opção A'));
    
    // The option should be selected (visual feedback)
    const optionButton = screen.getByText('Opção A').closest('button');
    expect(optionButton).toHaveClass('ring-2');
  });

  it('navigates between questions', async () => {
    const user = userEvent.setup();
    render(<LessonQuiz {...defaultProps} />);
    
    await waitFor(() => {
      expect(screen.getByText('Qual é o principal conceito da aula?')).toBeInTheDocument();
    });

    // Select an answer first
    await user.click(screen.getByText('Opção A'));
    
    // Click next
    const nextButton = screen.getByText('Próxima');
    await user.click(nextButton);
    
    await waitFor(() => {
      expect(screen.getByText('Qual alternativa melhor descreve o tema?')).toBeInTheDocument();
    });
  });

  it('calls onQuizComplete when quiz is submitted', async () => {
    const onQuizComplete = vi.fn();
    const user = userEvent.setup();
    
    render(<LessonQuiz {...defaultProps} onQuizComplete={onQuizComplete} />);
    
    await waitFor(() => {
      expect(screen.getByText('Opção A')).toBeInTheDocument();
    });

    // Answer first question
    await user.click(screen.getByText('Opção A'));
    await user.click(screen.getByText('Próxima'));
    
    // Answer second question
    await waitFor(() => {
      expect(screen.getByText('Alternativa 3')).toBeInTheDocument();
    });
    
    await user.click(screen.getByText('Alternativa 3'));
    
    // Submit quiz
    const submitButton = screen.getByText('Finalizar Quiz');
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(onQuizComplete).toHaveBeenCalled();
    });
  });
});

describe('LessonQuiz - No Questions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    mockFrom.mockImplementation((table: string) => {
      if (table === 'video_quizzes') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        };
      }
      if (table === 'student_quiz_results') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
                })),
              })),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => Promise.resolve({ data: [], error: null })),
      };
    });
  });

  it('shows message when no quiz available', async () => {
    render(<LessonQuiz videoId="video-1" studentId="student-1" onQuizComplete={vi.fn()} />);
    
    await waitFor(() => {
      expect(screen.getByText('Nenhum quiz disponível para esta aula.')).toBeInTheDocument();
    });
  });
});
