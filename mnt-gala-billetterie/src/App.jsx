import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import EventChooser from './pages/EventChooser';
import ClientFlow from './pages/ClientFlow';
import Admin from './pages/Admin';
import ControlPage from './pages/ControlPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/*" element={<Admin />} />
        <Route path="/controle" element={<ControlPage />} />
        <Route path="/samedi/r/:transactionId" element={<ClientFlow eventId="samedi" />} />
        <Route path="/samedi" element={<ClientFlow eventId="samedi" />} />
        <Route path="/dimanche/r/:transactionId" element={<ClientFlow eventId="dimanche" />} />
        <Route path="/dimanche" element={<ClientFlow eventId="dimanche" />} />
        <Route path="/" element={<EventChooser />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
