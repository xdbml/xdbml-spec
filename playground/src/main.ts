// Monaco environment must be set up BEFORE any code that creates a
// Monaco editor. This module configures the worker factory to use
// only the base editor worker (skipping the JSON/TS/CSS/HTML language
// workers we don't need) and shaves ~200 KB off the bundle.
import './components/editor/monaco-environment';

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './styles/main.css';

const app = createApp(App);
app.use(createPinia());
app.mount('#app');
