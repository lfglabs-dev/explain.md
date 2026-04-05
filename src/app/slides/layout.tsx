export default function SlidesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen w-screen overflow-hidden bg-white text-foreground">
      {children}
    </div>
  );
}
