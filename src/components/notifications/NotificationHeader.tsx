import { cn } from "@/src/lib/utils";
import type { ComponentClassNames } from "./types";
import { Button } from "@/src/ui/button";
import { LogOutIcon } from "lucide-react";

interface NotificationHeaderProps {
  projectName?: string;
  projectLogo?: string;
  projectLogoDark?: string;
  description: string | null;
  className?: ComponentClassNames;
  onLogout?: () => void;
}

export function NotificationHeader({
  projectName,
  projectLogo,
  projectLogoDark,
  description,
  className,
  onLogout,
}: NotificationHeaderProps) {
  return (
    <>
      {projectLogo != null ||
        (projectName != null && (
          <h2
            className={cn(
              "flex max-w-44 items-center gap-3 text-lg font-medium text-black sm:max-w-none md:text-xl lg:text-2xl xl:text-3xl dark:text-neutral-100",
              className?.headerTitle
            )}
          >
            {projectLogo != null && (
              <>
                <img
                  src={projectLogo}
                  alt=""
                  className={cn(
                    "h-12 w-auto dark:hidden",
                    className?.headerLogo
                  )}
                />
                <img
                  src={projectLogoDark ?? projectLogo}
                  alt=""
                  className={cn(
                    "hidden h-12 w-auto dark:inline",
                    className?.headerLogo
                  )}
                />
              </>
            )}
            <span>{projectName}</span>
          </h2>
        ))}
      <div className="flex items-center gap-2">
        {description && (
          <p
            className={cn(
              "mt-4 font-medium text-left",
              className?.headerDescription
            )}
          >
            {description}
          </p>
        )}
        <div className="grow"></div>
        {onLogout && (
          <Button variant="ghost" size="icon-sm" onClick={onLogout}>
            <LogOutIcon className="h-5 w-5" />
          </Button>
        )}
      </div>
    </>
  );
}
