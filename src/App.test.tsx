import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import App from './App';

// Mock all page components
vi.mock('./pages/Admin', () => ({
  default: () => <div data-testid="admin-page">Admin Page</div>,
}));

vi.mock('./pages/Student', () => ({
  default: () => <div data-testid="student-page">Student Page</div>,
}));

vi.mock('./pages/StudentDashboard', () => ({
  default: () => <div data-testid="student-dashboard">Student Dashboard</div>,
}));

vi.mock('./pages/NotFound', () => ({
  default: () => <div data-testid="not-found">Not Found</div>,
}));

vi.mock('./components/DebugPanel', () => ({
  default: () => null,
}));

describe('App Routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects root path to /aluno', async () => {
    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByTestId('student-page')).toBeInTheDocument();
    });
  });
});

describe('App Navigation', () => {
  it('renders the app without crashing', () => {
    render(<App />);
    // If it renders, the test passes
    expect(document.body).toBeDefined();
  });
});
