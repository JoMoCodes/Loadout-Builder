import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './design.css';
import { App } from './App';
import { applyLook, readCachedLook } from './shell/display';
import './shell.css';

// Put the last look on screen before anything draws, so there is no flash of the wrong colours.
applyLook(readCachedLook());

const root = document.getElementById('root');
if (!root) throw new Error('The page has no place to draw into.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
