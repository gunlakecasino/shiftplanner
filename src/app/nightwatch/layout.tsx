import type { Metadata } from 'next';
import { Barlow, PT_Serif } from 'next/font/google';
import './nightwatch.css';

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--nw-font-barlow',
  display: 'swap',
});

const ptSerif = PT_Serif({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--nw-font-ptserif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Nightwatch — GLCR Grave Shift Journal',
  description: 'Gun Lake Casino Resort grave shift operations journal',
};

export default function NightwatchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${barlow.variable} ${ptSerif.variable}`}
      style={{
        ['--font-display' as string]: `var(--nw-font-barlow), 'Century Gothic', 'Helvetica Neue', sans-serif`,
        ['--font-body' as string]:    `var(--nw-font-barlow), 'Century Gothic', 'Helvetica Neue', sans-serif`,
        ['--font-serif' as string]:   `var(--nw-font-ptserif), 'Garamond', Georgia, serif`,
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--nw-bg)',
      }}
    >
      {children}
    </div>
  );
}
