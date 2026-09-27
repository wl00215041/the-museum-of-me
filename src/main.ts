import './ui/styles.css';
import { mountSetupForm } from './ui/setup-form';

const setup = document.getElementById('setup');
if (!setup) throw new Error('#setup is missing from index.html');
mountSetupForm(setup, (input) => {
  console.info('setup', JSON.stringify({ ...input, photos: input.photos.map((f) => f.name), music: input.music?.name ?? null }));
});
