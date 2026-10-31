/**
 * The interactive 3D viewer. With `scene.three.ts`, the only module that
 * imports `three`, `@react-three/fiber` and `@react-three/drei` (optional peer
 * dependencies). `Model3DShell` loads it with `import()` inside an effect,
 * never during the server render; `test:package` checks that the main and
 * catalog entries never reach it.
 */
import { ContactShadows } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Component,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import {
  AUTO_ROTATE_RESUME_MS,
  AUTO_ROTATE_SPEED,
  CAMERA_FOV,
  STUDIO_LIGHTS,
} from "./constants";
import { fetchModel } from "./fetch-model";
import {
  applyFraming,
  createStudioEnvironment,
  frameModel,
  parseGLB,
  prepareModel,
  type Framing,
  type PreparedModel,
} from "./scene.three";

/** Glide after a drag: the share of speed lost per frame at 60 Hz. */
const DAMPING_PER_60HZ_FRAME = 0.08;

export type Viewer3DProps = {
  url: string;
  /** Draco decoder folder; default: three's decoder on jsDelivr for the installed revision. */
  decoderPath?: string;
  /** Bytes the server reported; the progress total when the response has none. */
  expectedSize: number;
  /** Bumped by the shell on retry; a failed download is not reused. */
  attempt: number;
  /** Rotation may run: on screen, tab visible, no reduced motion. */
  motionAllowed: boolean;
  /** The buyer can drag (on a phone only after a tap, so the page scrolls). */
  interactive: boolean;
  /** Wheel and pinch zoom: full screen and active touch only, so the page keeps its scroll. */
  allowZoom: boolean;
  /** Bumped by "Reset widoku". */
  resetSignal: number;
  onProgress: (loaded: number, total: number) => void;
  /** The first frame with the model is on screen. */
  onLoaded: () => void;
  onError: (error: unknown) => void;
  /** The buyer dragged or zoomed (hides the gesture hint). */
  onInteract: () => void;
  className?: string;
};

/**
 * Downloads and parsed models by URL, shared by every viewer of the page:
 * switching back to a variant does not download again. A download is aborted
 * only when its last viewer is gone, one task later, so a remount (React
 * StrictMode, a parent re-keying the viewer) picks the running download up
 * instead of failing with an AbortError.
 */
type ModelEntry = {
  promise: Promise<PreparedModel>;
  controller: AbortController;
  users: number;
  progress: Set<(loaded: number, total: number) => void>;
  last?: [number, number];
  abortTimer?: ReturnType<typeof setTimeout>;
};

const models = new Map<string, ModelEntry>();

function acquireModel(
  url: string,
  expectedSize: number,
  decoderPath: string | undefined,
  onProgress: (loaded: number, total: number) => void,
): ModelEntry {
  let entry = models.get(url);
  if (entry == null) {
    const controller = new AbortController();
    const created: ModelEntry = {
      controller,
      users: 0,
      progress: new Set(),
      promise: undefined as unknown as Promise<PreparedModel>,
    };
    created.promise = fetchModel(url, {
      signal: controller.signal,
      expectedSize,
      onProgress: (loaded, total) => {
        created.last = [loaded, total];
        for (const listener of created.progress) listener(loaded, total);
      },
    })
      .then((buffer) => parseGLB(buffer, decoderPath))
      .then((gltf) => prepareModel(gltf.scene));
    // A failed or aborted download is forgotten, so a retry downloads again.
    created.promise.catch(() => {
      if (models.get(url) === created) models.delete(url);
    });
    models.set(url, created);
    entry = created;
  }
  if (entry.abortTimer != null) {
    clearTimeout(entry.abortTimer);
    entry.abortTimer = undefined;
  }
  entry.users += 1;
  entry.progress.add(onProgress);
  if (entry.last != null) onProgress(...entry.last);
  return entry;
}

