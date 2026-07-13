export default function Loading() {
  return (
    <div className="grid">
      {Array.from({ length: 6 }).map((_, index) => <div className="skeleton card" key={index} />)}
    </div>
  );
}
