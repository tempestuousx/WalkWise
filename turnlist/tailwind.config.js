/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    screens: { sm: '640px', md: '768px', lg: '1024px', xl: '1280px' },
    extend: {
      fontFamily: {
        sans: ['"Manrope Variable"', 'Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        navy: { DEFAULT: '#14294B', 700: '#1D355E', 50: '#EEF2F8' },
        ink: { DEFAULT: '#172638', muted: '#5C6B7D', faint: '#7A8797' },
        canvas: { DEFAULT: '#FFFFFF', alt: '#F5F7FA', tint: '#E9F0F5' },
        line: { DEFAULT: '#E4E9EE', strong: '#CBD4DD' },
        teal: { DEFAULT: '#168A80', 700: '#11706A', 50: '#E7F4F2' },
        amber: { DEFAULT: '#E5AD46', 800: '#8A5A06', 50: '#FDF5E6' },
        danger: { DEFAULT: '#B4382F', 50: '#FBEDEC' },
      },
      fontSize: {
        '2xs': ['0.75rem', { lineHeight: '1rem' }],
        display: ['clamp(2.5rem, 6.2vw, 4.75rem)', { lineHeight: '1.02', letterSpacing: '-0.035em' }],
        h1: ['clamp(1.75rem, 3.2vw, 2.375rem)', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
      },
      borderRadius: { card: '14px', ctl: '10px' },
      boxShadow: {
        card: '0 1px 2px rgba(20,41,75,0.04), 0 2px 8px rgba(20,41,75,0.04)',
        lift: '0 2px 4px rgba(20,41,75,0.05), 0 12px 28px -8px rgba(20,41,75,0.14)',
        search: '0 1px 2px rgba(20,41,75,0.05), 0 18px 40px -18px rgba(20,41,75,0.25)',
      },
    },
  },
  plugins: [],
};
