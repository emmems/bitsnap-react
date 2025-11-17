export let HOST = "https://bitsnap.pl";

export function setCustomHost(host: string) {
  console.log("setCustomHost", host);
  HOST = host;
}
