export function mediaSessionPlay() {
  if (
    typeof navigator == "undefined" ||
    typeof navigator.mediaSession == "undefined"
  )
    return;
  navigator.mediaSession.playbackState = "playing";
}

export function mediaSessionPause() {
  if (
    typeof navigator == "undefined" ||
    typeof navigator.mediaSession == "undefined"
  )
    return;
  navigator.mediaSession.playbackState = "paused";
}

export function mediaSessionUpdateDurationAndPosition(
  duration: number | undefined,
  currentTime: number | undefined,
) {
  if (
    typeof navigator == "undefined" ||
    typeof navigator.mediaSession == "undefined"
  )
    return;
  if (duration != null && isNaN(duration)) {
    return;
  }
  if (currentTime != null && isNaN(currentTime)) {
    return;
  }
  navigator.mediaSession.setPositionState({
    playbackRate: 1,
    duration: duration,
    position: currentTime,
  });
}

export function startMediaSessionCoordinator(args: {
  title: string;
  artwork?: string;

  action: (details: MediaSessionActionDetails) => void;
}) {
  if (
    typeof navigator == "undefined" ||
    typeof navigator.mediaSession == "undefined"
  )
    return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: args.title,
    artwork: args.artwork
      ? [
          {
            type: "image/png",
            src: args.artwork,
          },
        ]
      : undefined,
  });

  navigator.mediaSession.setActionHandler("play", (e) => {
    args.action(e);
  });
  navigator.mediaSession.setActionHandler("pause", (e) => {
    args.action(e);
  });
  navigator.mediaSession.setActionHandler("stop", (e) => {
    args.action(e);
  });
  navigator.mediaSession.setActionHandler("seekbackward", (e) => {
    args.action(e);
  });
  navigator.mediaSession.setActionHandler("seekforward", (e) => {
    args.action(e);
  });
  navigator.mediaSession.setActionHandler("seekto", (e) => {
    args.action(e);
  });
}

export function stopMediaSessionCoordinator() {
  navigator.mediaSession.metadata = null;
}
