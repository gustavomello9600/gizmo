import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import './styles/animations.css';
import { StudioApp } from './components/studio/StudioApp';
import { ProjectorApp } from './components/projector/ProjectorApp';

const params = new URLSearchParams(window.location.search);
const windowType = params.get('window') === 'projector' ? 'projector' : 'studio';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Elemento #root não encontrado');

createRoot(rootElement).render(
  <React.StrictMode>
    {windowType === 'projector' ? <ProjectorApp /> : <StudioApp />}
  </React.StrictMode>,
);
