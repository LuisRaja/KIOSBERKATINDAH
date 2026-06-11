/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html',
    './js/**/*.js',
    './views/**/*.ejs',
  ],
  theme: {
    extend: {
      colors: {
        burgundy: '#4A0E17',
        gold: '#DDA15E',
        whatsapp: '#25D366',
      },
    },
  },
  plugins: [],
}
