// Hand-only mode runs only the hand model. Frames and results stay on-device.
self.exports = {};
importScripts('/vision/vision_bundle.cjs');
let pose = null;
let hands = null;
let files = null;
let mode = 'swat';
let poseLoad = null;
let busy = false;
async function setMode(next) {
  mode = next;
  if (mode === 'arm' && !pose) {
    poseLoad ??= self.exports.PoseLandmarker.createFromOptions(files, {
      baseOptions: {
        modelAssetPath: '/vision/pose_landmarker_lite.task',
        delegate: 'CPU',
      },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.6,
      minPosePresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });
    pose = await poseLoad;
  }
}
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      files = await self.exports.FilesetResolver.forVisionTasks('/vision');
      await setMode(data.mode || 'swat');
      try {
        hands = await self.exports.HandLandmarker.createFromOptions(files, {
          baseOptions: {
            modelAssetPath: '/vision/hand_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      } catch {
        if (mode !== 'arm')
          throw new Error('Hand tracking could not load. Restart the camera.');
        self.postMessage({ type: 'hands-unavailable' });
      }
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'mode' && files) {
      await setMode(data.mode);
      if (mode !== 'arm' && !hands)
        throw new Error('Hand tracking is unavailable. Restart the camera.');
    } else if (data.type === 'frame') {
      if (busy || (!pose && !hands)) {
        data.frame.close();
        return;
      }
      busy = true;
      try {
        const points =
          mode === 'arm' && pose
            ? pose.detectForVideo(data.frame, data.time).landmarks[0] || []
            : [];
        let tracked = [];
        if (hands) {
          const result = hands.detectForVideo(data.frame, data.time);
          tracked = result.landmarks.map((points, i) => ({
            points,
            world: result.worldLandmarks[i],
            label: result.handedness[i]?.[0]?.categoryName,
          }));
        }
        self.postMessage({
          type: 'pose',
          points,
          hands: tracked,
          time: data.time,
          width: data.frame.width,
          height: data.frame.height,
        });
      } finally {
        data.frame.close();
        busy = false;
      }
    } else if (data.type === 'close') {
      pose?.close();
      hands?.close();
      self.close();
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      message:
        error instanceof Error ? error.message : 'Motion tracking stopped.',
    });
  }
};
