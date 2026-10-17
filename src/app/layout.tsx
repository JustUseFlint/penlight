import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/bricolage-grotesque';
import './globals.css';
import { AppProvider } from '@/components/AppContext';
import { Shell } from '@/components/Shell';

export const metadata: Metadata = {
  title: { default: 'Penlight: study smarter for nursing school', template: '%s · Penlight' },
  description: 'Paste a lecture link and get a study guide, flashcards, NCLEX/TEAS-style practice, and learning games. Built for aspiring nurses.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0E8579' };

const themeInit = `try{var t=localStorage.getItem('penlight_theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInit }} /></head>
      <body>
        <AppProvider><Shell>{children}</Shell></AppProvider>
      </body>
    </html>
  );
}
