import './global.css';
import ThemeRegistry from './ThemeRegistry';

export const metadata = {
  title: 'Track Planner - Backoffice',
  description: 'Music management system for track planning',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ThemeRegistry>
          {children}
        </ThemeRegistry>
      </body>
    </html>
  );
}
