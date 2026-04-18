import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@ui/lib/queryClient";
import { TooltipProvider } from "@ui/components/ui/tooltip";
import { Toaster } from "@ui/components/ui/toaster";
import FrontOfficeRouter from "./routes";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <FrontOfficeRouter />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
