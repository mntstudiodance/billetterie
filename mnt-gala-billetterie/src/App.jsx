import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ClientFlow from './pages/ClientFlow';
import Admin from './pages/Admin';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/*" element={<Admin />} />
        <Route path="/r/:transactionId" element={<ClientFlow />} />
        <Route path="/" element={<ClientFlow />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
