import { useAutoAnimate } from "@formkit/auto-animate/react";
import { LogOut } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../../ui/button";
import type { GetThemeOutput } from "../types";

import type { PanelScreen } from "../types";

interface PanelProductHeaderComponentProps {
  activeScreen: PanelScreen;
  setActiveScreen: (screen: PanelScreen) => void;
  setParams: (params: { product?: string; state: PanelScreen }) => void;
  styles: CSSProperties;
  theme?: GetThemeOutput;
  logout: () => void;
}

function PanelProductHeaderComponent({
  activeScreen,
  setActiveScreen,
  setParams,
  styles,
  theme,
  logout,
}: PanelProductHeaderComponentProps) {
  return (
    <header className="md:border-r-neutral-150 md:bg-beige-50 fixed right-0 bottom-0 left-0 z-10 flex h-12 w-full items-center bg-neutral-800 md:static md:z-0 md:min-h-screen md:w-auto md:border-r dark:md:border-r-neutral-900">
      <MobileMenu
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        setParams={setParams}
      />

      <SidebarMenu
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        setParams={setParams}
        theme={theme}
        logout={logout}
      />
    </header>
  );
}

export default PanelProductHeaderComponent;

interface MobileMenuProps {
  activeScreen: PanelScreen;
  setActiveScreen: (screen: PanelScreen) => void;
  setParams: (params: { product?: string; state: PanelScreen }) => void;
}

function MobileMenu({
  activeScreen,
  setActiveScreen,
  setParams,
}: MobileMenuProps) {
  return (
    <nav className="flex w-full items-center justify-evenly gap-4 md:hidden">
      <MobileButton
        panelScreen="products"
        label="Produkty"
        imageURL="/icons/bitsnap-24x24.svg"
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        setParams={setParams}
      />

      <MobileButton
        panelScreen="orders"
        label="Faktury"
        imageURL="/icons/category-24x24.svg"
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        setParams={setParams}
      />

      <MobileButton
        panelScreen="profile"
        label="Profil"
        imageURL="/icons/profile-24x24.svg"
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        setParams={setParams}
      />
    </nav>
  );
}

interface MobileButtonProps {
  panelScreen: PanelScreen;
  label: string;
  imageURL: string;
  activeScreen: PanelScreen;
  setActiveScreen: (screen: PanelScreen) => void;
  setParams: (params: { product?: string; state: PanelScreen }) => void;
}

function MobileButton({
  panelScreen,
  label,
  imageURL,
  activeScreen,
  setActiveScreen,
  setParams,
}: MobileButtonProps) {
  return (
    <Button
      onClick={() => {
        setActiveScreen(panelScreen);
        setParams({
          product: undefined,
          state: panelScreen,
        });
      }}
      aria-label={label}
      variant={null}
      className={cn(
        "flex flex-col gap-0",
        activeScreen === panelScreen ? "opacity-100" : "opacity-50",
      )}
    >
      <img src={imageURL} alt={label} className="scale-75" />
      <span className="text-xs font-normal text-white">{label}</span>
    </Button>
  );
}

interface SidebarButtonProps {
  panelScreen: PanelScreen;
  label: string;
  imageURL: string;
  darkImageURL: string;
  activeScreen: PanelScreen;
  setActiveScreen: (screen: PanelScreen) => void;
  setParams: (params: { product?: string; state: PanelScreen }) => void;
  isExpanded: boolean;
}

function SidebarButton({
  panelScreen,
  label,
  imageURL,
  darkImageURL,
  activeScreen,
  setActiveScreen,
  setParams,
  isExpanded,
}: SidebarButtonProps) {
  return (
    <Button
      onClick={() => {
        setActiveScreen(panelScreen);
        setParams({
          product: undefined,
          state: panelScreen,
        });
      }}
      variant={activeScreen === panelScreen ? "secondary" : "ghost"}
      className="justify-start"
    >
      <img
        src={imageURL}
        alt={label}
        className={cn(
          "aspect-auto h-5 w-5 dark:hidden",
          isExpanded ? "mr-4" : "mr-2",
        )}
      />
      <img
        src={darkImageURL}
        alt={label}
        className={cn(
          "hidden aspect-auto h-5 w-5 dark:inline",
          isExpanded ? "mr-4" : "mr-2",
        )}
      />
      {isExpanded && (
        <span className="md:text-medium hidden md:inline">{label}</span>
      )}
    </Button>
  );
}

