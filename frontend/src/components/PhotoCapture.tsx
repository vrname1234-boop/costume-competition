import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './ui';

type Facing = 'environment' | 'user';

interface Props {
  /** Called with the captured still, already a JPEG File ready to upload. */
  onCapture: (file: File) => void;
  onCancel: () => void;
  /** Longest edge of the saved image. The server re-encodes anyway. */
  maxEdge?: number;
}

/**
 * Live camera capture for students photographing a costume on a phone.
 *
 * The rear camera is the default because the subject is usually someone else;
 * the switch covers a student photographing themselves in a mirror. Nothing is
 * sent anywhere until they choose to keep the photo, and the camera is stopped
 * the moment this component goes away.
 */
export function PhotoCapture({ onCapture, onCancel, maxEdge = 2000 }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<Facing>('environment');
  const [still, setStill] = useState<{ url: string; file: File } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (still) return;

    let cancelled = false;
    setStarting(true);
    setError(null);

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('unsupported');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1920 } },
        audio: false,
      });
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      stop();
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    };

    void start()
      .catch((err: unknown) => {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : '';
        setError(
          name === 'NotAllowedError'
            ? 'The camera is blocked for this site. Allow camera access in your browser settings, or choose a file instead.'
            : name === 'NotFoundError'
              ? 'No camera was found on this device. Choose a file instead.'
              : 'The camera could not be opened. Choose a file instead.',
        );
      })
      .finally(() => {
        if (!cancelled) setStarting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [facing, still, stop]);

  // Stop the camera on unmount, whatever route the component leaves by.
  useEffect(() => stop, [stop]);

  useEffect(() => {
    if (!still) return;
    return () => URL.revokeObjectURL(still.url);
  }, [still]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    const context = canvas.getContext('2d');
    if (!context) {
      setError('This browser could not save the photo. Choose a file instead.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('This browser could not save the photo. Choose a file instead.');
          return;
        }
        const file = new File([blob], `costume-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
        setStill({ url: URL.createObjectURL(blob), file });
        stop();
      },
      'image/jpeg',
      0.9,
    );
  };

  if (still) {
    return (
      <div className="camera">
        <img className="camera__view" src={still.url} alt="The photo you just took" />
        <div className="button-row">
          <Button onClick={() => onCapture(still.file)}>Use this photo</Button>
          <Button variant="secondary" onClick={() => setStill(null)}>
            Retake
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="camera">
      {error ? (
        <>
          <p className="field__error">{error}</p>
          <div className="button-row">
            <Button variant="secondary" onClick={onCancel}>
              Close camera
            </Button>
          </div>
        </>
      ) : (
        <>
          <video className="camera__view" ref={videoRef} playsInline muted />
          <p className="small muted">
            {starting ? 'Starting the camera…' : 'Fit the whole costume in the frame, then take the photo.'}
          </p>
          <div className="button-row">
            <Button onClick={capture} disabled={starting}>
              Take photo
            </Button>
            <Button
              variant="secondary"
              onClick={() => setFacing((current) => (current === 'environment' ? 'user' : 'environment'))}
              disabled={starting}
            >
              Switch camera
            </Button>
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
