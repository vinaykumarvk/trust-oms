/**
 * Client Portal App Root (Phase 5C)
 *
 * Sets up QueryClientProvider, TooltipProvider, Toaster, and RouterProvider.
 */

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@ui/lib/queryClient";
import { TooltipProvider } from "@ui/components/ui/tooltip";
import { Toaster } from "@ui/components/ui/toaster";
import { RouterProvider } from "react-router-dom";
import { router } from "@/routes";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
