// A template (unlike a layout) remounts on every navigation, so each page gets the quick fade-in.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
