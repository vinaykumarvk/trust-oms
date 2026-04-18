import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@ui/lib/queryClient";
import { Toaster } from "@ui/components/ui/toaster";
import { RouterProvider } from "react-router-dom";
import { router } from "@/routes";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster />
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

export default App;
