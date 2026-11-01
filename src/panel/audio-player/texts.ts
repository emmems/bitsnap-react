import { getLocale } from "../../components/checkout/locale";
import { useEffect, useState } from "react";

const pl = {
  play: "Odtwórz",
  pause: "Wstrzymaj",
  previous: "Poprzedni rozdział",
  next: "Następny rozdział",
  rewind: "Cofnij o 10 sekund",
  forward: "Przewiń o 10 sekund",
  progress: "Postęp odtwarzania",
  of: "z",
  speed: "Prędkość",
  sleep: "Wyłącznik czasowy",
  off: "Wyłączony",
  end: "Koniec rozdziału",
  cancel: "Anuluj wyłącznik",
  error: "Nie udało się odtworzyć nagrania.",
  retry: "Spróbuj ponownie",
  left: "zostało",
  book: "cała książka",
  chapter: "rozdział",
  chapters: "Rozdziały",
  loading: "Ładowanie rozdziałów…",
  empty: "Brak rozdziałów do wyświetlenia.",
  resume: "Kontynuuj",
  chapterName: "Rozdział",
  download: "Pobierz rozdział",
  playing: "Teraz odtwarzane",
  played: "Odsłuchane",
};
const en: typeof pl = {
  play: "Play",
  pause: "Pause",
  previous: "Previous chapter",
  next: "Next chapter",
  rewind: "Rewind 10 seconds",
  forward: "Forward 10 seconds",
  progress: "Playback progress",
  of: "of",
  speed: "Speed",
  sleep: "Sleep timer",
  off: "Off",
  end: "End of chapter",
  cancel: "Cancel timer",
  error: "The recording could not be played.",
  retry: "Try again",
  left: "left",
  book: "whole book",
  chapter: "chapter",
  chapters: "Chapters",
  loading: "Loading chapters…",
  empty: "No chapters to display.",
  resume: "Continue",
  chapterName: "Chapter",
  download: "Download chapter",
  playing: "Now playing",
  played: "Played",
};
export function useAudioTexts(locale?: string) {
  // Storage is consulted only after mount, including when rendered on the server.
  const [deviceLocale, setDeviceLocale] = useState("pl");
  useEffect(() => {
    try {
      setDeviceLocale(getLocale());
    } catch {
      /* Storage may be disabled. */
    }
  }, []);
  return (locale ?? deviceLocale).toLowerCase().startsWith("en") ? en : pl;
}
export function formatTime(value: number) {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `${seconds >= 3600 ? `${Math.floor(seconds / 3600)}:` : ""}${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
