import { cn } from "@/lib/utils";
import { RIDE_STATUS_CONFIG } from "@/lib/utils";
import { RideStatus } from "@/types/database";
import { Check } from "lucide-react";

interface StatusTimelineProps {
  currentStatus: RideStatus;
}

const TIMELINE_STEPS: RideStatus[] = [
  "requested",
  "assigned",
  "driver_en_route",
  "arrived_at_pickup",
  "in_transit",
  "arrived_at_dropoff",
  "completed",
];

export function StatusTimeline({ currentStatus }: StatusTimelineProps) {
  // Handle terminal statuses
  if (currentStatus === "cancelled" || currentStatus === "no_show") {
    const config = RIDE_STATUS_CONFIG[currentStatus];
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50">
        <div className="h-6 w-6 rounded-full bg-[#E11900] flex items-center justify-center">
          <span className="text-white text-xs font-bold">!</span>
        </div>
        <span className="text-sm font-medium text-red-700">
          {config.label}
        </span>
      </div>
    );
  }

  const currentIndex = TIMELINE_STEPS.indexOf(currentStatus);

  return (
    <div className="flex items-center w-full">
      {TIMELINE_STEPS.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const config = RIDE_STATUS_CONFIG[step];

        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            {/* Step dot */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium border-2 transition-colors",
                  isCompleted &&
                    "bg-black border-black text-white",
                  isCurrent &&
                    "bg-white border-black text-black",
                  !isCompleted &&
                    !isCurrent &&
                    "bg-white border-gray-200 text-gray-400"
                )}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  "mt-1.5 text-[10px] font-medium whitespace-nowrap",
                  isCompleted && "text-gray-900",
                  isCurrent && "text-black font-semibold",
                  !isCompleted && !isCurrent && "text-gray-400"
                )}
              >
                {config.label}
              </span>
            </div>

            {/* Connector line */}
            {index < TIMELINE_STEPS.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-1 mt-[-18px]",
                  index < currentIndex ? "bg-black" : "bg-gray-200"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