interface SidebarMenuProps {
  activeScreen: PanelScreen;
  setActiveScreen: (screen: PanelScreen) => void;
  setParams: (params: { product?: string; state: PanelScreen }) => void;
  theme?: GetThemeOutput;
  logout: () => void;
}

function SidebarMenu({
  activeScreen,
  setActiveScreen,
  setParams,
  theme,
  logout,
}: SidebarMenuProps) {
  const [sidebarExpandRef] = useAutoAnimate();
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div
      ref={sidebarExpandRef}
      className={cn(
        "hidden px-4 pt-4 pb-12 md:flex md:h-full md:flex-col dark:bg-neutral-900",
        isExpanded ? "md:w-52" : "md:w-16",
      )}
    >
      <div className="flex items-center justify-between">
        <CompanyLogo theme={theme} isExpanded={isExpanded} />
      </div>

      <SidebarSeparator className="my-6" />

      <div className="flex flex-1 flex-col gap-2">
        <SidebarButton
          panelScreen="products"
          label="Produkty"
          imageURL="/icons/bitsnap-dark-24x24.svg"
          darkImageURL="/icons/bitsnap-24x24.svg"
          activeScreen={activeScreen}
          setActiveScreen={setActiveScreen}
          setParams={setParams}
          isExpanded={isExpanded}
        />

        <SidebarButton
          panelScreen="orders"
          label="Zamówienia"
          imageURL="/icons/category-dark-24x24.svg"
          darkImageURL="/icons/category-24x24.svg"
          activeScreen={activeScreen}
          setActiveScreen={setActiveScreen}
          setParams={setParams}
          isExpanded={isExpanded}
        />

        <SidebarButton
          panelScreen="profile"
          label="Profil"
          imageURL="/icons/profile-dark-24x24.svg"
          darkImageURL="/icons/profile-24x24.svg"
          activeScreen={activeScreen}
          setActiveScreen={setActiveScreen}
          setParams={setParams}
          isExpanded={isExpanded}
        />
      </div>

      <SidebarSeparator className="mb-6" />

      <Button onClick={logout}>
        <LogOut className="mr-2" width={16} height={16} />
        {isExpanded && (
          <p className="md:text-medium hidden md:inline md:text-center">
            Wyloguj się
          </p>
        )}
      </Button>
    </div>
  );
}

interface SidebarSeparatorProps extends React.HTMLAttributes<HTMLDivElement> {}

function SidebarSeparator({ className }: SidebarSeparatorProps) {
  return (
    <div className={cn("relative h-px w-full bg-neutral-300", className)}>
      <div className="absolute -top-px left-0 h-1 w-1 rounded-full bg-neutral-500"></div>
      <div className="absolute -top-px right-0 h-1 w-1 rounded-full bg-neutral-500"></div>
    </div>
  );
}

interface CompanyLogoProps {
  theme?: GetThemeOutput;
  isExpanded: boolean;
}

function CompanyLogo({ theme, isExpanded }: CompanyLogoProps) {
  return (
    <>
      {theme == null && (
        <p className="text-xl tracking-wider md:inline dark:text-neutral-200">
          bitsnap.
        </p>
      )}
      {(theme?.logoDarkURL || theme?.logoURL) && (
        <img
          src={theme.logoDarkURL ?? theme.logoURL}
          alt="Company Logo"
          className="hidden h-6 w-6 dark:inline"
          draggable={false}
        />
      )}

      {theme?.logoURL && (
        <img
          src={theme.logoURL}
          alt="Company Logo"
          className="h-6 w-6 dark:hidden"
          draggable={false}
        />
      )}
    </>
  );
}
