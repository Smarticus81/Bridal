import { useToast } from "@/hooks/use-toast";

export function useCopyMessage() {
  const { toast } = useToast();
  return async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied to clipboard" });
    } catch {
      window.prompt("Copy this message", text);
    }
  };
}
