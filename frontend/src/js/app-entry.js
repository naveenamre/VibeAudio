import { ensureSignedInOrRedirect } from './auth.js';

async function bootApp() {
    try {
        await ensureSignedInOrRedirect('../../index.html');
        await import('./ui.js');
    } catch (error) {
        console.error('Unable to boot VibeAudio app shell.', error);
        window.location.replace('../../index.html');
    }
}

bootApp();
