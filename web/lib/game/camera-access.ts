export type CameraIssue = {
  kind:
    | 'permission'
    | 'missing'
    | 'busy'
    | 'insecure'
    | 'unsupported'
    | 'other';
  title: string;
  message: string;
};

export function cameraIssue(error: unknown): CameraIssue {
  const name =
    error && typeof error === 'object' && 'name' in error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError')
    return {
      kind: 'permission',
      title: 'Allow camera access',
      message:
        'Camera access wasn’t allowed. If no prompt appears, check the site and system permissions below, then try again.',
    };
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError')
    return {
      kind: 'missing',
      title: 'No camera found',
      message:
        'Connect or enable a camera, then try again. In Chrome, you can choose a camera in Settings → Privacy and security → Site settings → Camera.',
    };
  if (
    name === 'NotReadableError' ||
    name === 'TrackStartError' ||
    name === 'AbortError'
  )
    return {
      kind: 'busy',
      title: 'The camera couldn’t open',
      message:
        'Close other apps or tabs using the camera, check your computer’s camera permission, then try again.',
    };
  return {
    kind: 'other',
    title: 'Camera mode couldn’t start',
    message:
      error instanceof Error ? error.message : 'Try starting the camera again.',
  };
}

type CameraResult = { stream: MediaStream } | { issue: CameraIssue } | null;
export type CameraRequest = {
  result: Promise<CameraResult>;
  cancel: () => void;
};

// Call from the Enable camera click so the browser receives the user gesture.
export function beginCameraRequest({
  secure,
  getUserMedia,
}: {
  secure: boolean;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
}): CameraRequest {
  let cancelled = false;
  let stream: MediaStream | null = null;
  const stopTracks = () => {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  };
  const result = (async (): Promise<CameraResult> => {
    if (!secure)
      return {
        issue: {
          kind: 'insecure',
          title: 'Open a camera-safe address',
          message:
            'Use HTTPS or open the game on localhost on the computer running it. A plain HTTP network address cannot request camera access.',
        },
      };
    if (!getUserMedia)
      return {
        issue: {
          kind: 'unsupported',
          title: 'Camera access isn’t available',
          message:
            'Open the game directly in a current Chrome or Safari browser, then try camera mode again.',
        },
      };
    try {
      stream = await getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 960 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      });
      if (cancelled) {
        stopTracks();
        return null;
      }
      return { stream };
    } catch (error) {
      return cancelled ? null : { issue: cameraIssue(error) };
    }
  })();
  return {
    result,
    cancel() {
      cancelled = true;
      stopTracks();
    },
  };
}
