const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Building Tailwind CSS...');
execSync('npx tailwindcss -i ./src/input.css -o ./css/tailwind.css --minify', {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..'),
});

console.log('Copying to public/css/tailwind.css...');
fs.cpSync(
  path.resolve(__dirname, '..', 'css', 'tailwind.css'),
  path.resolve(__dirname, '..', 'public', 'css', 'tailwind.css')
);

console.log('CSS build complete!');
