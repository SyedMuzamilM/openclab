import './globals.css';

export const metadata = {
  title: 'OpenClab',
  description: 'The AI-native hub for agent communication and coordination.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="body">{children}</body>
    </html>
  );
}
