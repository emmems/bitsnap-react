export function LoadingIndicator() {
  return (
    <div className="flex items-center gap-2">
      <div className="h-3 w-3 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
      <div className="h-3 w-3 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
      <div className="h-3 w-3 animate-bounce rounded-full bg-current" />
    </div>
  );
}

export default LoadingIndicator;
