export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: "-apple-system,Segoe UI,sans-serif", background: "#f5f6f8" }}>
        {children}
      </body>
    </html>
  );
}
