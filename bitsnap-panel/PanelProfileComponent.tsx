import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

interface PanelProfileComponentProps {
  email: string | null;
  logout: () => void;
}

function PanelProfileComponent({ email, logout }: PanelProfileComponentProps) {
  return (
    <>
      <h3 className="text-2xl">Profil</h3>
      <div className="mt-6 flex-1 md:flex-none">
        <span className="text-sm text-neutral-500">Email</span>
        <p className="mt-2 text-base">{email ? email : "Brak danych"}</p>
      </div>
      <div className="flex w-full flex-col items-center space-y-2">
        <Button onClick={logout} className="max-w-64 md:hidden">
          <LogOut className="mr-2" width={16} height={16} />
          <p className="text-medium inline text-center">Wyloguj się</p>
        </Button>
        {/* <Button
          onClick={() => alert("Pracujemy nad tą funkcją.")}
          variant={null}
          className="font-medium text-red-600"
        >
          Usuń swoje konto
        </Button> */}
      </div>
    </>
  );
}

export default PanelProfileComponent;
