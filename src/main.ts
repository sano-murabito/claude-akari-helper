import './styles/main.css';
import { initApp } from './app';

const root = document.getElementById('app');
if (!root) throw new Error('No #app element found');
initApp(root);
