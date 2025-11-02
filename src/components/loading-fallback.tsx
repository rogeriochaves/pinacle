import { Loader2 } from "lucide-react";

type LoadingFallbackProps = {
  message?: string;
};

export const LoadingFallback = ({ message = "Loading..." }: LoadingFallbackProps) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-orange-500" />
        <h2 className="text-xl font-semibold text-white mb-2 font-mono">
          {message}
        </h2>
      </div>
    </div>
  );
};

