import { Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { PageLoading } from './components/PageLoading';
import { AuthProvider } from './lib/auth';
import { ThemeProvider, useTheme } from './lib/theme';
import { router } from './routes';
import 'react-toastify/dist/ReactToastify.css';

function AppShell() {
  const { theme } = useTheme();

  return (
    <AuthProvider>
      <Suspense fallback={<PageLoading />}>
        <RouterProvider router={router} />
      </Suspense>
      <ToastContainer
        autoClose={3500}
        closeOnClick
        newestOnTop
        pauseOnFocusLoss
        pauseOnHover
        position="top-right"
        theme={theme}
      />
    </AuthProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
