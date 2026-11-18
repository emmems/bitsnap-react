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
  speedLegend: "Prędkość odtwarzania",
  sleep: "Wyłącznik czasowy",
  sleepShort: "Wyłącznik",
  off: "Wyłączony",
  offShort: "wył.",
  end: "Do końca rozdziału",
  endShort: "koniec rozdziału",
  minutes: (minutes: number) => `${minutes} minut`,
  sleepStarted: (label: string) => `Wyłącznik czasowy: ${label}.`,
  sleepStopped: "Wyłącznik czasowy wyłączony.",
  sleepLastMinute: "Odtwarzanie zatrzyma się za minutę.",
  error: "Nie udało się odtworzyć nagrania.",
  streamError: "Odtwarzanie przerwane. Sprawdź połączenie.",
  positionKept: (time: string) => `Pozycja ${time} zostaje zapamiętana.`,
  retry: "Spróbuj ponownie",
  loadingAudio: "Wczytuję nagranie…",
  leftBook: (time: string) => `Zostało ${time}`,
  leftBookAtSpeed: (time: string, speed: string) =>
    `Zostało ${time} przy ${speed}×`,
  leftChapter: (time: string) => `Do końca rozdziału: ${time}`,
  chapterOf: (index: number, count: number) => `Rozdział ${index} z ${count}`,
  chapters: "Rozdziały",
  loading: "Ładowanie rozdziałów…",
  empty: "Brak rozdziałów do wyświetlenia.",
  resume: (index: number, time: string) =>
    `Kontynuuj: rozdział ${index}, ${time}`,
  download: "Pobierz rozdział",
  playing: "Teraz odtwarzany",
  played: "Odsłuchany",
  chapterLeft: (time: string) => `Zostało ${time}`,
  showAll: (count: number) => `Pokaż wszystkie rozdziały (${count})`,
  showLess: "Pokaż mniej",
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
  speedLegend: "Playback speed",
  sleep: "Sleep timer",
  sleepShort: "Sleep",
  off: "Off",
  offShort: "off",
  end: "End of chapter",
  endShort: "end of chapter",
  minutes: (minutes: number) => `${minutes} minutes`,
  sleepStarted: (label: string) => `Sleep timer: ${label}.`,
  sleepStopped: "Sleep timer off.",
  sleepLastMinute: "Playback stops in one minute.",
  error: "The recording could not be played.",
  streamError: "Playback stopped. Check your connection.",
  positionKept: (time: string) => `Your position ${time} is saved.`,
  retry: "Try again",
  loadingAudio: "Loading the recording…",
  leftBook: (time: string) => `${time} left`,
  leftBookAtSpeed: (time: string, speed: string) =>
    `${time} left at ${speed}×`,
  leftChapter: (time: string) => `${time} left in the chapter`,
  chapterOf: (index: number, count: number) => `Chapter ${index} of ${count}`,
  chapters: "Chapters",
  loading: "Loading chapters…",
  empty: "No chapters to display.",
  resume: (index: number, time: string) =>
    `Continue: chapter ${index}, ${time}`,
  download: "Download chapter",
  playing: "Now playing",
  played: "Played",
  chapterLeft: (time: string) => `${time} left`,
  showAll: (count: number) => `Show all chapters (${count})`,
  showLess: "Show less",
};
export type AudioTexts = typeof pl;
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

/** Playback rate as text: `1,25` in Polish, `1.25` in English. */
export function formatRate(rate: number, texts: AudioTexts) {
  const value = String(rate);
  return texts === en ? value : value.replace(".", ",");
}
/** Rounded-up duration as "10 h 10 min" / "26 min". */
export function formatLeft(seconds: number) {
  const minutes = Math.max(0, Math.ceil(seconds / 60));
  const hours = Math.floor(minutes / 60);
  return `${hours > 0 ? `${hours} h ` : ""}${minutes % 60} min`;
}
