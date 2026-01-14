import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import Student from './Student';
import { mockVideos } from '@/test/mocks/videos';

// Mock supabase with dynamic responses
const mockFrom = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    functions: {
      invoke: vi.fn(() => Promise.resolve({ data: null, error: null })),
    },
  },
}));

describe('Student Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mock responses for different tables
    mockFrom.mockImplementation((table: string) => {
      if (table === 'videos') {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: mockVideos, error: null })),
            eq: vi.fn(() => Promise.resolve({ data: mockVideos, error: null })),
          })),
        };
      }
      if (table === 'student_lesson_progress') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
          upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
        };
      }
      if (table === 'student_profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
          upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
          update: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
        };
      }
      if (table === 'student_observations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
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

  it('renders the page header correctly', async () => {
    render(<Student />);
    
    await waitFor(() => {
      expect(screen.getByText('Sala de Aula')).toBeInTheDocument();
    });
  });

  it('displays loading skeletons while fetching videos', () => {
    render(<Student />);
    
    // Check for loading state (animated skeletons)
    const loadingElements = document.querySelectorAll('.animate-pulse');
    expect(loadingElements.length).toBeGreaterThan(0);
  });

  it('renders video list after loading', async () => {
    render(<Student />);
    
    await waitFor(() => {
      expect(screen.getByText('Aulas')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Aula 1 - Introdução')).toBeInTheDocument();
      expect(screen.getByText('Aula 2 - Conceitos Básicos')).toBeInTheDocument();
    });
  });

  it('shows lesson duration for videos', async () => {
    render(<Student />);
    
    await waitFor(() => {
      expect(screen.getByText('15 min')).toBeInTheDocument();
      expect(screen.getByText('20 min')).toBeInTheDocument();
    });
  });

  it('allows navigation between lessons', async () => {
    const user = userEvent.setup();
    render(<Student />);
    
    await waitFor(() => {
      expect(screen.getByText('Aula 1 - Introdução')).toBeInTheDocument();
    });

    // Find and click next lesson button
    const nextButton = screen.getAllByRole('button').find(
      btn => btn.querySelector('svg.lucide-chevron-right')
    );
    
    if (nextButton) {
      await user.click(nextButton);
    }
  });

  it('displays progress bar when lessons exist', async () => {
    render(<Student />);
    
    await waitFor(() => {
      const progressElement = document.querySelector('[role="progressbar"]');
      expect(progressElement).toBeInTheDocument();
    });
  });

  it('has a link to the student dashboard', async () => {
    render(<Student />);
    
    await waitFor(() => {
      const dashboardLink = screen.getByRole('link', { name: '' });
      expect(dashboardLink).toHaveAttribute('href', '/aluno/dashboard');
    });
  });
});

describe('Student Page - Empty State', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Return empty videos
    mockFrom.mockImplementation((table: string) => {
      if (table === 'videos') {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      };
    });
  });

  it('shows empty state when no videos available', async () => {
    render(<Student />);
    
    await waitFor(() => {
      expect(screen.getByText('Nenhuma aula disponível')).toBeInTheDocument();
    });
  });
});

describe('Student Page - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Simulate API error
    mockFrom.mockImplementation(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ 
          data: null, 
          error: { message: 'Database error' } 
        })),
      })),
    }));
  });

  it('handles API errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    render(<Student />);
    
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    });
    
    consoleSpy.mockRestore();
  });
});