function releaseModel(
  entry: ModelEntry,
  onProgress: (loaded: number, total: number) => void,
): void {
  entry.users -= 1;
  entry.progress.delete(onProgress);
  if (entry.users > 0) return;
  entry.abortTimer = setTimeout(() => {
    entry.abortTimer = undefined;
    // Done downloads ignore it; the parsed model stays cached.
    if (entry.users === 0) entry.controller.abort();
  }, 0);
}

export default function Viewer3D(props: Viewer3DProps) {
  const [model, setModel] = useState<PreparedModel>();
  const callbacks = useRef(props);
  callbacks.current = props;

  useEffect(() => {
    let cancelled = false;
    setModel(undefined);
    const onProgress = (loaded: number, total: number) => {
      if (!cancelled) callbacks.current.onProgress(loaded, total);
    };
    const entry = acquireModel(
      props.url,
      props.expectedSize,
      props.decoderPath,
      onProgress,
    );
    entry.promise.then(
      (prepared) => {
        if (!cancelled) setModel(prepared);
      },
      (error) => {
        if (!cancelled) callbacks.current.onError(error);
      },
    );
    return () => {
      cancelled = true;
      releaseModel(entry, onProgress);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.url, props.attempt]);

  if (model == null) return null;

  return (
    <CanvasErrorBoundary onError={(error) => callbacks.current.onError(error)}>
      <Canvas
        key={props.url}
        className={props.className}
        dpr={[1, 2]}
        frameloop={props.motionAllowed ? "always" : "demand"}
        camera={{ fov: CAMERA_FOV, position: [0, 0, 5] }}
        gl={{ alpha: true, antialias: true, preserveDrawingBuffer: false }}
        // The page background shows through: the theme's card colour, never a grey box.
        style={{
          background: "transparent",
          touchAction: props.interactive ? "none" : "pan-y",
        }}
        aria-hidden="true"
      >
        <Scene model={model} {...props} />
      </Canvas>
    </CanvasErrorBoundary>
  );
}

function Scene({
  model,
  motionAllowed,
  interactive,
  allowZoom,
  resetSignal,
  onLoaded,
  onInteract,
  onError,
}: Viewer3DProps & { model: PreparedModel }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree(
    (state) => state.camera,
  ) as import("three").PerspectiveCamera;
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const [paused, setPaused] = useState(false);
  const loadedRef = useRef(false);
  const startRef = useRef<Framing | undefined>(undefined);
  const callbacks = useRef({ onLoaded, onInteract, onError });
  callbacks.current = { onLoaded, onInteract, onError };

  const controls = useMemo(
    () => new OrbitControls(camera, gl.domElement),
    [camera, gl],
  );

  // Light: a studio environment generated on the device.
  useEffect(() => {
    const environment = createStudioEnvironment(gl);
    scene.environment = environment.texture;
    scene.environmentIntensity = STUDIO_LIGHTS.environmentIntensity;
    invalidate();
    return () => {
      scene.environment = null;
      environment.dispose();
    };
  }, [gl, scene, invalidate]);

  // A lost GPU context is an error the buyer can retry.
  useEffect(() => {
    const canvas = gl.domElement;
    const onLost = (event: Event) => {
      event.preventDefault();
      callbacks.current.onError(new Error("webgl context lost"));
    };
    canvas.addEventListener("webglcontextlost", onLost);
    return () => canvas.removeEventListener("webglcontextlost", onLost);
  }, [gl]);

  // (Re)attach the controls to the canvas: a cleanup's `dispose` detaches
  // them and React StrictMode runs effects twice. A layout effect, before the
  // one below that sets `touch-action` (connect sets it to "none").
  useLayoutEffect(() => {
    controls.connect(gl.domElement);
  }, [controls, gl]);

  // Controls: rotate and zoom around the model, no panning.
  useEffect(() => {
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = DAMPING_PER_60HZ_FRAME;
    controls.rotateSpeed = 0.8;
    controls.minPolarAngle = 0.05;
    controls.maxPolarAngle = Math.PI * 0.62;
    controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
    let resume: ReturnType<typeof setTimeout> | undefined;
    const onStart = () => {
      clearTimeout(resume);
      setPaused(true);
      callbacks.current.onInteract();
    };
    const onEnd = () => {
      clearTimeout(resume);
      resume = setTimeout(() => setPaused(false), AUTO_ROTATE_RESUME_MS);
    };
    const onChange = () => invalidate();
    controls.addEventListener("start", onStart);
    controls.addEventListener("end", onEnd);
    controls.addEventListener("change", onChange);
    return () => {
      clearTimeout(resume);
      controls.removeEventListener("start", onStart);
      controls.removeEventListener("end", onEnd);
      controls.removeEventListener("change", onChange);
      controls.dispose();
    };
  }, [controls, invalidate]);

  // OrbitControls sets `touch-action: none` on connect; the page decides.
  useLayoutEffect(() => {
    controls.enabled = interactive;
    controls.enableZoom = allowZoom;
    gl.domElement.style.touchAction = interactive ? "none" : "pan-y";
    invalidate();
  }, [controls, gl, interactive, allowZoom, invalidate]);

  const rotating = motionAllowed && !paused;
  useEffect(() => {
    controls.autoRotate = rotating;
    invalidate();
  }, [controls, rotating, invalidate]);

  // Framing: the start view, again on reset; a new aspect keeps the direction.
  const aspect = size.width / Math.max(size.height, 1);
  useLayoutEffect(() => {
    const framing = frameModel(model, CAMERA_FOV, aspect);
    const previous = startRef.current;
    startRef.current = framing;
    controls.minDistance = framing.distance * 0.35;
    controls.maxDistance = framing.distance * 2.5;
    if (previous == null) {
      applyFraming(camera, framing);
      controls.target.copy(framing.target);
    } else {
      const direction = new Vector3()
        .subVectors(camera.position, controls.target)
        .normalize();
      const scale =
        camera.position.distanceTo(controls.target) /
        Math.max(previous.distance, 1e-6);
      camera.position
        .copy(framing.target)
        .addScaledVector(direction, framing.distance * scale);
      camera.near = framing.distance / 200;
      camera.far = framing.distance * 50;
      camera.updateProjectionMatrix();
    }
    controls.update();
    invalidate();
  }, [model, aspect, camera, controls, invalidate]);

  const firstReset = useRef(resetSignal);
  useEffect(() => {
    if (resetSignal === firstReset.current || startRef.current == null) return;
    applyFraming(camera, startRef.current);
    controls.target.copy(startRef.current.target);
    controls.update();
    setPaused(false);
    invalidate();
  }, [resetSignal, camera, controls, invalidate]);

  useFrame((_, delta) => {
    // Time-based: the same rotation speed and glide at 60 Hz, 120 Hz or a
    // slow device (OrbitControls damps per call); damping keeps drawing.
    const step = Math.min(delta, 0.1);
    controls.dampingFactor = 1 - (1 - DAMPING_PER_60HZ_FRAME) ** (step * 60);
    if (controls.update(step)) invalidate();
    if (!loadedRef.current) {
      loadedRef.current = true;
      requestAnimationFrame(() => callbacks.current.onLoaded());
    }
  });

  const footprint = Math.max(model.size.x, model.size.z, model.radius);
  return (
    <>
      <ambientLight intensity={STUDIO_LIGHTS.ambient} />
      {STUDIO_LIGHTS.directional.map((light) => (
        <directionalLight key={light.position.join(",")} position={light.position} intensity={light.intensity} />
      ))}
      <primitive object={model.object} />
      <ContactShadows
        position={[0, 0.0005 * model.radius, 0]}
        scale={footprint * 2.4}
        far={Math.max(model.size.y, model.radius) * 1.2}
        blur={2.6}
        opacity={0.42}
        resolution={512}
        frames={1}
      />
    </>
  );
}

class CanvasErrorBoundary extends Component<
  { onError: (error: unknown) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
