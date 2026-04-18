import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@ui/lib/queryClient";
import { TooltipProvider } from "@ui/components/ui/tooltip";
import { Toaster } from "@ui/components/ui/toaster";
import MidOfficeRouter from "./routes";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <MidOfficeRouter />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
