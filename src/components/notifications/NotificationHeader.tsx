import { cn } from "@/src/lib/utils";
import type { ComponentClassNames } from "./types";

interface NotificationHeaderProps {
    projectName?: string;
    projectLogo?: string;
    projectLogoDark?: string;
    description: string;
    className?: ComponentClassNames;
}

export function NotificationHeader({
    projectName,
    projectLogo,
    projectLogoDark,
    description,
    className,
}: NotificationHeaderProps) {
    return (
        <>
            <h2
                className={cn(
                    "flex max-w-44 items-center gap-3 text-lg font-medium text-black sm:max-w-none md:text-xl lg:text-2xl xl:text-3xl dark:text-neutral-100",
                    className?.headerTitle,
                )}
            >
                {projectLogo != null && (
                    <>
                        <img
                            src={projectLogo}
                            alt=""
                            className={cn("h-12 w-auto dark:hidden", className?.headerLogo)}
                        />
                        <img
                            src={projectLogoDark ?? projectLogo}
                            alt=""
                            className={cn("hidden h-12 w-auto dark:inline", className?.headerLogo)}
                        />
                    </>
                )}
                <span>{projectName}</span>
            </h2>
            <p
                className={cn(
                    "mt-4 text-xs md:text-sm xl:text-sm",
                    className?.headerDescription,
                )}
            >
                {description}
            </p>
        </>
    );
}

