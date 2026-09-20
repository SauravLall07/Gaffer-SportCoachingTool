import { FaFutbol, FaHandPaper, FaShieldAlt } from "react-icons/fa";
import { GiSoccerKick } from "react-icons/gi";
import { cn } from "@/lib/utils";

export function SoccerBallIcon({ className }: { className?: string }) {
  return (
    <FaFutbol
      className={cn("shrink-0", className)}
      aria-hidden
    />
  );
}

export function BootIcon({ className }: { className?: string }) {
  return (
    <GiSoccerKick
      className={cn("shrink-0", className)}
      aria-hidden
    />
  );
}

export function SaveIcon({ className }: { className?: string }) {
  return (
    <FaHandPaper
      className={cn("shrink-0", className)}
      aria-hidden
    />
  );
}

export function TackleIcon({ className }: { className?: string }) {
  return (
    <FaShieldAlt
      className={cn("shrink-0", className)}
      aria-hidden
    />
  );
}
