import type { ReactNode } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

const webScrollbarCss = `
  html,
  body,
  #root {
    background: #05070A;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  * {
    scrollbar-width: none !important;
    -ms-overflow-style: none !important;
  }

  *::-webkit-scrollbar {
    width: 0 !important;
    height: 0 !important;
    display: none !important;
    background: transparent !important;
  }

  *::-webkit-scrollbar-track,
  *::-webkit-scrollbar-track-piece,
  *::-webkit-scrollbar-thumb,
  *::-webkit-scrollbar-button,
  *::-webkit-scrollbar-button:single-button,
  *::-webkit-scrollbar-corner {
    width: 0 !important;
    height: 0 !important;
    display: none !important;
    background: transparent !important;
    border: 0 !important;
  }
`;

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: webScrollbarCss }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
