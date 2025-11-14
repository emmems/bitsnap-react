import { cn } from "../../lib/utils";
import { TriangleAlertIcon, XIcon } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { Button } from "@/src/ui/button";

interface UnsubscribeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    isDeleting?: boolean;
}

export function UnsubscribeDialog({
    open,
    onOpenChange,
    onConfirm,
    isDeleting = false,
}: UnsubscribeDialogProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    useEffect(() => {
        if (open) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [open]);

    if (!mounted || !open) {
        return null;
    }

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
            onOpenChange(false);
        }
    };

    const handleConfirm = () => {
        onConfirm();
    };

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
            onClick={handleBackdropClick}
        >
            <div
                className={cn(
                    "relative w-full max-w-md rounded-2xl bg-white p-6 shadow-lg",
                    "dark:bg-neutral-800",
                    "animate-in fade-in-0 zoom-in-95 duration-200"
                )}
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={() => onOpenChange(false)}
                    className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-neutral-950 focus:ring-offset-2 disabled:pointer-events-none dark:ring-offset-neutral-950 dark:focus:ring-neutral-300"
                    disabled={isDeleting}
                >
                    <XIcon className="h-4 w-4" />
                    <span className="sr-only">Zamknij</span>
                </button>

                <div className="flex flex-col gap-4">
                    <div className="flex items-start gap-3">
                        <div className="flex-shrink-0">
                            <TriangleAlertIcon
                                className="h-6 w-6 text-amber-500"
                                aria-hidden="true"
                            />
                        </div>
                        <div className="flex-1">
                            <h2 className="text-lg font-semibold text-black dark:text-neutral-100">
                                Czy na pewno chcesz się wypisać?
                            </h2>
                        </div>
                    </div>

                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        Kliknięcie tego przycisku spowoduje wypisanie z wszelkich
                        powiadomień i grup, które zapisałeś.
                    </p>

                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                            disabled={isDeleting}
                            className="sm:min-w-[100px]"
                        >
                            Anuluj
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={handleConfirm}
                            disabled={isDeleting}
                            className={cn(
                                isDeleting && "cursor-not-allowed text-transparent",
                                "relative sm:min-w-[100px]"
                            )}
                        >
                            Usuń
                            {isDeleting && (
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                </div>
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
