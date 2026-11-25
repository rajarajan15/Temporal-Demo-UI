import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DemoPage } from './pages/DemoPage';
import { HomePage } from './pages/HomePage';
import { NewCardPage } from './pages/NewCardPage';
import { ReconPage } from './pages/ReconPage';
import { ReconRunPage } from './pages/ReconRunPage';
import { ReissueDetailPage } from './pages/ReissueDetailPage';
import { RequestDetailPage } from './pages/RequestDetailPage';
import { RequestsPage } from './pages/RequestsPage';
import { defaultTenant, isTenant } from './lib/tenant';
import type { ReactNode } from 'react';

function TenantGuard({ children }: { children: ReactNode }) {
  const { tenant } = useParams();
  if (!isTenant(tenant)) return <Navigate to={`/${defaultTenant()}`} replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to={`/${defaultTenant()}`} replace />} />
        <Route
          path="/:tenant"
          element={
            <TenantGuard>
              <Layout />
            </TenantGuard>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="requests" element={<RequestsPage />} />
          <Route path="new" element={<NewCardPage />} />
          <Route path="requests/:id" element={<RequestDetailPage />} />
          <Route path="reissues/:id" element={<ReissueDetailPage />} />
          <Route path="reconciliation" element={<ReconPage />} />
          <Route path="reconciliation/:runId" element={<ReconRunPage />} />
          <Route path="demo" element={<DemoPage />} />
          <Route path="*" element={<Navigate to="." replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
