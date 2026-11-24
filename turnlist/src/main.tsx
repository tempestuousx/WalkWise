import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/manrope';
import './styles/index.css';
import App from './App';
import { AuthProvider } from './lib/auth';
import { ToastProvider } from './lib/toast';
import { ApiError, appMode, demoApi } from './data';
import SetupRequired from './pages/public/SetupRequired';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (count, err) => count < 2 && !(err instanceof ApiError && ['forbidden', 'not_found', 'unauthenticated', 'invalid'].includes(err.code)),
    },
  },
});

// Demo mode runs the same housekeeping the database schedules (expiry, reminders).
void demoApi?.runMaintenance();

const root = createRoot(document.getElementById('root')!);
if (appMode === 'unconfigured') root.render(<SetupRequired />);
else root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
