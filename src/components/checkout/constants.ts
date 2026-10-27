export const DEFAULT_HOST = "https://bitsnap.pl";
export let HOST = DEFAULT_HOST;

export function setCustomHost(host: string) {
  console.log("setCustomHost", host);
  HOST = host;
}
