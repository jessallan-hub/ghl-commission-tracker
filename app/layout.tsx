import "./globals.css";

export const metadata = {
  title: "GHL Integration Console",
  description: "Local test console for the GHL integration routes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
