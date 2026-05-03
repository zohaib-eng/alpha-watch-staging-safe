import { Providers } from './providers';

export const metadata = { title: "Alpha Watch" };

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body style={{margin:0,fontFamily:"Inter,Arial,sans-serif",background:"#020617",color:"#e2e8f0"}}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
