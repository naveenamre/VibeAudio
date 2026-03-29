import { ensureSignedInOrRedirect } from './auth.js';

async function bootApp() {
    try {
        if (!navigator.onLine) {
            if (window.location.hash !== '#offline') {
                window.location.replace(`${window.location.pathname}#offline`);
                return;
            }

            await import('./ui.js');
            return;
        }

        await ensureSignedInOrRedirect('../../index.html');
        await import('./ui.js');
    } catch (error) {
        console.error('Unable to boot VibeAudio app shell.', error);
        if (!navigator.onLine) {
            await import('./ui.js');
            return;
        }
        window.location.replace('../../index.html');
    }
}

bootApp();
