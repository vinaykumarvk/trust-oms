import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@ui/lib/queryClient";
import { Toaster } from "@ui/components/ui/toaster";
import { ErrorBoundary } from "@ui/components/ui/error-boundary";
import { RouterProvider } from "react-router-dom";
import { router } from "@/routes";

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Toaster />
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
