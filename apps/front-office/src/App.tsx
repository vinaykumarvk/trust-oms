import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient, setTokenGetter } from "@ui/lib/queryClient";
import { TooltipProvider } from "@ui/components/ui/tooltip";
import { Toaster } from "@ui/components/ui/toaster";
import { ErrorBoundary } from "@ui/components/ui/error-boundary";
import FrontOfficeRouter from "./routes";

setTokenGetter(async () => localStorage.getItem("trustoms-access-token"));

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <FrontOfficeRouter />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
