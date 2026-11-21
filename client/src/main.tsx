import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import './index.css';
import { ChampionsPage } from './pages/ChampionsPage';
import { GaragePage } from './pages/GaragePage';
import { HomePage } from './pages/HomePage';
import { PitCrewPage } from './pages/PitCrewPage';
import { RacePage } from './pages/RacePage';
import { ReplayPlayerPage, ReplaysPage } from './pages/ReplaysPage';
import { SettingsPage } from './pages/SettingsPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="garage" element={<GaragePage />} />
          <Route path="race" element={<RacePage />} />
          <Route path="champions" element={<ChampionsPage />} />
          <Route path="replays" element={<ReplaysPage />} />
          <Route path="replays/:id" element={<ReplayPlayerPage />} />
          <Route path="pit-crew" element={<PitCrewPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<div className="pt-24 text-center text-white/60">Off track — page not found.</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
