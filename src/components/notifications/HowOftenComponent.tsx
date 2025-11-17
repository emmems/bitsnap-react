import { Popover, PopoverContent, PopoverTrigger } from "@/src/ui/popover";
import { ClockIcon } from "lucide-react";

export function HowOftenComponent({ regularity }: { regularity: string }) {
  let text = "";
  switch (regularity) {
    case "rarely":
      text = "rzadko";
      break;
    case "often":
      text = "często";
      break;
    case "very_often":
      text = "codzienne";
      break;
  }

  return (
    <Popover>
      <PopoverTrigger
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <button
          type="button"
          className="flex w-[30%] cursor-help flex-col items-center justify-center text-xs md:w-[25%] xl:w-[20%]"
        >
          <ClockIcon size={12} />
          <span>{text}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="leading-none font-medium">Co to oznacza?</h4>
            <ul className="list-inside list-disc text-sm">
              <li>
                <span className="font-semibold">Rzadko</span> – powiadomienia
                będą wysyłane maksymalnie kilka razy w miesiącu.
              </li>
              <li>
                <span className="font-semibold">Często</span> – powiadomienia
                mogę być wysyłane kilka razy w tygodniu.
              </li>
              <li>
                <span className="font-semibold">Codzienne</span> – powiadomienia
                będą wysyłane nawet codziennie.
              </li>
            </ul>
          </div>
          <div className="grid gap-2"></div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
